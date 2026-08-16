import { describe, expect, it } from "vitest";

import {
  createRichdocContractBridge,
  parseRichdocContractConfigFromEnv,
  richdocUuidFromId,
  toRichdocIssueSeverity,
  toRichdocRunStatus,
  toRichdocWorkOrderStatus
} from "./richdoc.js";
import type { SearchOpsPrismaClient } from "./client.js";

interface CapturedRequest {
  readonly body: unknown;
  readonly headers: Record<string, string>;
  readonly url: string;
}

function createCapturingFetch(status = 201) {
  const calls: CapturedRequest[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      body: JSON.parse(String(init?.body)),
      headers: { ...(init?.headers as Record<string, string>) },
      url: String(url)
    });
    return new Response(null, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const site = { domain: "rejuel.com" };

function createFakePrisma(overrides: {
  crawlRun?: unknown;
  seoIssues?: unknown[];
  workOrders?: unknown[];
}) {
  const queries: string[] = [];
  const prisma = {
    crawlRun: {
      findUnique: async () => {
        queries.push("crawlRun.findUnique");
        return overrides.crawlRun ?? null;
      }
    },
    seoIssue: {
      findMany: async () => {
        queries.push("seoIssue.findMany");
        return overrides.seoIssues ?? [];
      }
    },
    workOrder: {
      findMany: async () => {
        queries.push("workOrder.findMany");
        return overrides.workOrders ?? [];
      }
    }
  } as unknown as SearchOpsPrismaClient;
  return { prisma, queries };
}

function createBridge(
  prisma: SearchOpsPrismaClient,
  fetchImpl: typeof fetch,
  siteIds: readonly string[] = ["site-1"],
) {
  return createRichdocContractBridge({
    fetchImpl,
    prisma,
    serviceRoleKey: "service-key",
    siteIds,
    supabaseUrl: "https://rejuel.supabase.co/"
  });
}

const crawlRunRow = {
  endedAt: new Date("2026-08-15T01:10:00Z"),
  id: "crawl-run-1",
  site,
  siteId: "site-1",
  startedAt: new Date("2026-08-15T01:00:00Z"),
  status: "completed",
  summary: { pagesProcessed: 12 }
};

const workOrderRow = {
  createdAt: new Date("2026-08-15T01:11:00Z"),
  id: "wo-1",
  relatedIssues: ["TITLE_MISSING"],
  seoIssueId: "issue-1",
  site,
  status: "in_review",
  title: "타이틀 누락 수정",
  updatedAt: new Date("2026-08-15T02:00:00Z")
};

describe("richdocUuidFromId", () => {
  it("derives a stable RFC 4122 uuid from a cuid", () => {
    const uuid = richdocUuidFromId("clxyz123");
    expect(uuid).toBe(richdocUuidFromId("clxyz123"));
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(richdocUuidFromId("other")).not.toBe(uuid);
  });
});

describe("parseRichdocContractConfigFromEnv", () => {
  it("requires url, key and at least one site id", () => {
    expect(parseRichdocContractConfigFromEnv({})).toBeUndefined();
    expect(
      parseRichdocContractConfigFromEnv({
        SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY: "k",
        SEARCHOPS_RICHDOC_SUPABASE_URL: "https://x.supabase.co"
      }),
    ).toBeUndefined();
    expect(
      parseRichdocContractConfigFromEnv({
        SEARCHOPS_RICHDOC_SITE_IDS: " site-1 , site-2 ,",
        SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY: "k",
        SEARCHOPS_RICHDOC_SUPABASE_URL: "https://x.supabase.co"
      }),
    ).toEqual({
      serviceRoleKey: "k",
      siteIds: ["site-1", "site-2"],
      supabaseUrl: "https://x.supabase.co"
    });
  });
});

describe("contract value mapping", () => {
  it("maps run, severity and work order statuses onto contract enums", () => {
    expect(toRichdocRunStatus("completed")).toBe("done");
    expect(toRichdocRunStatus("empty")).toBe("done");
    expect(toRichdocRunStatus("failed")).toBe("error");
    expect(toRichdocRunStatus("queued")).toBe("running");

    expect(toRichdocIssueSeverity("critical")).toBe("critical");
    expect(toRichdocIssueSeverity("high")).toBe("warning");
    expect(toRichdocIssueSeverity("medium")).toBe("warning");
    expect(toRichdocIssueSeverity("low")).toBe("info");

    expect(toRichdocWorkOrderStatus("open")).toBe("open");
    expect(toRichdocWorkOrderStatus("in_progress")).toBe("in_progress");
    expect(toRichdocWorkOrderStatus("blocked")).toBe("in_progress");
    expect(toRichdocWorkOrderStatus("in_review")).toBe("applied");
    expect(toRichdocWorkOrderStatus("done")).toBe("verified");
  });
});

describe("syncCrawlRun", () => {
  it("upserts run, issues and work orders for an allowlisted site", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma } = createFakePrisma({
      crawlRun: crawlRunRow,
      seoIssues: [
        {
          evidence: { observedValue: null, url: "https://rejuel.com/a" },
          ruleId: "TITLE_MISSING",
          severity: "high",
          title: "타이틀 누락",
          urlRecord: { url: "https://rejuel.com/a" }
        },
        {
          evidence: { url: "https://rejuel.com/b" },
          ruleId: "META_DESCRIPTION_MISSING",
          severity: "low",
          title: "메타 설명 누락",
          urlRecord: null
        }
      ],
      workOrders: [workOrderRow]
    });
    const bridge = createBridge(prisma, fetchImpl);

    await bridge.syncCrawlRun({ crawlRunId: "crawl-run-1", siteId: "site-1" });

    expect(calls.map((call) => call.url)).toEqual([
      "https://rejuel.supabase.co/rest/v1/searchops_runs?on_conflict=id",
      "https://rejuel.supabase.co/rest/v1/searchops_issues?on_conflict=site%2Cpage_url%2Crule_id",
      "https://rejuel.supabase.co/rest/v1/searchops_work_orders?on_conflict=id"
    ]);
    expect(calls[0]!.headers.authorization).toBe("Bearer service-key");
    expect(calls[0]!.headers.prefer).toBe("resolution=merge-duplicates,return=minimal");

    expect(calls[0]!.body).toEqual([
      {
        finished_at: "2026-08-15T01:10:00.000Z",
        id: richdocUuidFromId("crawl-run-1"),
        issues_found: 2,
        pages_crawled: 12,
        site: "rejuel.com",
        started_at: "2026-08-15T01:00:00.000Z",
        status: "done",
        summary: { pagesProcessed: 12 }
      }
    ]);

    const issueRows = calls[1]!.body as Array<Record<string, unknown>>;
    expect(issueRows).toHaveLength(2);
    expect(issueRows[0]).toMatchObject({
      page_url: "https://rejuel.com/a",
      rule_id: "TITLE_MISSING",
      severity: "warning",
      site: "rejuel.com",
      title: "타이틀 누락"
    });
    expect(issueRows[1]).toMatchObject({
      page_url: "https://rejuel.com/b",
      severity: "info"
    });
    // Console-managed columns must be left untouched by the adapter.
    expect(issueRows[0]).not.toHaveProperty("status");
    expect(issueRows[0]).not.toHaveProperty("first_seen");

    // created_at 은 보내지 않는다 — 병합 대상이라 매번 덮이면 오래 방치된 지시서가
    // 영원히 '오늘 만들어진 것'으로 보인다.
    // status 도 보내지 않는다 — 매일 도는 크롤이 콘솔에서 사람이 옮긴 진행 상태를
    // 되돌리면 안 된다. 이슈의 status/first_seen 과 같은 규칙이다.
    expect(calls[2]!.body).toEqual([
      {
        id: richdocUuidFromId("wo:rejuel.com:타이틀 누락 수정"),
        issue_count: 1,
        site: "rejuel.com",
        title: "타이틀 누락 수정",
        updated_at: "2026-08-15T02:00:00.000Z"
      }
    ]);
  });

  it("collapses issues sharing the contract conflict key", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const issue = {
      evidence: null,
      ruleId: "TITLE_MISSING",
      severity: "critical",
      title: "타이틀 누락",
      urlRecord: { url: "https://rejuel.com/a" }
    };
    const { prisma } = createFakePrisma({ crawlRun: crawlRunRow, seoIssues: [issue, { ...issue }] });
    const bridge = createBridge(prisma, fetchImpl);

    await bridge.syncCrawlRun({ crawlRunId: "crawl-run-1", siteId: "site-1" });

    expect(calls[1]!.body).toHaveLength(1);
  });

  it("does nothing for a site outside the allowlist", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma, queries } = createFakePrisma({ crawlRun: crawlRunRow });
    const bridge = createBridge(prisma, fetchImpl, ["other-site"]);

    await bridge.syncCrawlRun({ crawlRunId: "crawl-run-1", siteId: "site-1" });

    expect(queries).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("resolves without throwing when the upsert is rejected, but counts the failure", async () => {
    const { fetchImpl } = createCapturingFetch(500);
    const { prisma } = createFakePrisma({ crawlRun: crawlRunRow });
    const bridge = createBridge(prisma, fetchImpl);

    await expect(
      bridge.syncCrawlRun({ crawlRunId: "crawl-run-1", siteId: "site-1" }),
    ).resolves.toBeUndefined();
    // 삼킨 실패가 드러나야 배치가 종료 코드로 알릴 수 있다. 이게 0이면 적재가
    // 100% 실패해도 워크플로가 초록불로 끝난다.
    expect(bridge.failureCount).toBe(1);
  });

  it("uses the crawl time for last_seen, not the push time", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma } = createFakePrisma({
      crawlRun: crawlRunRow,
      seoIssues: [
        {
          evidence: null,
          ruleId: "TITLE_MISSING",
          severity: "critical",
          title: "타이틀 누락",
          urlRecord: { url: "https://rejuel.com/a" }
        }
      ]
    });
    const bridge = createBridge(prisma, fetchImpl);

    await bridge.syncCrawlRun({ crawlRunId: "crawl-run-1", siteId: "site-1" });

    const [issue] = calls[1]!.body as Array<Record<string, unknown>>;
    // 푸시 시각을 쓰면 과거 런을 백필할 때 이슈 나이가 사라진다.
    expect(issue!.last_seen).toBe(crawlRunRow.endedAt.toISOString());
  });
});

describe("syncSiteWorkOrders", () => {
  it("pushes work orders for an allowlisted site id and skips orphans", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma } = createFakePrisma({
      workOrders: [
        workOrderRow,
        {
          ...workOrderRow,
          id: "wo-2",
          relatedIssues: [],
          seoIssueId: null,
          site: null,
          status: "done"
        }
      ]
    });
    const bridge = createBridge(prisma, fetchImpl);

    await bridge.syncSiteWorkOrders({ siteId: "site-1" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual([
      expect.objectContaining({
        id: richdocUuidFromId("wo:rejuel.com:타이틀 누락 수정"),
        status: "applied"
      })
    ]);
  });

  it("collapses repeat work orders for the same problem into one row", async () => {
    // 크롤마다 SeoIssue 가 새로 생겨(유니크 키에 crawlRunId 포함) 같은 문제의 지시서가
    // 반복 생성된다. 콘솔에 그게 그대로 쌓이면 안 된다.
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma } = createFakePrisma({
      workOrders: [
        { ...workOrderRow, id: "wo-old", status: "open", updatedAt: new Date("2026-06-23T00:00:00Z") },
        { ...workOrderRow, id: "wo-new", status: "done", updatedAt: new Date("2026-08-16T00:00:00Z") }
      ]
    });
    const bridge = createBridge(prisma, fetchImpl);

    await bridge.syncSiteWorkOrders({ siteId: "site-1" });

    const rows = calls[0]!.body as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // 마지막에 올라간 값이 남으므로 최신 상태여야 한다.
    expect(rows[0]).toMatchObject({
      id: richdocUuidFromId("wo:rejuel.com:타이틀 누락 수정"),
      status: "verified"
    });
  });

  it("does not query or push for a site outside the allowlist", async () => {
    const { calls, fetchImpl } = createCapturingFetch();
    const { prisma, queries } = createFakePrisma({ workOrders: [workOrderRow] });
    const bridge = createBridge(prisma, fetchImpl, ["other-site"]);

    await bridge.syncSiteWorkOrders({ siteId: "site-1" });

    expect(queries).toEqual([]);
    expect(calls).toEqual([]);
  });
});
