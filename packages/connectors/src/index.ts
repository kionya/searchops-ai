import {
  BingUrlMetricSchema,
  CmsPageRecordSchema,
  ConnectorRunResultSchema,
  Ga4PageMetricSchema,
  GeoAnswerMonitorRequestSchema,
  GeoAnswerMonitorResultSchema,
  GeoAnswerObservationSchema,
  GscSearchMetricSchema,
  KeywordDiscoverySetSchema,
  PageSpeedMetricSchema,
  type BingUrlMetric,
  type CmsPageRecord,
  type ConnectorAuthMode,
  type ConnectorProvider,
  type ConnectorRecord,
  type ConnectorRunResult,
  type Ga4PageMetric,
  type GeoAnswerMonitorProvider,
  type GeoAnswerMonitorRequest,
  type GeoAnswerMonitorResult,
  type GeoAnswerObservation,
  type GscSearchMetric,
  type KeywordDiscoveryCandidate,
  type KeywordDiscoverySet,
  type PageSpeedMetric
} from "@searchops/types";

export * from "./cms-webhooks.js";

export const connectorsPackage = "connectors" as const;
export const liveExternalApisDefault = "disabled" as const;

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
      readonly accessibility: { readonly score: number };
      readonly performance: { readonly score: number };
      readonly seo: { readonly score: number };
    };
    readonly audits: {
      readonly "cumulative-layout-shift": { readonly numericValue: number };
      readonly "interaction-to-next-paint": { readonly numericValue: number };
      readonly "largest-contentful-paint": { readonly numericValue: number };
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
  readonly liveExternalApis: typeof liveExternalApisDefault;
  readonly provider: ConnectorProvider;
  sync(request: ConnectorSyncRequest): Promise<ConnectorRunResult>;
}

export interface FixtureConnectorAdapterConfig {
  readonly fixture: ConnectorFixtureInput;
  readonly provider: ConnectorProvider;
}

export interface ConnectorBatchSyncRequest extends ConnectorSyncRequest {
  readonly providers?: readonly ConnectorProvider[];
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
  readonly liveExternalApis: typeof liveExternalApisDefault;
  readonly provider: GeoAnswerMonitorProvider;
  monitor(request: GeoAnswerMonitorRequest): Promise<GeoAnswerMonitorResult>;
}

export interface FixtureGeoAnswerMonitorAdapterConfig {
  readonly fixture: GeoAnswerMonitoringFixture;
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
      performanceScore: toPercentScore(categories.performance.score),
      accessibilityScore: toPercentScore(categories.accessibility.score),
      seoScore: toPercentScore(categories.seo.score),
      largestContentfulPaintMs: audits["largest-contentful-paint"].numericValue,
      cumulativeLayoutShift: audits["cumulative-layout-shift"].numericValue,
      interactionToNextPaintMs: audits["interaction-to-next-paint"].numericValue,
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
  fetchedAt,
  provider,
  records,
  status = "ok"
}: {
  readonly fetchedAt: string;
  readonly provider: ConnectorProvider;
  readonly records: readonly ConnectorRecord[];
  readonly status?: ConnectorRunResult["status"];
}): ConnectorRunResult {
  return ConnectorRunResultSchema.parse({
    provider,
    status,
    fetchedAt,
    fixture: true,
    records
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

  return {
    failedProviders: results.filter((result) => result.status === "failed").length,
    okProviders: results.filter((result) => result.status === "ok").length,
    partialProviders: results.filter((result) => result.status === "partial").length,
    recordCountsByProvider,
    totalProviders: results.length,
    totalRecords: results.reduce((total, result) => total + result.records.length, 0)
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

function toPercentScore(score: number) {
  return Math.round(score * 100);
}
