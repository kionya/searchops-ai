import { describe, expect, it } from "vitest";

import type { DiagnosisReportInput } from "./index.js";

import { renderDiagnosisHtml, renderProposalHtml } from "./index.js";

const geo = {
  id: "geo_1",
  siteId: "site_1",
  brandName: "예시 클리닉",
  domain: "example-clinic.com",
  locale: "ko-KR",
  market: "KR",
  status: "visible",
  score: 60,
  mentionRate: 50,
  citationRate: 25,
  competitorCitationRate: 30,
  credentialSources: {},
  queryCount: 2,
  providerCount: 1,
  observations: [
    { provider: "chatgpt", query: "강남 피부과 추천", locale: "ko-KR", answerText: "예시 클리닉과 고운몸의원", citedUrls: ["https://example-clinic.com/a"], observedAt: "2026-09-21T00:00:00.000Z", source: "connector" },
    { provider: "chatgpt", query: "보톡스 후기", locale: "ko-KR", answerText: "", citedUrls: [], observedAt: "2026-09-21T00:00:00.000Z", source: "fixture" }
  ],
  citations: [{ url: "https://example-clinic.com/a", domain: "example-clinic.com", owned: true, kind: "owned" }],
  checks: [{ checkId: "BRAND_MENTIONED", status: "warning", score: 60, evidence: { observedValue: 50, expectedValue: ">= 70", sourceField: "observations.answerText" } }],
  generatedBy: "deterministic",
  evaluatedAt: "2026-09-21T00:00:00.000Z",
  createdAt: "2026-09-21T00:00:00.000Z",
  liveShare: 0.5,
  warnings: ["partial-fixture"],
  citationsByKind: { owned: 1, platform: 0, competitor: 0, community: 0, other: 0 },
  sov: 50,
  competitorMentions: [{ name: "고운몸의원", count: 1, questions: ["강남 피부과 추천"] }],
  runSeq: 3
} satisfies DiagnosisReportInput["geo"];

const input = {
  site: { domain: "example-clinic.com", brandName: "예시 클리닉" },
  generatedAt: "2026-09-21T01:00:00.000Z",
  targets: { mentionRate: 70, citationRate: 50, sov: 60 },
  geo,
  trend: [{ reportId: "geo_1", runSeq: 3, evaluatedAt: "2026-09-21T00:00:00.000Z", mentionRate: 50, citationRate: 25, sov: 50, liveShare: 0.5, delta: { mentionRate: 10, citationRate: 0, sov: -5 }, gapFromPrevious: 1 }],
  complianceFlags: [{ id: "f1", organizationId: "org", siteId: "site_1", workOrderId: null, riskLevel: "high", status: "open", message: "타 병원 비교", checklistItem: 4, legalClause: "의료법 §56② 4호·5호", createdAt: "2026-09-21T00:00:00.000Z" }]
} satisfies DiagnosisReportInput;

describe("reports (T6)", () => {
  it("renders a standalone UTF-8 diagnosis with A~J sections, data-source, and the partial-fixture warning", () => {
    const html = renderDiagnosisHtml(input);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("word-break:keep-all;text-wrap:pretty");
    for (const key of "ABCDEFGHIJ") expect(html).toContain(`id="sec-${key}"`);
    expect(html).toContain('data-source="geo:geo_1;run:3;liveShare:0.5"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("실측 비율 50%");
    expect(html).toContain('<div data-audience="internal"><h3>경쟁사 SOV 표 (내부용)</h3>');
    expect(html).toContain("고운몸의원");
    expect(html).toContain("A. 실측 개요");
    expect(html).toContain("J. 답변 원문");
    expect(html).toContain("<td>-20p</td>"); // 언급률 50 vs 목표 70
    expect(html).toContain("⚠️ 검증필요(사전심의)");
    expect(html).toContain("의료법 §56② 4호·5호");
  });

  it("omits internal sections for the external audience", () => {
    const html = renderDiagnosisHtml({ ...input, audience: "external" });
    expect(html).not.toContain('<div data-audience="internal">');
    expect(html).not.toContain("고운몸의원");
    expect(renderProposalHtml({ ...input, audience: "external" })).not.toContain("경쟁 구도 (내부용)");
  });

  it("fails the build when target figures are blank", () => {
    const { targets: _targets, ...withoutTargets } = input;
    expect(() => renderDiagnosisHtml(withoutTargets as unknown as DiagnosisReportInput)).toThrow();
    expect(() => renderProposalHtml({ ...input, targets: { mentionRate: 70, citationRate: 50 } } as unknown as DiagnosisReportInput)).toThrow();
  });

  it("renders the proposal 1~11 and no warning when fully live", () => {
    const html = renderProposalHtml({ ...input, geo: { ...geo, liveShare: 1 } });
    for (const key of ["1", "2", "5", "11"]) expect(html).toContain(`id="sec-${key}"`);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("BRAND_MENTIONED");
    expect(html).toContain("1. 배경·권위");
    expect(html).toContain("11. 결론·다음 단계");
  });
});
