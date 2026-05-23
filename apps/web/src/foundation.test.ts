import { afterEach, describe, expect, it, vi } from "vitest";

import { productName, SiteSchema, WorkOrderSchema } from "@searchops/types";

import {
  dashboardPlaceholders,
  getSiteDashboardPath,
  siteRouteItems
} from "./dashboard-shell";
import {
  createDemoConnectorSyncHistory,
  formatSyncDuration,
  getConnectorSyncRunTone,
  getConnectorSyncTriggerFeedback,
  loadConnectorSyncHistory,
  summarizeConnectorSyncHistory,
  triggerConnectorSync
} from "./connector-sync-history";
import {
  futureModuleKeys,
  futureModuleSkeletons,
  summarizeFutureModules
} from "./future-module-skeletons";
import {
  calculateSiteOverviewKpis,
  demoSiteOverviewInput,
  summarizeSiteOverview
} from "./site-overview-kpis";
import {
  demoCrawlRunRows,
  demoIssueListRows,
  demoUrlInventoryRows,
  formatDuration,
  summarizeCrawlRuns,
  summarizeIssues,
  summarizeUrlInventory
} from "./site-detail-views";
import {
  canRecheckWorkOrder,
  demoSite,
  demoWorkOrders,
  groupWorkOrdersByStatus,
  summarizeWorkOrders
} from "./work-order-board";

describe("web foundation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("can import shared workspace types", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("can validate the dashboard site fixture shape", () => {
    expect(SiteSchema.parse(demoSite)).toMatchObject({ domain: "example-clinic.com" });
  });

  it("can validate the work board fixtures", () => {
    expect(demoWorkOrders.map((workOrder) => WorkOrderSchema.parse(workOrder))).toHaveLength(5);
  });

  it("summarizes the work board fixture", () => {
    expect(summarizeWorkOrders(demoWorkOrders)).toEqual({
      total: 5,
      active: 4,
      inProgress: 1,
      inReview: 1,
      blocked: 1,
      urgent: 2
    });
  });

  it("groups work orders by deterministic board columns", () => {
    const grouped = groupWorkOrdersByStatus(demoWorkOrders);

    expect(grouped.open).toHaveLength(1);
    expect(grouped.in_progress[0]?.id).toBe("wo_h1_service");
    expect(grouped.done[0]?.id).toBe("wo_canonical_blog");
  });

  it("keeps recheck actions limited to active unblocked work", () => {
    const doneWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "done");
    const blockedWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "blocked");
    const openWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "open");

    expect(doneWorkOrder && canRecheckWorkOrder(doneWorkOrder)).toBe(false);
    expect(blockedWorkOrder && canRecheckWorkOrder(blockedWorkOrder)).toBe(false);
    expect(openWorkOrder && canRecheckWorkOrder(openWorkOrder)).toBe(true);
  });

  it("defines the Phase 5 site route shell", () => {
    expect(siteRouteItems.map((item) => item.segment)).toEqual([
      "",
      "crawls",
      "urls",
      "issues",
      "workorders",
      "connectors",
      "content",
      "geo",
      "compliance"
    ]);
    expect(getSiteDashboardPath("site_1", "")).toBe("/sites/site_1");
    expect(getSiteDashboardPath("site_1", "workorders")).toBe("/sites/site_1/workorders");
    expect(getSiteDashboardPath("site_1", "connectors")).toBe("/sites/site_1/connectors");
  });

  it("keeps placeholder modules wired for non-workorder dashboard sections", () => {
    expect(Object.keys(dashboardPlaceholders).sort()).toEqual([
      "compliance",
      "content",
      "crawls",
      "geo",
      "issues",
      "urls"
    ]);
  });

  it("summarizes deterministic connector sync history", () => {
    const history = createDemoConnectorSyncHistory("site_1");

    expect(summarizeConnectorSyncHistory(history)).toEqual({
      completed: 1,
      failed: 1,
      latestStatus: "completed",
      okResults: 4,
      partial: 1,
      queued: 0,
      total: 3,
      totalRecords: 5
    });
    expect(getConnectorSyncRunTone("partial")).toBe("partial");
    expect(formatSyncDuration("2026-05-22T09:00:00.000Z", "2026-05-22T09:01:18.000Z")).toBe(
      "1m 18s",
    );
  });

  it("loads connector sync history through the API response contracts", async () => {
    const fixture = createDemoConnectorSyncHistory("site_1");
    const connectorSyncRun = fixture.runs[0];
    const connectorSyncResult = connectorSyncRun
      ? fixture.resultsByRunId[connectorSyncRun.id]?.[0]
      : undefined;
    if (!connectorSyncRun || !connectorSyncResult) {
      throw new Error("Connector sync API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/sites/site_1/connector-sync-runs")) {
          return Response.json({
            connectorSyncRuns: [connectorSyncRun]
          });
        }

        if (url.endsWith(`/connector-sync-runs/${connectorSyncRun.id}`)) {
          return Response.json({
            connectorSyncRun,
            results: [connectorSyncResult]
          });
        }

        return new Response(null, { status: 404 });
      }),
    );

    const history = await loadConnectorSyncHistory("site_1");

    expect(history.source).toBe("api");
    expect(history.runs).toHaveLength(1);
    expect(history.resultsByRunId[connectorSyncRun.id]).toHaveLength(1);
  });

  it("queues connector sync trigger requests through the API contract", async () => {
    const fixture = createDemoConnectorSyncHistory("site_1");
    const connectorSyncRun = fixture.runs[0];
    if (!connectorSyncRun) {
      throw new Error("Connector sync trigger fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/connector-sync-runs");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ providers: ["gsc", "pagespeed"] });

        return Response.json({
          connectorSyncRun: {
            ...connectorSyncRun,
            id: "sync_queued",
            providers: ["gsc", "pagespeed"],
            status: "queued",
            endedAt: null,
            summary: null
          },
          job: {
            id: "job_queued",
            name: "connector-sync",
            payload: {
              connectorSyncRunId: "sync_queued",
              organizationId: connectorSyncRun.organizationId,
              siteId: "site_1",
              siteDomain: "example-clinic.com",
              requestedByUserId: connectorSyncRun.requestedByUserId,
              fetchedAt: "2026-05-22T09:00:00.000Z",
              providers: ["gsc", "pagespeed"]
            }
          }
        });
      }),
    );

    await expect(triggerConnectorSync("site_1", ["gsc", "pagespeed"])).resolves.toMatchObject({
      connectorSyncRunId: "sync_queued",
      jobId: "job_queued",
      source: "api",
      status: "queued"
    });
    expect(getConnectorSyncTriggerFeedback("queued", "sync_queued")?.message).toContain(
      "sync_queued",
    );
  });

  it("keeps connector sync trigger deterministic without an API base URL", async () => {
    await expect(triggerConnectorSync("site_1", ["gsc"])).resolves.toMatchObject({
      connectorSyncRunId: null,
      providers: ["gsc"],
      source: "fixture",
      status: "fixture"
    });
    expect(getConnectorSyncTriggerFeedback("fixture", undefined)?.tone).toBe("info");
  });

  it("calculates deterministic site overview KPIs", () => {
    expect(calculateSiteOverviewKpis(demoSiteOverviewInput)).toEqual({
      crawlSuccessRate: "80%",
      indexableUrlRatio: "75%",
      criticalIssueCount: "2",
      workOrderCompletionRate: "20%",
      resolvedIssueRate: "20%",
      nonBrandQueryCoverage: "0%",
      aiMentionRate: "0%",
      aiCitationRate: "0%"
    });
  });

  it("summarizes site overview decision counts", () => {
    expect(summarizeSiteOverview(demoSiteOverviewInput)).toEqual({
      activeWorkOrders: 4,
      rechecksInReview: 1,
      blockedWorkOrders: 1,
      totalUrls: 8,
      openIssues: 4
    });
  });

  it("summarizes deterministic crawl history rows", () => {
    expect(summarizeCrawlRuns(demoCrawlRunRows)).toEqual({
      total: 5,
      completed: 4,
      failed: 1,
      pagesCrawled: 31,
      latestStatus: "failed"
    });
    expect(formatDuration(252)).toBe("4m 12s");
  });

  it("summarizes deterministic URL inventory rows", () => {
    expect(summarizeUrlInventory(demoUrlInventoryRows)).toEqual({
      total: 8,
      indexable: 6,
      nonIndexable: 2,
      withIssues: 4,
      healthy: 2
    });
  });

  it("summarizes deterministic issue list rows", () => {
    expect(summarizeIssues(demoIssueListRows)).toEqual({
      total: 5,
      open: 4,
      resolved: 1,
      critical: 2,
      inReview: 1
    });
    expect(demoIssueListRows.map((issue) => issue.ruleId)).toEqual([
      "TITLE_MISSING",
      "H1_MISSING",
      "META_DESC_MISSING",
      "IMAGE_ALT_MISSING",
      "CANONICAL_MISSING"
    ]);
  });

  it("defines deterministic future module skeletons", () => {
    const modules = futureModuleKeys.map((key) => futureModuleSkeletons[key]);

    expect(futureModuleKeys).toEqual(["content", "geo", "compliance"]);
    expect(summarizeFutureModules(modules)).toEqual({
      total: 3,
      planned: 3,
      placeholderMetrics: 9,
      emptyStates: 3
    });
    expect(futureModuleSkeletons.compliance.dependsOn).toContain("Medical ad rules");
  });
});
