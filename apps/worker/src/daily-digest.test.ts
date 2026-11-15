import { describe, expect, it } from "vitest";

import { collectDigestWarnings, composeDailyDigest, isQuietHourKst, type DigestInput } from "./daily-digest.js";

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    batchStatus: "success",
    changes: [],
    now: new Date("2026-11-15T22:30:00.000Z"),
    previousWarningKeys: [],
    remaining: 7,
    search: { clicks: 28, fetchedAt: "2026-11-15T21:47:00.000Z", impressions: 3812 },
    siteName: "고운몸의원",
    todayUrl: "https://searchops.totopapa.com/sites/site_1/today",
    topTitle: "옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요",
    warnings: [],
    ...overrides
  };
}

describe("isQuietHourKst", () => {
  it("is quiet before 07:00 KST", () => {
    expect(isQuietHourKst(new Date("2026-11-15T21:30:00Z"))).toBe(true); // KST 06:30
    expect(isQuietHourKst(new Date("2026-11-15T22:30:00Z"))).toBe(false); // KST 07:30
    expect(isQuietHourKst(new Date("2026-11-15T15:00:00Z"))).toBe(true); // KST 00:00
  });
});

describe("composeDailyDigest", () => {
  it("starts with site and KST date and ends with the today link", () => {
    const { silent, text } = composeDailyDigest(input());
    const lines = text.split("\n");
    expect(lines[0]).toBe("[고운몸의원] 11월 16일 아침 요약");
    expect(lines.at(-1)).toBe("https://searchops.totopapa.com/sites/site_1/today");
    expect(text).toContain("구글 4주: 노출 3,812 · 클릭 28");
    expect(text).toContain("할 일 7개 · 1순위: 옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요");
    expect(silent).toBe(false);
  });

  it("announces only new warnings", () => {
    const { text, warningKeys } = composeDailyDigest(
      input({
        previousWarningKeys: ["legacy-broken"],
        warnings: [
          { key: "legacy-broken", text: "옛 주소 32개가 열리지 않아요 — 오늘 할 일 1순위" },
          { key: "crawl-blocked", text: "어젯밤 크롤이 1페이지만 읽었어요 — 차단 의심" }
        ]
      }),
    );
    expect(text.split("🚨")).toHaveLength(2);
    expect(text).toContain("🚨 어젯밤 크롤이 1페이지만 읽었어요 — 차단 의심");
    expect(text).not.toContain("옛 주소 32개가 열리지 않아요");
    expect(text).toContain("계속되는 경고 1건");
    expect(warningKeys).toEqual(["legacy-broken", "crawl-blocked"]);
  });

  it("adds batch failure line and change lines", () => {
    const { text } = composeDailyDigest(input({ batchStatus: "failure", changes: ["'골반 필러' 구글 순위 4.7→3.9위"] }));
    expect(text).toContain("⚠️ 어젯밤 배치가 실패했습니다");
    expect(text).toContain("'골반 필러' 구글 순위 4.7→3.9위");
  });

  it("is silent before 07:00 KST and says when there is nothing to do", () => {
    const { silent, text } = composeDailyDigest(input({ now: new Date("2026-11-15T19:00:00Z"), remaining: 0, search: null, topTitle: null }));
    expect(silent).toBe(true);
    expect(text).toContain("오늘 할 일이 없습니다");
    expect(text).not.toContain("구글 4주");
  });
});

describe("collectDigestWarnings", () => {
  it("collects legacy broken, blocked crawl and stale data warnings", () => {
    const warnings = collectDigestWarnings({
      freshnessItems: [
        { key: "crawl", label: "사이트 크롤", tone: "ok" },
        { key: "connectors", label: "연동 동기화 (GA4·GSC·PageSpeed·Bing)", tone: "failed" },
        { key: "geo", label: "GEO 리포트", tone: "stale" }
      ],
      lastCrawlPages: 1,
      legacyBrokenTitle: "옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요"
    });
    expect(warnings.map((warning) => warning.key)).toEqual(["legacy-broken", "crawl-blocked", "stale-connectors", "stale-geo"]);
    expect(warnings[0]?.text).toBe("옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요");
    expect(warnings[2]?.text).toBe("연동 동기화 (GA4·GSC·PageSpeed·Bing): 실패");
    expect(warnings[3]?.text).toBe("GEO 리포트: 지연");
  });

  it("returns nothing when all is fine", () => {
    expect(collectDigestWarnings({ freshnessItems: [], lastCrawlPages: 25, legacyBrokenTitle: null })).toEqual([]);
  });
});
