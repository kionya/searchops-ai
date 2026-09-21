import { describe, expect, it } from "vitest";

import { applyWorkOrderRecheck, type WorkOrderRecheckPersistenceClient } from "./work-order-recheck.js";

function createClient(overrides: {
  workOrder?: Awaited<ReturnType<WorkOrderRecheckPersistenceClient["workOrder"]["findUnique"]>>;
  issue?: Awaited<ReturnType<WorkOrderRecheckPersistenceClient["seoIssue"]["findUnique"]>>;
} = {}) {
  const calls: { workOrderUpdates: unknown[]; issueUpdates: unknown[]; events: unknown[] } = {
    events: [], issueUpdates: [], workOrderUpdates: []
  };
  const client: WorkOrderRecheckPersistenceClient = {
    closedLoopAuditEvent: { async create(args) { calls.events.push(args.data); return args; } },
    seoIssue: {
      async findUnique() {
        return overrides.issue === undefined
          ? { id: "issue_1", ruleId: "MISSING_TITLE", urlRecord: { url: "https://example.com/a" } }
          : overrides.issue;
      },
      async update(args) { calls.issueUpdates.push(args); return args; }
    },
    workOrder: {
      async findUnique() {
        return overrides.workOrder === undefined
          ? { id: "wo_1", organizationId: "org", seoIssueId: "issue_1", siteId: "site", status: "in_review" }
          : overrides.workOrder;
      },
      async update(args) { calls.workOrderUpdates.push(args); return args; }
    }
  };
  return { calls, client };
}

const input = { crawlRunId: "crawl_2", workOrderId: "wo_1" };

describe("work order recheck (T8)", () => {
  it("resolves the work order and issue when the rule is no longer detected", async () => {
    const { calls, client } = createClient();
    await expect(applyWorkOrderRecheck(client, { ...input, detectedIssues: [{ ruleId: "MISSING_H1", url: "https://example.com/a" }] }))
      .resolves.toEqual({ outcome: "resolved", workOrderId: "wo_1" });
    expect(calls.workOrderUpdates).toEqual([{ data: { status: "done" }, where: { id: "wo_1" } }]);
    expect(calls.issueUpdates).toEqual([{ data: { status: "resolved" }, where: { id: "issue_1" } }]);
    expect(calls.events[0]).toMatchObject({ eventType: "work_order_done", status: "done", source: "worker:recheck", metadata: { crawlRunId: "crawl_2", outcome: "resolved" } });
  });

  it("reopens the work order when the same rule is still detected on the same url", async () => {
    const { calls, client } = createClient();
    await expect(applyWorkOrderRecheck(client, { ...input, detectedIssues: [{ ruleId: "MISSING_TITLE", url: "https://example.com/a" }] }))
      .resolves.toEqual({ outcome: "still_open", workOrderId: "wo_1" });
    expect(calls.workOrderUpdates).toEqual([{ data: { status: "open" }, where: { id: "wo_1" } }]);
    expect(calls.issueUpdates).toEqual([]);
    expect(calls.events[0]).toMatchObject({ eventType: "work_order_recheck", status: "open" });
  });

  it("is idempotent: skips done work orders and orders without an issue", async () => {
    const done = createClient({ workOrder: { id: "wo_1", organizationId: "org", seoIssueId: "issue_1", siteId: "site", status: "done" } });
    await expect(applyWorkOrderRecheck(done.client, { ...input, detectedIssues: [] })).resolves.toEqual({ outcome: "skipped", workOrderId: "wo_1" });
    expect(done.calls.events).toEqual([]);
    const missing = createClient({ workOrder: null });
    await expect(applyWorkOrderRecheck(missing.client, { ...input, detectedIssues: [] })).resolves.toMatchObject({ outcome: "skipped" });
    const noIssue = createClient({ issue: null });
    await expect(applyWorkOrderRecheck(noIssue.client, { ...input, detectedIssues: [] })).resolves.toMatchObject({ outcome: "skipped" });
    expect(noIssue.calls.workOrderUpdates).toEqual([]);
  });
});
