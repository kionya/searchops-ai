import { describe, expect, it, vi } from "vitest";

import {
  buildLegacyWorkOrderDrafts,
  checklistDrafts,
  classifyLegacyUrl,
  runRedirectCheckForSite,
  type RedirectCheckDeps
} from "./redirect-check.js";

const W = "https://www.gowoonmom.co.kr";

describe("classifyLegacyUrl", () => {
  it("classifies final responses", () => {
    expect(classifyLegacyUrl(`${W}/web/blog/view?id=22`, { finalUrl: `${W}/web/blog/view?id=22`, statusCode: 404 })).toBe("broken");
    expect(classifyLegacyUrl(`${W}/web/sub/doctor`, { finalUrl: `${W}/about/doctors`, statusCode: 200 })).toBe("ok");
    expect(classifyLegacyUrl(`${W}/web/sub/doctor`, { finalUrl: `${W}/`, statusCode: 200 })).toBe("home_only");
    expect(classifyLegacyUrl(`${W}/`, { finalUrl: `${W}/`, statusCode: 200 })).toBe("ok");
    expect(classifyLegacyUrl(`${W}/a`, { finalUrl: `${W}/b`, statusCode: 302 })).toBe("broken");
    expect(classifyLegacyUrl(`${W}/a`, { error: new Error("ECONNRESET") })).toBe("unknown");
  });
});

describe("buildLegacyWorkOrderDrafts", () => {
  it("groups broken urls into one draft with a top-30 table", () => {
    const checks = Array.from({ length: 32 }, (_, index) => ({
      outcome: "broken" as const,
      traffic: 1000 - index,
      url: `${W}/web/blog/view?id=${index}`
    }));
    const { broken, homeOnly } = buildLegacyWorkOrderDrafts("gowoonmom.co.kr", checks);
    expect(broken?.title).toBe("옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요");
    expect(broken?.priority).toBe("p0");
    expect(broken?.description?.split("\n").filter((line) => line.startsWith("| https://"))).toHaveLength(30);
    expect(broken?.description).toContain("외 2개");
    expect(homeOnly).toBeNull();
  });

  it("returns null drafts when nothing is broken", () => {
    const { broken, homeOnly } = buildLegacyWorkOrderDrafts("gowoonmom.co.kr", [
      { outcome: "ok", traffic: 5, url: `${W}/a` },
      { outcome: "home_only", traffic: 3, url: `${W}/b` }
    ]);
    expect(broken).toBeNull();
    expect(homeOnly?.title).toBe("옛 주소 1개가 홈으로만 연결됨 — 맞는 페이지로 연결 권장");
    expect(homeOnly?.priority).toBe("p2");
  });

  it("has sitemap checklist drafts", () => {
    expect(checklistDrafts["sitemap-naver"].title).toBe("네이버 서치어드바이저에 새 사이트맵 제출");
    expect(checklistDrafts["sitemap-google"].title).toBe("구글 서치콘솔에 새 사이트맵 제출");
  });
});

describe("runRedirectCheckForSite", () => {
  const site = { domain: "gowoonmom.co.kr", id: "site_1", organizationId: "org" };

  function deps(fetchResults: Record<string, { finalUrl: string; statusCode: number } | "error">): RedirectCheckDeps & {
    upsert: ReturnType<typeof vi.fn>;
    closeGone: ReturnType<typeof vi.fn>;
  } {
    return {
      closeGone: vi.fn(async () => 0),
      fetch: async (url: string) => {
        const result = fetchResults[url];
        if (result === undefined || result === "error") {
          throw new Error("network");
        }
        return result;
      },
      loadCandidates: async () => Object.keys(fetchResults).map((url, index) => ({ traffic: 100 - index, url })),
      upsert: vi.fn(async () => "created" as const)
    };
  }

  it("does not touch work orders when most checks are unknown", async () => {
    const d = deps({ [`${W}/a`]: "error", [`${W}/b`]: "error", [`${W}/c`]: "error", [`${W}/d`]: { finalUrl: `${W}/d`, statusCode: 404 } });
    const result = await runRedirectCheckForSite(d, site);
    expect(result.aborted).toBe(true);
    expect(d.upsert).not.toHaveBeenCalled();
    expect(d.closeGone).not.toHaveBeenCalled();
  });

  it("tracks broken and home-only drafts, creates checklists once and closes gone url issues", async () => {
    const d = deps({
      [`${W}/web/blog/view?id=22`]: { finalUrl: `${W}/web/blog/view?id=22`, statusCode: 404 },
      [`${W}/web/sub/doctor`]: { finalUrl: `${W}/about/doctors`, statusCode: 200 },
      [`${W}/web/x`]: "error"
    });
    const result = await runRedirectCheckForSite(d, site);
    expect(result).toMatchObject({ aborted: false, broken: 1, checked: 3, homeOnly: 0, ok: 1, unknown: 1 });
    const keys = d.upsert.mock.calls.map((call) => [(call[0] as { sourceKey: string }).sourceKey, (call[0] as { mode: string }).mode]);
    expect(keys).toEqual([
      ["legacy-redirect:site_1:broken", "track"],
      ["legacy-redirect:site_1:home_only", "track"],
      ["checklist:site_1:sitemap-naver", "create_once"],
      ["checklist:site_1:sitemap-google", "create_once"]
    ]);
    expect(d.closeGone).toHaveBeenCalledWith([`${W}/web/blog/view?id=22`, `${W}/web/sub/doctor`]);
  });

  it("does nothing when there are no legacy candidates", async () => {
    const d = deps({});
    const result = await runRedirectCheckForSite(d, site);
    expect(result.checked).toBe(0);
    expect(d.upsert).not.toHaveBeenCalled();
  });
});
