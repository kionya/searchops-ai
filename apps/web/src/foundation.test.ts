import { describe, expect, it } from "vitest";

import { productName, SiteSchema, WorkOrderSchema } from "@searchops/types";

import {
  dashboardPlaceholders,
  getSiteDashboardPath,
  siteRouteItems
} from "./dashboard-shell";
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
      "content",
      "geo",
      "compliance"
    ]);
    expect(getSiteDashboardPath("site_1", "")).toBe("/sites/site_1");
    expect(getSiteDashboardPath("site_1", "workorders")).toBe("/sites/site_1/workorders");
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
});
