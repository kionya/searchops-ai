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
  type SchemaJsonLdType,
  type SchemaRichResultValidationIssue,
  type SchemaRichResultValidationResult,
  type SchemaRichResultValidationStatus
} from "@searchops/types";

export * from "./cms-webhooks.js";

export const connectorsPackage = "connectors" as const;
export const liveExternalApisDefault = "disabled" as const;
export const liveExternalApisEnabled = "enabled" as const;

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
  readonly provider: ConnectorOAuthProvider;
  readonly status?: "connected" | "expired" | "revoked";
  readonly tokenExpiresAt?: string | null;
}

export interface LiveConnectorBatchSyncRequest extends ConnectorBatchSyncRequest {
  readonly bingApiKey?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly ga4PropertyId?: string | undefined;
  readonly googleOAuthCredentials?: readonly GoogleConnectorOAuthCredential[] | undefined;
  readonly pagespeedApiKey?: string | undefined;
  readonly siteDomain: string;
}

export interface LiveGscConnectorAdapterConfig {
  readonly credential: GoogleConnectorOAuthCredential;
  readonly fetch?: typeof fetch | undefined;
  readonly rowLimit?: number | undefined;
  readonly siteDomain: string;
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
  readonly failedProviders: number;
  readonly okProviders: number;
  readonly partialProviders: number;
  readonly recordCountsByProvider: Readonly<Record<ConnectorProvider, number>>;
  readonly totalProviders: number;
  readonly totalRecords: number;
}

export interface ConnectorBatchSyncResult {
  readonly results: readonly ConnectorRunResult[];
  readonly summary: ConnectorBatchSyncSummary;
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
    ...(error === undefined ? {} : { error: normalizeConnectorSyncError(error) }),
    fetchedAt,
    fixture: false,
    provider,
    records: [],
    status: "failed"
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
  rowLimit = 25,
  siteDomain
}: LiveGscConnectorAdapterConfig): ConnectorAdapter {
  assertGoogleCredential("gsc", credential);
  const siteUrl = normalizeSiteUrl(siteDomain);

  return {
    authMode: "oauth",
    liveExternalApis: liveExternalApisEnabled,
    provider: "gsc",
    async sync(request) {
      const dateRange = getConnectorDateRange(request.fetchedAt);
      const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        siteUrl,
      )}/searchAnalytics/query`;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          dataState: "final",
          dimensions: ["query", "page", "country", "device"],
          rowLimit,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        })
      });

      assertFetchOk(response, "Google Search Console");
      const json = (await response.json()) as GscSearchAnalyticsApiResponse;
      const records = normalizeGscSearchAnalytics({
        siteUrl,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rows: (json.rows ?? []).map((row) => ({
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
  const normalizedPropertyId = propertyId.startsWith("properties/")
    ? propertyId
    : `properties/${propertyId}`;

  return {
    authMode: "oauth",
    liveExternalApis: liveExternalApisEnabled,
    provider: "ga4",
    async sync(request) {
      const dateRange = getConnectorDateRange(request.fetchedAt);
      const response = await fetchImpl(
        `https://analyticsdata.googleapis.com/v1beta/${normalizedPropertyId}:runReport`,
        {
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
            limit: 25
          })
        },
      );

      assertFetchOk(response, "Google Analytics Data API");
      const json = (await response.json()) as Ga4RunReportApiResponse;
      const records = normalizeGa4Report({
        propertyId: normalizedPropertyId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rows: (json.rows ?? []).map((row) => ({
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

      const response = await fetchImpl(url);
      assertFetchOk(response, "PageSpeed Insights");
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

          const response = await fetchImpl(endpoint);
          assertFetchOk(response, "Bing Webmaster");
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
  bingApiKey,
  fetchedAt,
  fetch: fetchImpl,
  ga4PropertyId,
  googleOAuthCredentials = [],
  pagespeedApiKey,
  providers = connectorProviders,
  siteDomain
}: LiveConnectorBatchSyncRequest): Promise<ConnectorBatchSyncResult> {
  const orderedProviders = orderConnectorProviders(providers);
  const results = await Promise.all(
    orderedProviders.map(async (provider) => {
      try {
        const adapter = createLiveConnectorAdapter(provider, {
          bingApiKey,
          fetch: fetchImpl,
          ga4PropertyId,
          googleOAuthCredentials,
          pagespeedApiKey,
          siteDomain
        });

        if (adapter === null) {
          return createFailedConnectorRunResult(
            provider,
            fetchedAt,
            createMissingLiveConnectorError(provider, {
              bingApiKey,
              ga4PropertyId,
              googleOAuthCredentials,
              pagespeedApiKey
            }),
          );
        }

        return await adapter.sync({ fetchedAt });
      } catch (error) {
        return createFailedConnectorRunResult(provider, fetchedAt, error);
      }
    }),
  );

  return {
    results,
    summary: summarizeConnectorRunResults(results)
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
      message: `${formatConnectorProviderName(result.provider)} connector failed.`
    };
  }

  return Object.keys(providerErrors).length > 0 ? providerErrors : undefined;
}

function normalizeConnectorSyncError(error: unknown): ConnectorSyncProviderError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    };
  }

  return {
    message: String(error),
    name: "Error"
  };
}

function formatConnectorProviderName(provider: ConnectorProvider) {
  const labels = {
    bing: "Bing",
    cms: "CMS",
    ga4: "GA4",
    gsc: "GSC",
    pagespeed: "PageSpeed"
  } as const satisfies Record<ConnectorProvider, string>;

  return labels[provider];
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
  config: Omit<LiveConnectorBatchSyncRequest, "fetchedAt" | "providers">,
): ConnectorAdapter | null {
  switch (provider) {
    case "bing":
      return config.bingApiKey
        ? createLiveBingConnectorAdapter({
            apiKey: config.bingApiKey,
            fetch: config.fetch,
            siteDomain: config.siteDomain
          })
        : null;
    case "cms":
      return null;
    case "ga4": {
      const credential = findGoogleCredential("ga4", config.googleOAuthCredentials ?? []);
      if (!credential || !config.ga4PropertyId) {
        return null;
      }

      return createLiveGa4ConnectorAdapter({
        credential,
        fetch: config.fetch,
        propertyId: config.ga4PropertyId
      });
    }
    case "gsc": {
      const credential = findGoogleCredential("gsc", config.googleOAuthCredentials ?? []);
      if (!credential) {
        return null;
      }

      return createLiveGscConnectorAdapter({
        credential,
        fetch: config.fetch,
        siteDomain: config.siteDomain
      });
    }
    case "pagespeed":
      return config.pagespeedApiKey
        ? createLivePageSpeedConnectorAdapter({
            apiKey: config.pagespeedApiKey,
            fetch: config.fetch,
            siteDomain: config.siteDomain
          })
        : null;
  }
}

function createMissingLiveConnectorError(
  provider: ConnectorProvider,
  config: Pick<
    LiveConnectorBatchSyncRequest,
    "bingApiKey" | "ga4PropertyId" | "googleOAuthCredentials" | "pagespeedApiKey"
  >,
) {
  switch (provider) {
    case "bing":
      return "Bing Webmaster API key is missing in the worker runtime.";
    case "cms":
      return "CMS live connector is not configured. Use a CMS webhook or add a provider-specific CMS adapter.";
    case "ga4": {
      const hasCredential = Boolean(findGoogleCredential("ga4", config.googleOAuthCredentials ?? []));
      if (!hasCredential) {
        return "GA4 OAuth credential is missing for this site.";
      }

      return "GA4 property ID is missing in the worker runtime.";
    }
    case "gsc":
      return "GSC OAuth credential is missing for this site.";
    case "pagespeed":
      return "PageSpeed API key is missing in the worker runtime.";
  }
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

function findGoogleCredential(
  provider: ConnectorOAuthProvider,
  credentials: readonly GoogleConnectorOAuthCredential[],
) {
  return credentials.find((credential) => credential.provider === provider);
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

function assertFetchOk(response: Response, serviceName: string) {
  if (!response.ok) {
    throw new Error(`${serviceName} request failed with status ${response.status}`);
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
