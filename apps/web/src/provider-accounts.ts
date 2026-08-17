import {
  AuthRoleSchema,
  CreateConnectorSyncRunRequestSchema,
  CreateConnectorSyncRunResponseSchema,
  CreateApiKeyProviderAccountRequestSchema,
  isGoogleConnectorScopeSatisfied,
  ProviderAccountDetailResponseSchema,
  ProviderAccountListResponseSchema,
  ReplaceProviderCredentialRequestSchema,
  SiteConnectorDetailResponseSchema,
  SiteConnectorListResponseSchema,
  SiteConnectorProviderSchema,
  SiteListResponseSchema,
  UpdateProviderAccountMetadataRequestSchema,
  UpsertSiteConnectorRequestSchema,
  type AuthRole,
  type ConnectorProvider,
  type CreateApiKeyProviderAccountRequest,
  type ProviderAccountMetadata,
  type ProviderAccountProvider,
  type ProviderAccountSummary,
  type SiteConnector,
  type SiteConnectorProvider,
  type Site,
  type UpdateProviderAccountMetadataRequest,
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "@searchops/db";

import { getApiBaseUrl } from "./api-base-url";
import { apiFetchAsUser } from "./api-client";
import { getWebDatabaseUrl } from "./web-database-url";
import { getSupabaseServerClient } from "./supabase-server";

const apiKeyProviders = [
  "bing",
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity",
] as const satisfies readonly ProviderAccountProvider[];

export const geoProviderOptions = [
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity",
] as const satisfies readonly ProviderAccountProvider[];

export type ProviderAccountClientErrorCode =
  | "account_in_use"
  | "authentication_required"
  | "forbidden"
  | "invalid_response"
  | "not_configured"
  | "request_failed"
  | "validation_error";

const clientErrorMessages = {
  account_in_use: "사이트 연결을 먼저 해제하세요.",
  authentication_required: "로그인이 필요합니다.",
  forbidden: "이 작업을 수행할 권한이 없습니다.",
  invalid_response: "API 응답 형식이 올바르지 않습니다.",
  not_configured: "API 주소가 설정되지 않았습니다.",
  request_failed: "요청을 처리하지 못했습니다.",
  validation_error: "입력값을 확인하세요.",
} as const satisfies Record<ProviderAccountClientErrorCode, string>;

export class ProviderAccountClientError extends Error {
  constructor(readonly code: ProviderAccountClientErrorCode) {
    super(clientErrorMessages[code]);
    this.name = "ProviderAccountClientError";
  }
}

export interface ProviderUserContext {
  readonly accessToken: string;
  readonly organizationId: string;
  readonly role: AuthRole;
  readonly userId: string;
}

export interface ResolveVerifiedProviderUserInput {
  readonly accessToken: string | null | undefined;
  readonly claims: Record<string, unknown> | null | undefined;
  readonly sessionUserId: string | null | undefined;
}

export interface ProviderUserMembership {
  readonly organizationId: string;
  readonly role: string;
}

/**
 * 토큰 클레임이 조직/역할을 담고 있지 않을 때 DB 소속으로 메운다.
 *
 * 커스텀 클레임(`organization_id`, `user_role`)은 Supabase custom access token hook 을
 * 따로 설치해야 나온다. 웹이 DB 를 직접 읽는 지금은 그 훅 없이도 소속을 알 수 있다.
 * 클레임이 있으면 그쪽을 그대로 쓴다 — 기존 API 경로의 신뢰 모델을 바꾸지 않기 위해서다.
 *
 * 인증 자체(서명 검증, sub 일치, role=authenticated)는 여기서도 똑같이 요구한다.
 * membership 은 "이 사람이 누구인가"가 아니라 "어느 조직 소속인가"만 채운다.
 */
export function resolveVerifiedProviderUser(
  { accessToken, claims, sessionUserId }: ResolveVerifiedProviderUserInput,
  membership?: ProviderUserMembership | null,
): ProviderUserContext {
  const token = accessToken?.trim();
  const userId = typeof claims?.sub === "string" ? claims.sub.trim() : "";
  const claimOrganizationId =
    typeof claims?.organization_id === "string" ? claims.organization_id.trim() : "";
  const organizationId =
    claimOrganizationId.length > 0 ? claimOrganizationId : (membership?.organizationId.trim() ?? "");
  const role = AuthRoleSchema.safeParse(
    claims?.user_role ?? (claimOrganizationId.length > 0 ? undefined : membership?.role),
  );
  const tokenUse = claims?.token_use;
  const principalType = claims?.principal_type;

  if (
    !token ||
    userId.length === 0 ||
    organizationId.length === 0 ||
    !role.success ||
    claims?.role !== "authenticated" ||
    (tokenUse !== undefined && tokenUse !== "user") ||
    (principalType !== undefined && principalType !== "user") ||
    sessionUserId !== userId
  ) {
    throw new ProviderAccountClientError("authentication_required");
  }

  return {
    accessToken: token,
    organizationId,
    role: role.data,
    userId,
  };
}

export async function getCurrentProviderUser(): Promise<ProviderUserContext> {
  const supabase = await getSupabaseServerClient();
  if (supabase === null) {
    throw new ProviderAccountClientError("authentication_required");
  }

  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error !== null || claimsResult.data?.claims == null) {
    throw new ProviderAccountClientError("authentication_required");
  }

  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.error !== null || sessionResult.data.session == null) {
    throw new ProviderAccountClientError("authentication_required");
  }

  const claims = claimsResult.data.claims as Record<string, unknown>;
  return resolveVerifiedProviderUser(
    {
      accessToken: sessionResult.data.session.access_token,
      claims,
      sessionUserId: sessionResult.data.session.user.id,
    },
    await lookupMembershipFromDatabase(claims),
  );
}

/**
 * 커스텀 클레임이 없고 직접 DB 모드일 때만 소속을 조회한다.
 *
 * 조회 키는 반드시 **검증된 클레임의 이메일**이어야 한다. user_metadata 처럼 사용자가
 * 고칠 수 있는 값을 쓰면 아무 조직이나 주장할 수 있다.
 */
async function lookupMembershipFromDatabase(
  claims: Record<string, unknown>,
): Promise<ProviderUserMembership | null> {
  if (typeof claims.organization_id === "string" && claims.organization_id.trim().length > 0) {
    return null;
  }
  // 직접 DB 모드의 스위치는 site-database.ts 한 곳에만 둔다. 여기서 환경변수를 다시
  // 읽으면 두 곳이 어긋나 로그인만 되고 데이터는 안 나오는 상태가 생긴다.
  const datasourceUrl = getWebDatabaseUrl();
  if (datasourceUrl === null) {
    return null;
  }
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  if (email.length === 0) {
    return null;
  }
  try {
    const db = await import("@searchops/db");
    membershipPrisma ??= db.createSearchOpsPrismaClient({ datasourceUrl });
    return await db.findUserMembershipByEmail(membershipPrisma, email);
  } catch {
    // 소속 조회 실패는 미인증으로 떨어뜨린다 — 조용히 다른 조직으로 넘어가는 것보다 낫다.
    return null;
  }
}

// Prisma 클라이언트를 모듈 스코프에 캐시한다 — 서버리스에서 요청마다 만들면 커넥션이
// 폭발한다. 타입만 정적으로 가져오고(런타임에 지워진다) 값은 동적 임포트로 만든다.
let membershipPrisma: SearchOpsPrismaClient | null = null;

export function canManageProviderAccounts(role: AuthRole): boolean {
  return role === "admin" || role === "owner" || role === "system";
}

export function canRunConnectorSync(role: AuthRole): boolean {
  return role !== "viewer";
}

export async function loadProviderAccounts(
  context: ProviderUserContext,
): Promise<ProviderAccountSummary[]> {
  const output = await requestJson(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/provider-accounts`,
    ProviderAccountListResponseSchema,
  );
  if (output.providerAccounts.some((account) => account.organizationId !== context.organizationId)) {
    throw new ProviderAccountClientError("invalid_response");
  }
  return output.providerAccounts;
}

export async function loadOrganizationSites(context: ProviderUserContext): Promise<Site[]> {
  const output = await requestJson(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/sites`,
    SiteListResponseSchema,
  );
  if (output.sites.some((site) => site.organizationId !== context.organizationId)) {
    throw new ProviderAccountClientError("invalid_response");
  }
  return output.sites;
}

export async function createApiKeyProviderAccount(
  context: ProviderUserContext,
  input: CreateApiKeyProviderAccountRequest,
): Promise<ProviderAccountMetadata> {
  const parsed = parseClientBoundary(CreateApiKeyProviderAccountRequestSchema, input);
  if (!apiKeyProviders.includes(parsed.provider as (typeof apiKeyProviders)[number])) {
    throw new ProviderAccountClientError("validation_error");
  }
  const output = await requestJson(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/provider-accounts/${encodeURIComponent(parsed.provider)}/api-key`,
    ProviderAccountDetailResponseSchema,
    {
      body: JSON.stringify(parsed),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  return output.providerAccount;
}

export async function replaceProviderAccountCredential(
  context: ProviderUserContext,
  providerAccountId: string,
  apiKey: string,
): Promise<ProviderAccountMetadata> {
  const input = parseClientBoundary(ReplaceProviderCredentialRequestSchema, { apiKey });
  const output = await requestJson(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/provider-accounts/${encodeURIComponent(requireId(providerAccountId))}/credential`,
    ProviderAccountDetailResponseSchema,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
  );
  return output.providerAccount;
}

export async function updateProviderAccountMetadata(
  context: ProviderUserContext,
  providerAccountId: string,
  update: UpdateProviderAccountMetadataRequest,
): Promise<ProviderAccountMetadata> {
  const input = parseClientBoundary(UpdateProviderAccountMetadataRequestSchema, update);
  const output = await requestJson(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/provider-accounts/${encodeURIComponent(requireId(providerAccountId))}`,
    ProviderAccountDetailResponseSchema,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  return output.providerAccount;
}

export async function deleteProviderAccount(
  context: ProviderUserContext,
  providerAccountId: string,
): Promise<void> {
  await requestEmpty(
    context,
    `/organizations/${encodeURIComponent(context.organizationId)}/provider-accounts/${encodeURIComponent(requireId(providerAccountId))}`,
    { method: "DELETE" },
    true,
  );
}

export async function loadSiteConnectors(
  context: ProviderUserContext,
  siteId: string,
): Promise<SiteConnector[]> {
  const output = await requestJson(
    context,
    `/sites/${encodeURIComponent(requireId(siteId))}/connectors`,
    SiteConnectorListResponseSchema,
  );
  const normalizedSiteId = requireId(siteId);
  if (output.siteConnectors.some(
    (connector) =>
      connector.organizationId !== context.organizationId || connector.siteId !== normalizedSiteId,
  )) {
    throw new ProviderAccountClientError("invalid_response");
  }
  return output.siteConnectors;
}

export async function saveSiteConnector(
  context: ProviderUserContext,
  input: {
    readonly siteId: string;
    readonly provider: SiteConnectorProvider;
    readonly providerAccountId: string;
    readonly externalResourceId: string;
  },
): Promise<SiteConnector> {
  const provider = parseClientBoundary(SiteConnectorProviderSchema, input.provider);
  const request = parseClientBoundary(UpsertSiteConnectorRequestSchema, {
    providerAccountId: input.providerAccountId,
    externalResourceId: normalizeSiteConnectorResource(provider, input.externalResourceId),
  });
  const output = await requestJson(
    context,
    `/sites/${encodeURIComponent(requireId(input.siteId))}/connectors/${provider}`,
    SiteConnectorDetailResponseSchema,
    {
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
  );
  return output.siteConnector;
}

export async function deleteSiteConnector(
  context: ProviderUserContext,
  siteId: string,
  provider: SiteConnectorProvider,
): Promise<void> {
  const parsedProvider = parseClientBoundary(SiteConnectorProviderSchema, provider);
  await requestEmpty(
    context,
    `/sites/${encodeURIComponent(requireId(siteId))}/connectors/${parsedProvider}`,
    { method: "DELETE" },
  );
}

export async function triggerSiteConnectorSync(
  context: ProviderUserContext,
  siteId: string,
  providers: readonly ConnectorProvider[],
): Promise<{
  readonly connectorSyncRunId: string;
  readonly jobId: string;
  readonly providers: readonly ConnectorProvider[];
}> {
  const input = parseClientBoundary(CreateConnectorSyncRunRequestSchema, { providers });
  const output = await requestJson(
    context,
    `/sites/${encodeURIComponent(requireId(siteId))}/connector-sync-runs`,
    CreateConnectorSyncRunResponseSchema,
    {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  return {
    connectorSyncRunId: output.connectorSyncRun.id,
    jobId: output.job.id,
    providers: output.connectorSyncRun.providers,
  };
}

export function normalizeSiteConnectorResource(
  provider: SiteConnectorProvider,
  rawValue: string,
): string {
  const value = rawValue.trim();
  if (provider === "ga4") {
    const match = /^(?:properties\/)?([1-9][0-9]*)$/.exec(value);
    if (match === null) {
      throw new ProviderAccountClientError("validation_error");
    }
    return `properties/${match[1]}`;
  }

  if (provider === "gsc" && value.startsWith("sc-domain:")) {
    const domain = value.slice("sc-domain:".length).toLowerCase();
    if (!isValidBareDomain(domain)) {
      throw new ProviderAccountClientError("validation_error");
    }
    return `sc-domain:${domain}`;
  }

  try {
    const url = new URL(value);
    const allowedProtocol =
      provider === "bing"
        ? url.protocol === "https:"
        : url.protocol === "http:" || url.protocol === "https:";
    if (
      !allowedProtocol ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error("invalid_url");
    }
    return url.toString();
  } catch {
    throw new ProviderAccountClientError("validation_error");
  }
}

export function parseCreateProviderAccountForm(formData: FormData) {
  const values = strictFormValues(formData, ["apiKey", "displayName", "isDefault", "provider"]);
  const provider = values.provider;
  if (!apiKeyProviders.includes(provider as (typeof apiKeyProviders)[number])) {
    throw new ProviderAccountClientError("validation_error");
  }
  if (values.isDefault !== undefined && values.isDefault !== "true") {
    throw new ProviderAccountClientError("validation_error");
  }
  return parseClientBoundary(CreateApiKeyProviderAccountRequestSchema, {
    apiKey: values.apiKey,
    displayName: values.displayName,
    isDefault: values.isDefault === "true",
    provider,
  });
}

export function parseReplaceProviderCredentialForm(formData: FormData) {
  const values = strictFormValues(formData, ["accountId", "apiKey"]);
  return {
    accountId: requireId(values.accountId),
    ...parseClientBoundary(ReplaceProviderCredentialRequestSchema, { apiKey: values.apiKey }),
  };
}

export function parseUpdateProviderAccountForm(formData: FormData) {
  const values = strictFormValues(formData, ["accountId", "displayName", "isDefault"]);
  const update = parseClientBoundary(UpdateProviderAccountMetadataRequestSchema, {
    ...(values.displayName === undefined ? {} : { displayName: values.displayName }),
    ...(values.isDefault === undefined ? {} : { isDefault: values.isDefault === "true" }),
  });
  if (values.isDefault !== undefined && values.isDefault !== "true" && values.isDefault !== "false") {
    throw new ProviderAccountClientError("validation_error");
  }
  return { accountId: requireId(values.accountId), update };
}

export function parseDeleteProviderAccountForm(formData: FormData) {
  const values = strictFormValues(formData, ["accountId"]);
  return { accountId: requireId(values.accountId) };
}

export function parseGoogleOAuthStartForm(formData: FormData) {
  const values = strictFormValues(formData, ["siteId"]);
  return { siteId: requireId(values.siteId) };
}

export function parseSiteConnectorForm(formData: FormData) {
  const values = strictFormValues(formData, ["externalResourceId", "provider", "providerAccountId"]);
  const provider = parseClientBoundary(SiteConnectorProviderSchema, values.provider);
  return {
    externalResourceId: normalizeSiteConnectorResource(provider, values.externalResourceId ?? ""),
    provider,
    providerAccountId: requireId(values.providerAccountId),
  };
}

export function parseDeleteSiteConnectorForm(formData: FormData) {
  const values = strictFormValues(formData, ["provider"]);
  return { provider: parseClientBoundary(SiteConnectorProviderSchema, values.provider) };
}

export function parseConnectorSyncForm(formData: FormData): ConnectorProvider[] {
  const values: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (key !== "providers" || typeof value !== "string") {
      throw new ProviderAccountClientError("validation_error");
    }
    values.push(value);
  }
  const input = parseClientBoundary(CreateConnectorSyncRunRequestSchema, {
    providers: [...new Set(values)],
  });
  return input.providers;
}

export function formatProviderAccountProvider(provider: ProviderAccountProvider): string {
  return {
    bing: "Bing",
    geo_chatgpt: "ChatGPT",
    geo_claude: "Claude",
    geo_gemini: "Gemini",
    geo_perplexity: "Perplexity",
    google: "Google",
  }[provider];
}

export function filterGoogleProviderAccounts(
  accounts: readonly ProviderAccountSummary[],
  provider: "gsc" | "ga4",
): ProviderAccountSummary[] {
  return accounts.filter(
    (account) =>
      account.provider === "google" &&
      account.authType === "oauth2" &&
      account.status === "connected" &&
      isGoogleConnectorScopeSatisfied(account.scopes, provider),
  );
}

function strictFormValues(
  formData: FormData,
  allowedKeys: readonly string[],
): Record<string, string | undefined> {
  const allowed = new Set(allowedKeys);
  const output: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!allowed.has(key) || typeof value !== "string" || output[key] !== undefined) {
      throw new ProviderAccountClientError("validation_error");
    }
    output[key] = value;
  }
  return output;
}

function requireId(value: string | null | undefined): string {
  const id = value?.trim() ?? "";
  if (id.length === 0) {
    throw new ProviderAccountClientError("validation_error");
  }
  return id;
}

function isValidBareDomain(value: string): boolean {
  if (value.length > 253 || value.includes(":")) {
    return false;
  }
  const labels = value.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  );
}

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

function parseClientBoundary<T>(schema: ResponseSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ProviderAccountClientError("validation_error");
  }
}

async function requestJson<T>(
  context: ProviderUserContext,
  path: string,
  schema: ResponseSchema<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await request(context, path, init);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new ProviderAccountClientError("invalid_response");
  }
}

async function requestEmpty(
  context: ProviderUserContext,
  path: string,
  init: RequestInit,
  conflictMeansAccountInUse = false,
): Promise<void> {
  await request(context, path, init, conflictMeansAccountInUse);
}

async function request(
  context: ProviderUserContext,
  path: string,
  init: RequestInit,
  conflictMeansAccountInUse = false,
): Promise<Response> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    throw new ProviderAccountClientError("not_configured");
  }

  let response: Response;
  try {
    response = await apiFetchAsUser(`${apiBaseUrl}${path}`, context.accessToken, init);
  } catch {
    throw new ProviderAccountClientError("request_failed");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ProviderAccountClientError("authentication_required");
    }
    if (response.status === 403) {
      throw new ProviderAccountClientError("forbidden");
    }
    if (response.status === 409 && conflictMeansAccountInUse) {
      throw new ProviderAccountClientError("account_in_use");
    }
    throw new ProviderAccountClientError("request_failed");
  }
  return response;
}
