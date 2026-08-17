import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadSiteCrawlRunDashboard,
  loadSiteIssueDashboard,
  loadSiteUrlInventoryDashboard
} from "./site-detail-views";

// @searchops/db 의 스냅샷과 웹의 행 매퍼 사이 이음새. 스냅샷은 실 DB 스모크
// (scripts/web-direct-db-smoke.mjs)가 검증하고, 여기서는 그 모양이 화면 행으로
// 제대로 변환되는지와 출처가 "database" 로 표시되는지를 본다.
const snapshot = {
  crawlRuns: [
    {
      endedAt: "2026-08-17T00:10:00.000Z",
      id: "crawl_a1",
      siteId: "site_a1",
      startedAt: "2026-08-17T00:00:00.000Z",
      status: "completed",
      summary: { pagesProcessed: 2 }
    }
  ],
  schemaRecommendations: [],
  seoIssues: [
    {
      createdAt: "2026-08-17T00:05:00.000Z",
      crawlRunId: "crawl_a1",
      evidence: {
        expectedValue: "present",
        observedValue: null,
        sourceField: "title",
        url: "https://a1.example.com/"
      },
      id: "issue_a1",
      ruleId: "TITLE_MISSING",
      severity: "high",
      status: "open",
      title: "타이틀 누락",
      urlRecordId: "url_a1"
    }
  ],
  site: {
    country: "KR",
    createdAt: "2026-08-01T00:00:00.000Z",
    domain: "a1.example.com",
    id: "site_a1",
    industry: "other",
    language: "ko",
    name: "a1.example.com",
    organizationId: "org_a"
  },
  urlRecords: [
    {
      crawlRunId: "crawl_a1",
      createdAt: "2026-08-17T00:02:00.000Z",
      id: "url_a1",
      metaDescription: null,
      siteId: "site_a1",
      statusCode: 200,
      title: "홈",
      url: "https://a1.example.com/"
    }
  ]
};

vi.mock("./site-database", () => ({
  getSiteSnapshot: vi.fn(async () => snapshot),
  isDirectDatabaseMode: () => true
}));

describe("직접 DB 모드 대시보드 로더", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("스냅샷에서 이슈 행을 만들고 출처를 database 로 표시한다", async () => {
    // 스냅샷이 있으면 API 를 부를 이유가 없다 — fetch 가 불리면 그 자체가 회귀다.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await loadSiteIssueDashboard("site_a1");

    expect(dashboard.source).toBe("database");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0]).toMatchObject({ id: "issue_a1", ruleId: "TITLE_MISSING" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("크롤 실행 행에 이슈 수를 집계한다", async () => {
    const dashboard = await loadSiteCrawlRunDashboard("site_a1");

    expect(dashboard.source).toBe("database");
    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0]).toMatchObject({ id: "crawl_a1", issuesFound: 1, pagesCrawled: 2 });
  });

  it("URL 인벤토리에 이슈를 연결한다", async () => {
    const dashboard = await loadSiteUrlInventoryDashboard("site_a1");

    expect(dashboard.source).toBe("database");
    expect(dashboard.rows).toHaveLength(1);
    // 이슈가 urlRecordId 로 붙어야 한다. 안 붙으면 URL 목록이 항상 "문제 없음" 으로 보인다.
    expect(dashboard.rows[0]).toMatchObject({ id: "url_a1", issueCount: 1 });
  });
});
