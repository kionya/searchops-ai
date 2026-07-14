import {
  BingUrlMetricSchema,
  CmsPageRecordSchema,
  ConnectorRunResultSchema,
  ConnectorOAuthProviderSchema,
  Ga4PageMetricSchema,
  GeoAnswerMonitorRequestSchema,
  GeoAnswerMonitorResultSchema,
  GeoAnswerObservationSchema,
  SchemaRichResultValidationResultSchema,
  GscSearchMetricSchema,
  KeywordDiscoverySetSchema,
  PageSpeedMetricSchema,
  type BingUrlMetric,
  type CmsPageRecord,
  type ConnectorAuthMode,
  type ConnectorCredentialSources,
  type ConnectorOAuthProvider,
  type ConnectorProvider,
  type ConnectorRecord,
  type ConnectorRunResult,
  type ConnectorSyncProviderError,
  type Ga4PageMetric,
  type GeoAnswerMonitorProvider,
  type GeoAnswerMonitorRequest,
  type GeoAnswerMonitorResult,
  type GeoAnswerObservation,
  type GscSearchMetric,
  type KeywordDiscoveryCandidate,
  type KeywordDiscoverySet,
  type JsonLdObject,
  type LiveExternalApiMode,
  type PageSpeedMetric,
  type ProviderCredentialFailureCode,
  type SchemaJsonLdType,
  type SchemaRichResultValidationIssue,
  type SchemaRichResultValidationResult,
  type SchemaRichResultValidationStatus
} from "@searchops/types";

export * from "./cms-webhooks.js";

export const connectorsPackage = "connectors" as const;
export const liveExternalApisDefault = "disabled" as const;
export const liveExternalApisEnabled = "enabled" as const;

export interface ConnectorLiveRuntimeInput {
  readonly credentialStorageMode?: string | null;
  readonly pagespeedApiKey?: string | null;
}

export function shouldEnableConnectorLiveRuntime({
  credentialStorageMode,
  pagespeedApiKey,
}: ConnectorLiveRuntimeInput): boolean {
  return hasConfiguredRuntimeValue(credentialStorageMode) || hasConfiguredRuntimeValue(pagespeedApiKey);
}

function hasConfiguredRuntimeValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const connectorProviders = ["gsc", "ga4", "pagespeed", "bing", "cms"] as const satisfies readonly ConnectorProvider[];

export const geoAnswerMonitorProviders = [
  "chatgpt",
  "perplexity",
  "gemini",
  "copilot",
  "claude"
] as const satisfies readonly GeoAnswerMonitorProvider[];

export const connectorAuthModes = {
  bing: "api_key",
  cms: "api_key",
  ga4: "oauth",
  gsc: "oauth",
  pagespeed: "api_key"
} as const satisfies Record<ConnectorProvider, ConnectorAuthMode>;

export interface GscSearchAnalyticsFixture {
  readonly siteUrl: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly rows: readonly GscSearchAnalyticsFixtureRow[];
}

export interface GscSearchAnalyticsFixtureRow {
  readonly keys: readonly [query: string, page: string, country: string, device: string];
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly position: number;
}

export interface Ga4ReportFixture {
  readonly propertyId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly rows: readonly Ga4ReportFixtureRow[];
}

export interface Ga4ReportFixtureRow {
  readonly dimensionValues: readonly [{ readonly value: string }];
  readonly metricValues: readonly [
    { readonly value: string },
    { readonly value: string },
    { readonly value: string },
    { readonly value: string }
  ];
}

export interface PageSpeedFixture {
  readonly fetchedAt: string;
  readonly url: string;
  readonly strategy: "desktop" | "mobile";
  readonly lighthouseResult: {
    readonly categories: {
      readonly accessibility?: { readonly score: number | null | undefined };
      readonly performance?: { readonly score: number | null | undefined };
      readonly seo?: { readonly score: number | null | undefined };
    };
    readonly audits: {
      readonly "cumulative-layout-shift"?: { readonly numericValue: number | null | undefined };
      readonly "interaction-to-next-paint"?: { readonly numericValue: number | null | undefined };
      readonly "largest-contentful-paint"?: { readonly numericValue: number | null | undefined };
    };
  };
}

export interface BingUrlInspectionFixture {
  readonly siteUrl: string;
  readonly urls: readonly BingUrlInspectionFixtureRow[];
}

export interface BingUrlInspectionFixtureRow {
  readonly url: string;
  readonly indexed: boolean;
  readonly clicks: number;
  readonly impressions: number;
  readonly discoveredAt: string | null;
  readonly lastCrawledAt: string | null;
}

export interface CmsPagesFixture {
  readonly cmsType: string;
  readonly pages: readonly CmsPagesFixtureRow[];
}

export interface CmsPagesFixtureRow {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly status: "archived" | "draft" | "published";
  readonly updatedAt: string;
}

export interface GeoAnswerMonitoringFixture {
  readonly observedAt: string;
  readonly provider: GeoAnswerMonitorProvider;
  readonly rows: readonly GeoAnswerMonitoringFixtureRow[];
}

export interface GeoAnswerMonitoringFixtureRow {
  readonly answerText: string;
  readonly citedUrls: readonly string[];
  readonly locale?: string;
  readonly query: string;
}

export type ConnectorFixtureInput =
  | BingUrlInspectionFixture
  | CmsPagesFixture
  | Ga4ReportFixture
  | GscSearchAnalyticsFixture
  | PageSpeedFixture;

export interface ConnectorSyncRequest {
  readonly fetchedAt: string;
}

export interface ConnectorAdapter {
  readonly authMode: ConnectorAuthMode;
  readonly liveExternalApis: LiveExternalApiMode;
  readonly provider: ConnectorProvider;
  sync(request: ConnectorSyncRequest): Promise<ConnectorRunResult>;
}

export interface FixtureConnectorAdapterConfig {
  readonly fixture: ConnectorFixtureInput;
  readonly provider: ConnectorProvider;
}

export interface ConnectorBatchSyncRequest extends ConnectorSyncRequest {
  readonly providers?: readonly ConnectorProvider[] | undefined;
}

export interface GoogleConnectorOAuthCredential {
  readonly accessToken: string;
  readonly externalAccountEmail?: string | null;
  readonly provider: ConnectorOAuthProvider;
  readonly status?: "connected" | "expired" | "revoked";
  readonly tokenExpiresAt?: string | null;
}

export type GoogleOAuthCredential = GoogleConnectorOAuthCredential;

export interface LiveConnectorProviderConfigs {
  readonly bing?: { readonly apiKey: string; readonly siteUrl: string } | undefined;
  readonly ga4?: {
    readonly credential: GoogleOAuthCredential;
    readonly propertyId: string;
  } | undefined;
  readonly gsc?: {
    readonly credential: GoogleOAuthCredential;
    readonly propertyId: string;
  } | undefined;
  readonly pagespeed?: {
    readonly apiKey?: string | undefined;
    readonly siteUrl: string;
  } | undefined;
}

export interface LiveConnectorBatchSyncRequest extends ConnectorBatchSyncRequest {
  readonly credentialSources?: ConnectorCredentialSources | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly providerConfigs: LiveConnectorProviderConfigs;
  readonly providerFailures?: Partial<
    Record<ConnectorProvider, ProviderCredentialFailureCode>
  > | undefined;
}

export interface LiveGscConnectorAdapterConfig {
  readonly credential: GoogleConnectorOAuthCredential;
  readonly fetch?: typeof fetch | undefined;
  readonly propertyId?: string | undefined;
  readonly rowLimit?: number | undefined;
  readonly siteDomain?: string | undefined;
}

export interface LiveGa4ConnectorAdapterConfig {
  readonly credential: GoogleConnectorOAuthCredential;
  readonly fetch?: typeof fetch | undefined;
  readonly propertyId: string;
}

export interface LivePageSpeedConnectorAdapterConfig {
  readonly apiKey: string;
  readonly fetch?: typeof fetch | undefined;
  readonly siteDomain: string;
  readonly strategy?: "desktop" | "mobile" | undefined;
}

export interface LiveBingConnectorAdapterConfig {
  readonly apiKey: string;
  readonly fetch?: typeof fetch | undefined;
  readonly siteDomain: string;
  readonly urls?: readonly string[] | undefined;
}

export interface ConnectorBatchSyncSummary {
  readonly credentialSources?: ConnectorCredentialSources | undefined;
  readonly failedProviders: number;
  readonly okProviders: number;
  readonly partialProviders: number;
  readonly providerErrors?: Partial<Record<ConnectorProvider, ConnectorSyncProviderError>> | undefined;
  readonly recordCountsByProvider: Readonly<Record<ConnectorProvider, number>>;
  readonly setupRequiredProviders: number;
  readonly totalProviders: number;
  readonly totalRecords: number;
}

export interface ConnectorBatchSyncResult {
  readonly results: readonly ConnectorRunResult[];
  readonly summary: ConnectorBatchSyncSummary;
}

interface ConnectorProviderDiagnosticMetadata {
  readonly code: string;
  readonly nextAction: string;
  readonly operatorMessage: string;
  readonly setupRequired?: boolean | undefined;
}

class ConnectorProviderDiagnosticError extends Error {
  readonly code: string;
  readonly nextAction: string;
  readonly operatorMessage: string;
  readonly setupRequired: boolean;

  constructor(message: string, metadata: ConnectorProviderDiagnosticMetadata) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ConnectorProviderDiagnosticError";
    this.code = metadata.code;
    this.nextAction = metadata.nextAction;
    this.operatorMessage = metadata.operatorMessage;
    this.setupRequired = metadata.setupRequired ?? false;
  }
}

class ConnectorHttpError extends Error {
  constructor(readonly status: number) {
    super("connector_provider_http_error");
    this.name = "ConnectorHttpError";
  }
}

export interface GeoAnswerMonitorAdapter {
  readonly liveExternalApis: LiveExternalApiMode;
  readonly provider: GeoAnswerMonitorProvider;
  monitor(request: GeoAnswerMonitorRequest): Promise<GeoAnswerMonitorResult>;
}

export interface FixtureGeoAnswerMonitorAdapterConfig {
  readonly fixture: GeoAnswerMonitoringFixture;
}

export interface LiveGeoAnswerProviderClientInput {
  readonly observedAt: string;
  readonly query: string;
  readonly queryLocale: string;
  readonly target: GeoAnswerMonitorRequest["target"];
}

export interface LiveGeoAnswerProviderClientResponse {
  readonly answerText: string;
  readonly citedUrls?: readonly string[];
  readonly observedAt?: string;
}

export interface LiveGeoAnswerProviderClient {
  readonly provider: GeoAnswerMonitorProvider;
  ask(input: LiveGeoAnswerProviderClientInput): Promise<LiveGeoAnswerProviderClientResponse>;
}

export interface LiveGeoAnswerMonitorAdapterConfig {
  readonly client: LiveGeoAnswerProviderClient;
  readonly observedAt?: () => string;
  readonly provider?: GeoAnswerMonitorProvider;
}

export interface SchemaRichResultValidatorAdapterInput {
  readonly jsonLd: JsonLdObject;
  readonly recommendedFields?: readonly string[];
  readonly requestedAt?: string;
  readonly requiredFields: readonly string[];
  readonly type: SchemaJsonLdType;
  readonly url: string;
}

export interface LiveSchemaRichResultValidatorClientInput
  extends SchemaRichResultValidatorAdapterInput {
  readonly requestedAt: string;
}

export interface LiveSchemaRichResultValidatorClientResponse {
  readonly eligible: boolean;
  readonly issues?: readonly SchemaRichResultValidationIssue[];
  readonly missingRecommendedFields?: readonly string[];
  readonly missingRequiredFields?: readonly string[];
  readonly recommendedFields?: readonly string[];
  readonly requiredFields?: readonly string[];
  readonly status: SchemaRichResultValidationStatus;
}

export interface LiveSchemaRichResultValidatorClient {
  validate(
    input: LiveSchemaRichResultValidatorClientInput,
  ): Promise<LiveSchemaRichResultValidatorClientResponse>;
}

export interface SchemaRichResultValidatorAdapter {
  readonly liveExternalApis: LiveExternalApiMode;
  validate(input: SchemaRichResultValidatorAdapterInput): Promise<SchemaRichResultValidationResult>;
}

export interface LiveSchemaRichResultValidatorAdapterConfig {
  readonly client: LiveSchemaRichResultValidatorClient;
  readonly requestedAt?: () => string;
}

export interface GeoAnswerMonitorBatchRequest extends GeoAnswerMonitorRequest {
  readonly providers?: readonly GeoAnswerMonitorProvider[];
}

export interface GeoAnswerMonitorBatchResult {
  readonly observations: readonly GeoAnswerObservation[];
  readonly results: readonly GeoAnswerMonitorResult[];
}

export interface KeywordDiscoveryRequest {
  readonly country?: string;
  readonly discoveredAt: string;
  readonly language?: string;
  readonly locale?: string;
  readonly maxCandidates?: number;
  readonly minImpressions?: number;
  readonly siteId: string;
}

export const mockGscSearchAnalyticsFixture: GscSearchAnalyticsFixture = {
  siteUrl: "https://example-clinic.com/",
  startDate: "2026-05-01",
  endDate: "2026-05-20",
  rows: [
    {
      keys: ["seo clinic", "https://example-clinic.com/service/seo", "KR", "mobile"],
      clicks: 12,
      impressions: 120,
      ctr: 0.1,
      position: 3.2
    },
    {
      keys: ["clinic content marketing", "https://example-clinic.com/blog/seo-basics", "KR", "desktop"],
      clicks: 3,
      impressions: 90,
      ctr: 0.0333,
      position: 8.1
    }
  ]
};

export const mockGa4ReportFixture: Ga4ReportFixture = {
  propertyId: "properties/123456",
  startDate: "2026-05-01",
  endDate: "2026-05-20",
  rows: [
    {
      dimensionValues: [{ value: "/service/seo" }],
      metricValues: [{ value: "42" }, { value: "31" }, { value: "4" }, { value: "36" }]
    },
    {
      dimensionValues: [{ value: "/" }],
      metricValues: [{ value: "120" }, { value: "82" }, { value: "9" }, { value: "100" }]
    }
  ]
};

export const mockPageSpeedFixture: PageSpeedFixture = {
  fetchedAt: "2026-05-22T00:00:00.000Z",
  url: "https://example-clinic.com/service/seo",
  strategy: "mobile",
  lighthouseResult: {
    categories: {
      accessibility: { score: 0.88 },
      performance: { score: 0.91 },
      seo: { score: 0.95 }
    },
    audits: {
      "cumulative-layout-shift": { numericValue: 0.03 },
      "interaction-to-next-paint": { numericValue: 180 },
      "largest-contentful-paint": { numericValue: 2120 }
    }
  }
};

export const mockBingUrlInspectionFixture: BingUrlInspectionFixture = {
  siteUrl: "https://example-clinic.com/",
  urls: [
    {
      url: "https://example-clinic.com/service/seo",
      indexed: true,
      clicks: 5,
      impressions: 70,
      discoveredAt: "2026-05-10T00:00:00.000Z",
      lastCrawledAt: "2026-05-20T00:00:00.000Z"
    },
    {
      url: "https://example-clinic.com/draft",
      indexed: false,
      clicks: 0,
      impressions: 0,
      discoveredAt: null,
      lastCrawledAt: null
    }
  ]
};

export const mockCmsPagesFixture: CmsPagesFixture = {
  cmsType: "wordpress",
  pages: [
    {
      id: "wp_101",
      url: "https://example-clinic.com/service/seo",
      title: "SEO service",
      status: "published",
      updatedAt: "2026-05-21T00:00:00.000Z"
    },
    {
      id: "wp_102",
      url: "https://example-clinic.com/draft",
      title: "Draft landing page",
      status: "draft",
      updatedAt: "2026-05-20T00:00:00.000Z"
    }
  ]
};

export const mockChatGptGeoAnswerFixture: GeoAnswerMonitoringFixture = {
  observedAt: "2026-05-25T00:00:00.000Z",
  provider: "chatgpt",
  rows: [
    {
      answerText:
        "Example Clinic is a relevant option for medical SEO planning and cites its service page.",
      citedUrls: ["https://example-clinic.com/service/seo"],
      query: "best seo clinic"
    },
    {
      answerText: "Example Clinic publishes guidance for clinic content marketing.",
      citedUrls: ["https://example-clinic.com/blog/seo-basics"],
      query: "clinic content marketing"
    }
  ]
};

export const mockPerplexityGeoAnswerFixture: GeoAnswerMonitoringFixture = {
  observedAt: "2026-05-25T00:00:00.000Z",
  provider: "perplexity",
  rows: [
    {
      answerText:
        "For best SEO clinic research, Example Clinic and another agency are both mentioned.",
      citedUrls: ["https://example-clinic.com/service/seo", "https://competitor.example/seo"],
      query: "best seo clinic"
    },
    {
      answerText: "The answer discusses clinic content marketing but does not cite the brand.",
      citedUrls: ["https://competitor.example/content"],
      query: "clinic content marketing"
    }
  ]
};

export function normalizeGscSearchAnalytics(input: GscSearchAnalyticsFixture): GscSearchMetric[] {
  return input.rows
    .map((row) => {
      const [query, page, country, device] = row.keys;

      return GscSearchMetricSchema.parse({
        provider: "gsc",
        siteUrl: input.siteUrl,
        query,
        page,
        country,
        device,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        startDate: input.startDate,
        endDate: input.endDate
      });
    })
    .sort((left, right) => `${left.page}:${left.query}`.localeCompare(`${right.page}:${right.query}`));
}

export function normalizeGa4Report(input: Ga4ReportFixture): Ga4PageMetric[] {
  return input.rows
    .map((row) =>
      Ga4PageMetricSchema.parse({
        provider: "ga4",
        propertyId: input.propertyId,
        pagePath: row.dimensionValues[0].value,
        sessions: parseIntegerMetric(row.metricValues[0].value),
        engagedSessions: parseIntegerMetric(row.metricValues[1].value),
        conversions: parseNumberMetric(row.metricValues[2].value),
        totalUsers: parseIntegerMetric(row.metricValues[3].value),
        startDate: input.startDate,
        endDate: input.endDate
      }),
    )
    .sort((left, right) => left.pagePath.localeCompare(right.pagePath));
}

export function normalizePageSpeed(input: PageSpeedFixture): PageSpeedMetric[] {
  const categories = input.lighthouseResult.categories;
  const audits = input.lighthouseResult.audits;

  return [
    PageSpeedMetricSchema.parse({
      provider: "pagespeed",
      url: input.url,
      strategy: input.strategy,
      performanceScore: toPercentScore(readPageSpeedCategoryScore(categories, "performance")),
      accessibilityScore: toPercentScore(readPageSpeedCategoryScore(categories, "accessibility")),
      seoScore: toPercentScore(readPageSpeedCategoryScore(categories, "seo")),
      largestContentfulPaintMs: readPageSpeedAuditNumericValue(audits, "largest-contentful-paint"),
      cumulativeLayoutShift: readPageSpeedAuditNumericValue(audits, "cumulative-layout-shift"),
      interactionToNextPaintMs: readPageSpeedAuditNumericValue(audits, "interaction-to-next-paint"),
      fetchedAt: input.fetchedAt
    })
  ];
}

export function normalizeBingUrlInspection(input: BingUrlInspectionFixture): BingUrlMetric[] {
  return input.urls
    .map((row) =>
      BingUrlMetricSchema.parse({
        provider: "bing",
        siteUrl: input.siteUrl,
        url: row.url,
        indexed: row.indexed,
        clicks: row.clicks,
        impressions: row.impressions,
        discoveredAt: row.discoveredAt,
        lastCrawledAt: row.lastCrawledAt
      }),
    )
    .sort((left, right) => left.url.localeCompare(right.url));
}

export function normalizeCmsPages(input: CmsPagesFixture): CmsPageRecord[] {
  return input.pages
    .map((page) =>
      CmsPageRecordSchema.parse({
        provider: "cms",
        cmsType: input.cmsType,
        externalId: page.id,
        url: page.url,
        title: page.title,
        status: page.status,
        updatedAt: page.updatedAt
      }),
    )
    .sort((left, right) => left.url.localeCompare(right.url));
}

export function normalizeConnectorFixture(
  provider: ConnectorProvider,
  fixture: ConnectorFixtureInput,
): ConnectorRecord[] {
  switch (provider) {
    case "bing":
      return normalizeBingUrlInspection(fixture as BingUrlInspectionFixture);
    case "cms":
      return normalizeCmsPages(fixture as CmsPagesFixture);
    case "ga4":
      return normalizeGa4Report(fixture as Ga4ReportFixture);
    case "gsc":
      return normalizeGscSearchAnalytics(fixture as GscSearchAnalyticsFixture);
    case "pagespeed":
      return normalizePageSpeed(fixture as PageSpeedFixture);
  }

  throw new Error(`Unsupported connector provider: ${provider}`);
}

export function normalizeGeoAnswerMonitoringFixture(
  fixture: GeoAnswerMonitoringFixture,
  request: GeoAnswerMonitorRequest,
): GeoAnswerObservation[] {
  const parsedRequest = GeoAnswerMonitorRequestSchema.parse(request);
  const rowsByQuery = new Map(
    fixture.rows.map((row) => [normalizeMonitorQuery(row.query), row] as const),
  );

  return parsedRequest.queries.map((queryInput) => {
    const row = rowsByQuery.get(normalizeMonitorQuery(queryInput.query));

    return GeoAnswerObservationSchema.parse({
      answerText: row?.answerText ?? "",
      citedUrls: row?.citedUrls ?? [],
      locale: queryInput.locale ?? row?.locale ?? parsedRequest.target.locale,
      observedAt: parsedRequest.observedAt ?? fixture.observedAt,
      provider: fixture.provider,
      query: queryInput.query,
      source: "fixture"
    });
  });
}

export function createConnectorRunResult({
  error,
  fetchedAt,
  fixture = true,
  provider,
  records,
  status = "ok"
}: {
  readonly error?: ConnectorSyncProviderError | undefined;
  readonly fetchedAt: string;
  readonly fixture?: boolean;
  readonly provider: ConnectorProvider;
  readonly records: readonly ConnectorRecord[];
  readonly status?: ConnectorRunResult["status"];
}): ConnectorRunResult {
  return ConnectorRunResultSchema.parse({
    provider,
    status,
    fetchedAt,
    fixture,
    records,
    ...(error ? { error } : {})
  });
}

export function createFailedConnectorRunResult(
  provider: ConnectorProvider,
  fetchedAt: string,
  error?: unknown,
): ConnectorRunResult {
  return createConnectorRunResult({
    ...(error === undefined ? {} : { error: normalizeConnectorSyncError(provider, error) }),
    fetchedAt,
    fixture: false,
    provider,
    records: [],
    status: "failed"
  });
}

export function createSetupRequiredConnectorRunResult(
  provider: ConnectorProvider,
  fetchedAt: string,
  error?: unknown,
): ConnectorRunResult {
  return createConnectorRunResult({
    ...(error === undefined ? {} : { error: normalizeConnectorSyncError(provider, error) }),
    fetchedAt,
    fixture: false,
    provider,
    records: [],
    status: "setup_required"
  });
}

export function createFixtureConnectorAdapter({
  fixture,
  provider
}: FixtureConnectorAdapterConfig): ConnectorAdapter {
  return {
    authMode: connectorAuthModes[provider],
    liveExternalApis: liveExternalApisDefault,
    provider,
    async sync(request) {
      const records = normalizeConnectorFixture(provider, fixture);

      return createConnectorRunResult({
        fetchedAt: request.fetchedAt,
        provider,
        records
      });
    }
  };
}

export function createLiveGscConnectorAdapter({
  credential,
  fetch: fetchImpl = fetch,
  propertyId,
  rowLimit = connectorPageSize,
  siteDomain
}: LiveGscConnectorAdapterConfig): ConnectorAdapter {
  assertGoogleCredential("gsc", credential);
  const siteUrl = propertyId ?? (siteDomain ? normalizeSiteUrl(siteDomain) : "");
  if (!siteUrl) {
    throw new Error("Google Search Console property ID is required");
  }

  return {
    authMode: "oauth",
    liveExternalApis: liveExternalApisEnabled,
    provider: "gsc",
    async sync(request) {
      const dateRange = getConnectorDateRange(request.fetchedAt);
      const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        siteUrl,
      )}/searchAnalytics/query`;

      // startRow 페이지네이션 — GSC는 첫 페이지만 읽으면 키워드가 잘린다.
      const rawRows: NonNullable<GscSearchAnalyticsApiResponse["rows"]>[number][] = [];
      for (let startRow = 0; rawRows.length < connectorMaxRows; startRow += rowLimit) {
        const response = await fetchWithResilience(fetchImpl, endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${credential.accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            dataState: "final",
            dimensions: ["query", "page", "country", "device"],
            rowLimit,
            startRow,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate
          })
        });

        await assertFetchOk(response, "Google Search Console");
        const json = (await response.json()) as GscSearchAnalyticsApiResponse;
        const pageRows = json.rows ?? [];
        rawRows.push(...pageRows);
        if (pageRows.length < rowLimit) {
          break;
        }
      }

      const records = normalizeGscSearchAnalytics({
        siteUrl,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rows: rawRows.map((row) => ({
          keys: toGscKeys(row.keys),
          clicks: toNonNegativeNumber(row.clicks),
          impressions: toNonNegativeNumber(row.impressions),
          ctr: toNonNegativeNumber(row.ctr),
          position: toNonNegativeNumber(row.position)
        }))
      });

      return createConnectorRunResult({
        fetchedAt: request.fetchedAt,
        fixture: false,
        provider: "gsc",
        records
      });
    }
  };
}

export function createLiveGa4ConnectorAdapter({
  credential,
  fetch: fetchImpl = fetch,
  propertyId
}: LiveGa4ConnectorAdapterConfig): ConnectorAdapter {
  assertGoogleCredential("ga4", credential);
  const normalizedPropertyId = normalizeGa4PropertyResourceName(propertyId);

  return {
    authMode: "oauth",
    liveExternalApis: liveExternalApisEnabled,
    provider: "ga4",
    async sync(request) {
      const dateRange = getConnectorDateRange(request.fetchedAt);
      const endpoint = `https://analyticsdata.googleapis.com/v1beta/${normalizedPropertyId}:runReport`;

      // limit/offset 페이지네이션 — GA4는 첫 페이지만 읽으면 행이 잘린다.
      const rawRows: NonNullable<Ga4RunReportApiResponse["rows"]>[number][] = [];
      let rowCount = Number.POSITIVE_INFINITY;
      for (let offset = 0; rawRows.length < connectorMaxRows && offset < rowCount; offset += connectorPageSize) {
        const response = await fetchWithResilience(fetchImpl, endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${credential.accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
            dimensions: [{ name: "pagePath" }],
            metrics: [
              { name: "sessions" },
              { name: "engagedSessions" },
              { name: "conversions" },
              { name: "totalUsers" }
            ],
            limit: connectorPageSize,
            offset
          })
        });

        if (response.status === 403) {
          throw new ConnectorProviderDiagnosticError(
            "Google Analytics Data API request failed with status 403",
            createGa4AccessDeniedDiagnosticWithEmail(credential.externalAccountEmail ?? null),
          );
        }

        await assertFetchOk(response, "Google Analytics Data API");
        const json = (await response.json()) as Ga4RunReportApiResponse;
        rowCount = json.rowCount ?? (json.rows?.length ?? 0);
        const pageRows = json.rows ?? [];
        rawRows.push(...pageRows);
        if (pageRows.length < connectorPageSize) {
          break;
        }
      }

      const records = normalizeGa4Report({
        propertyId: normalizedPropertyId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rows: rawRows.map((row) => ({
          dimensionValues: [{ value: row.dimensionValues?.[0]?.value ?? "/" }],
          metricValues: [
            { value: row.metricValues?.[0]?.value ?? "0" },
            { value: row.metricValues?.[1]?.value ?? "0" },
            { value: row.metricValues?.[2]?.value ?? "0" },
            { value: row.metricValues?.[3]?.value ?? "0" }
          ]
        }))
      });

      return createConnectorRunResult({
        fetchedAt: request.fetchedAt,
        fixture: false,
        provider: "ga4",
        records
      });
    }
  };
}

export function createLivePageSpeedConnectorAdapter({
  apiKey,
  fetch: fetchImpl = fetch,
  siteDomain,
  strategy = "mobile"
}: LivePageSpeedConnectorAdapterConfig): ConnectorAdapter {
  const siteUrl = normalizeSiteUrl(siteDomain);

  return {
    authMode: "api_key",
    liveExternalApis: liveExternalApisEnabled,
    provider: "pagespeed",
    async sync(request) {
      const url = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
      url.searchParams.set("url", siteUrl);
      url.searchParams.set("strategy", strategy);
      url.searchParams.set("key", apiKey);
      url.searchParams.append("category", "performance");
      url.searchParams.append("category", "accessibility");
      url.searchParams.append("category", "seo");

      // PageSpeed(Lighthouse)는 느리고 간헐 실패(terminated/429/5xx)가 잦아 타임아웃을 길게 잡고 재시도.
      const response = await fetchWithResilience(fetchImpl, url, {}, { timeoutMs: pageSpeedRequestTimeoutMs });
      await assertFetchOk(response, "PageSpeed Insights");
      const json = (await response.json()) as PageSpeedFixture;
      const records = normalizePageSpeed({
        ...json,
        fetchedAt: request.fetchedAt,
        strategy,
        url: siteUrl
      });

      return createConnectorRunResult({
        fetchedAt: request.fetchedAt,
        fixture: false,
        provider: "pagespeed",
        records
      });
    }
  };
}

export function createLiveBingConnectorAdapter({
  apiKey,
  fetch: fetchImpl = fetch,
  siteDomain,
  urls
}: LiveBingConnectorAdapterConfig): ConnectorAdapter {
  const siteUrl = normalizeSiteUrl(siteDomain);
  const urlsToInspect = urls ?? [siteUrl];

  return {
    authMode: "api_key",
    liveExternalApis: liveExternalApisEnabled,
    provider: "bing",
    async sync(request) {
      const records = await Promise.all(
        urlsToInspect.map(async (urlToInspect) => {
          const endpoint = new URL("https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo");
          endpoint.searchParams.set("apikey", apiKey);
          endpoint.searchParams.set("siteUrl", siteUrl);
          endpoint.searchParams.set("url", urlToInspect);

          const response = await fetchWithResilience(fetchImpl, endpoint, {});
          await assertFetchOk(response, "Bing Webmaster");
          const json = (await response.json()) as BingUrlInfoApiResponse;
          const info = unwrapBingUrlInfo(json);

          return BingUrlMetricSchema.parse({
            provider: "bing",
            siteUrl,
            url: urlToInspect,
            indexed: Boolean(readFlexibleField(info, ["isIndexed", "IsIndexed", "indexed", "Indexed"])),
            clicks: toNonNegativeInteger(readFlexibleField(info, ["clicks", "Clicks"])),
            impressions: toNonNegativeInteger(readFlexibleField(info, ["impressions", "Impressions"])),
            discoveredAt: toNullableIsoDateTime(
              readFlexibleField(info, ["discoveredAt", "DiscoveredAt", "firstDiscovered", "FirstDiscovered"]),
            ),
            lastCrawledAt: toNullableIsoDateTime(
              readFlexibleField(info, ["lastCrawledAt", "LastCrawledAt", "lastCrawled", "LastCrawled"]),
            )
          });
        }),
      );

      return createConnectorRunResult({
        fetchedAt: request.fetchedAt,
        fixture: false,
        provider: "bing",
        records
      });
    }
  };
}

export function createFixtureGeoAnswerMonitorAdapter({
  fixture
}: FixtureGeoAnswerMonitorAdapterConfig): GeoAnswerMonitorAdapter {
  return {
    liveExternalApis: liveExternalApisDefault,
    provider: fixture.provider,
    async monitor(request) {
      const observations = normalizeGeoAnswerMonitoringFixture(fixture, request);

      return GeoAnswerMonitorResultSchema.parse({
        generatedBy: "fixture",
        liveExternalApis: liveExternalApisDefault,
        observations,
        provider: fixture.provider
      });
    }
  };
}

export function createLiveGeoAnswerMonitorAdapter({
  client,
  observedAt: getObservedAt,
  provider = client.provider
}: LiveGeoAnswerMonitorAdapterConfig): GeoAnswerMonitorAdapter {
  if (client.provider !== provider) {
    throw new Error(`GEO answer monitor client provider mismatch: ${client.provider} != ${provider}`);
  }

  return {
    liveExternalApis: liveExternalApisEnabled,
    provider,
    async monitor(request) {
      const parsedRequest = GeoAnswerMonitorRequestSchema.parse(request);
      const observedAt = parsedRequest.observedAt ?? getObservedAt?.() ?? new Date().toISOString();
      const observations = await Promise.all(
        parsedRequest.queries.map(async (query) => {
          const queryLocale = query.locale ?? parsedRequest.target.locale;
          const response = await client.ask({
            observedAt,
            query: query.query,
            queryLocale,
            target: parsedRequest.target
          });

          return GeoAnswerObservationSchema.parse({
            answerText: response.answerText,
            citedUrls: response.citedUrls ?? [],
            locale: queryLocale,
            observedAt: response.observedAt ?? observedAt,
            provider,
            query: query.query,
            source: "connector"
          });
        }),
      );

      return GeoAnswerMonitorResultSchema.parse({
        generatedBy: "connector",
        liveExternalApis: liveExternalApisEnabled,
        observations,
        provider
      });
    }
  };
}

export function createLiveSchemaRichResultValidatorAdapter({
  client,
  requestedAt: getRequestedAt
}: LiveSchemaRichResultValidatorAdapterConfig): SchemaRichResultValidatorAdapter {
  return {
    liveExternalApis: liveExternalApisEnabled,
    async validate(input) {
      const requestedAt = input.requestedAt ?? getRequestedAt?.() ?? new Date().toISOString();
      const response = await client.validate({
        ...input,
        requestedAt
      });

      return SchemaRichResultValidationResultSchema.parse({
        eligible: response.eligible,
        generatedBy: "connector",
        issues: response.issues ?? [],
        liveExternalApis: liveExternalApisEnabled,
        missingRecommendedFields: response.missingRecommendedFields ?? [],
        missingRequiredFields: response.missingRequiredFields ?? [],
        recommendedFields: response.recommendedFields ?? input.recommendedFields ?? [],
        requiredFields: response.requiredFields ?? input.requiredFields,
        status: response.status,
        type: input.type,
        url: input.url
      });
    }
  };
}

export interface CreateHttpSchemaRichResultValidatorClientOptions {
  readonly url: string;
  readonly token?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

/**
 * Concrete {@link LiveSchemaRichResultValidatorClient} that POSTs a JSON-LD
 * validation request to an operator-supplied HTTP validator endpoint
 * (SEARCHOPS_RICH_RESULT_VALIDATOR_URL) and returns its JSON response. Wrap it
 * with {@link createLiveSchemaRichResultValidatorAdapter} to expose it through
 * the connector boundary.
 *
 * Request body (application/json):
 *   { jsonLd, type, url, requiredFields, recommendedFields, requestedAt }
 * Expected response body ({@link LiveSchemaRichResultValidatorClientResponse}):
 *   { status, eligible, issues?, missingRequiredFields?, missingRecommendedFields?,
 *     recommendedFields?, requiredFields? }
 *
 * `fetchImpl` is injectable for tests only; production uses the global fetch.
 * A non-2xx response throws so the worker job lands in the dead-letter queue
 * instead of silently persisting an empty/invalid validation.
 */
export function createHttpSchemaRichResultValidatorClient(
  options: CreateHttpSchemaRichResultValidatorClientOptions,
): LiveSchemaRichResultValidatorClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async validate(input) {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      if (options.token) {
        headers.authorization = `Bearer ${options.token}`;
      }

      const response = await fetchImpl(options.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonLd: input.jsonLd,
          recommendedFields: input.recommendedFields ?? [],
          requestedAt: input.requestedAt,
          requiredFields: input.requiredFields,
          type: input.type,
          url: input.url
        })
      });

      if (!response.ok) {
        throw new Error(`Rich result validator responded with HTTP ${response.status}`);
      }

      return (await response.json()) as LiveSchemaRichResultValidatorClientResponse;
    }
  };
}

export const fixtureConnectorAdapters = {
  bing: createFixtureConnectorAdapter({
    fixture: mockBingUrlInspectionFixture,
    provider: "bing"
  }),
  cms: createFixtureConnectorAdapter({
    fixture: mockCmsPagesFixture,
    provider: "cms"
  }),
  ga4: createFixtureConnectorAdapter({
    fixture: mockGa4ReportFixture,
    provider: "ga4"
  }),
  gsc: createFixtureConnectorAdapter({
    fixture: mockGscSearchAnalyticsFixture,
    provider: "gsc"
  }),
  pagespeed: createFixtureConnectorAdapter({
    fixture: mockPageSpeedFixture,
    provider: "pagespeed"
  })
} as const satisfies Record<ConnectorProvider, ConnectorAdapter>;

export const fixtureGeoAnswerMonitorAdapters = {
  chatgpt: createFixtureGeoAnswerMonitorAdapter({
    fixture: mockChatGptGeoAnswerFixture
  }),
  claude: createFixtureGeoAnswerMonitorAdapter({
    fixture: createEmptyGeoAnswerMonitoringFixture("claude")
  }),
  copilot: createFixtureGeoAnswerMonitorAdapter({
    fixture: createEmptyGeoAnswerMonitoringFixture("copilot")
  }),
  gemini: createFixtureGeoAnswerMonitorAdapter({
    fixture: createEmptyGeoAnswerMonitoringFixture("gemini")
  }),
  perplexity: createFixtureGeoAnswerMonitorAdapter({
    fixture: mockPerplexityGeoAnswerFixture
  })
} as const satisfies Record<GeoAnswerMonitorProvider, GeoAnswerMonitorAdapter>;

export function getFixtureConnectorAdapter(provider: ConnectorProvider): ConnectorAdapter {
  return fixtureConnectorAdapters[provider];
}

export function getFixtureGeoAnswerMonitorAdapter(
  provider: GeoAnswerMonitorProvider,
): GeoAnswerMonitorAdapter {
  return fixtureGeoAnswerMonitorAdapters[provider];
}

export async function syncFixtureConnector(
  provider: ConnectorProvider,
  request: ConnectorSyncRequest,
): Promise<ConnectorRunResult> {
  return getFixtureConnectorAdapter(provider).sync(request);
}

export async function syncFixtureConnectors({
  fetchedAt,
  providers = connectorProviders
}: ConnectorBatchSyncRequest): Promise<ConnectorBatchSyncResult> {
  const orderedProviders = orderConnectorProviders(providers);
  const results = await Promise.all(
    orderedProviders.map((provider) => syncFixtureConnector(provider, { fetchedAt })),
  );

  return {
    results,
    summary: summarizeConnectorRunResults(results)
  };
}

export async function syncLiveConnectors({
  credentialSources,
  fetchedAt,
  fetch: fetchImpl,
  providerConfigs,
  providerFailures = {},
  providers = connectorProviders,
}: LiveConnectorBatchSyncRequest): Promise<ConnectorBatchSyncResult> {
  const orderedProviders = orderConnectorProviders(providers);
  const results = await Promise.all(
    orderedProviders.map(async (provider) => {
      try {
        const resolutionFailure = providerFailures[provider];
        if (resolutionFailure !== undefined) {
          return createCredentialResolutionFailureResult(provider, fetchedAt, resolutionFailure);
        }

        const adapter = createLiveConnectorAdapter(provider, providerConfigs, fetchImpl);

        if (adapter === null) {
          return createSetupRequiredConnectorRunResult(
            provider,
            fetchedAt,
            createMissingLiveConnectorError(provider, providerConfigs),
          );
        }

        return await adapter.sync({ fetchedAt });
      } catch (error) {
        const credentialFailure = normalizeLiveProviderCredentialFailure(provider, error);
        if (credentialFailure !== null) {
          return createCredentialResolutionFailureResult(provider, fetchedAt, credentialFailure);
        }
        if (isConnectorSetupRequiredError(error)) {
          return createSetupRequiredConnectorRunResult(provider, fetchedAt, error);
        }

        return createFailedConnectorRunResult(provider, fetchedAt, error);
      }
    }),
  );

  return {
    results,
    summary: {
      ...summarizeConnectorRunResults(results),
      ...(credentialSources === undefined ? {} : { credentialSources })
    }
  };
}

export async function monitorFixtureGeoAnswers(
  provider: GeoAnswerMonitorProvider,
  request: GeoAnswerMonitorRequest,
): Promise<GeoAnswerMonitorResult> {
  return getFixtureGeoAnswerMonitorAdapter(provider).monitor(request);
}

export async function monitorFixtureGeoAnswersBatch({
  providers = geoAnswerMonitorProviders,
  ...request
}: GeoAnswerMonitorBatchRequest): Promise<GeoAnswerMonitorBatchResult> {
  const orderedProviders = orderGeoAnswerMonitorProviders(providers);
  const results = await Promise.all(
    orderedProviders.map((provider) => monitorFixtureGeoAnswers(provider, request)),
  );

  return {
    observations: results.flatMap((result) => result.observations),
    results
  };
}

// ---------------------------------------------------------------------------
// Live GEO answer monitor provider clients
//
// Concrete LiveGeoAnswerProviderClient implementations for the answer engines
// that expose an API: ChatGPT (OpenAI), Perplexity (OpenAI-compatible + native
// citations), Gemini (Google), and Claude (Anthropic). Copilot has no public
// API and stays fixture-only. All use injected `fetchImpl` for tests (default
// global fetch in production), matching the rest of this package's adapters.
// Wrap with createLiveGeoAnswerMonitorAdapter to expose through the connector
// boundary.
// ---------------------------------------------------------------------------

const GEO_URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Best-effort extraction of cited URLs from free-text answers (deduped, trailing punctuation trimmed). */
export function extractGeoCitedUrls(text: string): string[] {
  const matches = text.match(GEO_URL_REGEX) ?? [];
  const cleaned = matches.map((url) => url.replace(/[.,;:]+$/, ""));
  return [...new Set(cleaned)];
}

function buildGeoAnswerPrompt(input: LiveGeoAnswerProviderClientInput): string {
  return [
    `You are a general-knowledge answer engine responding to a user in locale ${input.queryLocale} (market ${input.target.market}).`,
    `Question: ${input.query}`,
    "Answer concisely and factually. When you reference specific organizations, clinics, products, or sources, include their full https:// URLs inline so they can be cited."
  ].join("\n");
}

export interface CreateOpenAiCompatibleGeoAnswerClientOptions {
  readonly provider: GeoAnswerMonitorProvider;
  readonly apiKey: string;
  readonly model: string;
  /** Full chat-completions endpoint URL (OpenAI or any OpenAI-compatible host). */
  readonly endpoint: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

interface OpenAiChatCompletionResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string | null } }>;
  /** Perplexity extension: native source citations. */
  readonly citations?: readonly string[];
}

/**
 * OpenAI Chat Completions client, also usable for any OpenAI-compatible host
 * (e.g. Perplexity at https://api.perplexity.ai/chat/completions, which adds a
 * top-level `citations` array). Auth is `Authorization: Bearer <apiKey>`.
 */
export function createOpenAiCompatibleGeoAnswerClient(
  options: CreateOpenAiCompatibleGeoAnswerClientOptions,
): LiveGeoAnswerProviderClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    provider: options.provider,
    async ask(input) {
      const response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messages: [{ content: buildGeoAnswerPrompt(input), role: "user" }],
          model: options.model
        })
      });
      if (!response.ok) {
        throw new Error(`${options.provider} GEO answer API responded with HTTP ${response.status}`);
      }
      const json = (await response.json()) as OpenAiChatCompletionResponse;
      const answerText = json.choices?.[0]?.message?.content ?? "";
      const citedUrls =
        json.citations && json.citations.length > 0
          ? [...new Set(json.citations)]
          : extractGeoCitedUrls(answerText);
      return { answerText, citedUrls, observedAt: input.observedAt };
    }
  };
}

export interface CreateGeminiGeoAnswerClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch | undefined;
  /** Override the Generative Language API base (default v1beta). */
  readonly baseUrl?: string | undefined;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<{ readonly text?: string }> };
  }>;
}

/** Google Gemini (Generative Language API) client. Auth via `x-goog-api-key`. */
export function createGeminiGeoAnswerClient(
  options: CreateGeminiGeoAnswerClientOptions,
): LiveGeoAnswerProviderClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  return {
    provider: "gemini",
    async ask(input) {
      const response = await fetchImpl(`${baseUrl}/models/${options.model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": options.apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildGeoAnswerPrompt(input) }] }]
        })
      });
      if (!response.ok) {
        throw new Error(`gemini GEO answer API responded with HTTP ${response.status}`);
      }
      const json = (await response.json()) as GeminiGenerateContentResponse;
      const answerText = (json.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");
      return { answerText, citedUrls: extractGeoCitedUrls(answerText), observedAt: input.observedAt };
    }
  };
}

export interface CreateAnthropicGeoAnswerClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly baseUrl?: string | undefined;
}

interface AnthropicMessagesResponse {
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
  readonly stop_reason?: string | null;
}

/**
 * Anthropic (Claude) client via the Messages API. Raw HTTP (injected fetch) to
 * match this package's adapter house pattern rather than pulling in the SDK.
 * Headers: `x-api-key` + `anthropic-version: 2023-06-01`. Body omits sampling
 * params (temperature/top_p/top_k 400 on current Opus). A `stop_reason:
 * "refusal"` yields empty content, surfaced here as an empty answer (not an
 * error) so a refused query records a blank observation instead of failing.
 */
export function createAnthropicGeoAnswerClient(
  options: CreateAnthropicGeoAnswerClientOptions,
): LiveGeoAnswerProviderClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com";
  return {
    provider: "claude",
    async ask(input) {
      const response = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": options.apiKey
        },
        body: JSON.stringify({
          max_tokens: options.maxTokens ?? 1024,
          messages: [{ content: buildGeoAnswerPrompt(input), role: "user" }],
          model: options.model
        })
      });
      if (!response.ok) {
        throw new Error(`claude GEO answer API responded with HTTP ${response.status}`);
      }
      const json = (await response.json()) as AnthropicMessagesResponse;
      const answerText = (json.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return { answerText, citedUrls: extractGeoCitedUrls(answerText), observedAt: input.observedAt };
    }
  };
}

/** Default model ids per provider; override via the SEARCHOPS_GEO_*_MODEL env keys. */
export const defaultGeoAnswerProviderModels = {
  chatgpt: "gpt-4o",
  claude: "claude-opus-4-8",
  gemini: "gemini-2.0-flash",
  perplexity: "sonar"
} as const;

export interface LiveGeoAnswerClientKeys {
  readonly chatgptApiKey?: string | undefined;
  readonly chatgptModel?: string | undefined;
  readonly perplexityApiKey?: string | undefined;
  readonly perplexityModel?: string | undefined;
  readonly geminiApiKey?: string | undefined;
  readonly geminiModel?: string | undefined;
  readonly claudeApiKey?: string | undefined;
  readonly claudeModel?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

/**
 * Builds live GEO answer monitor adapters for each provider whose API key is
 * present. Providers without a key are omitted, so the batch runner falls back
 * to fixture for them. Copilot is never built (no public API).
 */
export function createLiveGeoAnswerMonitorAdaptersFromKeys(
  keys: LiveGeoAnswerClientKeys,
): Partial<Record<GeoAnswerMonitorProvider, GeoAnswerMonitorAdapter>> {
  const adapters: Partial<Record<GeoAnswerMonitorProvider, GeoAnswerMonitorAdapter>> = {};
  const fetchImpl = keys.fetchImpl;
  if (keys.chatgptApiKey) {
    adapters.chatgpt = createLiveGeoAnswerMonitorAdapter({
      client: createOpenAiCompatibleGeoAnswerClient({
        apiKey: keys.chatgptApiKey,
        endpoint: "https://api.openai.com/v1/chat/completions",
        fetchImpl,
        model: keys.chatgptModel ?? defaultGeoAnswerProviderModels.chatgpt,
        provider: "chatgpt"
      })
    });
  }
  if (keys.perplexityApiKey) {
    adapters.perplexity = createLiveGeoAnswerMonitorAdapter({
      client: createOpenAiCompatibleGeoAnswerClient({
        apiKey: keys.perplexityApiKey,
        endpoint: "https://api.perplexity.ai/chat/completions",
        fetchImpl,
        model: keys.perplexityModel ?? defaultGeoAnswerProviderModels.perplexity,
        provider: "perplexity"
      })
    });
  }
  if (keys.geminiApiKey) {
    adapters.gemini = createLiveGeoAnswerMonitorAdapter({
      client: createGeminiGeoAnswerClient({
        apiKey: keys.geminiApiKey,
        fetchImpl,
        model: keys.geminiModel ?? defaultGeoAnswerProviderModels.gemini
      })
    });
  }
  if (keys.claudeApiKey) {
    adapters.claude = createLiveGeoAnswerMonitorAdapter({
      client: createAnthropicGeoAnswerClient({
        apiKey: keys.claudeApiKey,
        fetchImpl,
        model: keys.claudeModel ?? defaultGeoAnswerProviderModels.claude
      })
    });
  }
  return adapters;
}

export interface CreateGeoAnswerMonitorBatchRunnerOptions {
  readonly onProviderError?: (provider: GeoAnswerMonitorProvider, error: unknown) => void;
}

/**
 * Batch runner mirroring monitorFixtureGeoAnswersBatch, but using a per-provider
 * live adapter when one exists. Per-provider fallback: a provider with no adapter
 * — or whose live call throws — degrades to fixture for that provider only, so a
 * single outage never fails the whole batch. Drop-in for
 * ProcessGeoAnswerMonitorJobOptions.monitorGeoAnswers.
 */
export function createGeoAnswerMonitorBatchRunner(
  adapters: Partial<Record<GeoAnswerMonitorProvider, GeoAnswerMonitorAdapter>>,
  options: CreateGeoAnswerMonitorBatchRunnerOptions = {},
): (request: GeoAnswerMonitorBatchRequest) => Promise<GeoAnswerMonitorBatchResult> {
  return async ({ providers = geoAnswerMonitorProviders, ...request }: GeoAnswerMonitorBatchRequest) => {
    const orderedProviders = orderGeoAnswerMonitorProviders(providers);
    const results = await Promise.all(
      orderedProviders.map(async (provider) => {
        const adapter = adapters[provider];
        if (adapter === undefined) {
          return monitorFixtureGeoAnswers(provider, request);
        }
        try {
          return await adapter.monitor(request);
        } catch (error) {
          options.onProviderError?.(provider, error);
          return monitorFixtureGeoAnswers(provider, request);
        }
      }),
    );
    return {
      observations: results.flatMap((result) => result.observations),
      results
    };
  };
}

export function summarizeConnectorRunResults(
  results: readonly ConnectorRunResult[],
): ConnectorBatchSyncSummary {
  const recordCountsByProvider = Object.fromEntries(
    connectorProviders.map((provider) => [provider, 0]),
  ) as Record<ConnectorProvider, number>;

  for (const result of results) {
    recordCountsByProvider[result.provider] += result.records.length;
  }
  const providerErrors = summarizeConnectorProviderErrors(results);

  return {
    failedProviders: results.filter((result) => result.status === "failed").length,
    okProviders: results.filter((result) => result.status === "ok").length,
    partialProviders: results.filter((result) => result.status === "partial").length,
    ...(providerErrors ? { providerErrors } : {}),
    recordCountsByProvider,
    setupRequiredProviders: results.filter((result) => result.status === "setup_required").length,
    totalProviders: results.length,
    totalRecords: results.reduce((total, result) => total + result.records.length, 0)
  };
}

function summarizeConnectorProviderErrors(results: readonly ConnectorRunResult[]) {
  const providerErrors: Partial<Record<ConnectorProvider, ConnectorSyncProviderError>> = {};

  for (const result of results) {
    if (result.status === "ok") {
      continue;
    }

    providerErrors[result.provider] = result.error ?? {
      code: "provider_rate_limited",
      message: "Connector provider request could not be completed safely.",
      name: "ConnectorProviderError",
      nextAction: "잠시 후 해당 provider 동기화를 다시 실행하세요.",
      operatorMessage: "Connector provider 요청을 안전하게 완료하지 못했습니다."
    };
  }

  return Object.keys(providerErrors).length > 0 ? providerErrors : undefined;
}

function normalizeConnectorSyncError(
  _provider: ConnectorProvider,
  error: unknown,
): ConnectorSyncProviderError {
  const diagnostic =
    error instanceof Error ? readConnectorProviderDiagnostic(error) : null;
  const safeDiagnostic = diagnostic ?? transientProviderDiagnostic;

  return {
    code: safeDiagnostic.code,
    message: safeConnectorErrorMessage(safeDiagnostic.code),
    name: diagnostic === null ? "ConnectorProviderError" : "ConnectorProviderDiagnosticError",
    nextAction: safeDiagnostic.nextAction,
    operatorMessage: safeDiagnostic.operatorMessage,
    ...(safeDiagnostic.setupRequired ? { setupRequired: true } : {})
  };
}

function readConnectorProviderDiagnostic(
  error: Error,
): ConnectorProviderDiagnosticMetadata | null {
  if (!(error instanceof ConnectorProviderDiagnosticError)) {
    return null;
  }

  return {
    code: error.code,
    nextAction: error.nextAction,
    operatorMessage: error.operatorMessage,
    setupRequired: error.setupRequired
  };
}

const transientProviderDiagnostic: ConnectorProviderDiagnosticMetadata = {
  code: "provider_rate_limited",
  nextAction: "잠시 후 해당 provider 동기화를 다시 실행하세요.",
  operatorMessage: "Connector provider 요청을 안전하게 완료하지 못했습니다."
};

const safeConnectorErrorMessages: Readonly<Record<string, string>> = {
  account_missing: "account_missing",
  bing_api_key_missing: "Bing Webmaster API key is missing in the worker runtime.",
  bing_invalid_api_key: "Bing Webmaster credential is invalid.",
  bing_service_unavailable: "Bing Webmaster provider is temporarily unavailable.",
  cms_live_connector_not_configured:
    "CMS live connector is not configured. Use a CMS webhook or add a provider-specific CMS adapter.",
  connector_missing: "connector_missing",
  credential_decryption_failed: "credential_decryption_failed",
  credential_expired: "credential_expired",
  credential_revoked: "credential_revoked",
  ga4_oauth_missing: "GA4 OAuth credential is missing for this site.",
  ga4_property_access_denied: "GA4 property access is denied.",
  ga4_property_id_invalid: "GA4 property ID is invalid.",
  ga4_property_id_missing: "GA4 property ID is missing for this site.",
  gsc_oauth_missing: "GSC OAuth credential is missing for this site.",
  pagespeed_api_key_missing: "PageSpeed API key is missing in the worker runtime.",
  provider_rate_limited: "Connector provider request could not be completed safely.",
  resource_access_denied: "resource_access_denied",
  scope_missing: "scope_missing"
};

function safeConnectorErrorMessage(code: string) {
  return safeConnectorErrorMessages[code] ?? "Connector provider request failed safely.";
}

function isConnectorSetupRequiredError(error: unknown) {
  return error instanceof ConnectorProviderDiagnosticError && error.setupRequired;
}

function createGa4AccessDeniedDiagnosticWithEmail(
  _email: string | null,
): ConnectorProviderDiagnosticMetadata {
  return {
    code: "ga4_property_access_denied",
    nextAction:
      "GA4 관리 > 속성 액세스 관리에서 OAuth로 연결한 Google 계정을 뷰어 이상으로 추가하고, 같은 계정으로 OAuth를 다시 연결한 뒤 GA4만 다시 실행하세요.",
    operatorMessage: "OAuth Google 계정이 현재 GA4 속성에 접근할 권한이 없습니다."
  };
}

function createGa4PropertyIdDiagnostic(): ConnectorProviderDiagnosticMetadata {
  return {
    code: "ga4_property_id_invalid",
    nextAction:
      "Railway worker 환경변수 SEARCHOPS_GA4_PROPERTY_ID에는 측정 ID(G-...)나 GTM ID가 아니라 GA4 관리 > 속성 세부정보의 숫자 Property ID를 넣고 GA4만 다시 실행하세요.",
    operatorMessage:
      "GA4 Property ID가 잘못되었거나 Google Analytics Data API에서 해당 속성을 찾을 수 없습니다."
  };
}

export function discoverKeywordTargetsFromConnectorResults(
  results: readonly ConnectorRunResult[],
  request: KeywordDiscoveryRequest,
): KeywordDiscoverySet {
  const candidatesByPhrase = new Map<string, KeywordDiscoveryCandidate>();
  const minImpressions = request.minImpressions ?? 1;

  for (const result of results.map((item) => ConnectorRunResultSchema.parse(item))) {
    for (const record of result.records) {
      const candidate = createKeywordDiscoveryCandidate(record, request, minImpressions);
      if (!candidate) {
        continue;
      }

      const key = normalizeKeywordPhrase(candidate.keyword.phrase);
      const existing = candidatesByPhrase.get(key);
      if (!existing || candidate.score > existing.score) {
        candidatesByPhrase.set(key, candidate);
      }
    }
  }

  return KeywordDiscoverySetSchema.parse({
    candidates: [...candidatesByPhrase.values()]
      .sort((left, right) => right.score - left.score || left.keyword.phrase.localeCompare(right.keyword.phrase))
      .slice(0, request.maxCandidates ?? 25),
    discoveredAt: request.discoveredAt,
    generatedBy: "deterministic",
    siteId: request.siteId
  });
}

function orderConnectorProviders(providers: readonly ConnectorProvider[]) {
  const requested = new Set(providers);

  return connectorProviders.filter((provider) => requested.has(provider));
}

function createLiveConnectorAdapter(
  provider: ConnectorProvider,
  configs: LiveConnectorProviderConfigs,
  fetchImpl?: typeof fetch,
): ConnectorAdapter | null {
  switch (provider) {
    case "bing": {
      const config = configs.bing;
      return config
        ? createLiveBingConnectorAdapter({
            apiKey: config.apiKey,
            fetch: fetchImpl,
            siteDomain: config.siteUrl
          })
        : null;
    }
    case "cms":
      return null;
    case "ga4": {
      const config = configs.ga4;
      if (!config) {
        return null;
      }

      return createLiveGa4ConnectorAdapter({
        credential: config.credential,
        fetch: fetchImpl,
        propertyId: config.propertyId
      });
    }
    case "gsc": {
      const config = configs.gsc;
      if (!config) {
        return null;
      }

      return createLiveGscConnectorAdapter({
        credential: config.credential,
        fetch: fetchImpl,
        propertyId: config.propertyId
      });
    }
    case "pagespeed": {
      const config = configs.pagespeed;
      return config?.apiKey
        ? createLivePageSpeedConnectorAdapter({
            apiKey: config.apiKey,
            fetch: fetchImpl,
            siteDomain: config.siteUrl
          })
        : null;
    }
  }
}

function createMissingLiveConnectorError(
  provider: ConnectorProvider,
  configs: LiveConnectorProviderConfigs,
) {
  switch (provider) {
    case "bing":
      return new ConnectorProviderDiagnosticError(
        "Bing Webmaster API key is missing in the worker runtime.",
        {
          code: "bing_api_key_missing",
          nextAction:
            "Railway worker에 SEARCHOPS_BING_API_KEY를 추가하고 Bing Webmaster Tools의 API Access에서 발급한 키를 넣은 뒤 Bing만 다시 실행하세요.",
          operatorMessage: "Bing Webmaster API Key가 worker 런타임에 설정되지 않았습니다.",
          setupRequired: true
        },
      );
    case "cms":
      return new ConnectorProviderDiagnosticError(
        "CMS live connector is not configured. Use a CMS webhook or add a provider-specific CMS adapter.",
        {
          code: "cms_live_connector_not_configured",
          nextAction:
            "CMS webhook을 연결하거나 WordPress/Webflow/headless CMS adapter를 추가한 뒤 CMS만 다시 실행하세요.",
          operatorMessage:
            "CMS live connector가 아직 구성되지 않았습니다. 현재 상태는 장애가 아니라 설정 필요입니다.",
          setupRequired: true
        },
      );
    case "ga4": {
      if (!configs.ga4) {
        return new ConnectorProviderDiagnosticError("GA4 OAuth credential is missing for this site.", {
          code: "ga4_oauth_missing",
          nextAction:
            "사이트 커넥터 화면에서 GA4 OAuth를 다시 연결하고, 연결한 Google 계정이 GA4 속성에 뷰어 이상 권한을 갖는지 확인하세요.",
          operatorMessage: "이 사이트에 연결된 GA4 OAuth credential이 없습니다.",
          setupRequired: true
        });
      }

      return new ConnectorProviderDiagnosticError("GA4 property ID is missing for this site.", {
        code: "ga4_property_id_missing",
        nextAction:
          "Railway worker 환경변수 SEARCHOPS_GA4_PROPERTY_ID에 GA4 관리 > 속성 세부정보의 숫자 Property ID를 넣고 GA4만 다시 실행하세요.",
        operatorMessage: "GA4 Property ID가 worker 런타임에 설정되지 않았습니다.",
        setupRequired: true
      });
    }
    case "gsc":
      return new ConnectorProviderDiagnosticError("GSC OAuth credential is missing for this site.", {
        code: "gsc_oauth_missing",
        nextAction:
          "사이트 커넥터 화면에서 GSC OAuth를 다시 연결하고 Search Console 속성 권한을 확인하세요.",
        operatorMessage: "이 사이트에 연결된 GSC OAuth credential이 없습니다.",
        setupRequired: true
      });
    case "pagespeed":
      return new ConnectorProviderDiagnosticError(
        "PageSpeed API key is missing in the worker runtime.",
        {
          code: "pagespeed_api_key_missing",
          nextAction:
            "Railway worker에 SEARCHOPS_PAGESPEED_API_KEY를 추가한 뒤 PageSpeed만 다시 실행하세요.",
          operatorMessage: "PageSpeed API Key가 worker 런타임에 설정되지 않았습니다.",
          setupRequired: true
        },
      );
  }
}

function createCredentialResolutionFailureResult(
  provider: ConnectorProvider,
  fetchedAt: string,
  code: ProviderCredentialFailureCode,
): ConnectorRunResult {
  const setupRequired = isCredentialSetupRequired(code);
  const error = new ConnectorProviderDiagnosticError(code, {
    code,
    nextAction:
      "사이트 커넥터의 계정, 권한, 리소스 설정을 확인한 뒤 해당 provider를 다시 실행하세요.",
    operatorMessage: `Connector credential resolution failed: ${code}`,
    setupRequired
  });

  return setupRequired
    ? createSetupRequiredConnectorRunResult(provider, fetchedAt, error)
    : createFailedConnectorRunResult(provider, fetchedAt, error);
}

function normalizeLiveProviderCredentialFailure(
  provider: ConnectorProvider,
  error: unknown,
): ProviderCredentialFailureCode | null {
  if (error instanceof ConnectorProviderDiagnosticError) {
    return error.code === "ga4_property_access_denied"
      ? "resource_access_denied"
      : null;
  }
  if (error instanceof ConnectorHttpError) {
    if (error.status === 401) {
      return "credential_expired";
    }
    if (error.status === 403) {
      return "resource_access_denied";
    }
    if (provider === "bing" && error.status === 400) {
      return "credential_revoked";
    }
    if (error.status === 429 || error.status >= 500) {
      return "provider_rate_limited";
    }
  }
  return "provider_rate_limited";
}

function isCredentialSetupRequired(code: ProviderCredentialFailureCode) {
  return code !== "provider_rate_limited" && code !== "resource_access_denied";
}

interface GscSearchAnalyticsApiResponse {
  readonly rows?: readonly {
    readonly clicks?: number;
    readonly ctr?: number;
    readonly impressions?: number;
    readonly keys?: readonly string[];
    readonly position?: number;
  }[];
}

interface Ga4RunReportApiResponse {
  readonly rowCount?: number;
  readonly rows?: readonly {
    readonly dimensionValues?: readonly { readonly value?: string }[];
    readonly metricValues?: readonly { readonly value?: string }[];
  }[];
}

type BingUrlInfoApiResponse = Record<string, unknown>;

function assertGoogleCredential(
  provider: ConnectorOAuthProvider,
  credential: GoogleConnectorOAuthCredential,
) {
  ConnectorOAuthProviderSchema.parse(credential.provider);

  if (credential.provider !== provider) {
    throw new Error(`Google OAuth credential provider mismatch: ${credential.provider} != ${provider}`);
  }

  if (credential.status !== undefined && credential.status !== "connected") {
    throw new Error(`Google OAuth credential is not connected: ${credential.status}`);
  }
}

function normalizeSiteUrl(siteDomain: string) {
  const trimmed = siteDomain.trim();
  const withProtocol = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (!url.pathname || url.pathname === "") {
    url.pathname = "/";
  }

  return url.toString();
}

function normalizeGa4PropertyResourceName(propertyId: string) {
  const trimmed = propertyId.trim();
  const normalizedPropertyId = trimmed.startsWith("properties/")
    ? trimmed
    : `properties/${trimmed}`;

  if (!/^properties\/\d+$/u.test(normalizedPropertyId)) {
    throw new ConnectorProviderDiagnosticError(
      "GA4 property ID must be numeric. Use a GA4 numeric Property ID, not a Measurement ID or GTM container ID.",
      createGa4PropertyIdDiagnostic(),
    );
  }

  return normalizedPropertyId;
}

function getConnectorDateRange(fetchedAt: string) {
  const end = new Date(fetchedAt);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);

  return {
    endDate: toDateOnly(end),
    startDate: toDateOnly(start)
  };
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toGscKeys(keys: readonly string[] | undefined): [string, string, string, string] {
  return [
    keys?.[0] ?? "(not provided)",
    keys?.[1] ?? "https://example.com/",
    keys?.[2] ?? "ZZ",
    keys?.[3] ?? "unknown"
  ];
}

export const connectorRequestTimeoutMs = 30_000;
export const pageSpeedRequestTimeoutMs = 90_000;
export const connectorPageSize = 1_000;
export const connectorMaxRows = 5_000;
const defaultRetryableStatuses = [429, 500, 502, 503, 504] as const;

export interface ResilientFetchOptions {
  readonly retries?: number;
  readonly timeoutMs?: number;
  readonly retryableStatuses?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

/**
 * 라이브 커넥터 fetch 공용 래퍼: (1) AbortSignal 타임아웃으로 멈춤 방지, (2) 429/5xx·네트워크
 * 오류 시 지수 백오프+지터로 재시도(Retry-After 존중). PageSpeed/Bing 등 간헐 실패를 흡수한다.
 */
export async function fetchWithResilience(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  const timeoutMs = options.timeoutMs ?? connectorRequestTimeoutMs;
  const retryable = options.retryableStatuses ?? defaultRetryableStatuses;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      if (attempt >= retries || !retryable.includes(response.status)) {
        return response;
      }
      await sleep(connectorBackoffDelayMs(attempt, response, random));
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        throw error;
      }
      await sleep(connectorBackoffDelayMs(attempt, undefined, random));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fetchWithResilience: retries exhausted");
}

function connectorBackoffDelayMs(
  attempt: number,
  response: Response | undefined,
  random: () => number,
): number {
  const retryAfterMs = response ? parseRetryAfterMs(response) : null;
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }
  const base = 500 * 2 ** attempt;
  return base + Math.floor(random() * 250);
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

function assertFetchOk(response: Response, _serviceName: string) {
  if (!response.ok) {
    throw new ConnectorHttpError(response.status);
  }
}

function unwrapBingUrlInfo(response: BingUrlInfoApiResponse): Record<string, unknown> {
  const data = response.d;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return response;
}

function readFlexibleField(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function toNonNegativeInteger(value: unknown) {
  return Math.max(0, Math.trunc(toNonNegativeNumber(value)));
}

function toNonNegativeNumber(value: unknown) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function toNullableIsoDateTime(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function orderGeoAnswerMonitorProviders(providers: readonly GeoAnswerMonitorProvider[]) {
  const requested = new Set(providers);

  return geoAnswerMonitorProviders.filter((provider) => requested.has(provider));
}

function createEmptyGeoAnswerMonitoringFixture(
  provider: GeoAnswerMonitorProvider,
): GeoAnswerMonitoringFixture {
  return {
    observedAt: "2026-05-25T00:00:00.000Z",
    provider,
    rows: []
  };
}

function normalizeMonitorQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function createKeywordDiscoveryCandidate(
  record: ConnectorRecord,
  request: KeywordDiscoveryRequest,
  minImpressions: number,
): KeywordDiscoveryCandidate | null {
  if (record.provider === "gsc") {
    if (record.impressions < minImpressions) {
      return null;
    }

    const country = record.country || request.country || "KR";
    const language = request.language ?? "ko";

    return {
      evidence: {
        clicks: record.clicks,
        impressions: record.impressions,
        pageUrl: record.page,
        position: record.position,
        provider: "gsc",
        sourceField: "query"
      },
      keyword: {
        country,
        intent: null,
        language,
        locale: request.locale ?? `${language}-${country}`,
        phrase: normalizeKeywordPhrase(record.query),
        siteId: request.siteId,
        source: "gsc"
      },
      pageUrl: record.page,
      score: scoreGscKeyword(record)
    };
  }

  if (record.provider === "cms" && record.status === "published") {
    const country = request.country ?? "KR";
    const language = request.language ?? "ko";

    return {
      evidence: {
        pageUrl: record.url,
        provider: "cms",
        sourceField: "title",
        title: record.title
      },
      keyword: {
        country,
        intent: null,
        language,
        locale: request.locale ?? `${language}-${country}`,
        phrase: normalizeKeywordPhrase(record.title),
        siteId: request.siteId,
        source: "cms"
      },
      pageUrl: record.url,
      score: 25
    };
  }

  return null;
}

function scoreGscKeyword(record: GscSearchMetric) {
  const positionScore = Math.max(0, 100 - Math.round(record.position * 10));

  return Math.max(0, Math.round(record.impressions + record.clicks * 10 + positionScore));
}

function normalizeKeywordPhrase(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseIntegerMetric(value: string) {
  return Math.trunc(parseNumberMetric(value));
}

function parseNumberMetric(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative metric value: ${value}`);
  }

  return parsed;
}

function readPageSpeedCategoryScore(
  categories: PageSpeedFixture["lighthouseResult"]["categories"],
  category: keyof PageSpeedFixture["lighthouseResult"]["categories"],
) {
  const score = categories[category]?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

function readPageSpeedAuditNumericValue(
  audits: PageSpeedFixture["lighthouseResult"]["audits"],
  auditId: keyof PageSpeedFixture["lighthouseResult"]["audits"],
) {
  const value = audits[auditId]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function toPercentScore(score: number) {
  return Math.round(score * 100);
}
