import type {
  CrawlRun,
  SeoIssue,
  UrlRecord,
  WorkOrder,
  WorkOrderPriority
} from "@searchops/types";

import { demoSite, demoWorkOrders } from "./work-order-board";

export interface DashboardUrlRecord extends UrlRecord {
  readonly indexable: boolean;
}

export interface DashboardSeoIssue extends SeoIssue {
  readonly priority: WorkOrderPriority;
}

export interface GeoVisibilitySnapshot {
  readonly nonBrandQueries: number;
  readonly coveredNonBrandQueries: number;
  readonly aiAnswersChecked: number;
  readonly aiMentions: number;
  readonly aiCitations: number;
}

export interface SiteOverviewInput {
  readonly crawlRuns: readonly CrawlRun[];
  readonly urls: readonly DashboardUrlRecord[];
  readonly issues: readonly DashboardSeoIssue[];
  readonly workOrders: readonly WorkOrder[];
  readonly geo: GeoVisibilitySnapshot;
}

export interface SiteOverviewKpis {
  readonly crawlSuccessRate: string;
  readonly indexableUrlRatio: string;
  readonly criticalIssueCount: string;
  readonly workOrderCompletionRate: string;
  readonly resolvedIssueRate: string;
  readonly nonBrandQueryCoverage: string;
  readonly aiMentionRate: string;
  readonly aiCitationRate: string;
}

const fixtureDate = "2026-05-20T00:00:00.000Z";

export const demoCrawlRuns: CrawlRun[] = [
  createCrawlRun("crawl_demo_001", "completed"),
  createCrawlRun("crawl_demo_002", "completed"),
  createCrawlRun("crawl_demo_003", "completed"),
  createCrawlRun("crawl_demo_004", "completed"),
  createCrawlRun("crawl_demo_005", "failed")
];

export const demoUrlRecords: DashboardUrlRecord[] = [
  createUrlRecord("url_demo_home", "https://example-clinic.com/", true),
  createUrlRecord("url_demo_service", "https://example-clinic.com/service/seo", true),
  createUrlRecord("url_demo_about", "https://example-clinic.com/about", true),
  createUrlRecord("url_demo_blog", "https://example-clinic.com/blog/seo-basics", true),
  createUrlRecord("url_demo_team", "https://example-clinic.com/team", true),
  createUrlRecord("url_demo_contact", "https://example-clinic.com/contact", true),
  createUrlRecord("url_demo_draft", "https://example-clinic.com/draft", false),
  createUrlRecord("url_demo_thanks", "https://example-clinic.com/thanks", false)
];

export const demoSeoIssues: DashboardSeoIssue[] = [
  createSeoIssue("issue_title_service", "TITLE_MISSING", "high", "open", "p0"),
  createSeoIssue("issue_h1_service", "H1_MISSING", "high", "open", "p1"),
  createSeoIssue("issue_meta_home", "META_DESC_MISSING", "medium", "in_review", "p2"),
  createSeoIssue("issue_alt_team", "IMAGE_ALT_MISSING", "low", "open", "p3"),
  createSeoIssue("issue_canonical_blog", "CANONICAL_MISSING", "medium", "resolved", "p2")
];

export const demoGeoVisibility: GeoVisibilitySnapshot = {
  nonBrandQueries: 12,
  coveredNonBrandQueries: 0,
  aiAnswersChecked: 10,
  aiMentions: 0,
  aiCitations: 0
};

export const demoSiteOverviewInput: SiteOverviewInput = {
  crawlRuns: demoCrawlRuns,
  urls: demoUrlRecords,
  issues: demoSeoIssues,
  workOrders: demoWorkOrders,
  geo: demoGeoVisibility
};

export function calculateSiteOverviewKpis(input: SiteOverviewInput): SiteOverviewKpis {
  return {
    crawlSuccessRate: formatRatio(
      input.crawlRuns.filter((crawlRun) => crawlRun.status === "completed").length,
      input.crawlRuns.length,
    ),
    indexableUrlRatio: formatRatio(
      input.urls.filter((urlRecord) => urlRecord.indexable).length,
      input.urls.length,
    ),
    criticalIssueCount: String(
      input.issues.filter(
        (issue) => issue.status !== "resolved" && (issue.priority === "p0" || issue.priority === "p1"),
      ).length,
    ),
    workOrderCompletionRate: formatRatio(
      input.workOrders.filter((workOrder) => workOrder.status === "done").length,
      input.workOrders.length,
    ),
    resolvedIssueRate: formatRatio(
      input.issues.filter((issue) => issue.status === "resolved").length,
      input.issues.length,
    ),
    nonBrandQueryCoverage: formatRatio(
      input.geo.coveredNonBrandQueries,
      input.geo.nonBrandQueries,
    ),
    aiMentionRate: formatRatio(input.geo.aiMentions, input.geo.aiAnswersChecked),
    aiCitationRate: formatRatio(input.geo.aiCitations, input.geo.aiAnswersChecked)
  };
}

export function summarizeSiteOverview(input: SiteOverviewInput) {
  const activeWorkOrders = input.workOrders.filter((workOrder) => workOrder.status !== "done");
  const rechecksInReview = input.workOrders.filter((workOrder) => workOrder.status === "in_review");
  const blockedWorkOrders = input.workOrders.filter((workOrder) => workOrder.status === "blocked");

  return {
    activeWorkOrders: activeWorkOrders.length,
    rechecksInReview: rechecksInReview.length,
    blockedWorkOrders: blockedWorkOrders.length,
    totalUrls: input.urls.length,
    openIssues: input.issues.filter((issue) => issue.status !== "resolved").length
  };
}

function createCrawlRun(id: string, status: string): CrawlRun {
  return {
    id,
    siteId: demoSite.id,
    status,
    startedAt: fixtureDate,
    endedAt: status === "completed" || status === "failed" ? fixtureDate : null,
    summary: null
  };
}

function createUrlRecord(id: string, url: string, indexable: boolean): DashboardUrlRecord {
  return {
    id,
    siteId: demoSite.id,
    crawlRunId: "crawl_demo_005",
    url,
    statusCode: 200,
    title: indexable ? "Demo page" : null,
    metaDescription: indexable ? "Demo page description" : null,
    createdAt: fixtureDate,
    indexable
  };
}

function createSeoIssue(
  id: string,
  ruleId: string,
  severity: string,
  status: string,
  priority: WorkOrderPriority,
): DashboardSeoIssue {
  return {
    id,
    crawlRunId: "crawl_demo_005",
    urlRecordId: null,
    ruleId,
    severity,
    status,
    title: ruleId,
    evidence: null,
    createdAt: fixtureDate,
    priority
  };
}

function formatRatio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}
