import {
  CreateGeoVisibilityReportWorkOrderResponseSchema,
  CreateGeoVisibilityReportResponseSchema,
  GeoVisibilityReportListResponseSchema,
  type GeoAnswerObservation,
  type GeoProvider,
  type GeoVisibilityReportRecord,
  type GeoVisibilityStatus,
  type Site
} from "@searchops/types";

import { demoSite } from "./work-order-board";

export type GeoVisibilityDashboardSource = "api" | "fixture";
export type GeoVisibilityTone = "good" | "neutral" | "risk";
export type GeoVisibilityCreateStatus = "created" | "failed" | "fixture";
export type GeoVisibilityWorkOrderStatus = "converted" | "failed" | "fixture";

export interface GeoVisibilityDashboardData {
  readonly errorMessage: string | null;
  readonly reports: readonly GeoVisibilityReportRecord[];
  readonly source: GeoVisibilityDashboardSource;
}

export interface GeoVisibilityDashboardSummary {
  readonly averageCitationRate: string;
  readonly averageMentionRate: string;
  readonly latestStatus: GeoVisibilityStatus | "none";
  readonly strong: number;
  readonly total: number;
  readonly weakOrMissing: number;
}

export interface GeoVisibilityCreateResult {
  readonly errorMessage: string | null;
  readonly reportId: string | null;
  readonly source: GeoVisibilityDashboardSource;
  readonly status: GeoVisibilityCreateStatus;
}

export interface GeoVisibilityCreateFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export interface GeoVisibilityWorkOrderResult {
  readonly errorMessage: string | null;
  readonly reportId: string;
  readonly source: GeoVisibilityDashboardSource;
  readonly status: GeoVisibilityWorkOrderStatus;
  readonly workOrderId: string | null;
}

export interface GeoVisibilityWorkOrderFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

const fixtureEvaluatedAt = "2026-05-24T00:00:00.000Z";

export const demoGeoVisibilityReports: GeoVisibilityReportRecord[] = [
  {
    id: "geo_report_demo_strong",
    siteId: demoSite.id,
    brandName: demoSite.name ?? "Example Clinic",
    domain: demoSite.domain,
    locale: "ko-KR",
    market: "KR",
    status: "strong",
    score: 100,
    mentionRate: 100,
    citationRate: 100,
    competitorCitationRate: 0,
    queryCount: 3,
    providerCount: 3,
    observations: createDemoGeoObservations(demoSite),
    citations: [
      {
        url: "https://example-clinic.com/blog/medical-seo-checklist",
        domain: "example-clinic.com",
        owned: true
      },
      {
        url: "https://example-clinic.com/locations/gangnam",
        domain: "example-clinic.com",
        owned: true
      },
      {
        url: "https://example-clinic.com/services/aeo",
        domain: "example-clinic.com",
        owned: true
      }
    ],
    checks: [
      createCheck("BRAND_MENTIONED", "pass", 100, 100, ">= 70"),
      createCheck("OWNED_URL_CITED", "pass", 100, 100, ">= 50"),
      createCheck("QUERY_COVERAGE", "pass", 100, 3, ">= 3 distinct queries"),
      createCheck("PROVIDER_DIVERSITY", "pass", 100, 3, ">= 2 providers"),
      createCheck("COMPETITOR_CITATION_RISK", "pass", 100, 0, "<= 40")
    ],
    generatedBy: "deterministic",
    evaluatedAt: fixtureEvaluatedAt,
    createdAt: fixtureEvaluatedAt
  },
  {
    id: "geo_report_demo_visible",
    siteId: demoSite.id,
    brandName: demoSite.name ?? "Example Clinic",
    domain: demoSite.domain,
    locale: "ko-KR",
    market: "KR",
    status: "visible",
    score: 72,
    mentionRate: 67,
    citationRate: 67,
    competitorCitationRate: 33,
    queryCount: 3,
    providerCount: 2,
    observations: createDemoGeoObservations(demoSite).map((observation, index) =>
      index === 2
        ? {
            ...observation,
            answerText: "A competitor is cited for this local query.",
            citedUrls: ["https://competitor.example/seo"]
          }
        : observation,
    ),
    citations: [
      {
        url: "https://competitor.example/seo",
        domain: "competitor.example",
        owned: false
      },
      {
        url: "https://example-clinic.com/blog/medical-seo-checklist",
        domain: "example-clinic.com",
        owned: true
      },
      {
        url: "https://example-clinic.com/services/aeo",
        domain: "example-clinic.com",
        owned: true
      }
    ],
    checks: [
      createCheck("BRAND_MENTIONED", "warning", 60, 67, ">= 70"),
      createCheck("OWNED_URL_CITED", "pass", 100, 67, ">= 50"),
      createCheck("QUERY_COVERAGE", "pass", 100, 3, ">= 3 distinct queries"),
      createCheck("PROVIDER_DIVERSITY", "pass", 100, 2, ">= 2 providers"),
      createCheck("COMPETITOR_CITATION_RISK", "pass", 100, 33, "<= 40")
    ],
    generatedBy: "deterministic",
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    createdAt: "2026-05-23T00:00:00.000Z"
  }
];

export async function loadGeoVisibilityDashboard(
  site: Site,
): Promise<GeoVisibilityDashboardData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoGeoVisibilityDashboard(site);
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/geo-visibility-reports`,
      {
        cache: "no-store"
      },
    );
    if (!response.ok) {
      throw new Error(`GEO visibility request failed with ${response.status}`);
    }

    const list = GeoVisibilityReportListResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      reports: list.reports,
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoGeoVisibilityDashboard(site);
    return {
      ...fallback,
      errorMessage: error instanceof Error ? error.message : "GEO visibility request failed"
    };
  }
}

export async function createGeoVisibilityReportFromFixture(
  site: Site,
): Promise<GeoVisibilityCreateResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      reportId: null,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/geo-visibility-reports`,
      {
        body: JSON.stringify({
          evaluatedAt: new Date().toISOString(),
          observations: createDemoGeoObservations(site),
          target: createGeoTarget(site)
        }),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`GEO visibility create request failed with ${response.status}`);
    }

    const output = CreateGeoVisibilityReportResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      reportId: output.report.id,
      source: "api",
      status: "created"
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof Error ? error.message : "GEO visibility create request failed",
      reportId: null,
      source: "api",
      status: "failed"
    };
  }
}

export async function convertGeoVisibilityReportToWorkOrder(
  reportId: string,
): Promise<GeoVisibilityWorkOrderResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      reportId,
      source: "fixture",
      status: "fixture",
      workOrderId: null
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/geo-visibility-reports/${encodeURIComponent(reportId)}/work-order`,
      {
        cache: "no-store",
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`GEO work order request failed with ${response.status}`);
    }

    const output = CreateGeoVisibilityReportWorkOrderResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      reportId: output.report.id,
      source: "api",
      status: "converted",
      workOrderId: output.workOrder.id
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "GEO work order request failed",
      reportId,
      source: "api",
      status: "failed",
      workOrderId: null
    };
  }
}

export function createDemoGeoVisibilityDashboard(site: Site = demoSite): GeoVisibilityDashboardData {
  return {
    errorMessage: null,
    reports: demoGeoVisibilityReports.map((report) => ({
      ...report,
      brandName: site.name ?? site.domain,
      domain: site.domain,
      siteId: site.id
    })),
    source: "fixture"
  };
}

export function summarizeGeoVisibilityDashboard(
  dashboard: GeoVisibilityDashboardData,
): GeoVisibilityDashboardSummary {
  const totalMentionRate = dashboard.reports.reduce(
    (total, report) => total + report.mentionRate,
    0,
  );
  const totalCitationRate = dashboard.reports.reduce(
    (total, report) => total + report.citationRate,
    0,
  );

  return {
    averageCitationRate: formatAverage(totalCitationRate, dashboard.reports.length),
    averageMentionRate: formatAverage(totalMentionRate, dashboard.reports.length),
    latestStatus: dashboard.reports[0]?.status ?? "none",
    strong: dashboard.reports.filter((report) => report.status === "strong").length,
    total: dashboard.reports.length,
    weakOrMissing: dashboard.reports.filter(
      (report) => report.status === "weak" || report.status === "not_visible",
    ).length
  };
}

export function getGeoVisibilityStatusTone(status: GeoVisibilityStatus): GeoVisibilityTone {
  if (status === "strong" || status === "visible") {
    return "good";
  }

  if (status === "weak") {
    return "neutral";
  }

  return "risk";
}

export function getGeoVisibilityCreateFeedback(
  status: string | undefined,
  reportId: string | undefined,
): GeoVisibilityCreateFeedback | null {
  if (status === "created") {
    return {
      message: reportId ? `GEO visibility report created: ${reportId}` : "GEO visibility report created.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "Fixture mode: set SEARCHOPS_API_BASE_URL to persist GEO visibility reports.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "GEO visibility report creation failed. Check the API server and retry.",
      tone: "warning"
    };
  }

  return null;
}

export function getGeoVisibilityWorkOrderFeedback(
  status: string | undefined,
  workOrderId: string | undefined,
  reportId: string | undefined,
): GeoVisibilityWorkOrderFeedback | null {
  if (status === "converted") {
    return {
      message: workOrderId ? `GEO work order created: ${workOrderId}` : "GEO work order created.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: reportId
        ? `Fixture mode: ${reportId} was selected, but no API request was sent.`
        : "Fixture mode: set SEARCHOPS_API_BASE_URL to create persisted GEO work orders.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "GEO work order creation failed. Check the API server and retry.",
      tone: "warning"
    };
  }

  return null;
}

export function formatGeoStatus(status: GeoVisibilityStatus | "none") {
  return status.replaceAll("_", " ");
}

export function formatGeoProvider(provider: GeoProvider) {
  const labels = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    copilot: "Copilot",
    gemini: "Gemini",
    manual: "Manual",
    perplexity: "Perplexity"
  } as const satisfies Record<GeoProvider, string>;

  return labels[provider];
}

export function formatGeoDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function createDemoGeoObservations(site: Site): GeoAnswerObservation[] {
  const brandName = site.name ?? site.domain;
  const locale = `${site.language}-${site.country}`;

  return [
    {
      provider: "chatgpt",
      query: "answer engine optimization clinic",
      locale,
      answerText: `${brandName} is mentioned as an answer-engine optimization clinic.`,
      citedUrls: [`https://${site.domain}/services/aeo`],
      observedAt: fixtureEvaluatedAt,
      source: "fixture"
    },
    {
      provider: "perplexity",
      query: "medical seo checklist",
      locale,
      answerText: `${brandName} appears with a medical SEO checklist reference.`,
      citedUrls: [`https://${site.domain}/blog/medical-seo-checklist`],
      observedAt: fixtureEvaluatedAt,
      source: "fixture"
    },
    {
      provider: "gemini",
      query: "seo clinic near gangnam",
      locale,
      answerText: `${brandName} is visible for local SEO clinic research.`,
      citedUrls: [`https://${site.domain}/locations/gangnam`],
      observedAt: fixtureEvaluatedAt,
      source: "fixture"
    }
  ];
}

function createGeoTarget(site: Site) {
  return {
    brandName: site.name ?? site.domain,
    domain: site.domain,
    locale: `${site.language}-${site.country}`,
    market: site.country,
    siteId: site.id
  };
}

function createCheck(
  checkId: GeoVisibilityReportRecord["checks"][number]["checkId"],
  status: GeoVisibilityReportRecord["checks"][number]["status"],
  score: number,
  observedValue: number,
  expectedValue: string,
): GeoVisibilityReportRecord["checks"][number] {
  return {
    checkId,
    evidence: {
      expectedValue,
      observedValue,
      sourceField:
        checkId === "OWNED_URL_CITED" || checkId === "COMPETITOR_CITATION_RISK"
          ? "observations.citedUrls"
          : checkId === "PROVIDER_DIVERSITY"
            ? "observations.provider"
            : checkId === "QUERY_COVERAGE"
              ? "observations.query"
              : "observations.answerText"
    },
    score,
    status
  };
}

function formatAverage(total: number, count: number) {
  return count === 0 ? "0%" : `${Math.round(total / count)}%`;
}

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
