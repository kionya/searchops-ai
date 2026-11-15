import { describe, expect, it } from "vitest";

import type { TodayBoard, TodayBoardCandidate } from "@searchops/db";

import { buildTodayView } from "./today-view-model";

const W = "https://www.gowoonmom.co.kr";

function candidate(overrides: Partial<TodayBoardCandidate> & { readonly id: string }): TodayBoardCandidate {
  return {
    acceptanceCriteria: ["재크롤에서 확인"],
    description: null,
    estimatedEffort: "s",
    instructions: ["고칩니다."],
    priority: "p1",
    problem: "문제",
    ruleId: "H1_MISSING",
    sourceKey: null,
    status: "open",
    title: `${overrides.id} 제목`,
    url: `${W}/${overrides.id}`,
    ...overrides
  };
}

function board(overrides: Partial<TodayBoard> = {}): TodayBoard {
  return {
    candidates: [],
    changes: [],
    search: null,
    site: { domain: "gowoonmom.co.kr", id: "site_1", ignoredIssueKeys: [], name: "고운몸의원" },
    trafficByUrl: {},
    ...overrides
  };
}

describe("buildTodayView", () => {
  it("limits to 10 and reports remaining", () => {
    const view = buildTodayView(board({ candidates: Array.from({ length: 12 }, (_, index) => candidate({ id: `w${index}` })) }));
    expect(view.items).toHaveLength(10);
    expect(view.remaining).toBe(2);
  });

  it("labels in_review as waiting for crawl and marks checklist", () => {
    const view = buildTodayView(
      board({
        candidates: [
          candidate({ id: "a", status: "in_review" }),
          candidate({ id: "b", ruleId: null, sourceKey: "checklist:site_1:sitemap-naver", url: null })
        ]
      }),
    );
    const byId = Object.fromEntries(view.items.map((item) => [item.id, item]));
    expect(byId.a?.statusLabel).toBe("확인 대기 — 다음 크롤에서 확인");
    expect(byId.a?.intendedKey).toBe(`H1_MISSING|${W}/a`);
    expect(byId.b?.isChecklist).toBe(true);
    expect(byId.b?.intendedKey).toBeNull();
  });

  it("includes ebook protected rule in instruction when key is ignored", () => {
    const view = buildTodayView(
      board({
        candidates: [candidate({ id: "body/head-filler" })],
        site: { domain: "gowoonmom.co.kr", id: "site_1", ignoredIssueKeys: [`NOINDEX_ON_IMPORTANT_PAGE|${W}/ebook`], name: "고운몸의원" }
      }),
    );
    const text = view.items[0]?.aiInstruction ?? "";
    expect(text.startsWith("[고운몸의원 홈페이지 수정 요청]")).toBe(true);
    expect(text).toContain("의료광고 관련 고지·주의 문구는 지우거나 바꾸지 마세요.");
    expect(text).toContain(`${W}/ebook 의 검색 제외(noindex) 설정은 의도된 것이니 그대로 두세요.`);
  });

  it("formats search line in Korean locale and passes changes through", () => {
    const view = buildTodayView(
      board({ changes: ["'골반 필러' 구글 순위 4.7→3.9위"], search: { clicks: 28, fetchedAt: "2026-11-14T21:47:00.000Z", impressions: 3812 } }),
    );
    expect(view.searchLine).toBe("구글 4주: 노출 3,812 · 클릭 28");
    expect(view.changes).toEqual(["'골반 필러' 구글 순위 4.7→3.9위"]);
    expect(buildTodayView(board()).searchLine).toBeNull();
  });

  it("ranks by traffic using the board map", () => {
    const view = buildTodayView(
      board({ candidates: [candidate({ id: "low" }), candidate({ id: "high" })], trafficByUrl: { [`${W}/high`]: 500 } }),
    );
    expect(view.items.map((item) => item.id)).toEqual(["high", "low"]);
  });
});
