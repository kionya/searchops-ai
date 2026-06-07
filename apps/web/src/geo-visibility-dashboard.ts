import {
  CreateGeoVisibilityReportWorkOrderResponseSchema,
  CreateGeoVisibilityReportResponseSchema,
  DefaultGeoAnswerMonitorProviders,
  GeoAnswerMonitorProviderSchema,
  GeoVisibilityReportListResponseSchema,
  QueueGeoAnswerMonitorRequestSchema,
  QueueGeoAnswerMonitorResponseSchema,
  type GeoAnswerMonitorProvider,
  type GeoAnswerMonitorQuery,
  type GeoAnswerObservation,
  type GeoProvider,
  type GeoVisibilityReportRecord,
  type GeoVisibilityStatus,
  type Site
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import { formatStatusLabel } from "./korean-labels";
import { scopeDemoFixtureToSite } from "./site-fixture-scope";
import { demoSite } from "./work-order-board";

export type GeoVisibilityDashboardSource = "api" | "fixture";
export type GeoVisibilityTone = "good" | "neutral" | "risk";
export type GeoVisibilityCreateStatus = "created" | "failed" | "fixture";
export type GeoAnswerMonitorQueueStatus = "failed" | "fixture" | "queued";
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

export interface GeoAnswerMonitorQueueResult {
  readonly errorMessage: string | null;
  readonly jobId: string | null;
  readonly providerCount: number;
  readonly providers: readonly GeoAnswerMonitorProvider[];
  readonly queryCount: number;
  readonly source: GeoVisibilityDashboardSource;
  readonly status: GeoAnswerMonitorQueueStatus;
}

export interface GeoAnswerMonitorQueueFeedback {
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

export interface GeoWorkOrderPreviewCandidate {
  readonly failingChecks: readonly string[];
  readonly priority: "p0" | "p1" | "p2";
  readonly reason: string;
  readonly reportId: string;
  readonly score: number;
  readonly status: GeoVisibilityStatus;
}

export interface GeoWorkOrderBatchPreview {
  readonly candidateCount: number;
  readonly candidates: readonly GeoWorkOrderPreviewCandidate[];
  readonly excludedStrongCount: number;
  readonly reportIds: readonly string[];
}

const fixtureEvaluatedAt = "2026-05-24T00:00:00.000Z";

export const geoAnswerMonitorProviderOptions: readonly GeoAnswerMonitorProvider[] = [
  "chatgpt",
  "perplexity",
  "gemini",
  "copilot",
  "claude"
];

export const defaultGeoAnswerMonitorProviders: readonly GeoAnswerMonitorProvider[] = [
  ...DefaultGeoAnswerMonitorProviders
];

export const demoGeoVisibilityReports: GeoVisibilityReportRecord[] = [
  {
    id: "geo_report_demo_strong",
    siteId: demoSite.id,
    brandName: demoSite.name ?? "예시 클리닉",
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
    brandName: demoSite.name ?? "예시 클리닉",
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
            answerText: "이 지역 질의에서는 경쟁사가 인용되었습니다.",
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
      throw new Error(`GEO 노출 요청 실패: ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "GEO 노출 요청에 실패했습니다"
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
      throw new Error(`GEO 노출 리포트 생성 요청 실패: ${response.status}`);
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
        error instanceof Error ? error.message : "GEO 노출 리포트 생성 요청에 실패했습니다",
      reportId: null,
      source: "api",
      status: "failed"
    };
  }
}

export async function queueGeoAnswerMonitorJob(
  site: Site,
  formData?: FormData,
): Promise<GeoAnswerMonitorQueueResult> {
  const request = createGeoAnswerMonitorRequestFromForm(site, formData);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      jobId: null,
      providerCount: request.providers.length,
      providers: request.providers,
      queryCount: request.queries.length,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/geo-answer-monitor-jobs`,
      {
        body: JSON.stringify(request),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`GEO answer monitor queue request failed: ${response.status}`);
    }

    const output = QueueGeoAnswerMonitorResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      jobId: output.job.id,
      providerCount: output.job.payload.providers.length,
      providers: output.job.payload.providers,
      queryCount: output.job.payload.queries.length,
      source: "api",
      status: "queued"
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof Error ? error.message : "GEO answer monitor queue request failed",
      jobId: null,
      providerCount: request.providers.length,
      providers: request.providers,
      queryCount: request.queries.length,
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
      throw new Error(`GEO 작업 지시서 요청 실패: ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "GEO 작업 지시서 요청에 실패했습니다",
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
      ...scopeDemoFixtureToSite(report, site),
      brandName: site.name ?? site.domain,
      domain: site.domain,
      siteId: site.id
    })),
    source: "fixture"
  };
}

export function createGeoAnswerMonitorRequestFromForm(
  site: Site,
  formData?: FormData,
  options: {
    readonly observedAt?: string;
  } = {},
) {
  const selectedProviders = parseGeoAnswerMonitorProviders(formData);

  return QueueGeoAnswerMonitorRequestSchema.parse({
    observedAt: options.observedAt ?? new Date().toISOString(),
    providers: selectedProviders,
    queries: createGeoAnswerMonitorQueries(site),
    target: createGeoTarget(site)
  });
}

export function createGeoAnswerMonitorQueries(site: Site): GeoAnswerMonitorQuery[] {
  const locale = `${site.language}-${site.country}`;
  const uniqueQueries = new Set<string>();

  return createDemoGeoObservations(site)
    .filter((observation) => {
      if (uniqueQueries.has(observation.query)) {
        return false;
      }
      uniqueQueries.add(observation.query);
      return true;
    })
    .map((observation) => ({
      locale,
      query: observation.query
    }));
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

export function summarizeGeoWorkOrderBatchPreview(
  reports: readonly GeoVisibilityReportRecord[],
): GeoWorkOrderBatchPreview {
  const candidates = reports
    .filter((report) => report.status !== "strong")
    .map((report) => {
      const failingChecks = report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId);

      return {
        failingChecks,
        priority: getGeoWorkOrderCandidatePriority(report.status),
        reason: getGeoWorkOrderCandidateReason(report.status, failingChecks),
        reportId: report.id,
        score: report.score,
        status: report.status
      };
    });

  return {
    candidateCount: candidates.length,
    candidates,
    excludedStrongCount: reports.filter((report) => report.status === "strong").length,
    reportIds: candidates.map((candidate) => candidate.reportId)
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
      message: reportId ? `GEO 노출 리포트가 생성되었습니다: ${reportId}` : "GEO 노출 리포트가 생성되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: GEO 노출 리포트를 저장하려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "GEO 노출 리포트 생성에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getGeoAnswerMonitorQueueFeedback(
  status: string | undefined,
  jobId: string | undefined,
  providers: string | undefined,
  queryCount: string | undefined,
): GeoAnswerMonitorQueueFeedback | null {
  const providerLabel = providers ? providers.split(",").filter(Boolean).join(", ") : null;
  const queryLabel = queryCount ? `${queryCount}개 질의` : "배치 질의";

  if (status === "queued") {
    return {
      message: jobId
        ? `GEO answer monitor 작업이 큐에 등록되었습니다: ${jobId} (${queryLabel}${providerLabel ? `, ${providerLabel}` : ""})`
        : `GEO answer monitor 작업이 큐에 등록되었습니다 (${queryLabel}).`,
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message:
        "데모 데이터 모드: GEO answer monitor 큐를 등록하려면 SEARCHOPS_API_BASE_URL과 API/worker 런타임을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "GEO answer monitor 큐 등록에 실패했습니다. API 서버와 Redis/worker 설정을 확인하세요.",
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
      message: workOrderId ? `GEO 작업 지시서가 생성되었습니다: ${workOrderId}` : "GEO 작업 지시서가 생성되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: reportId
        ? `데모 데이터 모드: ${reportId}가 선택되었지만 API 요청은 보내지 않았습니다.`
        : "데모 데이터 모드: 저장되는 GEO 작업 지시서를 만들려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "GEO 작업 지시서 생성에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function formatGeoStatus(status: GeoVisibilityStatus | "none") {
  return formatStatusLabel(status);
}

export function formatGeoProvider(provider: GeoProvider) {
  const labels = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    copilot: "Copilot",
    gemini: "Gemini",
    manual: "수동",
    perplexity: "Perplexity"
  } as const satisfies Record<GeoProvider, string>;

  return labels[provider];
}

export function formatGeoDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function formatGeoWorkOrderCandidatePriority(
  priority: GeoWorkOrderPreviewCandidate["priority"],
) {
  const labels = {
    p0: "P0",
    p1: "P1",
    p2: "P2"
  } as const satisfies Record<GeoWorkOrderPreviewCandidate["priority"], string>;

  return labels[priority];
}

export function createDemoGeoObservations(site: Site): GeoAnswerObservation[] {
  const brandName = site.name ?? site.domain;
  const locale = `${site.language}-${site.country}`;

  return [
    {
      provider: "chatgpt",
      query: "답변엔진 최적화 클리닉",
      locale,
      answerText: `${brandName}이 답변엔진 최적화 클리닉으로 언급되었습니다.`,
      citedUrls: [`https://${site.domain}/services/aeo`],
      observedAt: fixtureEvaluatedAt,
      source: "fixture"
    },
    {
      provider: "perplexity",
      query: "의료 SEO 체크리스트",
      locale,
      answerText: `${brandName}이 의료 SEO 체크리스트 인용과 함께 노출되었습니다.`,
      citedUrls: [`https://${site.domain}/blog/medical-seo-checklist`],
      observedAt: fixtureEvaluatedAt,
      source: "fixture"
    },
    {
      provider: "gemini",
      query: "강남 SEO 클리닉",
      locale,
      answerText: `${brandName}이 지역 SEO 클리닉 조사 질의에서 노출되었습니다.`,
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

function parseGeoAnswerMonitorProviders(formData: FormData | undefined) {
  const providers = (formData?.getAll("providers") ?? [])
    .map((provider) => String(provider))
    .filter((provider) => provider.length > 0)
    .map((provider) => GeoAnswerMonitorProviderSchema.parse(provider));

  return providers.length > 0 ? providers : defaultGeoAnswerMonitorProviders;
}

function getGeoWorkOrderCandidatePriority(
  status: GeoVisibilityStatus,
): GeoWorkOrderPreviewCandidate["priority"] {
  if (status === "not_visible") {
    return "p0";
  }

  if (status === "weak") {
    return "p1";
  }

  return "p2";
}

function getGeoWorkOrderCandidateReason(
  status: GeoVisibilityStatus,
  failingChecks: readonly string[],
) {
  if (status === "not_visible") {
    return "브랜드 언급 또는 소유 URL 인용이 확인되지 않았습니다.";
  }

  if (status === "weak") {
    return "언급률/인용률 기준 미달 리포트입니다.";
  }

  if (failingChecks.includes("COMPETITOR_CITATION_RISK")) {
    return "경쟁사 인용 리스크가 있어 보강 작업 후보입니다.";
  }

  return "부분 노출 상태라 추가 소유 URL 인용 보강 후보입니다.";
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
