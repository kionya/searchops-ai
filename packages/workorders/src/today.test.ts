import { describe, expect, it } from "vitest";

import {
  buildAiInstruction,
  defaultProtectedRules,
  isChecklist,
  isLossType,
  protectedRulesFromIgnoredKeys,
  rankTodayWorkOrders,
  todayLimit,
  type TodayCandidate
} from "./today.js";

const BASE = "https://www.gowoonmom.co.kr";

function candidate(overrides: Partial<TodayCandidate> & { readonly id: string }): TodayCandidate {
  return {
    acceptanceCriteria: ["재크롤에서 h1 이 보인다."],
    description: null,
    estimatedEffort: "s",
    instructions: ["페이지 상단에 h1 을 하나 추가합니다."],
    priority: "p1",
    problem: "h1 이 없습니다.",
    ruleId: "H1_MISSING",
    sourceKey: null,
    status: "open",
    title: `${overrides.id} 제목`,
    url: `${BASE}/${overrides.id}`,
    ...overrides
  };
}

describe("rankTodayWorkOrders", () => {
  it("ranks loss-type first, then priority, then traffic", () => {
    const ranked = rankTodayWorkOrders(
      [
        candidate({ id: "p3", priority: "p3" }),
        candidate({ id: "p1-low" }),
        candidate({ id: "p1-high" }),
        candidate({ id: "legacy", priority: "p1", ruleId: null, sourceKey: "legacy-redirect:site_1:broken", url: null }),
        candidate({ id: "p0", priority: "p0" })
      ],
      new Map([
        [`${BASE}/p1-high`, 900],
        [`${BASE}/p1-low`, 10],
        [`${BASE}/p0`, 0]
      ]),
    );
    expect(ranked.map((item) => item.id)).toEqual(["legacy", "p0", "p1-high", "p1-low", "p3"]);
  });

  it("caps at 10 and excludes done and blocked", () => {
    const items = Array.from({ length: 13 }, (_, index) =>
      candidate({
        id: `w${String(index).padStart(2, "0")}`,
        status: index === 0 || index === 1 ? "done" : index === 2 ? "blocked" : "open"
      }),
    );
    const ranked = rankTodayWorkOrders(items, new Map());
    expect(todayLimit).toBe(10);
    expect(ranked).toHaveLength(10);
    expect(ranked.some((item) => item.status === "done" || item.status === "blocked")).toBe(false);
  });

  it("breaks ties by effort then id", () => {
    const ranked = rankTodayWorkOrders(
      [candidate({ estimatedEffort: "l", id: "b" }), candidate({ estimatedEffort: "s", id: "c" }), candidate({ estimatedEffort: "s", id: "a" })],
      new Map(),
    );
    expect(ranked.map((item) => item.id)).toEqual(["a", "c", "b"]);
  });
});

describe("kind helpers", () => {
  it("detects loss type and checklist", () => {
    expect(isLossType(candidate({ id: "x", ruleId: "NOINDEX_ON_IMPORTANT_PAGE" }))).toBe(true);
    expect(isLossType(candidate({ id: "x", sourceKey: "legacy-redirect:s:home_only" }))).toBe(false);
    expect(isChecklist(candidate({ id: "x", sourceKey: "checklist:s:sitemap-naver" }))).toBe(true);
    expect(isChecklist(candidate({ id: "x" }))).toBe(false);
  });
});

describe("buildAiInstruction", () => {
  it("builds self-contained instruction", () => {
    const text = buildAiInstruction(candidate({ id: "body/head-filler" }), {
      protectedRules: defaultProtectedRules,
      siteName: "고운몸의원"
    });
    expect(text.split("\n")[0]).toBe("[고운몸의원 홈페이지 수정 요청]");
    expect(text).toContain("대상 페이지: https://www.gowoonmom.co.kr/body/head-filler");
    expect(text).toContain("지금 문제: h1 이 없습니다.");
    expect(text).toContain("1. 페이지 상단에 h1 을 하나 추가합니다.");
    expect(text).toContain("- 의료광고 관련 고지·주의 문구는 지우거나 바꾸지 마세요.");
    expect(text).toContain("끝나면 확인할 것:\n- 재크롤에서 h1 이 보인다.");
  });

  it("omits target line when url is null and includes description", () => {
    const text = buildAiInstruction(candidate({ description: "| 옛 주소 | 노출 |", id: "x", url: null }), {
      protectedRules: [],
      siteName: "고운몸의원"
    });
    expect(text).not.toContain("대상 페이지:");
    expect(text).not.toContain("지켜야 할 것:");
    expect(text).toContain("| 옛 주소 | 노출 |");
  });
});

describe("protectedRulesFromIgnoredKeys", () => {
  it("derives protected rule from ignored key", () => {
    expect(protectedRulesFromIgnoredKeys([`NOINDEX_ON_IMPORTANT_PAGE|${BASE}/ebook`])).toEqual([
      "https://www.gowoonmom.co.kr/ebook 의 검색 제외(noindex) 설정은 의도된 것이니 그대로 두세요."
    ]);
  });

  it("falls back to rule id for unknown rules and skips malformed keys", () => {
    expect(protectedRulesFromIgnoredKeys(["SOMETHING_NEW|https://a.example/x", "broken"])).toEqual([
      "https://a.example/x 의 SOMETHING_NEW 설정은 의도된 것이니 그대로 두세요."
    ]);
  });
});
