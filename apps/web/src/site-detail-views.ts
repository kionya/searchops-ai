import type { CrawlRun, SeoIssue, UrlRecord, WorkOrderPriority } from "@searchops/types";

import { demoSite } from "./work-order-board";

export type CrawlRunTone = "complete" | "failed" | "queued";
export type UrlIndexability = "indexable" | "not_indexable";

export interface CrawlRunRow extends CrawlRun {
  readonly label: string;
  readonly pagesCrawled: number;
  readonly urlsDiscovered: number;
  readonly issuesFound: number;
  readonly durationSeconds: number | null;
  readonly failureReason: string | null;
}

export interface UrlInventoryRow extends UrlRecord {
  readonly path: string;
  readonly indexable: boolean;
  readonly indexability: UrlIndexability;
  readonly indexabilityReason: string;
  readonly issueCount: number;
  readonly primarySignal: string;
}

export interface IssueListRow extends SeoIssue {
  readonly url: string;
  readonly category: string;
  readonly priority: WorkOrderPriority;
  readonly ownerHint: string;
}

export const demoCrawlRunRows: CrawlRunRow[] = [
  createCrawlRunRow({
    id: "crawl_demo_005",
    status: "failed",
    startedAt: "2026-05-20T09:00:00.000Z",
    endedAt: "2026-05-20T09:00:34.000Z",
    label: "Manual recheck",
    pagesCrawled: 1,
    urlsDiscovered: 1,
    issuesFound: 0,
    durationSeconds: 34,
    failureReason: "Start URL returned 503"
  }),
  createCrawlRunRow({
    id: "crawl_demo_004",
    status: "completed",
    startedAt: "2026-05-19T09:00:00.000Z",
    endedAt: "2026-05-19T09:04:12.000Z",
    label: "Scheduled crawl",
    pagesCrawled: 8,
    urlsDiscovered: 8,
    issuesFound: 5,
    durationSeconds: 252,
    failureReason: null
  }),
  createCrawlRunRow({
    id: "crawl_demo_003",
    status: "completed",
    startedAt: "2026-05-18T09:00:00.000Z",
    endedAt: "2026-05-18T09:03:50.000Z",
    label: "Scheduled crawl",
    pagesCrawled: 8,
    urlsDiscovered: 8,
    issuesFound: 6,
    durationSeconds: 230,
    failureReason: null
  }),
  createCrawlRunRow({
    id: "crawl_demo_002",
    status: "completed",
    startedAt: "2026-05-17T09:00:00.000Z",
    endedAt: "2026-05-17T09:03:44.000Z",
    label: "Scheduled crawl",
    pagesCrawled: 7,
    urlsDiscovered: 8,
    issuesFound: 7,
    durationSeconds: 224,
    failureReason: null
  }),
  createCrawlRunRow({
    id: "crawl_demo_001",
    status: "completed",
    startedAt: "2026-05-16T09:00:00.000Z",
    endedAt: "2026-05-16T09:03:31.000Z",
    label: "Initial crawl",
    pagesCrawled: 7,
    urlsDiscovered: 7,
    issuesFound: 8,
    durationSeconds: 211,
    failureReason: null
  })
];

export const demoUrlInventoryRows: UrlInventoryRow[] = [
  createUrlInventoryRow({
    id: "url_demo_home",
    path: "/",
    title: "Example Clinic",
    metaDescription: null,
    indexable: true,
    issueCount: 1,
    primarySignal: "Missing meta description"
  }),
  createUrlInventoryRow({
    id: "url_demo_service",
    path: "/service/seo",
    title: null,
    metaDescription: "SEO service overview",
    indexable: true,
    issueCount: 2,
    primarySignal: "Missing title and H1"
  }),
  createUrlInventoryRow({
    id: "url_demo_about",
    path: "/about",
    title: "About Example Clinic",
    metaDescription: "Clinic team profile",
    indexable: true,
    issueCount: 1,
    primarySignal: "Images missing alt text"
  }),
  createUrlInventoryRow({
    id: "url_demo_blog",
    path: "/blog/seo-basics",
    title: "SEO basics",
    metaDescription: "Introductory SEO article",
    indexable: true,
    issueCount: 1,
    primarySignal: "Canonical fixed"
  }),
  createUrlInventoryRow({
    id: "url_demo_team",
    path: "/team",
    title: "Medical team",
    metaDescription: "Team listing",
    indexable: true,
    issueCount: 0,
    primarySignal: "Clean"
  }),
  createUrlInventoryRow({
    id: "url_demo_contact",
    path: "/contact",
    title: "Contact",
    metaDescription: "Contact information",
    indexable: true,
    issueCount: 0,
    primarySignal: "Clean"
  }),
  createUrlInventoryRow({
    id: "url_demo_draft",
    path: "/draft",
    title: "Draft landing page",
    metaDescription: null,
    indexable: false,
    issueCount: 0,
    primarySignal: "Noindex draft"
  }),
  createUrlInventoryRow({
    id: "url_demo_thanks",
    path: "/thanks",
    title: "Thank you",
    metaDescription: null,
    indexable: false,
    issueCount: 0,
    primarySignal: "Noindex utility page"
  })
];

export const demoIssueListRows: IssueListRow[] = [
  createIssueListRow({
    id: "issue_title_service",
    ruleId: "TITLE_MISSING",
    severity: "high",
    status: "open",
    title: "Missing title tag",
    url: "https://example-clinic.com/service/seo",
    category: "metadata",
    priority: "p0",
    ownerHint: "content"
  }),
  createIssueListRow({
    id: "issue_h1_service",
    ruleId: "H1_MISSING",
    severity: "high",
    status: "open",
    title: "Missing H1",
    url: "https://example-clinic.com/service/seo",
    category: "headings",
    priority: "p1",
    ownerHint: "developer"
  }),
  createIssueListRow({
    id: "issue_meta_home",
    ruleId: "META_DESC_MISSING",
    severity: "medium",
    status: "in_review",
    title: "Missing meta description",
    url: "https://example-clinic.com/",
    category: "metadata",
    priority: "p2",
    ownerHint: "marketer"
  }),
  createIssueListRow({
    id: "issue_alt_team",
    ruleId: "IMAGE_ALT_MISSING",
    severity: "low",
    status: "open",
    title: "Images missing alt text",
    url: "https://example-clinic.com/about",
    category: "images",
    priority: "p3",
    ownerHint: "legal"
  }),
  createIssueListRow({
    id: "issue_canonical_blog",
    ruleId: "CANONICAL_MISSING",
    severity: "medium",
    status: "resolved",
    title: "Canonical URL added",
    url: "https://example-clinic.com/blog/seo-basics",
    category: "canonical",
    priority: "p2",
    ownerHint: "developer"
  })
];

export function summarizeCrawlRuns(crawlRuns: readonly CrawlRunRow[]) {
  return {
    total: crawlRuns.length,
    completed: crawlRuns.filter((crawlRun) => crawlRun.status === "completed").length,
    failed: crawlRuns.filter((crawlRun) => crawlRun.status === "failed").length,
    pagesCrawled: crawlRuns.reduce((total, crawlRun) => total + crawlRun.pagesCrawled, 0),
    latestStatus: crawlRuns[0]?.status ?? "none"
  };
}

export function summarizeUrlInventory(urls: readonly UrlInventoryRow[]) {
  return {
    total: urls.length,
    indexable: urls.filter((url) => url.indexable).length,
    nonIndexable: urls.filter((url) => !url.indexable).length,
    withIssues: urls.filter((url) => url.issueCount > 0).length,
    healthy: urls.filter((url) => url.indexable && url.issueCount === 0).length
  };
}

export function summarizeIssues(issues: readonly IssueListRow[]) {
  return {
    total: issues.length,
    open: issues.filter((issue) => issue.status !== "resolved").length,
    resolved: issues.filter((issue) => issue.status === "resolved").length,
    critical: issues.filter((issue) => issue.priority === "p0" || issue.priority === "p1").length,
    inReview: issues.filter((issue) => issue.status === "in_review").length
  };
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "Pending";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function formatDateTime(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "Pending";
}

export function getCrawlRunTone(status: string): CrawlRunTone {
  if (status === "completed") {
    return "complete";
  }

  if (status === "failed") {
    return "failed";
  }

  return "queued";
}

function createCrawlRunRow(input: Omit<CrawlRunRow, "siteId" | "summary">): CrawlRunRow {
  return {
    ...input,
    siteId: demoSite.id,
    summary: {
      issuesFound: input.issuesFound,
      pagesCrawled: input.pagesCrawled,
      urlsDiscovered: input.urlsDiscovered
    }
  };
}

function createUrlInventoryRow(
  input: Omit<
    UrlInventoryRow,
    | "createdAt"
    | "crawlRunId"
    | "indexability"
    | "indexabilityReason"
    | "siteId"
    | "statusCode"
    | "url"
  >,
): UrlInventoryRow {
  return {
    ...input,
    siteId: demoSite.id,
    crawlRunId: "crawl_demo_004",
    url: `https://example-clinic.com${input.path === "/" ? "" : input.path}`,
    statusCode: 200,
    createdAt: "2026-05-19T09:04:12.000Z",
    indexability: input.indexable ? "indexable" : "not_indexable",
    indexabilityReason: input.indexable ? "Allowed for indexing" : "Excluded by noindex policy"
  };
}

function createIssueListRow(input: Omit<IssueListRow, "createdAt" | "crawlRunId" | "evidence" | "urlRecordId">) {
  return {
    ...input,
    crawlRunId: "crawl_demo_004",
    urlRecordId: null,
    evidence: {
      sourceField: input.ruleId.toLowerCase(),
      url: input.url,
      observedValue: input.status === "resolved" ? "fixed" : "missing",
      expectedValue: "valid signal"
    },
    createdAt: "2026-05-19T09:05:00.000Z"
  };
}
