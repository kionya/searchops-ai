import {
  geoAnswerMonitorProviders,
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
import {
  extractJsonLdTypes,
  recommendJsonLdForSnapshots,
  validateJsonLdDraft
} from "@searchops/schema-core";
import { evaluateGeoVisibility } from "@searchops/geo-core";
import { analyzeUrlSeoSnapshots } from "@searchops/seo-core";
import {
  createWorkOrdersFromSeoIssues,
  hasWorkOrderTemplate
} from "@searchops/workorders";
import {
  persistGeoAnswerMonitorJobResult,
  persistSchemaRichResultValidationJobResult,
  markConnectorSyncRunFailed,
  markCrawlRunFailed,
  persistCrawlAnalysisResult,
  persistConnectorSyncJobResult,
  persistCrawlJobResult,
  persistSchemaRecommendationRecheck,
  verifyConnectorSyncRunOwnership,
  type CredentialKeyring,
  type CrawlAnalysisPersistenceClient,
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
  type ConnectorRunResult,
  type CredentialStorageMode,
  type CrawlJobPageInput,
  type CrawlJobPayload,
  type CrawlJobResult,
  type GeoAnswerMonitorJobPayload,
  type GeoAnswerMonitorJobResult,
  type GeoAnswerMonitorProvider,
  type GeoAnswerMonitorResult,
  type SchemaRichResultValidationJobPayload,
  type SchemaRichResultValidationJobResult,
  type SchemaRichResultValidationResult
} from "@searchops/types";

import {
  createDbProviderCredentialResolverStore,
  createProviderCredentialResolver,
  type CreateProviderCredentialResolverOptions,
  type ProviderAccountRefreshLock,
  type ResolvedConnectorProviderConfigs,
  type ResolvedGeoAdapters,
} from "./provider-credential-resolver.js";

export interface ProcessAndPersistCrawlJobOptions {
  readonly crawlAnalysisClient?: CrawlAnalysisPersistenceClient;
  readonly crawlSite?: (input: CrawlSiteInput) => Promise<CrawlJobPageInput[]>;
  readonly schemaRecommendationRecheckClient?: SchemaRecommendationRecheckPersistenceClient;
}

export interface ProcessConnectorSyncJobOptions {
  readonly bingApiKey?: string | undefined;
  readonly credentialKeyring?: CredentialKeyring | undefined;
  readonly credentialStorageMode?: CredentialStorageMode | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly googleOAuthClientId?: string | undefined;
  readonly googleOAuthClientSecret?: string | undefined;
  readonly ga4PropertyId?: string | undefined;
  readonly liveExternalApis?: "disabled" | "enabled";
  readonly now?: () => Date;
  readonly pagespeedApiKey?: string | undefined;
  readonly refreshLock?: ProviderAccountRefreshLock | undefined;
  readonly recordConnectorProviderOutcomes?: (
    input: ConnectorSyncJobPayload,
    results: readonly ConnectorRunResult[],
  ) => Promise<void>;
  readonly resolveConnectorProviderConfigs?: (
    input: ConnectorSyncJobPayload,
  ) => Promise<ResolvedConnectorProviderConfigs>;
  readonly syncConnectors?: (input: ConnectorBatchSyncRequest) => Promise<ConnectorBatchSyncResult>;
}

export interface ProcessGeoAnswerMonitorJobOptions {
  readonly credentialKeyring?: CredentialKeyring | undefined;
  readonly credentialStorageMode?: CredentialStorageMode | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly geoPlatformApiKeys?: CreateProviderCredentialResolverOptions["geoPlatformApiKeys"];
  readonly geoProviderModels?: CreateProviderCredentialResolverOptions["geoProviderModels"];
  readonly liveExternalApis?: "disabled" | "enabled";
  readonly monitorGeoAnswers?: (
    input: GeoAnswerMonitorBatchRequest,
  ) => Promise<GeoAnswerMonitorBatchResult>;
  readonly resolveGeoProviderAdapters?: (
    input: GeoAnswerMonitorJobPayload,
  ) => Promise<ResolvedGeoAdapters>;
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
  const liveExternalApis = LiveExternalApiModeSchema.parse(
    options.liveExternalApis ?? "disabled",
  );
  let syncConnectors = options.syncConnectors;

  if (syncConnectors === undefined && liveExternalApis === "enabled") {
    const resolved = options.resolveConnectorProviderConfigs
      ? await options.resolveConnectorProviderConfigs(payload)
      : missingLiveProviderConfigs(payload.providers);
    syncConnectors = (request) =>
      syncLiveConnectors({
        credentialSources: resolved.credentialSources,
        fetchedAt: request.fetchedAt,
        fetch: options.fetch,
        providerConfigs: resolved.configs,
        providerFailures: resolved.failures,
        providers: request.providers,
      });
  }

  const result = await (syncConnectors ?? syncFixtureConnectors)({
    fetchedAt: payload.fetchedAt,
    providers: payload.providers
  });
  if (liveExternalApis === "enabled") {
    await options.recordConnectorProviderOutcomes?.(payload, result.results);
  }

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
  let ownedRun: boolean;
  try {
    ownedRun = await verifyConnectorSyncRunOwnership(persistenceClient, {
      connectorSyncRunId: payload.connectorSyncRunId,
      organizationId: payload.organizationId,
      siteId: payload.siteId,
    });
  } catch {
    throw new Error("worker_job_failed");
  }
  if (!ownedRun) {
    throw new Error("connector_sync_run_ownership_mismatch");
  }
  try {
    const liveExternalApis = LiveExternalApiModeSchema.parse(
      options.liveExternalApis ?? "disabled",
    );
    const runtimeResolver =
      options.resolveConnectorProviderConfigs === undefined &&
      liveExternalApis === "enabled" &&
      options.syncConnectors === undefined
        ? createRuntimeProviderCredentialResolver(persistenceClient, options)
        : undefined;
    const resolveConnectorProviderConfigs =
      options.resolveConnectorProviderConfigs ??
      runtimeResolver?.resolveConnectorProviderConfigs.bind(runtimeResolver);
    const recordConnectorProviderOutcomes =
      options.recordConnectorProviderOutcomes ??
      runtimeResolver?.recordConnectorProviderOutcomes.bind(runtimeResolver);
    const result = await processConnectorSyncJob(payload, {
      ...options,
      ...(resolveConnectorProviderConfigs === undefined
        ? {}
        : { resolveConnectorProviderConfigs }),
      ...(recordConnectorProviderOutcomes === undefined
        ? {}
        : { recordConnectorProviderOutcomes }),
    });
    await persistConnectorSyncJobResult(persistenceClient, result);
    return result;
  } catch (error) {
    await markConnectorSyncRunFailed(persistenceClient, {
      connectorSyncRunId: payload.connectorSyncRunId,
      error,
      organizationId: payload.organizationId,
      siteId: payload.siteId,
    }).catch(() => undefined);
    throw normalizeConnectorWorkerFailure(error);
  }
}

const safeConnectorWorkerFailureCodes = new Set([
  "connector_sync_run_ownership_changed",
  "connector_sync_run_ownership_mismatch",
  "credential_keyring_invalid",
  "worker_job_failed",
]);

function normalizeConnectorWorkerFailure(error: unknown) {
  return error instanceof Error && safeConnectorWorkerFailureCodes.has(error.message)
    ? error
    : new Error("worker_job_failed");
}

function createRuntimeProviderCredentialResolver(
  persistenceClient: ConnectorSyncPersistenceClient,
  options: ProcessConnectorSyncJobOptions,
) {
  if (options.credentialKeyring === undefined) {
    throw new Error("credential_keyring_invalid");
  }
  const resolver = createProviderCredentialResolver({
    fetch: options.fetch,
    globalBingApiKey: options.bingApiKey,
    googleOAuthClientId: options.googleOAuthClientId,
    googleOAuthClientSecret: options.googleOAuthClientSecret,
    keyring: options.credentialKeyring,
    legacyGa4PropertyId: options.ga4PropertyId,
    now: options.now,
    pagespeedApiKey: options.pagespeedApiKey,
    refreshLock: options.refreshLock,
    storageMode: options.credentialStorageMode ?? "dual",
    store: createDbProviderCredentialResolverStore(persistenceClient),
  });
  return resolver;
}

function missingLiveProviderConfigs(
  providers: readonly ConnectorSyncJobPayload["providers"][number][],
): ResolvedConnectorProviderConfigs {
  return {
    configs: {},
    credentialSources: {},
    failures: Object.fromEntries(
      providers.map((provider) => [provider, "account_missing"]),
    ) as ResolvedConnectorProviderConfigs["failures"],
  };
}

export async function processGeoAnswerMonitorJob(
  input: GeoAnswerMonitorJobPayload,
  options: ProcessGeoAnswerMonitorJobOptions = {},
): Promise<GeoAnswerMonitorJobResult> {
  const payload = GeoAnswerMonitorJobPayloadSchema.parse(input);
  const liveExternalApis = LiveExternalApiModeSchema.parse(
    options.liveExternalApis ?? "disabled",
  );
  const request = {
    observedAt: payload.observedAt,
    providers: payload.providers,
    queries: payload.queries,
    target: payload.target,
  };
  let monitorResult: GeoAnswerMonitorBatchResult;
  if (liveExternalApis === "disabled") {
    monitorResult = await (options.monitorGeoAnswers ?? monitorFixtureGeoAnswersBatch)(request);
  } else {
    let resolved: ResolvedGeoAdapters;
    try {
      resolved = options.resolveGeoProviderAdapters
        ? await options.resolveGeoProviderAdapters(payload)
        : { adapters: {}, credentialSources: {}, failures: {} };
    } catch {
      resolved = {
        adapters: {},
        credentialSources: {},
        failures: Object.fromEntries(
          payload.providers.map((provider) => [provider, "provider_request_failed"]),
        ),
      };
    }
    monitorResult = await monitorLiveGeoAnswers(request, resolved);
  }
  const visibilityReport =
    monitorResult.observations.length === 0
      ? createEmptyGeoVisibilityReport(payload.target, payload.observedAt)
      : evaluateGeoVisibility(
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

function createEmptyGeoVisibilityReport(
  target: GeoAnswerMonitorJobPayload["target"],
  evaluatedAt: string,
): GeoAnswerMonitorJobResult["visibilityReport"] {
  return {
    target,
    status: "not_visible",
    score: 10,
    mentionRate: 0,
    citationRate: 0,
    competitorCitationRate: 0,
    queryCount: 0,
    providerCount: 0,
    observations: [],
    citations: [],
    checks: [
      emptyGeoCheck("BRAND_MENTIONED", 0, ">= 70", "observations.answerText"),
      emptyGeoCheck("OWNED_URL_CITED", 0, ">= 50", "observations.citedUrls"),
      emptyGeoCheck("QUERY_COVERAGE", 0, ">= 3 distinct queries", "observations.query"),
      emptyGeoCheck("PROVIDER_DIVERSITY", 0, ">= 2 providers", "observations.provider"),
      emptyGeoCheck("COMPETITOR_CITATION_RISK", 100, "<= 40", "observations.citedUrls"),
    ],
    generatedBy: "deterministic",
    evaluatedAt,
  };
}

function emptyGeoCheck(
  checkId: GeoAnswerMonitorJobResult["visibilityReport"]["checks"][number]["checkId"],
  score: number,
  expectedValue: string,
  sourceField: string,
): GeoAnswerMonitorJobResult["visibilityReport"]["checks"][number] {
  return {
    checkId,
    status: score >= 80 ? "pass" : score >= 40 ? "warning" : "fail",
    score,
    evidence: { expectedValue, observedValue: 0, sourceField },
  };
}

async function monitorLiveGeoAnswers(
  request: GeoAnswerMonitorBatchRequest,
  resolved: ResolvedGeoAdapters,
): Promise<GeoAnswerMonitorBatchResult> {
  const requestedProviders = new Set(request.providers ?? geoAnswerMonitorProviders);
  const providers = geoAnswerMonitorProviders.filter((provider) =>
    requestedProviders.has(provider),
  );
  const results = await Promise.all(
    providers.map(async (provider): Promise<GeoAnswerMonitorResult> => {
      const failure = resolved.failures[provider];
      if (failure !== undefined) {
        return geoProviderFailureResult(provider, failure);
      }
      const adapter = resolved.adapters[provider];
      if (adapter === undefined) {
        return geoProviderFailureResult(provider, "account_missing");
      }
      try {
        const result = await adapter.monitor({
          observedAt: request.observedAt,
          queries: request.queries,
          target: request.target,
        });
        if (
          result.generatedBy !== "connector" ||
          result.liveExternalApis !== "enabled" ||
          result.provider !== provider ||
          result.status !== "ok" ||
          result.observations.some(
            (observation) =>
              observation.provider !== provider || observation.source !== "connector",
          )
        ) {
          return geoProviderFailureResult(provider, "provider_request_failed");
        }
        return result;
      } catch {
        return geoProviderFailureResult(provider, "provider_request_failed");
      }
    }),
  );
  return {
    observations: results.flatMap((result) => result.observations),
    results,
  };
}

function geoProviderFailureResult(
  provider: GeoAnswerMonitorProvider,
  code: ResolvedGeoAdapters["failures"][GeoAnswerMonitorProvider],
): GeoAnswerMonitorResult {
  if (code === "account_missing" || code === undefined) {
    return {
      error: {
        code: "account_missing",
        message:
          provider === "copilot"
            ? "GEO provider live monitoring is unavailable."
            : "GEO provider credential is not configured.",
      },
      generatedBy: "connector",
      liveExternalApis: "enabled",
      observations: [],
      provider,
      status: "setup_required",
    };
  }
  if (code === "credential_decryption_failed") {
    return {
      error: {
        code,
        message: "GEO provider credential could not be decrypted safely.",
      },
      generatedBy: "connector",
      liveExternalApis: "enabled",
      observations: [],
      provider,
      status: "failed",
    };
  }
  if (code === "provider_rate_limited") {
    return {
      error: {
        code,
        message: "GEO provider request was rate limited.",
      },
      generatedBy: "connector",
      liveExternalApis: "enabled",
      observations: [],
      provider,
      status: "failed",
    };
  }
  return {
    error: {
      code: "provider_request_failed",
      message: "GEO provider request could not be completed safely.",
    },
    generatedBy: "connector",
    liveExternalApis: "enabled",
    observations: [],
    provider,
    status: "failed",
  };
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
    await persistCrawlAnalysisFromCrawlResult(payload, result, options.crawlAnalysisClient);
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

async function persistCrawlAnalysisFromCrawlResult(
  payload: CrawlJobPayload,
  result: CrawlJobResult,
  crawlAnalysisClient: CrawlAnalysisPersistenceClient | undefined,
) {
  if (crawlAnalysisClient === undefined || result.snapshots.length === 0) {
    return null;
  }

  const analysisOptions = {
    generateSchemaRecommendations: payload.analysis?.generateSchemaRecommendations ?? true,
    generateSeoIssues: payload.analysis?.generateSeoIssues ?? true,
    generateWorkOrders: payload.analysis?.generateWorkOrders ?? true
  };
  const seoIssues = analysisOptions.generateSeoIssues
    ? analyzeUrlSeoSnapshots(result.snapshots).filter((issue) => hasWorkOrderTemplate(issue.ruleId))
    : [];
  const workOrders = analysisOptions.generateWorkOrders
    ? createWorkOrdersFromSeoIssues(seoIssues)
    : [];
  const schemaRecommendationSets = analysisOptions.generateSchemaRecommendations
    ? recommendJsonLdForSnapshots({
        site: {
          country: "KR",
          domain: payload.siteDomain,
          id: payload.siteId,
          industry: null,
          language: "ko",
          name: null
        },
        snapshots: result.snapshots
      })
    : [];

  return persistCrawlAnalysisResult(crawlAnalysisClient, {
    crawlRunId: result.crawlRunId,
    schemaRecommendationSets,
    seoIssueWorkOrders: seoIssues.map((issue, index) => ({
      issue,
      workOrder: analysisOptions.generateWorkOrders ? workOrders[index]! : null
    })),
    siteId: result.siteId
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
