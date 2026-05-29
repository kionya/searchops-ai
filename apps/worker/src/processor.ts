import {
  monitorFixtureGeoAnswersBatch,
  syncLiveConnectors,
  syncFixtureConnectors,
  type ConnectorBatchSyncRequest,
  type ConnectorBatchSyncResult,
  type GeoAnswerMonitorBatchRequest,
  type GeoAnswerMonitorBatchResult,
  type SchemaRichResultValidatorAdapterInput
} from "@searchops/connectors";
import { crawlSite, extractSeoSignals, type CrawlSiteInput } from "@searchops/crawler-core";
import { extractJsonLdTypes, validateJsonLdDraft } from "@searchops/schema-core";
import { evaluateGeoVisibility } from "@searchops/geo-core";
import {
  persistGeoAnswerMonitorJobResult,
  persistSchemaRichResultValidationJobResult,
  listConnectorOAuthCredentialsForSync,
  markConnectorSyncRunFailed,
  markCrawlRunFailed,
  persistConnectorSyncJobResult,
  persistCrawlJobResult,
  persistSchemaRecommendationRecheck,
  updateConnectorOAuthCredentialForSync,
  type ConnectorSyncPersistenceClient,
  type CrawlPersistenceClient,
  type GeoVisibilityPersistenceClient,
  type SchemaRichResultValidationPersistenceClient,
  type SchemaRecommendationRecheckPersistenceClient
} from "@searchops/db";
import {
  LiveExternalApiModeSchema,
  ConnectorSyncJobPayloadSchema,
  ConnectorSyncJobResultSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  GeoAnswerMonitorJobPayloadSchema,
  GeoAnswerMonitorJobResultSchema,
  SchemaRichResultValidationJobPayloadSchema,
  SchemaRichResultValidationJobResultSchema,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type CrawlJobPageInput,
  type CrawlJobPayload,
  type CrawlJobResult,
  type GeoAnswerMonitorJobPayload,
  type GeoAnswerMonitorJobResult,
  type SchemaRichResultValidationJobPayload,
  type SchemaRichResultValidationJobResult,
  type SchemaRichResultValidationResult
} from "@searchops/types";

export interface ProcessAndPersistCrawlJobOptions {
  readonly crawlSite?: (input: CrawlSiteInput) => Promise<CrawlJobPageInput[]>;
  readonly schemaRecommendationRecheckClient?: SchemaRecommendationRecheckPersistenceClient;
}

export interface ProcessConnectorSyncJobOptions {
  readonly bingApiKey?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly googleOAuthClientId?: string | undefined;
  readonly googleOAuthClientSecret?: string | undefined;
  readonly ga4PropertyId?: string | undefined;
  readonly liveExternalApis?: "disabled" | "enabled";
  readonly now?: () => Date;
  readonly pagespeedApiKey?: string | undefined;
  readonly syncConnectors?: (input: ConnectorBatchSyncRequest) => Promise<ConnectorBatchSyncResult>;
}

export interface ProcessGeoAnswerMonitorJobOptions {
  readonly monitorGeoAnswers?: (
    input: GeoAnswerMonitorBatchRequest,
  ) => Promise<GeoAnswerMonitorBatchResult>;
}

export interface ProcessSchemaRichResultValidationJobOptions {
  readonly validateRichResult?: (
    input: SchemaRichResultValidatorAdapterInput,
  ) => Promise<SchemaRichResultValidationResult>;
}

export function processCrawlJob(input: CrawlJobPayload): CrawlJobResult {
  const payload = CrawlJobPayloadSchema.parse(input);
  const pagesToProcess = payload.pages.slice(0, payload.maxPages);
  const snapshots = pagesToProcess.map((page) => extractPageSignals(page));
  const summary = {
    pagesRequested: payload.pages.length,
    pagesProcessed: snapshots.length,
    internalLinks: snapshots.reduce((sum, snapshot) => sum + snapshot.links.internal.length, 0),
    externalLinks: snapshots.reduce((sum, snapshot) => sum + snapshot.links.external.length, 0),
    images: snapshots.reduce((sum, snapshot) => sum + snapshot.images.length, 0),
    jsonLdBlocks: snapshots.reduce((sum, snapshot) => sum + snapshot.jsonLd.length, 0),
    noindexPages: snapshots.filter((snapshot) => snapshot.indexability.noindex).length
  };

  return CrawlJobResultSchema.parse({
    crawlRunId: payload.crawlRunId,
    siteId: payload.siteId,
    status: snapshots.length > 0 ? "completed" : "empty",
    snapshots,
    summary
  });
}

export async function processConnectorSyncJob(
  input: ConnectorSyncJobPayload,
  options: ProcessConnectorSyncJobOptions = {},
): Promise<ConnectorSyncJobResult> {
  const payload = ConnectorSyncJobPayloadSchema.parse(input);
  const result = await (options.syncConnectors ?? syncFixtureConnectors)({
    fetchedAt: payload.fetchedAt,
    providers: payload.providers
  });

  return ConnectorSyncJobResultSchema.parse({
    connectorSyncRunId: payload.connectorSyncRunId,
    fetchedAt: payload.fetchedAt,
    organizationId: payload.organizationId,
    requestedByUserId: payload.requestedByUserId,
    siteDomain: payload.siteDomain,
    siteId: payload.siteId,
    results: result.results,
    summary: result.summary
  });
}

export async function processAndPersistConnectorSyncJob(
  input: ConnectorSyncJobPayload,
  persistenceClient: ConnectorSyncPersistenceClient,
  options: ProcessConnectorSyncJobOptions = {},
): Promise<ConnectorSyncJobResult> {
  const payload = ConnectorSyncJobPayloadSchema.parse(input);
  try {
    const syncConnectors =
      options.syncConnectors ??
      (await createRuntimeConnectorSync(payload, persistenceClient, options));
    const result = await processConnectorSyncJob(payload, {
      ...options,
      syncConnectors
    });
    await persistConnectorSyncJobResult(persistenceClient, result);
    return result;
  } catch (error) {
    await markConnectorSyncRunFailed(persistenceClient, {
      connectorSyncRunId: payload.connectorSyncRunId,
      error
    });
    throw error;
  }
}

async function createRuntimeConnectorSync(
  payload: ConnectorSyncJobPayload,
  persistenceClient: ConnectorSyncPersistenceClient,
  options: ProcessConnectorSyncJobOptions,
) {
  const liveExternalApis = LiveExternalApiModeSchema.parse(
    options.liveExternalApis ?? "disabled",
  );

  if (liveExternalApis === "disabled") {
    return syncFixtureConnectors;
  }

  const credentials = await refreshExpiredGoogleCredentials(
    await listConnectorOAuthCredentialsForSync(persistenceClient, payload.siteId),
    payload.siteId,
    persistenceClient,
    options,
  );

  return (request: ConnectorBatchSyncRequest) =>
    syncLiveConnectors({
      bingApiKey: options.bingApiKey,
      fetchedAt: request.fetchedAt,
      fetch: options.fetch,
      ga4PropertyId: options.ga4PropertyId,
      googleOAuthCredentials: credentials.map((credential) => ({
        accessToken: credential.accessToken,
        externalAccountEmail: credential.externalAccountEmail,
        provider: credential.provider,
        status: credential.status,
        tokenExpiresAt: credential.tokenExpiresAt?.toISOString() ?? null
      })),
      pagespeedApiKey: options.pagespeedApiKey,
      providers: request.providers,
      siteDomain: payload.siteDomain
    });
}

async function refreshExpiredGoogleCredentials(
  credentials: Awaited<ReturnType<typeof listConnectorOAuthCredentialsForSync>>,
  siteId: string,
  persistenceClient: ConnectorSyncPersistenceClient,
  options: ProcessConnectorSyncJobOptions,
) {
  const now = options.now?.() ?? new Date();

  return Promise.all(
    credentials.map(async (credential) => {
      if (!shouldRefreshGoogleCredential(credential.tokenExpiresAt, now)) {
        return credential;
      }

      if (
        !credential.refreshToken ||
        !options.googleOAuthClientId ||
        !options.googleOAuthClientSecret
      ) {
        return credential;
      }

      try {
        const refreshed = await refreshGoogleAccessToken({
          clientId: options.googleOAuthClientId,
          clientSecret: options.googleOAuthClientSecret,
          fetch: options.fetch,
          now,
          refreshToken: credential.refreshToken
        });
        const updated = await updateConnectorOAuthCredentialForSync(persistenceClient, {
          accessToken: refreshed.accessToken,
          provider: credential.provider,
          siteId,
          tokenExpiresAt: refreshed.expiresAt,
          tokenType: refreshed.tokenType
        });

        return updated ?? {
          ...credential,
          accessToken: refreshed.accessToken,
          tokenExpiresAt: refreshed.expiresAt,
          tokenType: refreshed.tokenType
        };
      } catch {
        return credential;
      }
    }),
  );
}

function shouldRefreshGoogleCredential(tokenExpiresAt: Date | null, now: Date) {
  if (tokenExpiresAt === null) {
    return false;
  }

  return tokenExpiresAt.getTime() <= now.getTime() + 120_000;
}

async function refreshGoogleAccessToken(input: {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof fetch | undefined;
  readonly now: Date;
  readonly refreshToken: string;
}) {
  const fetchImpl = input.fetch ?? fetch;
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token refresh failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!json.access_token) {
    throw new Error("Google OAuth token refresh did not return an access token");
  }

  const expiresInSeconds = typeof json.expires_in === "number" ? json.expires_in : 3600;

  return {
    accessToken: json.access_token,
    expiresAt: new Date(input.now.getTime() + expiresInSeconds * 1000),
    tokenType: json.token_type ?? "Bearer"
  };
}

export async function processGeoAnswerMonitorJob(
  input: GeoAnswerMonitorJobPayload,
  options: ProcessGeoAnswerMonitorJobOptions = {},
): Promise<GeoAnswerMonitorJobResult> {
  const payload = GeoAnswerMonitorJobPayloadSchema.parse(input);
  const monitorResult = await (options.monitorGeoAnswers ?? monitorFixtureGeoAnswersBatch)({
    observedAt: payload.observedAt,
    providers: payload.providers,
    queries: payload.queries,
    target: payload.target
  });
  const visibilityReport = evaluateGeoVisibility(
    {
      observations: [...monitorResult.observations],
      target: payload.target
    },
    {
      evaluatedAt: payload.observedAt
    },
  );

  return GeoAnswerMonitorJobResultSchema.parse({
    organizationId: payload.organizationId,
    siteId: payload.siteId,
    siteDomain: payload.siteDomain,
    requestedByUserId: payload.requestedByUserId,
    observedAt: payload.observedAt,
    providers: payload.providers,
    monitorResults: [...monitorResult.results],
    visibilityReport
  });
}

export async function processAndPersistGeoAnswerMonitorJob(
  input: GeoAnswerMonitorJobPayload,
  persistenceClient: GeoVisibilityPersistenceClient,
  options: ProcessGeoAnswerMonitorJobOptions = {},
): Promise<GeoAnswerMonitorJobResult> {
  const result = await processGeoAnswerMonitorJob(input, options);
  await persistGeoAnswerMonitorJobResult(persistenceClient, result);
  return result;
}

export async function processSchemaRichResultValidationJob(
  input: SchemaRichResultValidationJobPayload,
  options: ProcessSchemaRichResultValidationJobOptions = {},
): Promise<SchemaRichResultValidationJobResult> {
  const payload = SchemaRichResultValidationJobPayloadSchema.parse(input);
  const validationResult = await (options.validateRichResult ?? validateJsonLdDraft)({
    jsonLd: payload.jsonLd,
    recommendedFields: payload.recommendedFields,
    requiredFields: payload.requiredFields,
    type: payload.type,
    url: payload.url
  });

  return SchemaRichResultValidationJobResultSchema.parse({
    recommendationId: payload.recommendationId,
    siteId: payload.siteId,
    siteDomain: payload.siteDomain,
    requestedByUserId: payload.requestedByUserId,
    requestedAt: payload.requestedAt,
    validationResult
  });
}

export async function processAndPersistSchemaRichResultValidationJob(
  input: SchemaRichResultValidationJobPayload,
  persistenceClient: SchemaRichResultValidationPersistenceClient,
  options: ProcessSchemaRichResultValidationJobOptions = {},
): Promise<SchemaRichResultValidationJobResult> {
  const result = await processSchemaRichResultValidationJob(input, options);
  await persistSchemaRichResultValidationJobResult(persistenceClient, result);
  return result;
}

export async function processAndPersistCrawlJob(
  input: CrawlJobPayload,
  persistenceClient: CrawlPersistenceClient,
  options: ProcessAndPersistCrawlJobOptions = {},
): Promise<CrawlJobResult> {
  let payload = CrawlJobPayloadSchema.parse(input);
  try {
    if (payload.pages.length === 0) {
      const pages = await (options.crawlSite ?? crawlSite)({
        maxPages: payload.maxPages,
        siteDomain: payload.siteDomain,
        startUrl: payload.startUrl
      });
      payload = {
        ...payload,
        pages
      };
    }

    const result = processCrawlJob(payload);
    await persistCrawlJobResult(persistenceClient, result, payload.pages);
    await persistSchemaRecommendationRecheckFromCrawlResult(
      payload,
      result,
      options.schemaRecommendationRecheckClient,
    );
    return result;
  } catch (error) {
    await markCrawlRunFailed(persistenceClient, {
      crawlRunId: payload.crawlRunId,
      error
    });
    throw error;
  }
}

function extractPageSignals(page: CrawlJobPageInput) {
  if (page.finalUrl === undefined) {
    return extractSeoSignals({
      url: page.url,
      html: page.html
    });
  }

  return extractSeoSignals({
    url: page.url,
    finalUrl: page.finalUrl,
    html: page.html
  });
}

async function persistSchemaRecommendationRecheckFromCrawlResult(
  payload: CrawlJobPayload,
  result: CrawlJobResult,
  recheckClient: SchemaRecommendationRecheckPersistenceClient | undefined,
) {
  if (payload.schemaRecommendationId === undefined || payload.schemaRecommendationId === null) {
    return null;
  }

  if (recheckClient === undefined) {
    return null;
  }

  const snapshot = findSchemaRecommendationRecheckSnapshot(payload, result);
  if (snapshot === null) {
    return null;
  }

  return persistSchemaRecommendationRecheck(recheckClient, {
    observedTypes: extractJsonLdTypes(snapshot),
    recommendationId: payload.schemaRecommendationId
  });
}

function findSchemaRecommendationRecheckSnapshot(payload: CrawlJobPayload, result: CrawlJobResult) {
  return (
    result.snapshots.find(
      (snapshot) => snapshot.url === payload.startUrl || snapshot.finalUrl === payload.startUrl,
    ) ??
    result.snapshots[0] ??
    null
  );
}
