// T6 진단서·제안서 HTML 렌더. 입력은 다른 패키지의 결과 JSON 뿐 — DB 접근 금지(의존 규칙).
// 목표 수치(targets)가 비면 Zod 가 던져서 빌드가 실패한다 — 타업체 진단서의 약점(목표 공란)을 코드로 막는다.
//
// 절 이름·순서 정본: harness-suite/docs/GEO_DIAGNOSIS_PROPOSAL_FRAMEWORK.md §2(A~J)·§3(1~11). 2026-09-21 대조.
// D·E·F 는 결정적 룰 결과(Keyword 검색량·SeoIssue/WorkOrder·AeoReadinessReport)를 그대로 표로 옮긴다.
// H·I 는 이 저장소에 데이터 소스 자체가 없다 — 없다는 사실을 적는다. 비워 두지 않는다.

import {
  AeoReadinessReportRecordSchema,
  ComplianceFlagSchema,
  GeoVisibilityReportRecordSchema,
  GeoVisibilityTrendPointSchema,
  KeywordSchema,
  KeywordVolumeTierSchema,
  SeoIssueSchema,
  WorkOrderSchema
} from "@searchops/types";
import { z } from "zod";

const PercentageScoreSchema = z.number().int().min(0).max(100);
const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const reportsPackage = "reports" as const;

export const ReportAudienceSchema = z.enum(["internal", "external"]);

export const ReportTargetsSchema = z.object({
  mentionRate: PercentageScoreSchema,
  citationRate: PercentageScoreSchema,
  sov: PercentageScoreSchema
});

/**
 * D 절 입력. tier(검색량 등급)는 API 층이 classifyKeywordVolumeTier(@searchops/connectors, 하한 100회)로 계산해 넘긴다 —
 * 하한 상수를 이 패키지에 복사하면 정본이 둘로 갈라지고, connectors(라이브 HTTP 클라이언트)를 렌더러 의존에 넣을 수도 없다.
 * tier === null 은 "미조회"다. 0 으로 캐스팅해 exploratory 로 떨어뜨리지 않는다 — 근거로 쓰지 않는 3번째 상태다.
 */
export const ReportKeywordSchema = KeywordSchema.extend({
  tier: KeywordVolumeTierSchema.nullable().default(null)
});

export const DiagnosisReportInputSchema = z.object({
  /** 브랜드 별칭(상호 일부만 쓰는 질의 대조용). 비면 상호·도메인 라벨만으로 판별한다. */
  site: z.object({ domain: z.string().min(1), brandName: z.string().min(1), brandAliases: z.array(z.string().min(1)).default([]) }),
  generatedAt: IsoDateTimeSchema,
  audience: ReportAudienceSchema.default("internal"),
  /** 공란 불가. 없으면 렌더가 던진다. */
  targets: ReportTargetsSchema,
  geo: GeoVisibilityReportRecordSchema,
  trend: z.array(GeoVisibilityTrendPointSchema).default([]),
  complianceFlags: z.array(ComplianceFlagSchema).default([]),
  /** D·E·F 입력. 데이터가 아직 없는 것은 정상 상태라 비면 안내만 렌더하고 던지지 않는다(targets 와 다르다). */
  keywords: z.array(ReportKeywordSchema).default([]),
  seoIssues: z.array(SeoIssueSchema).default([]),
  /**
   * E 절 스코프. SeoIssue.crawlRunId 는 "마지막 관측 런"이라 이슈 배열만으로는 최신 런을 알 수 없다 —
   * API 층이 listCrawlRuns 로 구한 최신 CrawlRun.id 를 넘긴다. null 이면 런 스코핑 없이 열린 이슈 전체를 쓴다.
   */
  latestCrawlRunId: z.string().min(1).nullable().default(null),
  workOrders: z.array(WorkOrderSchema).default([]),
  aeoReports: z.array(AeoReadinessReportRecordSchema).default([])
});

export type DiagnosisReportInput = z.input<typeof DiagnosisReportInputSchema>;

type ReportInput = z.output<typeof DiagnosisReportInputSchema>;
type MaskFn = (text: string) => string;

const checklistLabels: Record<number, string> = {
  1: "보장성·최상급 표현",
  2: "치료 경험담(후기)",
  3: "전후 사진",
  4: "비교·비방광고",
  5: "환자 유인·알선",
  6: "객관적 근거·신의료기술",
  7: "부작용 등 중요정보 누락",
  8: "사전심의",
  9: "기사형 광고"
};

export function renderDiagnosisHtml(rawInput: DiagnosisReportInput) {
  const input = DiagnosisReportInputSchema.parse(rawInput);
  const { geo, targets } = input;
  const src = sourceAttr(input);
  const gap = (current: number | undefined, target: number) =>
    current === undefined ? "-" : `${current - target >= 0 ? "+" : ""}${current - target}p`;
  const mask = competitorMasker(input);
  const sections = [
    section("A", "실측 개요", src, `
      <p>${esc(input.site.brandName)} (${esc(input.site.domain)}) · 측정일 ${esc(geo.evaluatedAt)} · 리포트 ${esc(geo.id)}${geo.runSeq === undefined ? "" : ` · run #${geo.runSeq}`} · 질의 ${geo.queryCount} × 엔진 ${geo.providerCount} = 관측 ${geo.observations.length}건</p>
      ${liveShareBox(geo.liveShare)}
      ${input.trend.length === 0
        ? "<p>주간 run 이 아직 없습니다. 첫 배치 이후 반복 측정 추세가 표시됩니다.</p>"
        : table(["run", "측정일", "언급률", "Δ", "SOV", "Δ", "실측"],
            input.trend.map((point) => [
              `#${point.runSeq}`, esc(point.evaluatedAt.slice(0, 10)), pct(point.mentionRate), delta(point.delta.mentionRate),
              pct(point.sov ?? undefined), delta(point.delta.sov), point.liveShare === null ? "-" : pct(Math.round(point.liveShare * 100))
            ]))}`),
    section("B", "브랜드 멘션·인용 (현재 vs 목표)", src, table(
      ["지표", "현재", "목표", "갭"],
      [
        ["AI 답변 브랜드 언급률", pct(geo.mentionRate), pct(targets.mentionRate), gap(geo.mentionRate, targets.mentionRate)],
        ["자사 URL 인용률", pct(geo.citationRate), pct(targets.citationRate), gap(geo.citationRate, targets.citationRate)],
        ["SOV", pct(geo.sov), pct(targets.sov), gap(geo.sov, targets.sov)],
        ["종합 점수", String(geo.score), "-", esc(geo.status)]
      ]) + (input.audience === "external" ? "" : `<div data-audience="internal"><h3>경쟁사 SOV 표 (내부용)</h3>${table(
      ["경쟁사", "언급 관측 수", "질문"],
      (geo.competitorMentions ?? []).map((mention) => [esc(mention.name), String(mention.count), esc(mention.questions.join(", "))])
    )}</div>`)),
    section("C", "인용 출처", src, geo.citationsByKind === undefined
      ? "<p>출처 분류 없음(T1 이전 리포트).</p>"
      : table(["출처 유형", "건수"], Object.entries(geo.citationsByKind).map(([kind, count]) => [esc(kind), String(count)]))
        + table(["URL", "유형"], geo.citations.map((citation) => [esc(citation.url), esc(citation.kind ?? (citation.owned ? "owned" : "other"))]))),
    section("D", "키워드 수요", src, keywordDemandBody(input, mask)),
    section("E", "홈페이지 기술 진단", src, seoIssueBody(input) + workOrderBody(input, mask) + scoreLiftNote
      + `<h3>GEO 답변 가시성 체크 (참고 — 홈페이지 기술 이슈가 아니라 답변 노출 체크입니다)</h3><ul>${(geo.checks ?? [])
      .filter((check) => check.status !== "pass")
      .map((check) => `<li>GEO ${esc(check.checkId)}: 관측 ${esc(String(check.evidence.observedValue))} / 기대 ${esc(String(check.evidence.expectedValue))}</li>`)
      .join("") || "<li>실패한 GEO 체크 없음</li>"}</ul>`),
    section("F", "AEO 준비도", src, aeoBody(input, mask)),
    section("G", "의료광고법 판정", src, table(
      ["#", "항목", "플래그", "조항"],
      Object.entries(checklistLabels).map(([item, label]) => {
        const flags = input.complianceFlags.filter((flag) => String(flag.checklistItem ?? "") === item);
        return [item, label, flags.length === 0 ? (item === "8" ? "⚠️ 검증필요(사전심의)" : "없음") : `${flags.length}건`, esc(flags[0]?.legalClause ?? "")];
      })) + "<p>판정은 플래그까지입니다. 승인·반려는 Medical_Compliance_Officer 게이트(사람)가 합니다(draft-only).</p>"),
    section("H", "리뷰·평판 신호", src, noDataSource("review_and_community_analyzer 플랫폼별 감성·페인포인트", "리뷰·평판 수집 커넥터")),
    section("I", "NAP·로컬", src, noDataSource("local_seo_optimizer 플레이스 체크", "NAP·플레이스 수집 커넥터")),
    section("J", "답변 원문", src, table(
      ["엔진", "소스", "질의", "답변", "인용 URL"],
      geo.observations.map((observation) => [
        esc(observation.provider), esc(observation.source), esc(observation.query), esc(mask(observation.answerText) || "-"), esc(observation.citedUrls.join(", ") || "-")
      ])) + `<p class="muted">결정적 룰(geo-core·compliance) 기반, LLM 은 판정에 쓰지 않습니다. 실측 비율 ${pct(geo.liveShare === undefined ? undefined : Math.round(geo.liveShare * 100))}. 생성 ${esc(input.generatedAt)} · 대상 ${esc(input.audience)}.</p>`)
  ];
  return document(`${esc(input.site.brandName)} GEO 진단서`, sections.join("\n"));
}

export function renderProposalHtml(rawInput: DiagnosisReportInput) {
  const input = DiagnosisReportInputSchema.parse(rawInput);
  const { geo, targets } = input;
  const src = sourceAttr(input);
  const mask = competitorMasker(input);
  const failing = (geo.checks ?? []).filter((check) => check.status !== "pass").map((check) => check.checkId);
  const openFlags = input.complianceFlags.filter((flag) => flag.status === "open");
  const sections = [
    section("1", "배경·권위", src, `<p>${esc(input.site.brandName)} (${esc(input.site.domain)}). 의료진·시술·접근성은 공식 페이지 출처를 명기해 채운다(⚠️ 검증필요).</p>`),
    section("2", "검색시장 진단", src, brandSplitBody(input)),
    section("3", "AI 실측", src, table(["지표", "현재", "목표"], [
      ["브랜드 언급률", pct(geo.mentionRate), pct(targets.mentionRate)],
      ["자사 인용률", pct(geo.citationRate), pct(targets.citationRate)],
      ["SOV", pct(geo.sov), pct(targets.sov)]
    ]) + `<p>주간 run ${input.trend.length}회. 실패 체크 ${failing.length}건: ${esc(failing.join(", ") || "없음")}.</p>${liveShareBox(geo.liveShare)}`
      + (input.audience === "external" ? "" : `<div data-audience="internal"><h3>경쟁 구도 (내부용)</h3><p>${esc((geo.competitorMentions ?? []).map((mention) => `${mention.name} ${mention.count}`).join(" · ") || "경쟁사 미설정")}</p></div>`)),
    section("4", "인용 출처", src, geo.citationsByKind === undefined ? "<p>출처 분류 없음.</p>" : table(["출처 유형", "건수"], Object.entries(geo.citationsByKind).map(([kind, count]) => [esc(kind), String(count)]))),
    section("5", "홈페이지·AEO 진단", src, workOrderBody(input, mask) + scoreLiftNote
      + `<h3>GEO 실패 체크</h3><ol>${failing.map((id) => `<li>${esc(id)}</li>`).join("") || "<li>측정 유지</li>"}</ol>`
      + `<h3>AEO 준비도</h3>${aeoBody(input, mask)}`),
    section("6", "의료광고법 판정표", src, `<p>열린 플래그 ${openFlags.length}건. 반려 문장 수·수정안·심의 대상은 진단서 G 절 기준. 승인·반려는 사람이 한다.</p>`),
    section("7", "검색축 우선순위 5개", src, "<p>각 축에 3축 계측 이름(타겟·위치·관심사, docs/ATTRIBUTION_CONTRACT.md)을 부여한다(⚠️ 검증필요 — 축 확정은 harness-medical).</p>"),
    section("8", "관리질문 10선·측정 체계", src, `<p>주간 자동 재측정(batch-geo, runSeq) + GA4 + 봇 크롤 로그 + 텔레그램 주간 요약. 현재 질의 ${geo.queryCount}개.</p>`),
    section("9", "12개월 로드맵", src, "<p>1~2주 컴플라이언스 플래그 정리 → 3~6주 자사 URL 인용 자산(FAQ·구조화 데이터) → 7~12주 경쟁사 대비 SOV → 이후 월 단위 종료 조건(수치)으로 관리. 가정이 무너지는 조건: 실측 비율이 1 미만이면 수치를 근거로 쓰지 않는다.</p>"),
    section("10", "산출물·추적지표", src, `<p>목표를 공란으로 두지 않는다 — 현재 → 목표(달성 조건부, ⚠️ 검증필요): 언급률 ${pct(geo.mentionRate)} → ${pct(targets.mentionRate)}, 인용률 ${pct(geo.citationRate)} → ${pct(targets.citationRate)}, SOV ${pct(geo.sov)} → ${pct(targets.sov)}. 산출물: 주간 요약(텔레그램), 월간 진단서 HTML, 워크오더 재검수 로그.</p>`),
    section("11", "결론·다음 단계", src, "<ul><li>목표 수치 합의</li><li>경쟁사 목록·관리질문 10선 확정</li><li>첫 주간 run 2회 후 재보고</li></ul>")
  ];
  return document(`${esc(input.site.brandName)} GEO 제안서`, sections.join("\n"));
}

/** 외부용은 경쟁사 실명을 가린다(비교광고 §56② 4호 게이트). 내부용은 원문 그대로. */
function competitorMasker(input: ReportInput): MaskFn {
  const mentions = input.geo.competitorMentions ?? [];
  return (text) =>
    input.audience === "external"
      ? mentions.reduce((masked, mention) => masked.split(mention.name).join("타 의원"), text)
      : text;
}

/** 내부 배관(API 경로 등)은 고객용 문서에 인쇄하지 않는다 — B 절 경쟁사 블록과 같은 게이트. */
function internalOnly(input: ReportInput, text: string) {
  return input.audience === "external" ? "" : text;
}

/** H·I 전용. "아직 배선 안 됨"이 아니라 "이 제품에 소스가 없음"을 적는다 — D·E·F 의 빈 상태와 섞이면 안 된다. */
function noDataSource(what: string, missingSource: string) {
  return `<p class="muted">${esc(what)} — ${esc(missingSource)}가 이 저장소에 없어 채울 수 없습니다(스킬 산출물 수기 첨부 영역, ⚠️ 검증필요).</p>`;
}

const keywordTierLabels = { evidence: "근거", exploratory: "탐색" } as const;

function keywordTierCounts(keywords: ReportInput["keywords"]) {
  return {
    evidence: keywords.filter((keyword) => keyword.tier === "evidence").length,
    exploratory: keywords.filter((keyword) => keyword.tier === "exploratory").length,
    unknown: keywords.filter((keyword) => keyword.tier === null).length
  };
}

function volumeCell(volume: number | null | undefined) {
  return volume === null || volume === undefined ? "미조회" : String(volume);
}

/**
 * 검색 수요 절이 볼 키워드. AI 질문 세트(purpose="geo_query")는 제외한다 —
 * "힙딥 시술 어디서 받아요" 는 AI 에게 묻는 말이라 네이버 월 검색량이 10회 미만이고,
 * 그걸 검색 수요 근거로 세면 진단서가 거짓을 말한다(2026-09-21 실측: 질문 10개 전부 18회).
 */
function searchDemandKeywords(input: ReportInput) {
  return input.keywords.filter((keyword) => keyword.purpose !== "geo_query");
}

/** D 절. 등급 판정은 API 층(결정적)이 끝내 놓고, 여기서는 옮겨 적기만 한다. */
function keywordDemandBody(input: ReportInput, mask: MaskFn) {
  const demandKeywords = searchDemandKeywords(input);
  const geoOnly = input.keywords.length - demandKeywords.length;
  const geoNote = geoOnly > 0
    ? ` AI 질문 세트 ${geoOnly}건은 검색 수요가 아니라 답변 노출 측정용이므로 이 표에서 제외했습니다(A 절 참조).`
    : "";
  if (demandKeywords.length === 0) {
    return `<p class="muted">검색 수요 키워드 미등록 — 등록된 검색 수요 키워드가 0건입니다(데이터 소스는 배선돼 있습니다).${geoNote}${internalOnly(input, " POST /sites/:id/keywords 에 purpose=search_demand 로 넣으면 채워집니다.")}</p>`;
  }
  const counts = keywordTierCounts(demandKeywords);
  const rows = demandKeywords.map((keyword) => [
    esc(mask(keyword.phrase)),
    volumeCell(keyword.monthlyVolumePc),
    volumeCell(keyword.monthlyVolumeMobile),
    keyword.tier === null ? "-" : String((keyword.monthlyVolumePc ?? 0) + (keyword.monthlyVolumeMobile ?? 0)),
    keyword.tier === null ? "미조회" : keywordTierLabels[keyword.tier],
    esc(keyword.volumeFetchedAt ?? "-")
  ]);
  return table(["키워드", "월 PC", "월 모바일", "합계", "등급", "검색량 조회"], rows)
    + `<p class="muted">근거 ${counts.evidence}건 · 탐색 ${counts.exploratory}건 · 미조회 ${counts.unknown}건.${geoNote} 등급은 월간 PC+모바일 하한으로 결정적으로 나뉩니다(하한 상수 정본 @searchops/connectors, 판정은 API 층). 탐색·미조회 키워드는 근거로 쓰지 않으며 순위 약속의 대상이 아닙니다.</p>`;
}

/** 제안서 2절. 브랜드 판별은 브랜드명·도메인 라벨 포함 여부(결정적). */
function brandSplitBody(input: ReportInput) {
  const demandKeywords = searchDemandKeywords(input);
  if (demandKeywords.length === 0) {
    return `<p class="muted">검색 수요 키워드 미등록 — 브랜드/비브랜드 검색량 비교는 purpose=search_demand 키워드 등록 후 산출됩니다(데이터 소스는 배선돼 있습니다).</p>`;
  }
  const needles = [input.site.brandName, input.site.domain.split(".")[0] ?? "", ...input.site.brandAliases]
    .filter((needle) => needle.length > 0)
    .map((needle) => needle.toLowerCase());
  const isBrand = (phrase: string) => needles.some((needle) => phrase.toLowerCase().includes(needle));
  const row = (label: string, group: ReportInput["keywords"]) => {
    const counts = keywordTierCounts(group);
    return [label, String(group.length), String(counts.evidence), String(counts.exploratory), String(counts.unknown)];
  };
  return table(["구분", "키워드", "근거", "탐색", "미조회"], [
    row("브랜드", demandKeywords.filter((keyword) => isBrand(keyword.phrase))),
    row("비브랜드", demandKeywords.filter((keyword) => !isBrand(keyword.phrase)))
  ]) + `<p class="muted">브랜드 판별: 상호·도메인 라벨·별칭(${input.site.brandAliases.length}건) 문자열 포함 여부입니다 — 별칭을 등록하지 않으면 상호 일부만 쓰는 질의가 비브랜드로 집계됩니다(⚠️ 검증필요). 근거 키워드(하한 이상)만 수치 근거로 씁니다. 탐색·미조회 키워드에는 순위를 약속하지 않습니다.</p>`;
}

const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const priorityRank: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const openWorkOrderLimit = 20;

const scoreLiftNote = `<p class="muted">"고치면 몇 점"은 수치로 적지 않습니다 — 저장된 SeoIssue·WorkOrder 에 점수 영향 필드가 없어 지어내야 하기 때문입니다. 심각도·우선순위로 대체 표기합니다(⚠️ 검증필요).</p>`;

/**
 * E 절 이슈 집합. createdAt 으로 최신 런을 역추정하지 않는다 — createdAt 은 최초 관측 시각이고
 * crawlRunId 가 마지막 관측 런이라(packages/db/prisma/schema.prisma SeoIssue 주석) 엉뚱한 과거 런이 뽑힌다.
 * 최신 런 id 는 입력으로 받는다. resolved 는 워크오더 표(status !== "done")와 같은 기준으로 뺀다.
 */
function openSeoIssues(input: ReportInput) {
  const open = input.seoIssues.filter((issue) => issue.status !== "resolved");
  return input.latestCrawlRunId === null
    ? open
    : open.filter((issue) => issue.crawlRunId === input.latestCrawlRunId);
}

/** E 절 앞단. seo-core 룰 결과를 룰·심각도로 집계한다. */
function seoIssueBody(input: ReportInput) {
  const issues = openSeoIssues(input);
  const scope = input.latestCrawlRunId === null
    ? "크롤런 정보 없음(⚠️ 검증필요 — 최신 크롤런 기준이 아니라 열린 이슈 전체 기준)"
    : `최신 크롤런 ${esc(input.latestCrawlRunId)} 기준`;
  if (issues.length === 0) {
    return `<p class="muted">${scope} 열린 SEO 이슈가 0건입니다(크롤 미실행이면 0건입니다 — 이슈 0건을 성과로 읽지 마십시오. 측정 커버리지와 성과는 다릅니다).</p>`;
  }
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const key = `${issue.severity}\t${issue.ruleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([key, count]) => ({ count, ruleId: key.split("\t")[1] ?? "", severity: key.split("\t")[0] ?? "" }))
    .sort((a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || b.count - a.count || a.ruleId.localeCompare(b.ruleId))
    .map((row) => [esc(row.ruleId), esc(row.severity), String(row.count)]);
  return table(["룰", "심각도", "건수"], rows)
    + `<p class="muted">${scope} 열린 이슈 ${issues.length}건. 해결(resolved) 처리된 이슈는 워크오더 표와 같은 기준으로 제외했습니다.</p>`;
}

/** E 절·제안서 5절 공용. 정본이 요구하는 "워크오더 단위" 표. */
function workOrderBody(input: ReportInput, mask: MaskFn) {
  const open = input.workOrders
    .filter((workOrder) => workOrder.status !== "done")
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) || a.title.localeCompare(b.title));
  if (open.length === 0) {
    return `<p class="muted">열린 워크오더가 0건입니다(워크오더 생성 전이면 0건입니다).</p>`;
  }
  return table(["우선순위", "워크오더", "대상 URL", "공수", "상태"], open.slice(0, openWorkOrderLimit).map((workOrder) => [
    esc(workOrder.priority),
    esc(mask(workOrder.title)),
    esc(mask(workOrder.evidence?.url ?? "-")),
    esc(workOrder.estimatedEffort),
    esc(workOrder.status)
  ])) + (open.length > openWorkOrderLimit
    ? `<p class="muted">우선순위 상위 ${openWorkOrderLimit}건만 표시(열린 워크오더 ${open.length}건).</p>`
    : "");
}

/**
 * F 절. 질문(phrase)별 최신 측정 1건을 고른 뒤 **같은 측정값끼리 묶어** 렌더한다.
 *
 * 묶는 이유: AEO 점수는 페이지의 순수 함수다(aeo-core 7룰 중 6룰이 candidatePage 만 보고,
 * 유일한 키워드 의존 룰은 항상 pass·100). 한 번의 측정에서 같은 페이지로 평가된 질문은 점수가
 * 같으므로, 질문마다 줄을 나누면 없는 차이를 있는 것처럼 보인다 —
 * 실측에서 질문 8건이 모두 46점으로 8줄 찍혔다.
 *
 * 묶는 키에 점수·상태까지 넣는 이유: 같은 페이지라도 측정 시점이 다르면 점수가 갈린다
 * (워크오더로 페이지를 고치면 46 → 88 이 되는 것이 정상이다). 페이지만으로 묶고 대표 1건의
 * 숫자를 쓰면, 46 으로 측정된 질문 줄에 88 이 붙는다 — 저장된 값이 아닌 남의 값이다.
 * 갈리면 묶지 않는다.
 */
function aeoBody(input: ReportInput, mask: MaskFn) {
  if (input.aeoReports.length === 0) {
    return `<p class="muted">AEO 진단 미실행 — aeo-core 준비도 리포트가 0건입니다(데이터 소스는 배선돼 있습니다).${internalOnly(input, " POST /sites/:id/aeo-readiness-reports 실행 후 채워집니다.")}</p>`;
  }
  const latest = new Map<string, ReportInput["aeoReports"][number]>();
  for (const report of input.aeoReports) {
    const previous = latest.get(report.phrase);
    if (previous === undefined || report.evaluatedAt > previous.evaluatedAt) {
      latest.set(report.phrase, report);
    }
  }

  const groups = new Map<string, { phrases: string[]; report: ReportInput["aeoReports"][number] }>();
  for (const report of latest.values()) {
    const failed = report.checks.filter((check) => check.status !== "pass").map((check) => check.checkId).join(", ");
    const key = `${report.pageUrl ?? ""}\t${report.score}\t${report.status}\t${failed}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { phrases: [report.phrase], report });
      continue;
    }
    group.phrases.push(report.phrase);
  }

  const rows = [...groups.values()]
    .sort((a, b) => a.report.score - b.report.score || (a.report.pageUrl ?? "").localeCompare(b.report.pageUrl ?? ""))
    .map((group) => [
      esc(mask(group.report.pageUrl ?? "-")),
      esc(mask([...group.phrases].sort((a, b) => a.localeCompare(b)).join(", "))),
      String(group.report.score),
      esc(group.report.status),
      esc(group.report.checks.filter((check) => check.status !== "pass").map((check) => check.checkId).join(", ") || "없음")
    ]);

  const questionCount = latest.size;
  const pageCount = new Set([...latest.values()].map((report) => report.pageUrl ?? "")).size;
  // "매칭돼"라고 쓰지 않는다. 질문에 대응하는 페이지를 못 찾으면 워커가 대표 페이지로 폴백하는데,
  // 그 사실은 리포트에 저장되지 않아(AeoReadinessReportRecord 에 필드가 없다) 여기서 구분할 수 없다.
  const unit = pageCount === 1 && questionCount > 1
    ? `질문 ${questionCount}건이 모두 페이지 1장으로 평가됐습니다 — 질문별 차이가 아니라 그 페이지 1장의 점수입니다.`
    : `질문 ${questionCount}건이 페이지 ${pageCount}장으로 평가됐습니다.`;
  const splitNote = rows.length > pageCount
    ? ` 같은 페이지인데 측정 시점이 달라 점수가 갈린 행이 있습니다(행 ${rows.length} > 페이지 ${pageCount}) — 한 줄로 합치지 않았습니다.`
    : "";

  return table(["페이지", "질문", "점수", "상태", "미통과 체크"], rows)
    + `<p class="muted">${unit}${splitNote} 점수는 페이지 속성(요약·질문형 헤딩·FAQ 스키마·헤딩 구조·인용 가능성·분량)만 봅니다 — 한 번의 측정에서 같은 페이지로 평가된 질문은 점수가 같습니다. <strong>"이 페이지가 이 질문에 답하는가"는 아직 측정하지 않습니다</strong>(⚠️ 검증필요). 질문에 대응하는 페이지를 찾지 못하면 대표 페이지로 평가되며, 이 표만으로는 그 폴백을 구분할 수 없습니다(⚠️ 검증필요). 점수는 aeo-core 결정적 룰이며 LLM 판정이 아닙니다. 체크 통과 자체를 성과로 읽지 마십시오.</p>`;
}

function sourceAttr(input: z.output<typeof DiagnosisReportInputSchema>) {
  const { geo } = input;
  return `geo:${geo.id};run:${geo.runSeq ?? "-"};liveShare:${geo.liveShare ?? "unknown"}`;
}

function section(key: string, title: string, dataSource: string, body: string, audience?: "internal") {
  return `<section id="sec-${key}" data-source="${esc(dataSource)}"${audience ? ` data-audience="${audience}"` : ""}><h2>${key}. ${esc(title)}</h2>${body}</section>`;
}

function liveShareBox(liveShare: number | undefined) {
  if (liveShare === 1) {
    return "";
  }
  const label = liveShare === undefined ? "실측 구분 정보 없음(T0 이전 리포트)" : `실측 비율 ${Math.round(liveShare * 100)}% — fixture/수동 관측 포함`;
  return `<div class="warn" role="alert">⚠️ ${label}. 이 수치를 외부 근거로 쓰지 마십시오.</div>`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]) {
  const head = headers.map((header) => `<th>${esc(header)}</th>`).join("");
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">데이터 없음</td></tr>`
    : rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function document(title: string, body: string) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;max-width:900px;margin:32px auto;padding:0 16px;line-height:1.6;word-break:keep-all;text-wrap:pretty;color:#111}
h1{font-size:24px}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
.muted{color:#64748b}.warn{background:#fff7ed;border:1px solid #f59e0b;padding:10px 12px;border-radius:6px;margin:8px 0}
section[data-audience="internal"],div[data-audience="internal"]{background:#f8fafc;padding:0 12px 12px;border-left:4px solid #64748b}
section[data-audience="internal"] h2::after,div[data-audience="internal"] h3::after{content:" — 내부용";font-size:12px;color:#64748b}
</style>
</head>
<body>
<h1>${title}</h1>
${body}
</body>
</html>
`;
}

function pct(value: number | undefined) {
  return value === undefined ? "-" : `${value}%`;
}

function delta(value: number | null) {
  return value === null ? "-" : `${value >= 0 ? "+" : ""}${value}p`;
}

function esc(value: string) {
  return value.replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
