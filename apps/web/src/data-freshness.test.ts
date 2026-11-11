import { describe, expect, it } from "vitest";

import { formatKstDateTime, formatRelative, summarizeDataFreshness } from "./data-freshness";

const now = new Date("2026-11-11T09:00:00.000Z");

describe("summarizeDataFreshness", () => {
  it("판정: 하루 주기 36시간·주간 8일 기준, 실패·부분 실패·기록 없음을 구분한다", () => {
    const items = summarizeDataFreshness(
      {
        lastAeoEvaluatedAt: "2026-11-09T09:00:00.000Z", // 48시간 전 → 지연
        lastConnectorSync: { okProviders: 3, startedAt: "2026-11-10T22:41:00.000Z", status: "completed", totalProviders: 4 },
        lastCrawl: { pagesProcessed: 25, startedAt: "2026-11-10T22:37:00.000Z", status: "completed" },
        lastGeoEvaluatedAt: null
      },
      now,
    );
    expect(items.map((item) => [item.key, item.tone])).toEqual([
      ["crawl", "ok"],
      ["connectors", "failed"],
      ["aeo", "stale"],
      ["geo", "missing"]
    ]);
    expect(items[0]?.detail).toBe("25페이지 수집");
    expect(items[1]?.detail).toBe("연동 3/4 정상");
  });

  it("GEO 는 주간이라 6일 전이어도 정상이다", () => {
    const [, , , geo] = summarizeDataFreshness(
      { lastAeoEvaluatedAt: null, lastConnectorSync: null, lastCrawl: null, lastGeoEvaluatedAt: "2026-11-05T09:00:00.000Z" },
      now,
    );
    expect(geo?.tone).toBe("ok");
  });
});

describe("시각 표기", () => {
  it("UTC ISO 를 KST 로 바꿔 보여준다", () => {
    expect(formatKstDateTime("2026-11-10T22:37:10.637Z")).toBe("2026-11-11 07:37");
  });

  it("상대 시각", () => {
    expect(formatRelative("2026-11-11T08:30:00.000Z", now)).toBe("30분 전");
    expect(formatRelative("2026-11-10T22:37:00.000Z", now)).toBe("10시간 전");
    expect(formatRelative("2026-11-08T09:00:00.000Z", now)).toBe("3일 전");
  });
});
