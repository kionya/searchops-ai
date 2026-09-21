// T6 진단서·제안서 HTML 렌더. 입력은 다른 패키지의 결과 JSON 뿐 — DB 접근 금지(의존 규칙).
// 목표 수치(targets)가 비면 Zod 가 던져서 빌드가 실패한다 — 타업체 진단서의 약점(목표 공란)을 코드로 막는다.
//
// 절 이름·순서 정본: harness-suite/docs/GEO_DIAGNOSIS_PROPOSAL_FRAMEWORK.md §2(A~J)·§3(1~11). 2026-09-21 대조.
// 데이터 소스가 아직 이 패키지 입력에 없는 절(D·E·F·H·I)은 "미배선" 안내를 렌더한다 — 비워 두지 않는다.

import {
  ComplianceFlagSchema,
  GeoVisibilityReportRecordSchema,
  GeoVisibilityTrendPointSchema
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

export const DiagnosisReportInputSchema = z.object({
  site: z.object({ domain: z.string().min(1), brandName: z.string().min(1) }),
  generatedAt: IsoDateTimeSchema,
  audience: ReportAudienceSchema.default("internal"),
  /** 공란 불가. 없으면 렌더가 던진다. */
  targets: ReportTargetsSchema,
  geo: GeoVisibilityReportRecordSchema,
  trend: z.array(GeoVisibilityTrendPointSchema).default([]),
  complianceFlags: z.array(ComplianceFlagSchema).default([])
});

export type DiagnosisReportInput = z.input<typeof DiagnosisReportInputSchema>;

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
  // 외부용은 답변 원문의 경쟁사 실명을 가린다(비교광고 §56② 4호 게이트). 내부용은 원문 그대로.
  const maskCompetitors = (text: string) =>
    input.audience === "external"
      ? (geo.competitorMentions ?? []).reduce((masked, mention) => masked.split(mention.name).join("타 의원"), text)
      : text;
  const unwired = (what: string) =>
    `<p class="muted">${esc(what)} — 이 절의 데이터 소스는 아직 리포트 입력에 배선되지 않았습니다(⚠️ 검증필요).</p>`;
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
    section("D", "키워드 수요", src, unwired("네이버 검색광고 월간 검색량(하한 100회 이상만 근거, 미만은 탐색 키워드)")),
    section("E", "홈페이지 기술 진단", src, unwired("seo-core 룰 결과를 워크오더 단위로") + `<ul>${(geo.checks ?? [])
      .filter((check) => check.status !== "pass")
      .map((check) => `<li>GEO ${esc(check.checkId)}: 관측 ${esc(String(check.evidence.observedValue))} / 기대 ${esc(String(check.evidence.expectedValue))}</li>`)
      .join("") || "<li>실패한 GEO 체크 없음</li>"}</ul>`),
    section("F", "AEO 준비도", src, unwired("aeo-core 페이지별 점수")),
    section("G", "의료광고법 판정", src, table(
      ["#", "항목", "플래그", "조항"],
      Object.entries(checklistLabels).map(([item, label]) => {
        const flags = input.complianceFlags.filter((flag) => String(flag.checklistItem ?? "") === item);
        return [item, label, flags.length === 0 ? (item === "8" ? "⚠️ 검증필요(사전심의)" : "없음") : `${flags.length}건`, esc(flags[0]?.legalClause ?? "")];
      })) + "<p>판정은 플래그까지입니다. 승인·반려는 Medical_Compliance_Officer 게이트(사람)가 합니다(draft-only).</p>"),
    section("H", "리뷰·평판 신호", src, unwired("review_and_community_analyzer 플랫폼별 감성·페인포인트")),
    section("I", "NAP·로컬", src, unwired("local_seo_optimizer 플레이스 체크")),
    section("J", "답변 원문", src, table(
      ["엔진", "소스", "질의", "답변", "인용 URL"],
      geo.observations.map((observation) => [
        esc(observation.provider), esc(observation.source), esc(observation.query), esc(maskCompetitors(observation.answerText) || "-"), esc(observation.citedUrls.join(", ") || "-")
      ])) + `<p class="muted">결정적 룰(geo-core·compliance) 기반, LLM 은 판정에 쓰지 않습니다. 실측 비율 ${pct(geo.liveShare === undefined ? undefined : Math.round(geo.liveShare * 100))}. 생성 ${esc(input.generatedAt)} · 대상 ${esc(input.audience)}.</p>`)
  ];
  return document(`${esc(input.site.brandName)} GEO 진단서`, sections.join("\n"));
}

export function renderProposalHtml(rawInput: DiagnosisReportInput) {
  const input = DiagnosisReportInputSchema.parse(rawInput);
  const { geo, targets } = input;
  const src = sourceAttr(input);
  const failing = (geo.checks ?? []).filter((check) => check.status !== "pass").map((check) => check.checkId);
  const openFlags = input.complianceFlags.filter((flag) => flag.status === "open");
  const sections = [
    section("1", "배경·권위", src, `<p>${esc(input.site.brandName)} (${esc(input.site.domain)}). 의료진·시술·접근성은 공식 페이지 출처를 명기해 채운다(⚠️ 검증필요).</p>`),
    section("2", "검색시장 진단", src, "<p>브랜드 vs 비브랜드 검색량. 검색량 하한 100회 규칙 적용 — 키워드 검색량 입력은 아직 미배선(⚠️ 검증필요).</p>"),
    section("3", "AI 실측", src, table(["지표", "현재", "목표"], [
      ["브랜드 언급률", pct(geo.mentionRate), pct(targets.mentionRate)],
      ["자사 인용률", pct(geo.citationRate), pct(targets.citationRate)],
      ["SOV", pct(geo.sov), pct(targets.sov)]
    ]) + `<p>주간 run ${input.trend.length}회. 실패 체크 ${failing.length}건: ${esc(failing.join(", ") || "없음")}.</p>${liveShareBox(geo.liveShare)}`
      + (input.audience === "external" ? "" : `<div data-audience="internal"><h3>경쟁 구도 (내부용)</h3><p>${esc((geo.competitorMentions ?? []).map((mention) => `${mention.name} ${mention.count}`).join(" · ") || "경쟁사 미설정")}</p></div>`)),
    section("4", "인용 출처", src, geo.citationsByKind === undefined ? "<p>출처 분류 없음.</p>" : table(["출처 유형", "건수"], Object.entries(geo.citationsByKind).map(([kind, count]) => [esc(kind), String(count)]))),
    section("5", "홈페이지·AEO 진단", src, `<ol>${failing.map((id) => `<li>${esc(id)}</li>`).join("") || "<li>측정 유지</li>"}</ol><p>seo-core·aeo-core 워크오더 목록(우선순위·예상 점수 상승)은 미배선(⚠️ 검증필요).</p>`),
    section("6", "의료광고법 판정표", src, `<p>열린 플래그 ${openFlags.length}건. 반려 문장 수·수정안·심의 대상은 진단서 G 절 기준. 승인·반려는 사람이 한다.</p>`),
    section("7", "검색축 우선순위 5개", src, "<p>각 축에 3축 계측 이름(타겟·위치·관심사, docs/ATTRIBUTION_CONTRACT.md)을 부여한다(⚠️ 검증필요 — 축 확정은 harness-medical).</p>"),
    section("8", "관리질문 10선·측정 체계", src, `<p>주간 자동 재측정(batch-geo, runSeq) + GA4 + 봇 크롤 로그 + 텔레그램 주간 요약. 현재 질의 ${geo.queryCount}개.</p>`),
    section("9", "12개월 로드맵", src, "<p>1~2주 컴플라이언스 플래그 정리 → 3~6주 자사 URL 인용 자산(FAQ·구조화 데이터) → 7~12주 경쟁사 대비 SOV → 이후 월 단위 종료 조건(수치)으로 관리. 가정이 무너지는 조건: 실측 비율이 1 미만이면 수치를 근거로 쓰지 않는다.</p>"),
    section("10", "산출물·추적지표", src, `<p>목표를 공란으로 두지 않는다 — 현재 → 목표(달성 조건부, ⚠️ 검증필요): 언급률 ${pct(geo.mentionRate)} → ${pct(targets.mentionRate)}, 인용률 ${pct(geo.citationRate)} → ${pct(targets.citationRate)}, SOV ${pct(geo.sov)} → ${pct(targets.sov)}. 산출물: 주간 요약(텔레그램), 월간 진단서 HTML, 워크오더 재검수 로그.</p>`),
    section("11", "결론·다음 단계", src, "<ul><li>목표 수치 합의</li><li>경쟁사 목록·관리질문 10선 확정</li><li>첫 주간 run 2회 후 재보고</li></ul>")
  ];
  return document(`${esc(input.site.brandName)} GEO 제안서`, sections.join("\n"));
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
