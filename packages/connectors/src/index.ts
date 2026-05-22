import {
  BingUrlMetricSchema,
  CmsPageRecordSchema,
  ConnectorRunResultSchema,
  Ga4PageMetricSchema,
  GscSearchMetricSchema,
  PageSpeedMetricSchema,
  type BingUrlMetric,
  type CmsPageRecord,
  type ConnectorAuthMode,
  type ConnectorProvider,
  type ConnectorRecord,
  type ConnectorRunResult,
  type Ga4PageMetric,
  type GscSearchMetric,
  type PageSpeedMetric
} from "@searchops/types";

export const connectorsPackage = "connectors" as const;
export const liveExternalApisDefault = "disabled" as const;

export const connectorProviders = ["gsc", "ga4", "pagespeed", "bing", "cms"] as const satisfies readonly ConnectorProvider[];

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

export type ConnectorFixtureInput =
  | BingUrlInspectionFixture
  | CmsPagesFixture
  | Ga4ReportFixture
  | GscSearchAnalyticsFixture
  | PageSpeedFixture;

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
