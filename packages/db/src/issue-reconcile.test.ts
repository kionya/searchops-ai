import { describe, expect, it } from "vitest";

import {
  closeIssuesForGoneUrls,
  issueKey,
  reconcileSiteIssues,
  type IssueReconcileClient,
  type ReconcileIssueRow
} from "./issue-reconcile.js";

const SITE = "site_1";
const RUN = "crawl_new";
const EBOOK = "https://www.gowoonmom.co.kr/ebook";

function issue(overrides: Partial<ReconcileIssueRow> & { readonly id: string }): ReconcileIssueRow {
  return {
    crawlRunId: "crawl_old",
    ruleId: "H1_MISSING",
    status: "open",
    urlRecord: { crawlRunId: RUN, statusCode: 200, url: `https://www.gowoonmom.co.kr/${overrides.id}` },
    workOrders: [{ id: `wo_${overrides.id}`, organizationId: "org", siteId: SITE, status: "open" }],
    ...overrides
  };
}

function createClient(input: {
  readonly issues: readonly ReconcileIssueRow[];
  readonly crawl?: { status: string; summary: unknown } | null;
  readonly ignoredIssueKeys?: readonly string[];
}) {
  const calls = { events: [] as Record<string, unknown>[], issueUpdates: [] as unknown[], workOrderUpdates: [] as unknown[] };
  const client: IssueReconcileClient = {
    closedLoopAuditEvent: {
      async create(args) {
        calls.events.push(args.data);
        return args;
      }
    },
    crawlRun: {
      async findUnique() {
        return input.crawl === null
          ? null
          : { id: RUN, siteId: SITE, ...(input.crawl ?? { status: "completed", summary: { pagesProcessed: 25 } }) };
      }
    },
    seoIssue: {
      async findMany(args) {
        const urls = args.where.urlRecord.url?.in;
        return input.issues.filter((row) => urls === undefined || (row.urlRecord !== null && urls.includes(row.urlRecord.url)));
      },
      async update(args) {
        calls.issueUpdates.push(args);
        return args;
      }
    },
    site: {
      async findUnique() {
        return { id: SITE, ignoredIssueKeys: [...(input.ignoredIssueKeys ?? [])] };
      }
    },
    workOrder: {
      async update(args) {
        calls.workOrderUpdates.push(args);
        return args;
      }
    }
  };
  return { calls, client };
}

describe("reconcileSiteIssues", () => {
  it("resolves issue on crawled url that was not re-detected", async () => {
    const { calls, client } = createClient({ issues: [issue({ id: "a" })] });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toEqual({
      ignored: 0,
      reopened: 0,
      resolved: 1,
      skipped: false
    });
    expect(calls.issueUpdates).toEqual([{ data: { status: "resolved" }, where: { id: "a" } }]);
    expect(calls.workOrderUpdates).toEqual([{ data: { status: "done" }, where: { id: "wo_a" } }]);
    expect(calls.events).toHaveLength(1);
    expect(calls.events[0]).toMatchObject({
      eventType: "work_order_done",
      metadata: { crawlRunId: RUN, reason: "not_redetected" },
      source: "worker:reconcile",
      workOrderId: "wo_a"
    });
  });

  // 리뷰 I4: 오류 페이지(429·5xx 등)를 읽고 규칙이 안 걸렸다고 "고쳐짐"으로 치면 안 된다.
  it("does not resolve issues on a url that answered with an error status", async () => {
    const { calls, client } = createClient({
      issues: [issue({ id: "a", urlRecord: { crawlRunId: RUN, statusCode: 429, url: "https://www.gowoonmom.co.kr/a" } })]
    });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toMatchObject({ resolved: 0 });
    expect(calls.workOrderUpdates).toEqual([]);
  });

  it("leaves issue on url outside this crawl untouched", async () => {
    const { calls, client } = createClient({
      issues: [issue({ id: "old", urlRecord: { crawlRunId: "crawl_old", statusCode: 200, url: "https://www.gowoonmom.co.kr/web/sub/doctor" } })]
    });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toMatchObject({ resolved: 0 });
    expect(calls.issueUpdates).toEqual([]);
    expect(calls.workOrderUpdates).toEqual([]);
  });

  it("skips when crawl looks blocked", async () => {
    const { calls, client } = createClient({
      crawl: { status: "completed", summary: { pagesProcessed: 1 } },
      issues: [issue({ id: "a" })]
    });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toEqual({
      ignored: 0,
      reopened: 0,
      resolved: 0,
      skipped: true
    });
    expect(calls.issueUpdates).toEqual([]);
  });

  it("skips when crawl did not complete", async () => {
    const { calls, client } = createClient({ crawl: { status: "failed", summary: null }, issues: [issue({ id: "a" })] });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toMatchObject({ skipped: true });
    expect(calls.workOrderUpdates).toEqual([]);
  });

  it("reopens in_review work order when issue is re-detected", async () => {
    const { calls, client } = createClient({
      issues: [
        issue({
          crawlRunId: RUN,
          id: "a",
          workOrders: [{ id: "wo_a", organizationId: "org", siteId: SITE, status: "in_review" }]
        })
      ]
    });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toMatchObject({ reopened: 1, resolved: 0 });
    expect(calls.workOrderUpdates).toEqual([{ data: { status: "open" }, where: { id: "wo_a" } }]);
    expect(calls.events[0]).toMatchObject({ eventType: "work_order_reopened", status: "open" });
    expect(String(calls.events[0]?.message)).toContain("다시 확인 필요");
  });

  it("does not touch re-detected issue whose work order is still open", async () => {
    const { calls, client } = createClient({ issues: [issue({ crawlRunId: RUN, id: "a" })] });
    await reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE });
    expect(calls.workOrderUpdates).toEqual([]);
    expect(calls.events).toEqual([]);
  });

  it("keeps ignored issue closed on re-detection", async () => {
    const { calls, client } = createClient({
      ignoredIssueKeys: [issueKey("NOINDEX_ON_IMPORTANT_PAGE", EBOOK)],
      issues: [
        issue({
          crawlRunId: RUN,
          id: "ebook",
          ruleId: "NOINDEX_ON_IMPORTANT_PAGE",
          urlRecord: { crawlRunId: RUN, statusCode: 200, url: EBOOK },
          workOrders: [{ id: "wo_ebook", organizationId: "org", siteId: SITE, status: "done" }]
        })
      ]
    });
    await expect(reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE })).resolves.toMatchObject({ ignored: 1, reopened: 0 });
    expect(calls.issueUpdates).toEqual([{ data: { status: "ignored" }, where: { id: "ebook" } }]);
    // 이미 done 이라 지시서는 그대로, 감사 이벤트도 없다.
    expect(calls.workOrderUpdates).toEqual([]);
  });

  it("closes open work order of a newly ignored issue with reason intended", async () => {
    const { calls, client } = createClient({
      ignoredIssueKeys: [issueKey("NOINDEX_ON_IMPORTANT_PAGE", EBOOK)],
      issues: [issue({ crawlRunId: RUN, id: "ebook", ruleId: "NOINDEX_ON_IMPORTANT_PAGE", urlRecord: { crawlRunId: RUN, statusCode: 200, url: EBOOK } })]
    });
    await reconcileSiteIssues(client, { crawlRunId: RUN, siteId: SITE });
    expect(calls.workOrderUpdates).toEqual([{ data: { status: "done" }, where: { id: "wo_ebook" } }]);
    expect(calls.events[0]).toMatchObject({ metadata: { reason: "intended" } });
  });
});

describe("closeIssuesForGoneUrls", () => {
  it("closeIssuesForGoneUrls closes issues and work orders for given urls", async () => {
    const gone = "https://www.gowoonmom.co.kr/web/sub/doctor";
    const { calls, client } = createClient({
      issues: [
        issue({ id: "x", urlRecord: { crawlRunId: "crawl_old", statusCode: 200, url: gone } }),
        issue({ id: "y", ruleId: "IMAGE_ALT_MISSING", urlRecord: { crawlRunId: "crawl_old", statusCode: 200, url: gone } }),
        issue({ id: "z", status: "resolved", urlRecord: { crawlRunId: "crawl_old", statusCode: 200, url: gone }, workOrders: [{ id: "wo_z", organizationId: "org", siteId: SITE, status: "done" }] })
      ]
    });
    await expect(closeIssuesForGoneUrls(client, { siteId: SITE, urls: [gone] })).resolves.toBe(2);
    expect(calls.workOrderUpdates).toEqual([
      { data: { status: "done" }, where: { id: "wo_x" } },
      { data: { status: "done" }, where: { id: "wo_y" } }
    ]);
    expect(calls.events[0]).toMatchObject({ metadata: { reason: "url_gone" } });
  });

  it("does nothing for an empty url list", async () => {
    const { calls, client } = createClient({ issues: [issue({ id: "a" })] });
    await expect(closeIssuesForGoneUrls(client, { siteId: SITE, urls: [] })).resolves.toBe(0);
    expect(calls.issueUpdates).toEqual([]);
  });
});
