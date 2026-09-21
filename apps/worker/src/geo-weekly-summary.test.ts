import { describe, expect, it } from "vitest";

import { formatGeoWeeklySummary } from "./geo-weekly-summary.js";

describe("geo weekly summary (T7)", () => {
  it("formats mention/SOV deltas and flags partial fixture", () => {
    expect(
      formatGeoWeeklySummary({
        domain: "a.example",
        liveShare: 0.5,
        mentionRate: 40,
        previous: { mentionRate: 30, sov: 50 },
        providers: ["chatgpt", "perplexity"],
        runSeq: 4,
        sov: 45
      })
    ).toBe(
      "[GEO 주간] a.example · run #4\n언급률 40% (+10p)\nSOV 45% (-5p)\n실측 비율 50% ⚠ fixture/수동 포함\n엔진 chatgpt, perplexity"
    );
  });

  it("omits deltas on the first run and renders missing SOV as -", () => {
    expect(
      formatGeoWeeklySummary({ domain: "b.example", liveShare: 1, mentionRate: 0, previous: null, providers: ["claude"], runSeq: 1, sov: null })
    ).toBe("[GEO 주간] b.example · run #1\n언급률 0%\nSOV -\n실측 비율 100%\n엔진 claude");
  });
});
