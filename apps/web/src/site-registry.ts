import {
  CreateSiteRequestSchema,
  CreateSiteRegistrationRequestSchema,
  CreateSiteRegistrationResponseSchema,
  SiteListResponseSchema,
  SiteSchema,
  type CreateSiteRegistrationRequest,
  type Site
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import { demoSite } from "./work-order-board";

export const defaultOrganizationId = "org_demo";
export const siteRegistrationCreatedAt = "2026-01-01T00:00:00.000Z";

export type SiteRegistryMode = "api" | "database" | "fixture";

export interface SiteRegistrationInput {
  readonly country?: string | null | undefined;
  readonly domain: string;
  readonly industry?: string | null | undefined;
  readonly language?: string | null | undefined;
  readonly name?: string | null | undefined;
}

export interface SiteRegistryData {
  readonly feedback: SiteRegistrationFeedback | null;
  readonly mode: SiteRegistryMode;
  readonly sites: readonly Site[];
}

export interface SiteRegistrationFeedback {
  readonly href: string;
  readonly message: string;
  readonly tone: "ready" | "info" | "warning" | "risk";
}

export interface InitialCrawlFeedback {
  readonly crawlRunId: string;
  readonly message: string;
  readonly tone: "info";
}

export type SiteRegistrationSearchParams = Record<string, string | string[] | undefined>;

export function normalizeSiteRegistrationDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  const hostname = url.hostname.replace(/^www\./, "");
  return CreateSiteRequestSchema.shape.domain.parse(hostname);
}

export function createSiteIdFromDomain(domain: string): string {
  const normalizedDomain = normalizeSiteRegistrationDomain(domain);
  return `site_${normalizedDomain.replaceAll("-", "_dash_").replaceAll(".", "_dot_")}`;
}

export function decodeDomainFromSiteRegistrationId(siteId: string): string | null {
  if (!siteId.startsWith("site_")) {
    return null;
  }

  const decoded = siteId.slice(5).replaceAll("_dot_", ".").replaceAll("_dash_", "-");
  const parsed = CreateSiteRequestSchema.shape.domain.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function createSiteRegistrationDraft(input: SiteRegistrationInput): Site {
  const request = CreateSiteRequestSchema.parse({
    country: (input.country?.trim() || "KR").toUpperCase(),
    domain: normalizeSiteRegistrationDomain(input.domain),
    industry: normalizeOptionalText(input.industry),
    language: (input.language?.trim() || "ko").toLowerCase(),
    name: normalizeOptionalText(input.name)
  });

  return SiteSchema.parse({
    country: request.country,
    createdAt: siteRegistrationCreatedAt,
    domain: request.domain,
    id: createSiteIdFromDomain(request.domain),
    industry: request.industry ?? null,
    language: request.language,
    name: request.name ?? request.domain,
    organizationId: defaultOrganizationId
  });
}

export function createSiteRegistrationDraftFromForm(formData: FormData): Site {
  return createSiteRegistrationDraft({
    country: readFormValue(formData, "country"),
    domain: readRequiredFormValue(formData, "domain"),
    industry: readFormValue(formData, "industry"),
    language: readFormValue(formData, "language"),
    name: readFormValue(formData, "name")
  });
}

export function resolveSiteFromRegistrationId(siteId: string): Site | null {
  const domain = decodeDomainFromSiteRegistrationId(siteId);
  if (!domain) {
    return null;
  }

  return SiteSchema.parse({
    country: "KR",
    createdAt: siteRegistrationCreatedAt,
    domain,
    id: siteId,
    industry: null,
    language: "ko",
    name: domain,
    organizationId: defaultOrganizationId
  });
}

export function createSiteRegistrationSearchParams(site: Site, mode: SiteRegistryMode): URLSearchParams {
  return new URLSearchParams({
    createdSiteCountry: site.country,
    createdSiteDomain: site.domain,
    createdSiteId: site.id,
    createdSiteIndustry: site.industry ?? "",
    createdSiteLanguage: site.language,
    createdSiteName: site.name ?? site.domain,
    siteCreate: mode
  });
}

export function getInitialCrawlFeedback(
  searchParams?: SiteRegistrationSearchParams,
): InitialCrawlFeedback | null {
  const status = readSearchParam(searchParams, "crawl");
  const crawlRunId = readSearchParam(searchParams, "crawlRunId");
  if (status !== "queued" || !crawlRunId) {
    return null;
  }

  return {
    crawlRunId,
    message: "초기 crawl이 대기열에 등록됐습니다.",
    tone: "info"
  };
}

export function mergeSitesWithCreatedPreview(
  sites: readonly Site[],
  searchParams?: SiteRegistrationSearchParams
): readonly Site[] {
  const preview = getCreatedSitePreview(searchParams);
  if (!preview) {
    return sites;
  }

  const deduped = sites.filter((site) => site.id !== preview.id && site.domain !== preview.domain);
  return [...deduped, preview];
}

export async function loadSiteRegistry(searchParams?: SiteRegistrationSearchParams): Promise<SiteRegistryData> {
  const apiBaseUrl = getApiBaseUrl();
  const feedback = getSiteRegistrationFeedback(searchParams);

  // 직접 DB 모드면 API 없이 로그인한 조직의 실제 사이트를 읽는다.
  const { getOrganizationSites } = await import("./site-database");
  const ownedSites = await getOrganizationSites();
  if (ownedSites !== null) {
    // 등록 미리보기를 합치지 않는다. 이 모드는 등록이 실제로 DB 에 저장되므로 방금
    // 만든 사이트도 아래 조회에 이미 들어 있다. 미리보기를 겹쳐 넣으면 저장이 실패한
    // 경우에도 목록에 보여서, 열었을 때 404 가 나는 유령 항목이 된다.
    return {
      feedback,
      mode: "database",
      sites: ownedSites
    };
  }

  if (!apiBaseUrl) {
    return {
      feedback,
      mode: "fixture",
      sites: mergeSitesWithCreatedPreview([demoSite], searchParams)
    };
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/organizations/${defaultOrganizationId}/sites`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Site list request failed with ${response.status}`);
    }

    const payload = SiteListResponseSchema.parse(await response.json());
    return {
      feedback,
      mode: "api",
      sites: mergeSitesWithCreatedPreview(payload.sites, searchParams)
    };
  } catch {
    return {
      feedback: feedback ?? {
        href: "/sites",
        message: "API 서버 응답이 없어 fixture 목록으로 전환했습니다.",
        tone: "warning"
      },
      mode: "fixture",
      sites: mergeSitesWithCreatedPreview([demoSite], searchParams)
    };
  }
}

export async function createSiteInRegistry(formData: FormData): Promise<{
  readonly mode: SiteRegistryMode;
  readonly redirectPath: string | null;
  readonly site: Site;
}> {
  const registrationRequest = createSiteRegistrationRequestFromForm(formData);
  const draft = createSiteRegistrationDraft(registrationRequest.site);

  // 직접 DB 모드는 API 를 아예 건드리지 않는다. SEARCHOPS_API_BASE_URL 이 죽은 주소로
  // 남아 있으면(Railway 폐지 후 실제로 그랬다) 그쪽으로 POST 해서 원시 404 가 튄다.
  //
  // 초기 crawl 은 여기서 걸지 않는다 — 큐도 워커도 없다. 대신 배치(GitHub Actions)가
  // 등록된 사이트를 전부 크롤하므로, 다음 실행에서 데이터가 채워진다.
  const { isDirectDatabaseMode } = await import("./web-database-url");
  if (isDirectDatabaseMode()) {
    const { createOrganizationSite } = await import("./site-database");
    const site = await createOrganizationSite({
      country: draft.country,
      domain: draft.domain,
      industry: draft.industry,
      language: draft.language,
      name: draft.name
    });
    if (site === null) {
      throw new Error("사이트를 등록할 수 없습니다. 로그인 상태를 확인하세요.");
    }
    return { mode: "database", redirectPath: null, site };
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return { mode: "fixture", redirectPath: null, site: draft };
  }

  const response = await apiFetch(`${apiBaseUrl}/organizations/${defaultOrganizationId}/sites/register`, {
    body: JSON.stringify(registrationRequest),
    cache: "no-store",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Site registration request failed with ${response.status}`);
  }

  const payload = CreateSiteRegistrationResponseSchema.parse(await response.json());
  return { mode: "api", redirectPath: payload.next.dashboardUrl, site: payload.site };
}

export function createSiteRegistrationRequestFromForm(
  formData: FormData,
): CreateSiteRegistrationRequest {
  const draft = createSiteRegistrationDraftFromForm(formData);
  const maxPages = Number(readFormValue(formData, "maxPages") ?? 10);
  const startUrl = normalizeOptionalText(readFormValue(formData, "startUrl"));
  const requestedProviders = formData
    .getAll("connectorProvider")
    .map((value) => String(value))
    .filter((value) => value.length > 0);

  return CreateSiteRegistrationRequestSchema.parse({
    automation: {
      generateSchemaRecommendations: readBooleanFormValue(
        formData,
        "generateSchemaRecommendations",
        true,
      ),
      generateSeoIssues: readBooleanFormValue(formData, "generateSeoIssues", true),
      generateWorkOrders: readBooleanFormValue(formData, "generateWorkOrders", true)
    },
    connectors: {
      requestedProviders
    },
    initialCrawl: {
      discoverSitemap: readBooleanFormValue(formData, "discoverSitemap", true),
      enabled: readBooleanFormValue(formData, "initialCrawlEnabled", true),
      maxPages: Number.isFinite(maxPages) ? maxPages : 10,
      respectRobotsTxt: readBooleanFormValue(formData, "respectRobotsTxt", true),
      ...(startUrl === undefined ? {} : { startUrl })
    },
    site: {
      country: draft.country,
      domain: draft.domain,
      industry: draft.industry ?? undefined,
      language: draft.language,
      name: draft.name ?? undefined
    }
  });
}

function getCreatedSitePreview(searchParams?: SiteRegistrationSearchParams): Site | null {
  const id = readSearchParam(searchParams, "createdSiteId");
  const domain = readSearchParam(searchParams, "createdSiteDomain");
  if (!id || !domain) {
    return null;
  }

  return SiteSchema.parse({
    country: readSearchParam(searchParams, "createdSiteCountry") ?? "KR",
    createdAt: siteRegistrationCreatedAt,
    domain,
    id,
    industry: normalizeOptionalText(readSearchParam(searchParams, "createdSiteIndustry")) ?? null,
    language: readSearchParam(searchParams, "createdSiteLanguage") ?? "ko",
    name: readSearchParam(searchParams, "createdSiteName") ?? domain,
    organizationId: defaultOrganizationId
  });
}

function getSiteRegistrationFeedback(searchParams?: SiteRegistrationSearchParams): SiteRegistrationFeedback | null {
  const status = readSearchParam(searchParams, "siteCreate");
  const id = readSearchParam(searchParams, "createdSiteId");
  if (status === "api" && id) {
    return {
      href: `/sites/${id}`,
      message: "사이트가 API 저장소에 등록됐습니다.",
      tone: "ready"
    };
  }

  if (status === "fixture" && id) {
    return {
      href: `/sites/${id}`,
      message: "사이트가 로컬 fixture preview로 추가됐습니다.",
      tone: "info"
    };
  }

  // 직접 DB 모드에서도 등록은 실제로 저장된다. 다만 크롤은 배치가 돌 때 시작하므로
  // 지금 열면 비어 있다 — 그걸 미리 말해두지 않으면 등록이 실패한 것처럼 보인다.
  if (status === "database" && id) {
    return {
      href: `/sites/${id}`,
      message:
        "사이트를 DB에 등록했습니다. 크롤 데이터는 다음 배치 실행(매일 03:00 KST) 후에 채워집니다.",
      tone: "ready"
    };
  }

  if (status === "error") {
    return {
      href: "/sites",
      message: readSearchParam(searchParams, "siteCreateMessage") ?? "사이트 등록에 실패했습니다.",
      tone: "risk"
    };
  }

  return null;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function readRequiredFormValue(formData: FormData, key: string): string {
  const value = readFormValue(formData, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function readBooleanFormValue(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  const value = values.at(-1);
  if (typeof value !== "string") {
    return defaultValue;
  }

  return value === "true" || value === "on";
}

function readSearchParam(searchParams: SiteRegistrationSearchParams | undefined, key: string): string | undefined {
  const value = searchParams?.[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
