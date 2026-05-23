import {
  AeoReadinessReportSchema,
  type AeoReadinessCheck,
  type AeoReadinessCheckStatus,
  type AeoReadinessReport,
  type AeoReadinessStatus
} from "@searchops/types";

import { demoSite } from "./work-order-board";

export type KeywordAeoDashboardSource = "fixture";
export type AeoReadinessTone = "good" | "neutral" | "risk";

export interface KeywordAeoDashboardData {
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

const expectedEvidenceByCheck = {
  ANSWER_SUMMARY_PRESENT: "Concise answer block near the top of the page",
  CITABLE_SOURCE_PRESENT: "At least one citable source or service proof point",
  CONTENT_DEPTH: "Sufficient supporting copy for the query intent",
  FAQ_SCHEMA_PRESENT: "FAQ schema when FAQ-style questions are present",
  KEYWORD_INTENT_DEFINED: "Non-null deterministic keyword intent",
  QUESTION_COVERAGE: "Questions matching the query intent are covered",
  STRUCTURED_HEADINGS: "Structured H1/H2 hierarchy"
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
      createCheck("ANSWER_SUMMARY_PRESENT", "pass", 92, "answer block present"),
      createCheck("QUESTION_COVERAGE", "pass", 86, ["pricing", "comparison"]),
      createCheck("FAQ_SCHEMA_PRESENT", "warning", 68, []),
      createCheck("STRUCTURED_HEADINGS", "pass", 88, ["H1", "H2"]),
      createCheck("CITABLE_SOURCE_PRESENT", "pass", 82, "service page"),
      createCheck("CONTENT_DEPTH", "pass", 84, 720)
    ],
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    generatedBy: "deterministic",
    keyword: {
      country: "KR",
      intent: "commercial",
      language: "ko",
      locale: "ko-KR",
      phrase: "answer engine optimization clinic",
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
      createCheck("QUESTION_COVERAGE", "pass", 78, ["checklist", "review"]),
      createCheck("FAQ_SCHEMA_PRESENT", "fail", 0, []),
      createCheck("STRUCTURED_HEADINGS", "pass", 72, ["H1", "H2"]),
      createCheck("CITABLE_SOURCE_PRESENT", "warning", 58, "thin source list"),
      createCheck("CONTENT_DEPTH", "pass", 70, 480)
    ],
    evaluatedAt: "2026-05-23T00:00:00.000Z",
    generatedBy: "deterministic",
    keyword: {
      country: "KR",
      intent: "informational",
      language: "ko",
      locale: "ko-KR",
      phrase: "medical seo checklist",
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
      createCheck("STRUCTURED_HEADINGS", "warning", 45, ["H1 only"]),
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
      phrase: "seo clinic near gangnam",
      siteId: demoSite.id,
      source: "fixture"
    },
    pageUrl: null,
    score: 34,
    status: "not_ready"
  }
];

export function createDemoKeywordAeoDashboard(
  siteId: string = demoSite.id,
): KeywordAeoDashboardData {
  return {
    reports: demoAeoReadinessReports.map((report) =>
      AeoReadinessReportSchema.parse({
        ...report,
        keyword: {
          ...report.keyword,
          siteId
        }
      }),
    ),
    source: "fixture"
  };
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
  return status.replace("_", " ");
}

export function formatAeoCheckId(checkId: AeoReadinessCheck["checkId"]) {
  return checkId
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
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
