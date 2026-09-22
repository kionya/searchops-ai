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

const keyword = (
  id: string,
  phrase: string,
  volume: { tier?: "evidence" | "exploratory"; monthlyVolumePc?: number; monthlyVolumeMobile?: number }
): NonNullable<DiagnosisReportInput["keywords"]>[number] => ({
  id,
  siteId: "site_1",
  phrase,
  locale: "ko-KR",
  intent: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  monthlyVolumePc: volume.monthlyVolumePc ?? null,
  monthlyVolumeMobile: volume.monthlyVolumeMobile ?? null,
  volumeFetchedAt: volume.tier === undefined ? null : "2026-09-21T00:00:00.000Z",
  tier: volume.tier ?? null
});

const seoIssue = (
  id: string,
  crawlRunId: string,
  ruleId: string,
  severity: string,
  createdAt: string,
  status = "open"
): NonNullable<DiagnosisReportInput["seoIssues"]>[number] => ({
  id,
  crawlRunId,
  urlRecordId: null,
  ruleId,
  severity,
  status,
  title: `${ruleId} on /page`,
  evidence: null,
  createdAt
});

const workOrder = (
  id: string,
  priority: "p0" | "p1" | "p2" | "p3",
  status: "open" | "in_progress" | "done",
  title: string
): NonNullable<DiagnosisReportInput["workOrders"]>[number] => ({
  id,
  organizationId: "org_1",
  siteId: "site_1",
  seoIssueId: null,
  schemaRecommendationId: null,
  geoVisibilityReportId: null,
  status,
  priority,
  title,
  description: null,
  problem: "문제",
  evidence: { url: "https://example-clinic.com/services", observedValue: 0, expectedValue: 1, sourceField: "h1Count" },
  impact: "영향",
  instructions: ["고친다"],
  ownerType: "content",
  acceptanceCriteria: ["재크롤 통과"],
  verificationMethod: "재크롤",
  estimatedEffort: "s",
  relatedIssues: [],
  assignedTo: null,
  dueDate: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z"
});

const aeoReport = (
  id: string,
  phrase: string,
  score: number,
  evaluatedAt: string,
  pageUrl = "https://example-clinic.com/faq"
): NonNullable<DiagnosisReportInput["aeoReports"]>[number] => ({
  id,
  siteId: "site_1",
  keywordId: null,
  phrase,
  locale: "ko-KR",
  intent: null,
  pageUrl,
  status: "needs_work",
  score,
  checks: [{
    checkId: "ANSWER_SUMMARY_PRESENT",
    status: "fail",
    score,
    evidence: { url: "https://example-clinic.com/faq", observedValue: false, expectedValue: true, sourceField: "answerBlocks" }
  }],
  generatedBy: "deterministic",
  evaluatedAt,
  createdAt: "2026-09-21T00:00:00.000Z"
});

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

  it("keeps H/I as 'no data source in this repo' instead of 'not wired yet'", () => {
    const html = renderDiagnosisHtml(input);
    expect(html).toContain("리뷰·평판 수집 커넥터가 이 저장소에 없어 채울 수 없습니다");
    expect(html).toContain("NAP·플레이스 수집 커넥터가 이 저장소에 없어 채울 수 없습니다");
    expect(html).not.toContain("아직 리포트 입력에 배선되지 않았습니다");
  });

  it("separates 'pipeline has not run' (D/E/F) from 'no data source' (H/I)", () => {
    const html = renderDiagnosisHtml(input);
    expect(html).toContain("검색 수요 키워드 미등록");
    expect(html).toContain("AEO 진단 미실행");
    expect(html).toContain("열린 SEO 이슈가 0건입니다");
    expect(html).toContain("열린 워크오더가 0건입니다");
    expect(renderProposalHtml(input)).toContain("브랜드/비브랜드 검색량 비교는 purpose=search_demand 키워드 등록 후 산출됩니다");
  });

  it("classifies keyword volume at the 100 boundary and keeps null volume as 미조회 (D)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      keywords: [
        keyword("kw_evidence", "골반 필러", { tier: "evidence", monthlyVolumeMobile: 60, monthlyVolumePc: 40 }),
        keyword("kw_edge", "골반 필러 후기", { tier: "exploratory", monthlyVolumeMobile: 59, monthlyVolumePc: 40 }),
        keyword("kw_unknown", "골반 필러 가격", {})
      ]
    });
    expect(html).toContain("<td>골반 필러</td><td>40</td><td>60</td><td>100</td><td>근거</td>");
    expect(html).toContain("<td>골반 필러 후기</td><td>40</td><td>59</td><td>99</td><td>탐색</td>");
    expect(html).toContain("<td>골반 필러 가격</td><td>미조회</td><td>미조회</td><td>-</td><td>미조회</td>");
    expect(html).toContain("근거 1건 · 탐색 1건 · 미조회 1건");
    expect(html).not.toContain("검색 수요 키워드 미등록");
  });

  it("splits brand and non-brand keywords in the proposal (2절)", () => {
    const html = renderProposalHtml({
      ...input,
      keywords: [
        keyword("kw_brand", "예시 클리닉 후기", { tier: "evidence", monthlyVolumeMobile: 500, monthlyVolumePc: 500 }),
        keyword("kw_generic", "강남 보톡스", { tier: "exploratory", monthlyVolumeMobile: 10, monthlyVolumePc: 10 }),
        keyword("kw_generic2", "강남 필러", {})
      ]
    });
    expect(html).toContain("<td>브랜드</td><td>1</td><td>1</td><td>0</td><td>0</td>");
    expect(html).toContain("<td>비브랜드</td><td>2</td><td>0</td><td>1</td><td>1</td>");
  });

  it("renders SEO issues from the newest crawl run only, with open work orders by priority (E)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      latestCrawlRunId: "crawl_new",
      seoIssues: [
        seoIssue("i1", "crawl_new", "H1_MISSING", "high", "2026-09-21T00:00:00.000Z"),
        seoIssue("i2", "crawl_new", "H1_MISSING", "high", "2026-09-21T00:00:00.000Z"),
        seoIssue("i3", "crawl_new", "TITLE_MISSING", "critical", "2026-09-21T00:00:00.000Z"),
        seoIssue("i4", "crawl_old", "SCHEMA_MISSING", "low", "2026-08-01T00:00:00.000Z")
      ],
      workOrders: [
        workOrder("wo_done", "p0", "done", "이미 끝난 워크오더"),
        workOrder("wo_low", "p2", "open", "이미지 alt 보강"),
        workOrder("wo_top", "p0", "in_progress", "타이틀 태그 추가")
      ]
    });
    expect(html).toContain("<td>TITLE_MISSING</td><td>critical</td><td>1</td>");
    expect(html).toContain("<td>H1_MISSING</td><td>high</td><td>2</td>");
    expect(html).not.toContain("SCHEMA_MISSING"); // 과거 크롤런은 섞지 않는다
    expect(html).toContain("최신 크롤런 crawl_new 기준 열린 이슈 3건");
    expect(html.indexOf("타이틀 태그 추가")).toBeLessThan(html.indexOf("이미지 alt 보강"));
    expect(html).not.toContain("이미 끝난 워크오더");
    expect(html).toContain('"고치면 몇 점"은 수치로 적지 않습니다');
    expect(html).toContain("GEO 답변 가시성 체크");
  });

  it("scopes E to the given latest crawl run id, not to the newest createdAt (E)", () => {
    // createdAt 은 최초 관측, crawlRunId 는 마지막 관측 런이다 — createdAt 으로 런을 역추정하면 뒤집힌다.
    const html = renderDiagnosisHtml({
      ...input,
      latestCrawlRunId: "run_C",
      seoIssues: [
        seoIssue("i_title", "run_C", "TITLE_MISSING", "critical", "2026-01-01T00:00:00.000Z"),
        seoIssue("i_schema", "run_B", "SCHEMA_MISSING", "low", "2026-09-10T00:00:00.000Z")
      ]
    });
    expect(html).toContain("<td>TITLE_MISSING</td><td>critical</td><td>1</td>");
    expect(html).not.toContain("SCHEMA_MISSING");
    expect(html).toContain("최신 크롤런 run_C 기준 열린 이슈 1건");
  });

  it("reaches the 0건 empty state when the latest crawl run has no issues (E)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      latestCrawlRunId: "crawl_sep",
      seoIssues: [seoIssue("i_aug", "crawl_aug", "H1_MISSING", "high", "2026-08-01T00:00:00.000Z")]
    });
    expect(html).toContain("최신 크롤런 crawl_sep 기준 열린 SEO 이슈가 0건입니다");
    expect(html).not.toContain("<td>H1_MISSING</td>");
  });

  it("excludes resolved issues so E matches the work order table (E)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      latestCrawlRunId: "run_C",
      seoIssues: [
        seoIssue("i1", "run_C", "TITLE_MISSING", "critical", "2026-09-01T00:00:00.000Z"),
        seoIssue("i2", "run_C", "H1_MISSING", "high", "2026-09-01T00:00:00.000Z", "resolved")
      ],
      workOrders: [workOrder("wo_done", "p0", "done", "이미 끝난 워크오더")]
    });
    expect(html).toContain("<td>TITLE_MISSING</td><td>critical</td><td>1</td>");
    expect(html).not.toContain("H1_MISSING");
    expect(html).toContain("최신 크롤런 run_C 기준 열린 이슈 1건");
    expect(html).toContain("열린 워크오더가 0건입니다");
  });

  it("falls back to all open issues and flags the missing run scope (E)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      seoIssues: [seoIssue("i1", "crawl_old", "H1_MISSING", "high", "2026-08-01T00:00:00.000Z")]
    });
    expect(html).toContain("<td>H1_MISSING</td><td>high</td><td>1</td>");
    expect(html).toContain("크롤런 정보 없음(⚠️ 검증필요 — 최신 크롤런 기준이 아니라 열린 이슈 전체 기준)");
  });

  it("keeps internal API routes out of external D/F empty states", () => {
    const external = { ...input, audience: "external" as const };
    const diagnosis = renderDiagnosisHtml(external);
    expect(diagnosis).toContain("검색 수요 키워드 미등록");
    expect(diagnosis).toContain("AEO 진단 미실행");
    expect(diagnosis).not.toContain("POST /sites/:id/keywords");
    expect(diagnosis).not.toContain("POST /sites/:id/aeo-readiness-reports");
    expect(renderProposalHtml(external)).not.toContain("POST /sites/:id/aeo-readiness-reports");
    // 내부용은 조치 안내를 그대로 남긴다.
    expect(renderDiagnosisHtml(input)).toContain("POST /sites/:id/keywords");
  });

  it("states the brand rule and matches brand aliases in the proposal (2절)", () => {
    const keywords = [
      keyword("kw_full", "예시 클리닉 후기", { tier: "evidence", monthlyVolumeMobile: 500, monthlyVolumePc: 500 }),
      keyword("kw_partial", "예시 리프팅", { tier: "evidence", monthlyVolumeMobile: 500, monthlyVolumePc: 500 }),
      keyword("kw_generic", "강남 보톡스", { tier: "exploratory", monthlyVolumeMobile: 10, monthlyVolumePc: 10 })
    ];
    const withoutAliases = renderProposalHtml({ ...input, keywords });
    expect(withoutAliases).toContain("<td>브랜드</td><td>1</td>");
    expect(withoutAliases).toContain("브랜드 판별: 상호·도메인 라벨·별칭(0건) 문자열 포함 여부입니다");
    const withAliases = renderProposalHtml({ ...input, keywords, site: { ...input.site, brandAliases: ["예시"] } });
    expect(withAliases).toContain("<td>브랜드</td><td>2</td>");
    expect(withAliases).toContain("별칭(1건)");
  });

  it("keeps only the newest measurement per phrase (F)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      aeoReports: [
        aeoReport("aeo_old", "보톡스 가격", 30, "2026-08-01T00:00:00.000Z"),
        aeoReport("aeo_new", "보톡스 가격", 72, "2026-09-20T00:00:00.000Z")
      ]
    });
    expect(html).toContain("<td>보톡스 가격</td>");
    expect(html).toContain("<td>72</td>");
    expect(html).not.toContain("<td>30</td>");
    expect(html).not.toContain("AEO 진단 미실행");
  });

  /**
   * 실측 회귀: 대표 페이지 1장으로 질문 8건을 평가해 8줄이 전부 46점으로 찍혔다.
   * 점수는 페이지의 순수 함수라 그 8줄은 차이가 아니라 같은 값의 복사다.
   */
  it("collapses same-page questions into one row and says so (F)", () => {
    const phrases = ["보톡스 가격", "리프팅 효과", "주차 안내", "상담 예약"];
    const html = renderDiagnosisHtml({
      ...input,
      aeoReports: phrases.map((phrase, index) =>
        aeoReport(`aeo_${index}`, phrase, 46, "2026-09-20T00:00:00.000Z"),
      )
    });

    // 페이지가 1장이면 행도 1줄이다 — 46 이 네 번 찍히면 없는 차이를 있는 것처럼 보인다.
    expect(html.match(/<td>46<\/td>/gu)).toHaveLength(1);
    expect(html).toContain("질문 4건이 모두 페이지 1장으로 평가됐습니다");
    expect(html).toContain("질문별 차이가 아니라 그 페이지 1장의 점수입니다");
    expect(html).toContain("이 페이지가 이 질문에 답하는가");
    expect(html).toContain("는 아직 측정하지 않습니다");
    // 질문은 버리지 않는다. 어느 질문이 그 페이지로 평가됐는지 남는다.
    for (const phrase of phrases) expect(html).toContain(phrase);
  });

  it("renders one row per matched page when questions map to different pages (F)", () => {
    const html = renderDiagnosisHtml({
      ...input,
      aeoReports: [
        aeoReport("aeo_1", "보톡스 가격", 46, "2026-09-20T00:00:00.000Z", "https://example-clinic.com/botox"),
        aeoReport("aeo_2", "보톡스 부작용", 46, "2026-09-20T00:00:00.000Z", "https://example-clinic.com/botox"),
        aeoReport("aeo_3", "주차 안내", 72, "2026-09-20T00:00:00.000Z", "https://example-clinic.com/parking")
      ]
    });

    expect(html).toContain("질문 3건이 페이지 2장에 매칭돼 평가됐습니다");
    expect(html).toContain("<td>보톡스 가격, 보톡스 부작용</td>");
    expect(html).toContain("<td>주차 안내</td>");
    expect(html.match(/<td>46<\/td>/gu)).toHaveLength(1);
    expect(html.match(/<td>72<\/td>/gu)).toHaveLength(1);
  });

  it("masks competitor names leaking through the newly wired sections (external)", () => {
    const wired = {
      ...input,
      aeoReports: [aeoReport("aeo_1", "고운몸의원 vs 예시 클리닉", 40, "2026-09-20T00:00:00.000Z")],
      audience: "external" as const,
      keywords: [keyword("kw_1", "고운몸의원 후기", { tier: "evidence", monthlyVolumeMobile: 200, monthlyVolumePc: 200 })],
      workOrders: [workOrder("wo_1", "p1", "open", "고운몸의원 비교 페이지 정리")]
    };
    expect(renderDiagnosisHtml(wired)).not.toContain("고운몸의원");
    expect(renderProposalHtml(wired)).not.toContain("고운몸의원");
    expect(renderDiagnosisHtml(wired)).toContain("타 의원 후기");
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

describe("검색 수요 절은 AI 질문 세트를 근거로 세지 않는다 (2026-09-21 실측 회귀)", () => {
  const keyword = (
    phrase: string,
    purpose: "geo_query" | "search_demand" | "both",
    pc: number,
    mo: number,
    tier: "evidence" | "exploratory"
  ) => ({
    id: `kw_${phrase}`, siteId: "site_1", phrase, locale: "ko-KR", intent: null, purpose,
    createdAt: "2026-09-21T00:00:00.000Z", monthlyVolumePc: pc, monthlyVolumeMobile: mo,
    volumeFetchedAt: "2026-09-21T00:00:00.000Z", tier
  });
  const withKeywords = {
    ...input,
    site: { ...input.site, brandAliases: [] },
    keywords: [
      keyword("힙딥 시술 어디서 받아요", "geo_query", 9, 9, "exploratory"),
      keyword("골반필러 가격 서초 강남 비교", "geo_query", 9, 9, "exploratory"),
      keyword("골반필러", "search_demand", 1480, 3410, "evidence"),
      keyword("힙딥", "both", 580, 4100, "evidence")
    ]
  };

  it("D 절은 geo_query 를 표에서 빼고 제외 사실을 밝힌다", () => {
    const html = renderDiagnosisHtml(withKeywords);
    expect(html).toContain("골반필러");
    expect(html).not.toContain("힙딥 시술 어디서 받아요");
    expect(html).toContain("AI 질문 세트 2건은 검색 수요가 아니라");
    // geo_query 2건이 탐색으로 세어지면 "탐색 2건" 이 된다
    expect(html).toContain("근거 2건 · 탐색 0건 · 미조회 0건");
  });

  it("제안서 브랜드/비브랜드 분할도 검색 수요 키워드만 센다", () => {
    const html = renderProposalHtml(withKeywords);
    expect(html).not.toContain("힙딥 시술 어디서 받아요");
    expect(html).toContain("비브랜드");
  });

  it("검색 수요 키워드가 하나도 없으면 질문 세트가 있어도 미등록으로 적는다", () => {
    const html = renderDiagnosisHtml({
      ...withKeywords,
      keywords: withKeywords.keywords.filter((k) => k.purpose === "geo_query")
    });
    expect(html).toContain("검색 수요 키워드 미등록");
    expect(html).toContain("AI 질문 세트 2건은");
  });
});
