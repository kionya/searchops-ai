// T6 진단서·제안서 HTML 렌더. 입력은 다른 패키지의 결과 JSON 뿐 — DB 접근 금지(의존 규칙).
// 목표 수치(targets)가 비면 Zod 가 던져서 빌드가 실패한다 — 타업체 진단서의 약점(목표 공란)을 코드로 막는다.
//
// ⚠️ 검증필요: 절 순서는 harness-suite GEO_DIAGNOSIS_PROPOSAL_FRAMEWORK §2 A~J·§3 1~11 정본과 대조해 맞춘다.
// 그 문서는 다른 프로젝트라 접근 승인 전에는 이 저장소 데이터 기준 절 구성으로 둔다.

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
  const sections = [
    section("A", "개요", src, `
      <p>${esc(input.site.brandName)} (${esc(input.site.domain)}) · 측정일 ${esc(geo.evaluatedAt)} · 리포트 ${esc(geo.id)}${geo.runSeq === undefined ? "" : ` · run #${geo.runSeq}`}</p>
      ${liveShareBox(geo.liveShare)}`),
    section("B", "지표 요약 (현재 vs 목표)", src, table(
      ["지표", "현재", "목표", "갭"],
      [
        ["AI 답변 브랜드 언급률", pct(geo.mentionRate), pct(targets.mentionRate), gap(geo.mentionRate, targets.mentionRate)],
        ["자사 URL 인용률", pct(geo.citationRate), pct(targets.citationRate), gap(geo.citationRate, targets.citationRate)],
        ["SOV", pct(geo.sov), pct(targets.sov), gap(geo.sov, targets.sov)],
        ["종합 점수", String(geo.score), "-", esc(geo.status)]
      ])),
    section("C", "주간 추세", src, input.trend.length === 0
      ? "<p>주간 run 이 아직 없습니다. 첫 배치 이후 표시됩니다.</p>"
      : table(["run", "측정일", "언급률", "Δ", "SOV", "Δ", "실측"],
          input.trend.map((point) => [
            `#${point.runSeq}`, esc(point.evaluatedAt.slice(0, 10)), pct(point.mentionRate), delta(point.delta.mentionRate),
            pct(point.sov ?? undefined), delta(point.delta.sov), point.liveShare === null ? "-" : pct(Math.round(point.liveShare * 100))
          ]))),
    section("D", "인용 출처 분포", src, geo.citationsByKind === undefined
      ? "<p>출처 분류 없음(T1 이전 리포트).</p>"
      : table(["출처", "건수"], Object.entries(geo.citationsByKind).map(([kind, count]) => [esc(kind), String(count)]))),
    input.audience === "external" ? "" : section("E", "경쟁사 SOV (내부용)", src, table(
      ["경쟁사", "언급 관측 수", "질문"],
      (geo.competitorMentions ?? []).map((mention) => [esc(mention.name), String(mention.count), esc(mention.questions.join(", "))])
    ), "internal"),
    section("F", "관측 상세", src, table(
      ["엔진", "소스", "질의", "인용 URL"],
      geo.observations.map((observation) => [
        esc(observation.provider), esc(observation.source), esc(observation.query), esc(observation.citedUrls.join(", ") || "-")
      ]))),
    section("G", "의료광고법 9항목", src, table(
      ["#", "항목", "플래그", "조항"],
      Object.entries(checklistLabels).map(([item, label]) => {
        const flags = input.complianceFlags.filter((flag) => String(flag.checklistItem ?? "") === item);
        return [item, label, flags.length === 0 ? (item === "8" ? "⚠️ 검증필요(사전심의)" : "없음") : `${flags.length}건`, esc(flags[0]?.legalClause ?? "")];
      })) + "<p>판정은 플래그까지입니다. 승인·반려는 사람이 합니다(draft-only).</p>"),
    section("H", "권고 · 워크오더", src, `<ul>${(geo.checks ?? [])
      .filter((check) => check.status !== "pass")
      .map((check) => `<li>${esc(check.checkId)}: 관측 ${esc(String(check.evidence.observedValue))} / 기대 ${esc(String(check.evidence.expectedValue))}</li>`)
      .join("") || "<li>실패한 GEO 체크 없음</li>"}</ul>`),
    section("I", "방법론 · 한계", src, `<p>결정적 룰(geo-core·compliance) 기반. LLM 은 판정에 쓰지 않습니다. 실측 비율 ${pct(geo.liveShare === undefined ? undefined : Math.round(geo.liveShare * 100))}. 경쟁사 실명은 내부 분석 한정(비교광고 §56② 4호).</p>`),
    section("J", "부록", src, `<p>생성 ${esc(input.generatedAt)} · 대상 ${esc(input.audience)}</p>`)
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
    section("1", "목표", src, table(["지표", "현재", "목표"], [
      ["브랜드 언급률", pct(geo.mentionRate), pct(targets.mentionRate)],
      ["자사 인용률", pct(geo.citationRate), pct(targets.citationRate)],
      ["SOV", pct(geo.sov), pct(targets.sov)]
    ])),
    section("2", "현황 갭", src, `<p>실패 체크 ${failing.length}건: ${esc(failing.join(", ") || "없음")}. 열린 컴플라이언스 플래그 ${openFlags.length}건.</p>${liveShareBox(geo.liveShare)}`),
    section("3", "우선순위 과제", src, `<ol>${failing.map((id) => `<li>${esc(id)}</li>`).join("") || "<li>측정 유지</li>"}</ol>`),
    section("4", "실행 로드맵", src, "<p>1~2주: 컴플라이언스 플래그 정리 → 3~6주: 자사 URL 인용 자산(FAQ·구조화 데이터) → 7~12주: 경쟁사 대비 SOV.</p>"),
    section("5", "KPI 정의", src, "<p>언급률 = 브랜드 언급 관측 / 전체 관측. 인용률 = 자사 URL 인용 관측 / 전체. SOV = 자사 / (자사 + Σ경쟁사).</p>"),
    section("6", "측정 주기", src, `<p>주 1회 배치 재측정(runSeq). 현재 run ${input.trend.length}회.</p>`),
    section("7", "컴플라이언스 게이트", src, "<p>환자 대상 문구는 9항목 전수 검수 후 사람이 승인한다. 사전심의(§57)는 게재 직전 별도 확인.</p>"),
    section("8", "리스크 · 가정", src, "<p>AI 엔진 응답 변동, 키 비용 상한(질문 10 × 엔진 4 × 주 1회), 정규식 오탐. 가정이 무너지는 조건: 실측 비율이 1 미만으로 떨어지면 수치를 근거로 쓰지 않는다.</p>"),
    input.audience === "external" ? "" : section("9", "경쟁 구도 (내부용)", src, `<p>${esc((geo.competitorMentions ?? []).map((mention) => `${mention.name} ${mention.count}`).join(" · ") || "경쟁사 미설정")}</p>`, "internal"),
    section("10", "산출물 · 일정", src, "<p>주간 요약(텔레그램), 월간 진단서 HTML, 워크오더 재검수 로그.</p>"),
    section("11", "다음 액션", src, `<ul><li>목표 수치 합의: 언급률 ${pct(targets.mentionRate)}, 인용률 ${pct(targets.citationRate)}, SOV ${pct(targets.sov)}</li><li>경쟁사 목록·질문 세트 확정</li></ul>`)
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
.warn{background:#fff7ed;border:1px solid #f59e0b;padding:10px 12px;border-radius:6px;margin:8px 0}
section[data-audience="internal"]{background:#f8fafc;padding:0 12px 12px;border-left:4px solid #64748b}
section[data-audience="internal"] h2::after{content:" — 내부용";font-size:12px;color:#64748b}
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
