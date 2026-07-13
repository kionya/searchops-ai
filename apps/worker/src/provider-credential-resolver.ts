import { randomUUID } from "node:crypto";

import {
  applyProviderFeedbackForConnectorSync,
  CredentialDecryptionError,
  decryptProviderCredential,
  encryptProviderCredential,
  getProviderAccountForConnectorSync,
  getSiteConnectorForConnectorSync,
  getSiteForConnectorSync,
  listConnectorOAuthCredentialsForSync,
  updateProviderAccountCredentialForConnectorSync,
  type ConnectorOAuthCredentialForSync,
  type ConnectorSyncProviderFeedbackInput,
  type ConnectorSyncPersistenceClient,
  type CredentialKeyring,
  type EncryptedProviderCredential,
  type ProviderAccountSecretRecord,
} from "@searchops/db";
import type {
  GoogleOAuthCredential,
  LiveConnectorProviderConfigs,
} from "@searchops/connectors";
import type {
  ConnectorRunResult,
  ConnectorCredentialSources,
  ConnectorProvider,
  ConnectorSyncJobPayload,
  CredentialStorageMode,
  ProviderAccountStatus,
  ProviderCredentialFailureCode,
  SiteConnector,
  SiteConnectorProvider,
  SiteConnectorStatus,
} from "@searchops/types";

const googleRequiredScopes = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
} as const;
const googleRefreshSkewMs = 120_000;

export interface ProviderCredentialResolverStore {
  applyProviderFeedback(input: ConnectorSyncProviderFeedbackInput): Promise<boolean>;
  getSite(input: {
    readonly organizationId: string;
    readonly siteId: string;
  }): Promise<{ readonly id: string; readonly organizationId: string } | null>;
  getSiteConnector(input: {
    readonly organizationId: string;
    readonly siteId: string;
    readonly provider: SiteConnectorProvider;
  }): Promise<SiteConnector | null>;
  getProviderAccount(input: {
    readonly organizationId: string;
    readonly providerAccountId: string;
  }): Promise<ProviderAccountSecretRecord | null>;
  listLegacyGoogleCredentials(input: {
    readonly organizationId: string;
    readonly siteId: string;
    readonly providers: readonly ("gsc" | "ga4")[];
  }): Promise<ConnectorOAuthCredentialForSync[]>;
  updateProviderAccountCredential(input: {
    readonly encryptedCredential: EncryptedProviderCredential;
    readonly expectedUpdatedAt: string;
    readonly organizationId: string;
    readonly providerAccountId: string;
    readonly status: "connected";
    readonly tokenExpiresAt: Date;
  }): Promise<{ readonly updatedAt: string } | null>;
}

export interface ProviderAccountRefreshLock {
  withLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface RedisProviderAccountRefreshLockClient {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    token: string,
  ): Promise<unknown>;
  set(
    key: string,
    token: string,
    px: "PX",
    ttlMs: number,
    nx: "NX",
  ): Promise<"OK" | null>;
}

export function createRedisProviderAccountRefreshLock(
  getClient: () => Promise<RedisProviderAccountRefreshLockClient>,
  options: {
    readonly createToken?: (() => string) | undefined;
    readonly retryDelayMs?: number | undefined;
    readonly ttlMs?: number | undefined;
    readonly waitTimeoutMs?: number | undefined;
  } = {},
): ProviderAccountRefreshLock {
  const createToken = options.createToken ?? randomUUID;
  const retryDelayMs = options.retryDelayMs ?? 50;
  const ttlMs = options.ttlMs ?? 30_000;
  const waitTimeoutMs = options.waitTimeoutMs ?? 10_000;

  return {
    async withLock(key, operation) {
      const token = createToken();
      const deadline = Date.now() + waitTimeoutMs;
      let acquired = false;
      let client: RedisProviderAccountRefreshLockClient;

      try {
        client = await getClient();
        while (!acquired && Date.now() <= deadline) {
          acquired = (await client.set(key, token, "PX", ttlMs, "NX")) === "OK";
          if (!acquired) {
            await delay(retryDelayMs);
          }
        }
      } catch {
        throw new ProviderAccountRefreshLockError();
      }
      if (!acquired) {
        throw new ProviderAccountRefreshLockError();
      }

      let operationFailed = false;
      try {
        return await operation();
      } catch (error) {
        operationFailed = true;
        throw error;
      } finally {
        try {
          await client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            key,
            token,
          );
        } catch {
          if (!operationFailed) {
            throw new ProviderAccountRefreshLockError();
          }
        }
      }
    },
  };
}

export interface ResolvedConnectorProviderConfigs {
  readonly configs: LiveConnectorProviderConfigs;
  readonly credentialSources: ConnectorCredentialSources;
  readonly failures: Partial<Record<ConnectorProvider, ProviderCredentialFailureCode>>;
}

export interface ProviderCredentialResolver {
  recordConnectorProviderOutcomes(
    job: ConnectorSyncJobPayload,
    results: readonly ConnectorRunResult[],
  ): Promise<void>;
  resolveConnectorProviderConfigs(
    job: ConnectorSyncJobPayload,
  ): Promise<ResolvedConnectorProviderConfigs>;
}

export interface CreateProviderCredentialResolverOptions {
  readonly fetch?: typeof fetch | undefined;
  readonly globalBingApiKey?: string | undefined;
  readonly googleOAuthClientId?: string | undefined;
  readonly googleOAuthClientSecret?: string | undefined;
  readonly keyring: CredentialKeyring;
  readonly legacyGa4PropertyId?: string | undefined;
  readonly now?: (() => Date) | undefined;
  readonly pagespeedApiKey?: string | undefined;
  readonly refreshLock?: ProviderAccountRefreshLock | undefined;
  readonly storageMode: CredentialStorageMode;
  readonly store: ProviderCredentialResolverStore;
}

export function createDbProviderCredentialResolverStore(
  client: ConnectorSyncPersistenceClient,
): ProviderCredentialResolverStore {
  return {
    applyProviderFeedback: (input) => applyProviderFeedbackForConnectorSync(client, input),
    getProviderAccount: (input) => getProviderAccountForConnectorSync(client, input),
    getSite: (input) => getSiteForConnectorSync(client, input),
    getSiteConnector: (input) => getSiteConnectorForConnectorSync(client, input),
    listLegacyGoogleCredentials: (input) =>
      listConnectorOAuthCredentialsForSync(client, input),
    updateProviderAccountCredential: (input) =>
      updateProviderAccountCredentialForConnectorSync(client, input),
  };
}

export function createProviderCredentialResolver(
  options: CreateProviderCredentialResolverOptions,
): ProviderCredentialResolver {
  const outcomeBindings = new Map<string, ProviderOutcomeBinding>();
  return {
    async recordConnectorProviderOutcomes(job, results) {
      try {
        await recordConnectorProviderOutcomes(options.store, job, results, outcomeBindings);
      } finally {
        for (const provider of job.providers) {
          outcomeBindings.delete(providerOutcomeBindingKey(job, provider));
        }
      }
    },
    async resolveConnectorProviderConfigs(job) {
      const configs: MutableLiveConnectorProviderConfigs = {};
      const credentialSources: MutableConnectorCredentialSources = {};
      const failures: Partial<Record<ConnectorProvider, ProviderCredentialFailureCode>> = {};
      const site = await options.store.getSite({
        organizationId: job.organizationId,
        siteId: job.siteId,
      });

      if (site === null || site.organizationId !== job.organizationId || site.id !== job.siteId) {
        for (const provider of job.providers) {
          failures[provider] = "connector_missing";
        }
        return { configs, credentialSources, failures };
      }

      for (const provider of job.providers) {
        outcomeBindings.delete(providerOutcomeBindingKey(job, provider));
        if (provider === "cms") {
          failures.cms = "connector_missing";
          continue;
        }
        if (provider === "pagespeed") {
          if (options.pagespeedApiKey) {
            configs.pagespeed = {
              apiKey: options.pagespeedApiKey,
              siteUrl: job.siteDomain,
            };
            credentialSources.pagespeed = "platform";
          } else {
            failures.pagespeed = "account_missing";
          }
          continue;
        }

        const connector = await options.store.getSiteConnector({
          organizationId: job.organizationId,
          provider,
          siteId: job.siteId,
        });

        if (connector !== null) {
          if (connector.provider !== provider) {
            failures[provider] = "connector_missing";
            continue;
          }
          const resolution = await resolveEncryptedConnector({
            connector,
            job,
            options,
          });
          if (resolution.ok) {
            assignProviderConfig(configs, provider, resolution.config);
            credentialSources[provider] = "encrypted";
            outcomeBindings.set(
              providerOutcomeBindingKey(job, provider),
              resolution.binding,
            );
          } else {
            outcomeBindings.delete(providerOutcomeBindingKey(job, provider));
            failures[provider] = resolution.code;
            await recordResolutionFailure(
              options.store,
              job,
              connector,
              resolution.code,
              resolution.account,
              resolution.allowStatusFeedback,
            );
          }
          continue;
        }

        if (options.storageMode === "dual") {
          const legacyCredentials = isGoogleConnectorProvider(provider)
            ? await options.store.listLegacyGoogleCredentials({
                organizationId: job.organizationId,
                providers: [provider],
                siteId: job.siteId,
              })
            : [];
          const fallback = resolveLegacyConnector(provider, job, legacyCredentials, options);
          if (fallback !== null) {
            assignProviderConfig(configs, provider, fallback);
            credentialSources[provider] = "legacy";
            continue;
          }
        }

        failures[provider] = "connector_missing";
      }

      return { configs, credentialSources, failures };
    },
  };
}

async function resolveEncryptedConnector(input: {
  readonly connector: SiteConnector;
  readonly job: ConnectorSyncJobPayload;
  readonly options: CreateProviderCredentialResolverOptions;
}): Promise<ProviderResolution> {
  const { connector, job, options } = input;
  if (
    connector.organizationId !== job.organizationId ||
    connector.siteId !== job.siteId ||
    connector.providerAccountId.length === 0
  ) {
    return failure("account_missing");
  }

  const account = await options.store.getProviderAccount({
    organizationId: job.organizationId,
    providerAccountId: connector.providerAccountId,
  });
  if (!isCompatibleAccount(account, connector, job.organizationId)) {
    return failure("account_missing");
  }

  const accountFailure = validateAccountStatus(account);
  if (accountFailure !== null) {
    return failure(accountFailure, account);
  }
  if (
    isGoogleConnectorProvider(connector.provider) &&
    !account.scopes.includes(googleRequiredScopes[connector.provider])
  ) {
    return failure("scope_missing", account);
  }

  try {
    if (connector.provider === "bing") {
      const secret = decryptProviderCredential(options.keyring, credentialContext(account), account);
      if (secret.kind !== "api_key" || connector.externalResourceId === null) {
        return failure("connector_missing", account);
      }
      return success(
        { apiKey: secret.apiKey, siteUrl: connector.externalResourceId },
        providerOutcomeBinding(account, connector),
      );
    }

    const propertyId = normalizeGoogleResource(connector, job.siteDomain);
    if (propertyId === null) {
      return failure("connector_missing", account);
    }
    const credential = await resolveGoogleCredential(account, connector.provider, options);
    return success(
      {
        credential: toGoogleCredential(connector.provider, credential.secret, account),
        propertyId,
      },
      {
        accountUpdatedAt: credential.accountUpdatedAt,
        connectorUpdatedAt: connector.updatedAt,
        providerAccountId: account.id,
      },
    );
  } catch (error) {
    if (error instanceof ProviderCredentialResolutionError) {
      return failure(error.code, account, error.allowStatusFeedback);
    }
    if (error instanceof CredentialDecryptionError) {
      return failure("credential_decryption_failed", account);
    }
    if (error instanceof ProviderAccountRefreshLockError) {
      return failure("provider_rate_limited", account, false);
    }
    return failure("provider_rate_limited", account, false);
  }
}

async function resolveGoogleCredential(
  initialAccount: ProviderAccountSecretRecord,
  requestedProvider: "gsc" | "ga4",
  options: CreateProviderCredentialResolverOptions,
) {
  const now = options.now?.() ?? new Date();
  if (!shouldRefresh(initialAccount.tokenExpiresAt, now)) {
    return {
      accountUpdatedAt: initialAccount.updatedAt,
      secret: decryptOAuthCredential(initialAccount, options.keyring),
    };
  }
  if (options.refreshLock === undefined) {
    throw new ProviderCredentialResolutionError("credential_expired");
  }

  return options.refreshLock.withLock(
    `provider-account-refresh:${initialAccount.id}`,
    async () => {
      const account = await options.store.getProviderAccount({
        organizationId: initialAccount.organizationId,
        providerAccountId: initialAccount.id,
      });
      assertValidGoogleAccountReread(account, initialAccount, requestedProvider);
      const lockedNow = options.now?.() ?? new Date();
      const currentSecret = decryptOAuthCredential(account, options.keyring);
      if (!shouldRefresh(account.tokenExpiresAt, lockedNow)) {
        return { accountUpdatedAt: account.updatedAt, secret: currentSecret };
      }
      if (
        currentSecret.refreshToken === null ||
        !options.googleOAuthClientId ||
        !options.googleOAuthClientSecret
      ) {
        throw new ProviderCredentialResolutionError("credential_expired");
      }

      const refreshed = await refreshGoogleCredential({
        clientId: options.googleOAuthClientId,
        clientSecret: options.googleOAuthClientSecret,
        fetchImpl: options.fetch ?? fetch,
        now: lockedNow,
        refreshToken: currentSecret.refreshToken,
      });
      const encryptedCredential = encryptProviderCredential(
        options.keyring,
        credentialContext(account),
        {
          accessToken: refreshed.accessToken,
          kind: "oauth2",
          refreshToken: currentSecret.refreshToken,
          tokenType: refreshed.tokenType,
        },
      );
      const updated = await options.store.updateProviderAccountCredential({
        encryptedCredential,
        expectedUpdatedAt: account.updatedAt,
        organizationId: account.organizationId,
        providerAccountId: account.id,
        status: "connected",
        tokenExpiresAt: refreshed.expiresAt,
      });
      if (!updated) {
        const latest = await options.store.getProviderAccount({
          organizationId: account.organizationId,
          providerAccountId: account.id,
        });
        assertValidGoogleAccountReread(latest, account, requestedProvider);
        if (shouldRefresh(latest.tokenExpiresAt, lockedNow)) {
          throw new ProviderCredentialResolutionError("credential_expired");
        }
        return {
          accountUpdatedAt: latest.updatedAt,
          secret: decryptOAuthCredential(latest, options.keyring),
        };
      }

      return {
        accountUpdatedAt: updated.updatedAt,
        secret: {
          accessToken: refreshed.accessToken,
          kind: "oauth2" as const,
          refreshToken: currentSecret.refreshToken,
          tokenType: refreshed.tokenType,
        },
      };
    },
  );
}

async function refreshGoogleCredential(input: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl: typeof fetch;
  readonly now: Date;
  readonly refreshToken: string;
}) {
  let response: Response;
  try {
    response = await input.fetchImpl("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
  } catch {
    throw new ProviderCredentialResolutionError("provider_rate_limited", false);
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      const oauthError = await readBoundedGoogleOAuthError(response);
      if (oauthError === "invalid_grant") {
        throw new ProviderCredentialResolutionError("credential_revoked", true);
      }
    }
    throw new ProviderCredentialResolutionError("provider_rate_limited", false);
  }
  let payload: {
    readonly access_token?: unknown;
    readonly expires_in?: unknown;
    readonly token_type?: unknown;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new ProviderCredentialResolutionError("provider_rate_limited", false);
  }
  if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
    throw new ProviderCredentialResolutionError("provider_rate_limited", false);
  }
  const expiresIn =
    typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;

  return {
    accessToken: payload.access_token,
    expiresAt: new Date(input.now.getTime() + expiresIn * 1000),
    tokenType:
      typeof payload.token_type === "string" && payload.token_type.length > 0
        ? payload.token_type
        : "Bearer",
  };
}

async function readBoundedGoogleOAuthError(
  response: Response,
): Promise<"invalid_grant" | null> {
  const maximumBytes = 4_096;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (response.body === null) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    const parsed = JSON.parse(body) as unknown;
    return parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error === "invalid_grant"
      ? "invalid_grant"
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function resolveLegacyConnector(
  provider: SiteConnectorProvider,
  job: ConnectorSyncJobPayload,
  credentials: readonly ConnectorOAuthCredentialForSync[],
  options: CreateProviderCredentialResolverOptions,
): ProviderConfig | null {
  if (provider === "bing") {
    return options.globalBingApiKey
      ? { apiKey: options.globalBingApiKey, siteUrl: job.siteDomain }
      : null;
  }
  const credential = credentials.find(
    (candidate) => candidate.provider === provider && candidate.status === "connected",
  );
  if (credential === undefined) {
    return null;
  }
  const googleCredential = toLegacyGoogleCredential(credential);
  if (provider === "gsc") {
    return { credential: googleCredential, propertyId: normalizeSiteUrl(job.siteDomain) };
  }
  const propertyId = normalizeGa4PropertyId(options.legacyGa4PropertyId);
  return propertyId === null ? null : { credential: googleCredential, propertyId };
}

async function recordResolutionFailure(
  store: ProviderCredentialResolverStore,
  job: ConnectorSyncJobPayload,
  connector: SiteConnector,
  code: ProviderCredentialFailureCode,
  account?: ProviderAccountSecretRecord,
  allowStatusFeedback = true,
) {
  if (
    !allowStatusFeedback ||
    account === undefined ||
    account.id !== connector.providerAccountId ||
    account.organizationId !== job.organizationId
  ) {
    return;
  }
  const metadata = failureStatusMetadata(code);
  await store
    .applyProviderFeedback({
      accountStatus:
        account.status === "connected" ? metadata.accountStatus : null,
      expectedAccountStatus: account.status,
      expectedAccountUpdatedAt: account.updatedAt,
      expectedConnectorUpdatedAt: connector.updatedAt,
      lastCheckedAt: new Date(job.fetchedAt),
      lastErrorCode: code,
      organizationId: job.organizationId,
      provider: connector.provider,
      providerAccountId: account.id,
      siteId: job.siteId,
      status: metadata.connectorStatus,
    })
    .catch(() => false);
}

function failureStatusMetadata(code: ProviderCredentialFailureCode): {
  readonly accountStatus: ProviderAccountStatus | null;
  readonly connectorStatus: SiteConnectorStatus;
} {
  switch (code) {
    case "credential_revoked":
      return { accountStatus: "revoked", connectorStatus: "revoked" };
    case "credential_expired":
      return { accountStatus: "expired", connectorStatus: "expired" };
    case "credential_decryption_failed":
      return { accountStatus: "invalid", connectorStatus: "error" };
    default:
      return { accountStatus: null, connectorStatus: "error" };
  }
}

async function recordConnectorProviderOutcomes(
  store: ProviderCredentialResolverStore,
  job: ConnectorSyncJobPayload,
  results: readonly ConnectorRunResult[],
  bindings: ReadonlyMap<string, ProviderOutcomeBinding>,
) {
  for (const result of results) {
    if (
      result.fixture ||
      !job.providers.includes(result.provider) ||
      !isSiteConnectorProvider(result.provider)
    ) {
      continue;
    }
    const binding = bindings.get(providerOutcomeBindingKey(job, result.provider));
    if (binding === undefined) {
      continue;
    }
    const connector = await store.getSiteConnector({
      organizationId: job.organizationId,
      provider: result.provider,
      siteId: job.siteId,
    });
    if (
      connector === null ||
      connector.organizationId !== job.organizationId ||
      connector.siteId !== job.siteId ||
      connector.provider !== result.provider ||
      connector.providerAccountId !== binding.providerAccountId
    ) {
      continue;
    }
    const account = await store.getProviderAccount({
      organizationId: job.organizationId,
      providerAccountId: binding.providerAccountId,
    });
    if (
      !isCompatibleAccount(account, connector, job.organizationId) ||
      account.status !== "connected" ||
      account.updatedAt !== binding.accountUpdatedAt
    ) {
      continue;
    }

    if (result.status === "ok") {
      await store.applyProviderFeedback({
        accountStatus: null,
        expectedAccountStatus: "connected",
        expectedAccountUpdatedAt: binding.accountUpdatedAt,
        expectedConnectorUpdatedAt: binding.connectorUpdatedAt,
        lastCheckedAt: new Date(result.fetchedAt),
        lastErrorCode: null,
        organizationId: job.organizationId,
        provider: connector.provider,
        providerAccountId: binding.providerAccountId,
        siteId: job.siteId,
        status: "connected",
      }).catch(() => false);
      continue;
    }

    const code = parseProviderCredentialFailureCode(result.error?.code);
    if (code === null) {
      continue;
    }
    const metadata = failureStatusMetadata(code);
    await store
      .applyProviderFeedback({
        accountStatus:
          metadata.accountStatus === "expired" || metadata.accountStatus === "revoked"
            ? metadata.accountStatus
            : null,
        expectedAccountStatus: "connected",
        expectedAccountUpdatedAt: binding.accountUpdatedAt,
        expectedConnectorUpdatedAt: binding.connectorUpdatedAt,
        lastCheckedAt: new Date(result.fetchedAt),
        lastErrorCode: code,
        organizationId: job.organizationId,
        provider: connector.provider,
        providerAccountId: binding.providerAccountId,
        siteId: job.siteId,
        status: metadata.connectorStatus,
      })
      .catch(() => false);
  }
}

interface ProviderOutcomeBinding {
  readonly accountUpdatedAt: string;
  readonly connectorUpdatedAt: string;
  readonly providerAccountId: string;
}

function providerOutcomeBinding(
  account: ProviderAccountSecretRecord,
  connector: SiteConnector,
): ProviderOutcomeBinding {
  return {
    accountUpdatedAt: account.updatedAt,
    connectorUpdatedAt: connector.updatedAt,
    providerAccountId: account.id,
  };
}

function providerOutcomeBindingKey(
  job: ConnectorSyncJobPayload,
  provider: ConnectorProvider,
) {
  return `${job.connectorSyncRunId}:${provider}`;
}

const providerCredentialFailureCodes = new Set<ProviderCredentialFailureCode>([
  "account_missing",
  "connector_missing",
  "scope_missing",
  "credential_expired",
  "credential_revoked",
  "resource_access_denied",
  "provider_rate_limited",
  "credential_decryption_failed",
]);

function parseProviderCredentialFailureCode(
  code: string | undefined,
): ProviderCredentialFailureCode | null {
  return code !== undefined && providerCredentialFailureCodes.has(code as ProviderCredentialFailureCode)
    ? (code as ProviderCredentialFailureCode)
    : null;
}

function validateAccountStatus(
  account: ProviderAccountSecretRecord,
): ProviderCredentialFailureCode | null {
  if (account.status === "revoked") {
    return "credential_revoked";
  }
  if (account.status === "expired") {
    return "credential_expired";
  }
  if (account.status === "invalid") {
    return "credential_decryption_failed";
  }
  return null;
}

function isCompatibleAccount(
  account: ProviderAccountSecretRecord | null,
  connector: SiteConnector,
  organizationId: string,
): account is ProviderAccountSecretRecord {
  if (
    account === null ||
    account.id !== connector.providerAccountId ||
    account.organizationId !== organizationId
  ) {
    return false;
  }
  return connector.provider === "bing"
    ? account.provider === "bing" && account.authType === "api_key"
    : account.provider === "google" && account.authType === "oauth2";
}

function isSameGoogleAccount(
  account: ProviderAccountSecretRecord | null,
  expected: ProviderAccountSecretRecord,
): account is ProviderAccountSecretRecord {
  return (
    account !== null &&
    account.id === expected.id &&
    account.organizationId === expected.organizationId &&
    account.provider === "google" &&
    account.authType === "oauth2"
  );
}

function assertValidGoogleAccountReread(
  account: ProviderAccountSecretRecord | null,
  expected: ProviderAccountSecretRecord,
  requestedProvider: "gsc" | "ga4",
): asserts account is ProviderAccountSecretRecord {
  if (!isSameGoogleAccount(account, expected)) {
    throw new ProviderCredentialResolutionError("account_missing");
  }
  const statusFailure = validateAccountStatus(account);
  if (statusFailure !== null) {
    throw new ProviderCredentialResolutionError(statusFailure);
  }
  if (!account.scopes.includes(googleRequiredScopes[requestedProvider])) {
    throw new ProviderCredentialResolutionError("scope_missing");
  }
}

function normalizeGoogleResource(connector: SiteConnector, siteDomain: string) {
  if (connector.provider === "ga4") {
    return normalizeGa4PropertyId(connector.externalResourceId);
  }
  if (connector.externalResourceId !== null) {
    return connector.externalResourceId;
  }
  return connector.config.resourceResolution === "legacy_auto"
    ? normalizeSiteUrl(siteDomain)
    : null;
}

function normalizeGa4PropertyId(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const numeric = value.startsWith("properties/") ? value.slice("properties/".length) : value;
  return /^\d+$/.test(numeric) ? `properties/${numeric}` : null;
}

function normalizeSiteUrl(siteDomain: string) {
  return siteDomain.startsWith("http://") || siteDomain.startsWith("https://")
    ? siteDomain.endsWith("/")
      ? siteDomain
      : `${siteDomain}/`
    : `https://${siteDomain}/`;
}

function toGoogleCredential(
  provider: "gsc" | "ga4",
  secret: ReturnType<typeof decryptOAuthCredential>,
  account: ProviderAccountSecretRecord,
): GoogleOAuthCredential {
  return {
    accessToken: secret.accessToken,
    provider,
    status: "connected",
    tokenExpiresAt: account.tokenExpiresAt,
  };
}

function toLegacyGoogleCredential(
  credential: ConnectorOAuthCredentialForSync,
): GoogleOAuthCredential {
  return {
    accessToken: credential.accessToken,
    externalAccountEmail: credential.externalAccountEmail,
    provider: credential.provider,
    status: credential.status,
    tokenExpiresAt: credential.tokenExpiresAt?.toISOString() ?? null,
  };
}

function decryptOAuthCredential(account: ProviderAccountSecretRecord, keyring: CredentialKeyring) {
  const secret = decryptProviderCredential(keyring, credentialContext(account), account);
  if (secret.kind !== "oauth2") {
    throw new CredentialDecryptionError();
  }
  return secret;
}

function credentialContext(account: ProviderAccountSecretRecord) {
  return {
    organizationId: account.organizationId,
    provider: account.provider,
    providerAccountId: account.id,
  };
}

function shouldRefresh(tokenExpiresAt: string | null, now: Date) {
  return (
    tokenExpiresAt !== null &&
    new Date(tokenExpiresAt).getTime() <= now.getTime() + googleRefreshSkewMs
  );
}

function isGoogleConnectorProvider(
  provider: ConnectorProvider,
): provider is "gsc" | "ga4" {
  return provider === "gsc" || provider === "ga4";
}

function isSiteConnectorProvider(
  provider: ConnectorProvider,
): provider is SiteConnectorProvider {
  return provider === "gsc" || provider === "ga4" || provider === "bing";
}

type ProviderConfig = NonNullable<LiveConnectorProviderConfigs[keyof LiveConnectorProviderConfigs]>;
type MutableLiveConnectorProviderConfigs = {
  -readonly [P in keyof LiveConnectorProviderConfigs]?: LiveConnectorProviderConfigs[P];
};
type MutableConnectorCredentialSources = {
  -readonly [P in keyof ConnectorCredentialSources]?: ConnectorCredentialSources[P];
};

function assignProviderConfig(
  configs: MutableLiveConnectorProviderConfigs,
  provider: SiteConnectorProvider,
  config: ProviderConfig,
) {
  if (provider === "bing") {
    configs.bing = config as NonNullable<LiveConnectorProviderConfigs["bing"]>;
  } else if (provider === "ga4") {
    configs.ga4 = config as NonNullable<LiveConnectorProviderConfigs["ga4"]>;
  } else {
    configs.gsc = config as NonNullable<LiveConnectorProviderConfigs["gsc"]>;
  }
}

type ProviderResolution =
  | {
      readonly binding: ProviderOutcomeBinding;
      readonly ok: true;
      readonly config: ProviderConfig;
    }
  | {
      readonly account?: ProviderAccountSecretRecord;
      readonly allowStatusFeedback: boolean;
      readonly ok: false;
      readonly code: ProviderCredentialFailureCode;
    };

function success(
  config: ProviderConfig,
  binding: ProviderOutcomeBinding,
): ProviderResolution {
  return { binding, config, ok: true };
}

function failure(
  code: ProviderCredentialFailureCode,
  account?: ProviderAccountSecretRecord,
  allowStatusFeedback = true,
): ProviderResolution {
  return {
    ...(account === undefined ? {} : { account }),
    allowStatusFeedback,
    code,
    ok: false,
  };
}

class ProviderCredentialResolutionError extends Error {
  constructor(
    readonly code: ProviderCredentialFailureCode,
    readonly allowStatusFeedback = true,
  ) {
    super(code);
    this.name = "ProviderCredentialResolutionError";
  }
}

class ProviderAccountRefreshLockError extends Error {
  constructor() {
    super("provider_account_refresh_lock_timeout");
    this.name = "ProviderAccountRefreshLockError";
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
