// T7: batch-geo 가 사이트별로 1통 보내는 주간 요약 문안. 순수 함수 — 테스트는 여기서.

export interface GeoWeeklySummaryInput {
  readonly domain: string;
  readonly runSeq: number;
  readonly mentionRate: number;
  readonly sov: number | null;
  readonly liveShare: number;
  readonly previous: { readonly mentionRate: number; readonly sov: number | null } | null;
  readonly providers: readonly string[];
}

export function formatGeoWeeklySummary(input: GeoWeeklySummaryInput) {
  const delta = (current: number | null, previous: number | null | undefined) =>
    current === null || previous === null || previous === undefined
      ? ""
      : ` (${current - previous >= 0 ? "+" : ""}${current - previous}p)`;
  const lines = [
    `[GEO 주간] ${input.domain} · run #${input.runSeq}`,
    `언급률 ${input.mentionRate}%${delta(input.mentionRate, input.previous?.mentionRate)}`,
    `SOV ${input.sov === null ? "-" : `${input.sov}%`}${delta(input.sov, input.previous?.sov)}`,
    `실측 비율 ${Math.round(input.liveShare * 100)}%${input.liveShare < 1 ? " ⚠ fixture/수동 포함" : ""}`,
    `엔진 ${input.providers.join(", ")}`
  ];
  return lines.join("\n");
}
