import {
  AeoReadinessReportListResponseSchema,
  AeoReadinessReportSchema,
  CreateKeywordDiscoveryRequestSchema,
  CreateKeywordDiscoveryResponseSchema,
  KeywordDiscoveryListResponseSchema,
  type AeoReadinessCheck,
  type AeoReadinessCheckStatus,
  type AeoReadinessReport,
  type AeoReadinessReportRecord,
  type AeoReadinessStatus,
  type ConnectorSyncRun,
  type KeywordDiscoveryCandidateRecord,
  type Site
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import type { ConnectorSyncHistoryData } from "./connector-sync-history";
import { formatStatusLabel } from "./korean-labels";
import { getFixtureSite, getFixtureSiteId, scopeDemoFixtureToSite } from "./site-fixture-scope";
import { demoSite } from "./work-order-board";

export type KeywordAeoDashboardSource = "api" | "fixture";
export type AeoReadinessTone = "good" | "neutral" | "risk";
export type KeywordDiscoveryCreateStatus = "created" | "failed" | "fixture";

export interface KeywordAeoDashboardData {
  readonly errorMessage: string | null;
  readonly keywordDiscoveries: readonly KeywordDiscoveryCandidateRecord[];
  readonly reports: readonly AeoReadinessReport[];
  readonly source: KeywordAeoDashboardSource;
}

export interface KeywordAeoDashboardSummary {
  readonly averageScore: string;
  readonly needsWork: number;
  readonly notReady: number;
  readonly ready: number;
  readonly total: number;
  readonly weakChecks: number;
}

export interface KeywordDiscoveryCreateResult {
  readonly candidateCount: number;
  readonly connectorSyncRunId: string;
  readonly errorMessage: string | null;
  readonly source: KeywordAeoDashboardSource;
  readonly status: KeywordDiscoveryCreateStatus;
  readonly topKeyword: string | null;
}

export interface KeywordDiscoveryCreateFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

const expectedEvidenceByCheck = {
  ANSWER_SUMMARY_PRESENT: "페이지 상단 근처의 간결한 답변 블록",
  CITABLE_SOURCE_PRESENT: "인용 가능한 출처 또는 서비스 근거 최소 1개",
  CONTENT_DEPTH: "검색 의도에 맞는 충분한 보조 본문",
  FAQ_SCHEMA_PRESENT: "FAQ형 질문이 있을 때 FAQ 스키마",
  KEYWORD_INTENT_DEFINED: "비어 있지 않은 결정론적 키워드 의도",
  QUESTION_COVERAGE: "검색 의도와 맞는 질문을 다룸",
  STRUCTURED_HEADINGS: "구조화된 H1/H2 계층"
} as const satisfies Record<AeoReadinessCheck["checkId"], string>;

const sourceFieldByCheck = {
  ANSWER_SUMMARY_PRESENT: "answerBlocks",
  CITABLE_SOURCE_PRESENT: "schemaTypes",
  CONTENT_DEPTH: "wordCount",
  FAQ_SCHEMA_PRESENT: "schemaTypes",
  KEYWORD_INTENT_DEFINED: "keyword.intent",
  QUESTION_COVERAGE: "questionHeadings",
  STRUCTURED_HEADINGS: "headings"
} as const satisfies Record<AeoReadinessCheck["checkId"], string>;

export const demoAeoReadinessReports: AeoReadinessReport[] = [
  {
    checks: [
      createCheck("KEYWORD_INTENT_DEFINED", "pass", 100, "commercial"),
      createCheck("ANSWER_SUMMARY_PRESENT", "pass", 92, "답변 블록 있음"),
      createCheck("QUESTION_COVERAGE", "pass", 86, ["가격", "비교"]),
      createCheck("FAQ_SCHEMA_PRESENT", "warning", 68, []),
      createCheck("STRUCTURED_HEADINGS", "pass", 88, ["H1", "H2"]),
      createCheck("CITABLE_SOURCE_PRESENT", "pass", 82, "서비스 페이지"),
      createCheck("CONTENT_DEPTH", "pass", 84, 720)
    ],
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    generatedBy: "deterministic",
    keyword: {
      country: "KR",
      intent: "commercial",
      language: "ko",
      locale: "ko-KR",
      phrase: "답변엔진 최적화 클리닉",
      siteId: demoSite.id,
      source: "fixture"
    },
    pageUrl: "https://example-clinic.com/service/aeo",
    score: 86,
    status: "ready"
  },
  {
    checks: [
      createCheck("KEYWORD_INTENT_DEFINED", "pass", 100, "informational"),
      createCheck("ANSWER_SUMMARY_PRESENT", "warning", 62, null),
      createCheck("QUESTION_COVERAGE", "pass", 78, ["체크리스트", "검토"]),
      createCheck("FAQ_SCHEMA_PRESENT", "fail", 0, []),
      createCheck("STRUCTURED_HEADINGS", "pass", 72, ["H1", "H2"]),
      createCheck("CITABLE_SOURCE_PRESENT", "warning", 58, "출처 목록 부족"),
      createCheck("CONTENT_DEPTH", "pass", 70, 480)
    ],
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    generatedBy: "deterministic",
    keyword: {
      country: "KR",
      intent: "informational",
      language: "ko",
      locale: "ko-KR",
      phrase: "의료 SEO 체크리스트",
      siteId: demoSite.id,
      source: "fixture"
    },
    pageUrl: "https://example-clinic.com/blog/medical-seo-checklist",
    score: 63,
    status: "needs_work"
  },
  {
    checks: [
      createCheck("KEYWORD_INTENT_DEFINED", "warning", 50, null),
      createCheck("ANSWER_SUMMARY_PRESENT", "fail", 0, null),
      createCheck("QUESTION_COVERAGE", "fail", 20, []),
      createCheck("FAQ_SCHEMA_PRESENT", "fail", 0, []),
      createCheck("STRUCTURED_HEADINGS", "warning", 45, ["H1만 있음"]),
      createCheck("CITABLE_SOURCE_PRESENT", "fail", 0, null),
      createCheck("CONTENT_DEPTH", "warning", 40, 180)
    ],
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    generatedBy: "deterministic",
    keyword: {
      country: "KR",
      intent: "local",
      language: "ko",
      locale: "ko-KR",
      phrase: "강남 SEO 클리닉",
      siteId: demoSite.id,
      source: "fixture"
    },
    pageUrl: null,
    score: 34,
    status: "not_ready"
  }
];

export const demoKeywordDiscoveryCandidates: KeywordDiscoveryCandidateRecord[] = [
  {
    id: "keyword_discovery_fixture_1",
    siteId: demoSite.id,
    keywordId: "keyword_fixture_1",
    phrase: "답변엔진 최적화 클리닉",
    locale: "ko-KR",
    language: "ko",
    country: "KR",
    intent: "commercial",
    source: "gsc",
    pageUrl: "https://example-clinic.com/service/aeo",
    score: 132,
    evidence: {
      provider: "gsc",
      pageUrl: "https://example-clinic.com/service/aeo",
      sourceField: "query",
      clicks: 14,
      impressions: 132,
      position: 4.2
    },
    generatedBy: "deterministic",
    discoveredAt: "2026-05-25T00:00:00.000Z",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  },
  {
    id: "keyword_discovery_fixture_2",
    siteId: demoSite.id,
    keywordId: "keyword_fixture_2",
    phrase: "의료 SEO 체크리스트",
    locale: "ko-KR",
    language: "ko",
    country: "KR",
    intent: "informational",
    source: "cms",
    pageUrl: "https://example-clinic.com/blog/medical-seo-checklist",
    score: 25,
    evidence: {
      provider: "cms",
      pageUrl: "https://example-clinic.com/blog/medical-seo-checklist",
      sourceField: "title",
      title: "의료 SEO 체크리스트"
    },
    generatedBy: "deterministic",
    discoveredAt: "2026-05-25T00:00:00.000Z",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z"
  }
];

export function createDemoKeywordAeoDashboard(
  siteOrId: Site | string = demoSite,
): KeywordAeoDashboardData {
  const site = getFixtureSite(siteOrId);

  return {
    errorMessage: null,
    keywordDiscoveries: scopeDemoFixtureToSite(demoKeywordDiscoveryCandidates, site),
    reports: demoAeoReadinessReports.map((report) =>
      AeoReadinessReportSchema.parse(scopeDemoFixtureToSite(report, site)),
    ),
    source: "fixture"
  };
}

export async function loadKeywordAeoDashboard(siteOrId: Site | string): Promise<KeywordAeoDashboardData> {
  const siteId = getFixtureSiteId(siteOrId);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoKeywordAeoDashboard(siteOrId);
  }

  try {
    const [readinessResponse, discoveryResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/aeo-readiness-reports`, {
        cache: "no-store"
      }),
      fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/keyword-discoveries`, {
        cache: "no-store"
      })
    ]);
    if (!readinessResponse.ok) {
      throw new Error(`키워드/AEO 준비도 요청 실패: ${readinessResponse.status}`);
    }
    if (!discoveryResponse.ok) {
      throw new Error(`키워드 발견 요청 실패: ${discoveryResponse.status}`);
    }

    const list = AeoReadinessReportListResponseSchema.parse(await readinessResponse.json());
    const discoveryList = KeywordDiscoveryListResponseSchema.parse(await discoveryResponse.json());
    return {
      errorMessage: null,
      keywordDiscoveries: discoveryList.candidates,
      reports: list.reports.map((report) => mapRecordToReadinessReport(report)),
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoKeywordAeoDashboard(siteOrId);
    return {
      ...fallback,
      errorMessage:
        error instanceof Error ? error.message : "키워드/AEO 준비도 요청에 실패했습니다"
    };
  }
}

export function summarizeKeywordAeoDashboard(
  dashboard: KeywordAeoDashboardData,
): KeywordAeoDashboardSummary {
  const totalScore = dashboard.reports.reduce((total, report) => total + report.score, 0);
  const weakChecks = dashboard.reports.reduce(
    (total, report) => total + getWeakAeoChecks(report).length,
    0,
  );

  return {
    averageScore: dashboard.reports.length === 0
      ? "0"
      : String(Math.round(totalScore / dashboard.reports.length)),
    needsWork: dashboard.reports.filter((report) => report.status === "needs_work").length,
    notReady: dashboard.reports.filter((report) => report.status === "not_ready").length,
    ready: dashboard.reports.filter((report) => report.status === "ready").length,
    total: dashboard.reports.length,
    weakChecks
  };
}

export function findLatestGscKeywordDiscoveryRun(
  history: ConnectorSyncHistoryData,
): ConnectorSyncRun | null {
  for (const run of history.runs) {
    if (!run.providers.includes("gsc")) {
      continue;
    }

    const hasGscRecords = (history.resultsByRunId[run.id] ?? []).some(
      (result) =>
        result.provider === "gsc" &&
        (result.status === "ok" || result.status === "partial") &&
        result.recordCount > 0,
    );
    if (hasGscRecords) {
      return run;
    }
  }

  return null;
}

export async function createKeywordDiscoveryFromConnectorRun(
  siteId: string,
  formData: FormData,
): Promise<KeywordDiscoveryCreateResult> {
  const input = createKeywordDiscoveryRequestFromForm(formData);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    const gscCandidates = demoKeywordDiscoveryCandidates.filter((candidate) => candidate.source === "gsc");
    return {
      candidateCount: gscCandidates.length,
      connectorSyncRunId: input.connectorSyncRunId,
      errorMessage: null,
      source: "fixture",
      status: "fixture",
      topKeyword: gscCandidates[0]?.phrase ?? null
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/keyword-discoveries`, {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`키워드 발견 실행 요청 실패: ${response.status}`);
    }

    const output = CreateKeywordDiscoveryResponseSchema.parse(await response.json());
    return {
      candidateCount: output.candidates.length,
      connectorSyncRunId: input.connectorSyncRunId,
      errorMessage: null,
      source: "api",
      status: "created",
      topKeyword: output.candidates[0]?.phrase ?? null
    };
  } catch (error) {
    return {
      candidateCount: 0,
      connectorSyncRunId: input.connectorSyncRunId,
      errorMessage: error instanceof Error ? error.message : "키워드 발견 실행 요청에 실패했습니다",
      source: "api",
      status: "failed",
      topKeyword: null
    };
  }
}

export function createKeywordDiscoveryRequestFromForm(formData: FormData) {
  const connectorSyncRunId = getRequiredFormText(formData, "connectorSyncRunId");

  return CreateKeywordDiscoveryRequestSchema.parse({
    connectorSyncRunId,
    maxCandidates: getOptionalInteger(formData, "maxCandidates"),
    minImpressions: getOptionalInteger(formData, "minImpressions")
  });
}

export function getKeywordDiscoveryCreateFeedback(
  status: string | undefined,
  candidateCount: string | undefined,
  topKeyword: string | undefined,
): KeywordDiscoveryCreateFeedback | null {
  if (status === "created") {
    return {
      message: `GSC 기반 키워드 후보 ${candidateCount ?? "0"}개를 저장했습니다.${topKeyword ? ` 상위 후보: ${topKeyword}` : ""}`,
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: `데모 데이터 모드: GSC 후보 ${candidateCount ?? "0"}개를 파싱했지만 API 요청은 보내지 않았습니다.`,
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "키워드 발견 실행에 실패했습니다. GSC connector sync run과 API 서버를 확인하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getWeakAeoChecks(report: AeoReadinessReport) {
  return report.checks.filter((check) => check.status !== "pass");
}

export function getAeoReadinessTone(status: AeoReadinessStatus): AeoReadinessTone {
  if (status === "ready") {
    return "good";
  }

  if (status === "needs_work") {
    return "neutral";
  }

  return "risk";
}

export function getAeoCheckTone(status: AeoReadinessCheckStatus): AeoReadinessTone {
  if (status === "pass") {
    return "good";
  }

  if (status === "warning") {
    return "neutral";
  }

  return "risk";
}

export function formatAeoReadinessStatus(status: AeoReadinessStatus) {
  return formatStatusLabel(status);
}

export function formatAeoCheckId(checkId: AeoReadinessCheck["checkId"]) {
  const labels = {
    ANSWER_SUMMARY_PRESENT: "답변 요약",
    CITABLE_SOURCE_PRESENT: "인용 근거",
    CONTENT_DEPTH: "콘텐츠 깊이",
    FAQ_SCHEMA_PRESENT: "FAQ 스키마",
    KEYWORD_INTENT_DEFINED: "키워드 의도",
    QUESTION_COVERAGE: "질문 커버리지",
    STRUCTURED_HEADINGS: "헤딩 구조"
  } as const satisfies Record<AeoReadinessCheck["checkId"], string>;

  return labels[checkId];
}

function createCheck(
  checkId: AeoReadinessCheck["checkId"],
  status: AeoReadinessCheckStatus,
  score: number,
  observedValue: AeoReadinessCheck["evidence"]["observedValue"],
): AeoReadinessCheck {
  return {
    checkId,
    evidence: {
      expectedValue: expectedEvidenceByCheck[checkId],
      observedValue,
      sourceField: sourceFieldByCheck[checkId],
      url: null
    },
    score,
    status
  };
}

function mapRecordToReadinessReport(record: AeoReadinessReportRecord): AeoReadinessReport {
  return AeoReadinessReportSchema.parse({
    checks: record.checks,
    evaluatedAt: record.evaluatedAt,
    generatedBy: record.generatedBy,
    keyword: {
      intent: record.intent,
      locale: record.locale,
      phrase: record.phrase,
      siteId: record.siteId,
      source: "manual"
    },
    pageUrl: record.pageUrl,
    score: record.score,
    status: record.status
  });
}

function getRequiredFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${key} is required`);
  }

  return text;
}

function getOptionalInteger(formData: FormData, key: string) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return undefined;
  }

  return Number(text);
}
