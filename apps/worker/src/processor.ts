import {
  filterUnresolvedCitations,
  geoAnswerMonitorProviders,
  monitorFixtureGeoAnswersBatch,
  syncLiveConnectors,
  syncFixtureConnectors,
  type ConnectorBatchSyncRequest,
  type ConnectorBatchSyncResult,
  type CitationDomainResolver,
  type GeoAnswerMonitorBatchRequest,
  type GeoAnswerMonitorBatchResult,
  type SchemaRichResultValidatorAdapterInput
} from "@searchops/connectors";
import { evaluateAeoReadiness } from "@searchops/aeo-core";
import { evaluateCompliance } from "@searchops/compliance";
import {
  crawlSite,
  extractSeoSignals,
  extractVisibleText,
  parseHtml,
  type CrawlSiteInput
} from "@searchops/crawler-core";
import {
  extractJsonLdTypes,
  recommendJsonLdForSnapshots,
  validateJsonLdDraft
} from "@searchops/schema-core";
import {
  GEO_CITATIONS_UNRESOLVED_WARNING,
  GEO_NO_OBSERVATIONS_WARNING,
  evaluateGeoVisibility
} from "@searchops/geo-core";
import { analyzeUrlSeoSnapshots } from "@searchops/seo-core";
import {
  createWorkOrdersFromSeoIssues,
  hasWorkOrderTemplate
} from "@searchops/workorders";
import {
  applyWorkOrderRecheck,
  persistGeoAnswerMonitorJobResult,
  persistSchemaRichResultValidationJobResult,
  markConnectorSyncRunFailed,
  filterAeoReadinessKeywords,
  markCrawlRunFailed,
  persistAeoReadinessReports,
  persistComplianceFlags,
  persistCrawlAnalysisResult,
  persistConnectorSyncJobResult,
  persistCrawlJobResult,
  persistSchemaRecommendationRecheck,
  verifyConnectorSyncRunOwnership,
  verifyGeoVisibilitySiteOwnership,
  type CredentialKeyring,
  type AeoReadinessPersistenceClient,
  type ComplianceFlagPersistenceClient,
  type CrawlAnalysisPersistenceClient,
  type ConnectorSyncPersistenceClient,
  type CrawlPersistenceClient,
  type GeoVisibilityPersistenceClient,
  type RichdocContractBridge,
  type WorkOrderRecheckPersistenceClient,
  type SchemaRichResultValidationPersistenceClient,
  type SchemaRecommendationRecheckPersistenceClient
} from "@searchops/db";
import {
  AeoPageSignalSchema,
  KeywordTargetSchema,
  LiveExternalApiModeSchema,
  ConnectorSyncJobPayloadSchema,
  ConnectorSyncJobResultSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  GeoAnswerMonitorJobPayloadSchema,
  GeoAnswerMonitorJobResultSchema,
  GeoAnswerMonitorResultSchema,
  SchemaRichResultValidationJobPayloadSchema,
  SchemaRichResultValidationJobResultSchema,
  type AeoPageSignal,
  type AeoReadinessReport,
  type ComplianceReviewReport,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type CrawlerPageSnapshot,
  type ConnectorRunResult,
  type CredentialStorageMode,
  type CrawlJobPageInput,
  type CrawlJobPayload,
  type CrawlJobResult,
  type GeoAnswerMonitorJobPayload,
  type GeoAnswerMonitorJobResult,
  type GeoAnswerMonitorProvider,
  type GeoAnswerMonitorResult,
  type GeoCredentialSources,
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
  /** T9: 크롤 후처리 AEO 준비도. 없으면 조용히 건너뛴다(기존 호출부 호환). */
  readonly aeoReadinessClient?: AeoReadinessPersistenceClient;
  /** T9: 크롤 후처리 의료광고법 검수. 플래그만 만들고 게재 판정은 하지 않는다. */
  readonly complianceFlagClient?: ComplianceFlagPersistenceClient;
  /** T8: recheckWorkOrderId 가 있는 크롤 뒤 워크오더 상태 전이·감사 이벤트. */
  readonly workOrderRecheckClient?: WorkOrderRecheckPersistenceClient;
  readonly crawlSite?: (input: CrawlSiteInput) => Promise<CrawlJobPageInput[]>;
  readonly richdocBridge?: RichdocContractBridge;
  readonly schemaRecommendationRecheckClient?: SchemaRecommendationRecheckPersistenceClient;
  /**
   * 크롤 잡을 깨지 않고 삼킨 후처리(AEO·컴플라이언스) 실패를 배치 실행으로 올린다.
   * 없으면 전패해도 워크플로가 초록불이라 0건 상태를 아무도 모른다(richdocBridge.failureCount 와 같은 취지).
   */
  readonly onPostprocessFailure?: (label: string, error: unknown) => void;
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
  /**
   * 인용 도메인 실재 확인기. 주면 라이브 모드에서 DNS 로 확인되지 않는 인용을 집계에서 뺀다.
   * 없으면 검증하지 않는다(fixture·테스트 기본값).
   */
  readonly resolveCitationDomains?: CitationDomainResolver;
  /** 라이브 엔진 실패의 실제 원인(HTTP 상태·Zod 이슈)을 받는다. 결과 코드는 provider_request_failed 로 뭉개지므로 로그는 여기서만 가능하다. */
  readonly onProviderError?: (provider: GeoAnswerMonitorProvider, error: unknown) => void;
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
    // 원본 오류는 다음 줄에서 worker_job_failed 하나로 뭉개지고, DB 요약도 고정
    // 문자열이라 error 인자를 받고 버린다. 그래서 5분 넘게 돌다 죽은 배치를 두고도
    // 단서가 하나도 없었다. 던지는 값은 그대로 두되(코드로 쓰이는 계약이다) 운영자가
    // 볼 수 있게 로그에는 남긴다.
    console.error(
      `[connector-sync] ${payload.siteDomain} 원인: ${describeWorkerFailure(error)}`,
    );
    throw normalizeConnectorWorkerFailure(error);
  }
}

// 값은 남기지 않는다. URL 쿼리스트링에 키가 실려 오는 게 현실적인 유출 경로다
// (PageSpeed 는 ?key=..., Google 토큰 교환은 본문이지만 리다이렉트가 쿼리로 온다).
function redactUrlQueries(text: string): string {
  return text.replace(/\?[^\s"')]*/g, "?<redacted>");
}

// fetch 실패는 message 가 "fetch failed" 뿐이고 진짜 이유는 cause 에 있다. 사슬을
// 따라간다 — 깊이는 막아 둔다(순환 cause 가 있으면 여기서 멈춘다).
function describeWorkerFailure(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) {
    return typeof error;
  }
  const cause =
    depth < 3 && error.cause !== undefined && error.cause !== null
      ? ` <- ${describeWorkerFailure(error.cause, depth + 1)}`
      : "";
  return `${error.name}: ${redactUrlQueries(error.message)}${cause}`;
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
  let credentialSources: GeoCredentialSources = {};
  if (liveExternalApis === "disabled") {
    monitorResult = await monitorFixtureGeoAnswersBatch(request);
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
    credentialSources = filterGeoCredentialSources(
      resolved.credentialSources,
      payload.providers,
    );
    monitorResult = await monitorLiveGeoAnswers(request, resolved, options.onProviderError);
  }
  // AI 가 지어낸 도메인을 인용 집계에서 뺀다. monitorResults 는 "엔진이 이렇게 응답했다" 는
  // 원시 기록이라 손대지 않는다 — 진단서 답변 원문에는 그대로 남아야 사실이 보존된다.
  let observations = monitorResult.observations;
  let unresolvedCitations = 0;
  if (
    liveExternalApis === "enabled" &&
    options.resolveCitationDomains !== undefined &&
    observations.length > 0
  ) {
    const verified = await filterUnresolvedCitations(observations, options.resolveCitationDomains);
    observations = verified.observations;
    unresolvedCitations = verified.unresolved;
  }

  const evaluated =
    observations.length === 0
      ? createEmptyGeoVisibilityReport(payload.target, payload.observedAt)
      : evaluateGeoVisibility(
          {
            observations: [...observations],
            target: payload.target
          },
          {
            evaluatedAt: payload.observedAt
          },
        );
  const visibilityReport =
    unresolvedCitations > 0
      ? {
          ...evaluated,
          warnings: [
            ...(evaluated.warnings ?? []),
            `${GEO_CITATIONS_UNRESOLVED_WARNING}:${unresolvedCitations}`
          ]
        }
      : evaluated;

  return GeoAnswerMonitorJobResultSchema.parse({
    organizationId: payload.organizationId,
    siteId: payload.siteId,
    siteDomain: payload.siteDomain,
    requestedByUserId: payload.requestedByUserId,
    observedAt: payload.observedAt,
    providers: payload.providers,
    credentialSources,
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
    liveShare: 0,
    warnings: [GEO_NO_OBSERVATIONS_WARNING],
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
  onProviderError?: (provider: GeoAnswerMonitorProvider, error: unknown) => void,
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
        const parsedResult = GeoAnswerMonitorResultSchema.safeParse(await adapter.monitor({
          observedAt: request.observedAt,
          queries: request.queries,
          target: request.target,
        }));
        if (!parsedResult.success) {
          onProviderError?.(provider, parsedResult.error);
          return geoProviderFailureResult(provider, "provider_request_failed");
        }
        const result = parsedResult.data;
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
          onProviderError?.(provider, new Error("live adapter returned a non-connector or non-ok result"));
          return geoProviderFailureResult(provider, "provider_request_failed");
        }
        return result;
      } catch (error) {
        onProviderError?.(provider, error);
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
  const payload = GeoAnswerMonitorJobPayloadSchema.parse(input);
  let owned: boolean;
  try {
    owned = await verifyGeoVisibilitySiteOwnership(persistenceClient, {
      organizationId: payload.organizationId,
      siteId: payload.siteId,
    });
  } catch {
    throw new Error("geo_site_ownership_verification_failed");
  }
  if (!owned) {
    throw new Error("geo_site_ownership_mismatch");
  }

  const result = await processGeoAnswerMonitorJob(payload, options);
  try {
    await persistGeoAnswerMonitorJobResult(persistenceClient, result);
  } catch (error) {
    if (error instanceof Error && error.message === "geo_site_ownership_mismatch") {
      throw error;
    }
    throw new Error("geo_visibility_persistence_failed");
  }
  return result;
}

function filterGeoCredentialSources(
  sources: GeoCredentialSources,
  providers: readonly GeoAnswerMonitorProvider[],
): GeoCredentialSources {
  const requested = new Set(providers);
  const filtered: GeoCredentialSources = {};
  for (const provider of ["chatgpt", "claude", "gemini", "perplexity"] as const) {
    const source = sources[provider];
    if (requested.has(provider) && (source === "encrypted" || source === "platform")) {
      filtered[provider] = source;
    }
  }
  return filtered;
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
    // AEO·컴플라이언스는 서로, 그리고 크롤 잡과 독립적으로 보호한다. 여기서 던지면
    // markCrawlRunFailed 가 돌면서 정상 저장된 크롤·SEO 결과까지 실패로 뒤집힌다.
    await runGuarded(
      "aeo-readiness",
      () => persistAeoReadinessFromCrawlResult(payload, result, options.aeoReadinessClient),
      options.onPostprocessFailure,
    );
    await runGuarded(
      "compliance",
      () => persistComplianceFromCrawlResult(payload, result, options.complianceFlagClient),
      options.onPostprocessFailure,
    );
    await persistSchemaRecommendationRecheckFromCrawlResult(
      payload,
      result,
      options.schemaRecommendationRecheckClient,
    );
    if (payload.recheckWorkOrderId && options.workOrderRecheckClient !== undefined) {
      await applyWorkOrderRecheck(options.workOrderRecheckClient, {
        crawlRunId: payload.crawlRunId,
        detectedIssues: analyzeUrlSeoSnapshots(result.snapshots).map((issue) => ({
          ruleId: issue.ruleId,
          url: issue.evidence.url
        })),
        workOrderId: payload.recheckWorkOrderId
      });
    }
    await options.richdocBridge?.syncCrawlRun({
      crawlRunId: payload.crawlRunId,
      siteId: payload.siteId
    });
    return result;
  } catch (error) {
    await markCrawlRunFailed(persistenceClient, {
      crawlRunId: payload.crawlRunId,
      error
    });
    await options.richdocBridge?.syncCrawlRun({
      crawlRunId: payload.crawlRunId,
      siteId: payload.siteId
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

// ── 크롤 후처리 T9: AEO 준비도 · 의료광고법 검수 ────────────────────────────
// SeoIssue·SchemaRecommendation 과 같은 자리에서 돈다. 새 큐·크론·배치 없음.

/**
 * 질문형 헤딩 판정. 결정적이어야 하고 LLM 을 끼우지 않는다.
 * 물음표를 포함하거나, 아래 '의문형이 확실한' 어미로 끝나면 질문형으로 본다.
 *
 * 단독 의문사(왜·어디·언제·무엇·얼마)와 평서형과 겹치는 어미(니까·가요·인가)는 넣지 않는다.
 * 넣으면 "전문의가 직접 하니까"·"보건복지부 인가"·"함께 가요" 같은 평서형 마케팅 헤딩이
 * 질문으로 잡혀 QUESTION_COVERAGE 가 fail→pass 로 뒤집히고, FAQ 가 0건인 페이지가
 * AeoReadinessReport 에 "ready" 로 저장된다. 의문형 -ㅂ니까 는 종성 ㅂ 이 붙은
 * 합니까·입니까·습니까 만 받아 원인 어미 -니까(하니까·이니까)와 갈라둔다.
 */
const QUESTION_HEADING_SUFFIXES = [
  "무엇인가",
  "어떻게",
  "인가요",
  "나요",
  "되나",
  "까요",
  "할까",
  "일까",
  "을까",
  "습니까",
  "합니까",
  "입니까"
] as const;

export function isQuestionHeading(heading: string): boolean {
  const normalized = heading.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (normalized.includes("?") || normalized.includes("？")) {
    return true;
  }

  // 끝의 문장부호·공백만 털어낸다. 어미 판정이 마침표 하나로 어긋나면 안 된다.
  const trimmed = normalized.replace(/[\s.!·…"'”’)\]]+$/u, "");
  return QUESTION_HEADING_SUFFIXES.some((suffix) => trimmed.endsWith(suffix));
}

export function deriveQuestionHeadings(headings: readonly string[]): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const heading of headings) {
    const normalized = heading.trim();
    if (normalized.length === 0 || seen.has(normalized) || !isQuestionHeading(normalized)) {
      continue;
    }
    seen.add(normalized);
    questions.push(normalized);
  }
  return questions;
}

/**
 * 질문(키워드)과 대조할 페이지 텍스트. 제목·헤딩·URL 경로만 본다 — 본문 전체를 넣으면
 * 푸터·내비에 든 흔한 단어가 전 페이지에 걸려 매칭이 무의미해진다.
 */
function aeoMatchHaystack(snapshot: CrawlerPageSnapshot): string {
  let path = "";
  try {
    // 한글 URL 은 퍼센트 인코딩돼 들어온다. 디코드하지 않으면 경로가 매칭에 기여하지 못한다.
    path = decodeURIComponent(new URL(snapshot.url).pathname);
  } catch {
    path = snapshot.url;
  }

  return [snapshot.title ?? "", snapshot.headings.h1.join(" "), snapshot.headings.h2.join(" "), path]
    .join(" ")
    .toLowerCase();
}

/**
 * 질문 1건을 평가할 페이지를 고른다. 결정적이어야 하고 LLM 을 끼우지 않는다(AGENTS.md).
 *
 * 왜 필요한가: AEO 준비도 7룰 중 6룰이 페이지만 보는 순수 함수고(packages/aeo-core),
 * 유일한 키워드 의존 룰 KEYWORD_INTENT_DEFINED 는 항상 pass·100 이다. 그래서 페이지 1장을
 * 전 키워드에 재사용하면 점수가 수학적으로 전부 같아진다 — 실측에서 질문 8건이 모두 46점이었다.
 *
 * 매칭 실패(겹치는 토큰 0개)는 대표 페이지로 폴백하고 matched:false 로 알린다. 억지로
 * 아무 페이지나 붙이면 F 절이 '질문별로 다른 페이지를 쟀다'고 거짓말한다.
 *
 * ponytail: 공백 토큰 부분일치 개수라는 얕은 휴리스틱이고, 키워드마다 전 스냅샷의 haystack 을
 * 다시 만든다(O(키워드 × 페이지)). 실측 규모(페이지·키워드 수십)에서는 무시할 만하다 —
 * 한국어는 어절 경계가 없어 형태소 분석 없이는 이 이상 정확해지지도 않는다.
 * 오매칭이나 지연이 실측으로 보이면 그때 haystack 을 크롤런 단위로 한 번만 만들고 룰을 올린다.
 */
export function selectAeoCandidateSnapshot(
  phrase: string,
  snapshots: readonly CrawlerPageSnapshot[],
  fallback: CrawlerPageSnapshot,
): { snapshot: CrawlerPageSnapshot; matched: boolean } {
  const tokens = [...new Set(phrase.toLowerCase().split(/\s+/u).filter((token) => token.length > 0))];
  if (tokens.length === 0) {
    return { snapshot: fallback, matched: false };
  }

  let best: CrawlerPageSnapshot | null = null;
  let bestScore = 0;
  for (const snapshot of snapshots) {
    const haystack = aeoMatchHaystack(snapshot);
    const score = tokens.filter((token) => haystack.includes(token)).length;
    // 동점은 먼저 온 스냅샷이 이긴다 — 입력 순서만으로 결과가 정해져야 재실행이 같은 값을 낸다.
    if (score > bestScore) {
      bestScore = score;
      best = snapshot;
    }
  }

  return best === null ? { snapshot: fallback, matched: false } : { snapshot: best, matched: true };
}

export function toAeoPageSignal(snapshot: CrawlerPageSnapshot): AeoPageSignal {
  return AeoPageSignalSchema.parse({
    url: snapshot.url,
    title: snapshot.title,
    metaDescription: snapshot.metaDescription,
    h1: snapshot.headings.h1[0] ?? null,
    h2: snapshot.headings.h2,
    wordCount: snapshot.content.wordCount,
    schemaTypes: extractJsonLdTypes(snapshot),
    questionHeadings: deriveQuestionHeadings(snapshot.headings.h2),
    answerBlocks: []
  });
}

/** 한 블록의 실패가 크롤 잡 전체를 깨지 않게 감싼다. 대신 실패 사실은 호출부로 올린다. */
async function runGuarded<T>(
  label: string,
  run: () => Promise<T>,
  onFailure?: (label: string, error: unknown) => void,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`[crawl-postprocess] ${label} 실패 — 크롤 결과는 유지한다`, error);
    onFailure?.(label, error);
    return null;
  }
}

async function persistAeoReadinessFromCrawlResult(
  payload: CrawlJobPayload,
  result: CrawlJobResult,
  aeoReadinessClient: AeoReadinessPersistenceClient | undefined,
) {
  if (aeoReadinessClient === undefined || result.snapshots.length === 0) {
    return null;
  }
  if ((payload.analysis?.generateAeoReadiness ?? true) === false) {
    return null;
  }

  const snapshot = findSchemaRecommendationRecheckSnapshot(payload, result);
  if (snapshot === null) {
    return null;
  }

  const keywords = filterAeoReadinessKeywords(
    await aeoReadinessClient.keyword.findMany({ where: { siteId: result.siteId } }),
  );
  if (keywords.length === 0) {
    return null;
  }

  const evaluatedAt = new Date().toISOString();
  const reports: { keywordId: string; report: AeoReadinessReport }[] = [];
  let matchedCount = 0;
  for (const keyword of keywords) {
    // 키워드 1건의 파싱 실패가 크롤 잡을 깨면 안 된다(라우트엔 400 이 있지만 워커엔 없다).
    try {
      const selection = selectAeoCandidateSnapshot(keyword.phrase, result.snapshots, snapshot);
      if (selection.matched) {
        matchedCount += 1;
      }
      reports.push({
        keywordId: keyword.id,
        report: evaluateAeoReadiness(
          {
            candidatePage: toAeoPageSignal(selection.snapshot),
            keyword: KeywordTargetSchema.parse({
              siteId: result.siteId,
              phrase: keyword.phrase,
              locale: keyword.locale,
              intent: keyword.intent
            })
          },
          { evaluatedAt },
        )
      });
    } catch (error) {
      console.error(`[crawl-postprocess] AEO 키워드 건너뜀: ${keyword.phrase}`, error);
    }
  }

  // 매칭 0건이면 전 질문이 대표 페이지 1장으로 평가된 것이다 — 그때 점수는 수학적으로 전부 같다.
  console.log(
    `[crawl-postprocess] AEO 페이지 매칭 ${matchedCount}/${keywords.length}건 (${result.siteId})`,
  );

  if (reports.length === 0) {
    return null;
  }

  return persistAeoReadinessReports(aeoReadinessClient, {
    reports,
    siteId: result.siteId
  });
}

/** 이보다 짧은 본문은 검수 근거가 되지 못한다(빈 페이지·리다이렉트 껍데기). */
const MIN_COMPLIANCE_TEXT_LENGTH = 40;

/**
 * 의료 계열 사이트에서만 의료광고법 룰을 돌린다. batch-crawl 은 DB 의 모든 Site 를 긁으므로
 * 게이트가 없으면 토너 판매·영어 SaaS 사이트가 본문 속 "laser"·"treatment" 한 단어로
 * kr-medical 룰팩에 걸려 매일 밤 의료법 플래그를 받는다.
 * Site.industry 는 자유 문자열이라(스키마상 nullable) 한글 진료과명도 그대로 들어온다.
 */
const MEDICAL_INDUSTRY_PATTERN =
  /(clinic|dental|dermatolog|hospital|medical|medicine|surgery|의료|의원|병원|클리닉|피부과|성형|치과|한의원|안과|이비인후과|정형외과|산부인과)/iu;

export function isMedicalIndustry(industry: string | null): boolean {
  return industry !== null && MEDICAL_INDUSTRY_PATTERN.test(industry);
}

async function persistComplianceFromCrawlResult(
  payload: CrawlJobPayload,
  result: CrawlJobResult,
  complianceFlagClient: ComplianceFlagPersistenceClient | undefined,
) {
  if (complianceFlagClient === undefined || result.snapshots.length === 0) {
    return null;
  }
  if ((payload.analysis?.generateComplianceFlags ?? true) === false) {
    return null;
  }

  const site = await complianceFlagClient.site.findUnique({ where: { id: result.siteId } });
  if (site === null) {
    return null;
  }
  // 게이트는 사이트 단위로 먼저 친다. 페이지 본문의 영어 단어 하나로 룰팩이 뒤집히면 안 된다.
  if (!isMedicalIndustry(site.industry)) {
    console.log(
      `[crawl-postprocess] 컴플라이언스 건너뜀 — 비의료 industry(${site.industry ?? "null"}): ${result.siteId}`,
    );
    return null;
  }

  // 사이트가 정본이다. ko-KR 하드코딩은 영어권 사이트에 한국 의료광고법을 억지로 붙인다.
  const locale = `${site.language}-${site.country}`;
  const reports: ComplianceReviewReport[] = [];
  // processCrawlJob 이 pages.slice(0, maxPages) 를 그대로 map 하므로 색인이 1:1 이다.
  for (const [index, snapshot] of result.snapshots.entries()) {
    const page = payload.pages[index];
    if (page === undefined) {
      continue;
    }

    try {
      const text = extractVisibleText(parseHtml(page.html)).trim();
      if (text.length < MIN_COMPLIANCE_TEXT_LENGTH) {
        continue;
      }

      reports.push(
        // 룰팩은 자동 선택(selectComplianceRulePackId)에 맡긴다. industry 가 정본이다.
        evaluateCompliance({
          siteId: result.siteId,
          subjectType: "page_copy",
          subjectId: null,
          url: snapshot.url,
          title: snapshot.title,
          text,
          locale,
          industry: site.industry,
          // 크롤한 페이지는 이미 공개돼 있다. draft 로 속이지 않는다.
          publishState: "published",
          source: "crawl"
        }),
      );
    } catch (error) {
      console.error(`[crawl-postprocess] 컴플라이언스 페이지 건너뜀: ${snapshot.url}`, error);
    }
  }

  if (reports.length === 0) {
    return null;
  }

  // "검수했는데 깨끗함"과 "룰이 아예 안 돌았음"은 둘 다 플래그 0건이라 로그로만 갈린다.
  // isMedicalContext 가 영어 단어 정규식이라 순 한글 본문 + 한글 industry 는 global 로 떨어진다.
  const rulePackCounts = new Map<string, number>();
  for (const report of reports) {
    rulePackCounts.set(report.rulePackId, (rulePackCounts.get(report.rulePackId) ?? 0) + 1);
  }
  const rulePackSummary = [...rulePackCounts]
    .map(([rulePackId, count]) => `${rulePackId}=${count}`)
    .join(" ");
  console.log(`[crawl-postprocess] 컴플라이언스 룰팩 ${rulePackSummary} (${result.siteId})`);
  if ((rulePackCounts.get("kr-medical") ?? 0) === 0) {
    console.warn(
      `[crawl-postprocess] 의료 사이트인데 kr-medical 로 평가된 페이지가 0건이다 — 룰이 돌지 않았다: ${result.siteId}`,
    );
  }

  // 플래그를 만들 뿐이다. 승인·반려·게재 차단은 사람이 한다(draft-only).
  return persistComplianceFlags(complianceFlagClient, {
    reports,
    siteId: result.siteId
  });
}
