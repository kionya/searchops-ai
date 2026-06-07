import {
  SeoIssueListResponseSchema,
  UrlRecordListResponseSchema,
  type CrawlRun,
  type SeoIssue,
  type Site,
  type UrlRecord,
  type WorkOrderPriority
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import { getFixtureSite, getFixtureSiteId, scopeDemoFixtureToSite } from "./site-fixture-scope";
import { demoSite } from "./work-order-board";

export type CrawlRunTone = "complete" | "failed" | "queued";
export type SiteDetailDataSource = "api" | "fixture";
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

export interface UrlInventoryDashboardData {
  readonly errorMessage: string | null;
  readonly rows: readonly UrlInventoryRow[];
  readonly source: SiteDetailDataSource;
}

export interface IssueDashboardData {
  readonly errorMessage: string | null;
  readonly rows: readonly IssueListRow[];
  readonly source: SiteDetailDataSource;
}

export const demoCrawlRunRows: CrawlRunRow[] = [
  createCrawlRunRow({
    id: "crawl_demo_005",
    status: "failed",
    startedAt: "2026-05-20T09:00:00.000Z",
    endedAt: "2026-05-20T09:00:34.000Z",
    label: "수동 재검수",
    pagesCrawled: 1,
    urlsDiscovered: 1,
    issuesFound: 0,
    durationSeconds: 34,
    failureReason: "시작 URL이 503을 반환했습니다"
  }),
  createCrawlRunRow({
    id: "crawl_demo_004",
    status: "completed",
    startedAt: "2026-05-19T09:00:00.000Z",
    endedAt: "2026-05-19T09:04:12.000Z",
    label: "예약 크롤링",
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
    label: "예약 크롤링",
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
    label: "예약 크롤링",
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
    label: "초기 크롤링",
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
    title: "예시 클리닉",
    metaDescription: null,
    indexable: true,
    issueCount: 1,
    primarySignal: "meta description 누락"
  }),
  createUrlInventoryRow({
    id: "url_demo_service",
    path: "/service/seo",
    title: null,
    metaDescription: "SEO 서비스 개요",
    indexable: true,
    issueCount: 2,
    primarySignal: "title 및 H1 누락"
  }),
  createUrlInventoryRow({
    id: "url_demo_about",
    path: "/about",
    title: "예시 클리닉 소개",
    metaDescription: "클리닉 팀 소개",
    indexable: true,
    issueCount: 1,
    primarySignal: "이미지 alt 텍스트 누락"
  }),
  createUrlInventoryRow({
    id: "url_demo_blog",
    path: "/blog/seo-basics",
    title: "SEO 기본 가이드",
    metaDescription: "SEO 입문 글",
    indexable: true,
    issueCount: 1,
    primarySignal: "캐노니컬 수정됨"
  }),
  createUrlInventoryRow({
    id: "url_demo_team",
    path: "/team",
    title: "의료진",
    metaDescription: "팀 목록",
    indexable: true,
    issueCount: 0,
    primarySignal: "정상"
  }),
  createUrlInventoryRow({
    id: "url_demo_contact",
    path: "/contact",
    title: "문의",
    metaDescription: "문의 정보",
    indexable: true,
    issueCount: 0,
    primarySignal: "정상"
  }),
  createUrlInventoryRow({
    id: "url_demo_draft",
    path: "/draft",
    title: "초안 랜딩 페이지",
    metaDescription: null,
    indexable: false,
    issueCount: 0,
    primarySignal: "noindex 초안"
  }),
  createUrlInventoryRow({
    id: "url_demo_thanks",
    path: "/thanks",
    title: "감사 페이지",
    metaDescription: null,
    indexable: false,
    issueCount: 0,
    primarySignal: "noindex 유틸리티 페이지"
  })
];

export const demoIssueListRows: IssueListRow[] = [
  createIssueListRow({
    id: "issue_title_service",
    ruleId: "TITLE_MISSING",
    severity: "high",
    status: "open",
    title: "title 태그 누락",
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
    title: "H1 누락",
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
    title: "meta description 누락",
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
    title: "이미지 alt 텍스트 누락",
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
    title: "canonical URL 추가됨",
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

export function createSiteCrawlRunRows(site: Site): CrawlRunRow[] {
  return scopeDemoFixtureToSite(demoCrawlRunRows, site);
}

export function createSiteUrlInventoryRows(site: Site): UrlInventoryRow[] {
  return scopeDemoFixtureToSite(demoUrlInventoryRows, site);
}

export function createSiteIssueListRows(site: Site): IssueListRow[] {
  return scopeDemoFixtureToSite(demoIssueListRows, site);
}

export async function loadSiteUrlInventoryDashboard(
  siteOrId: Site | string,
): Promise<UrlInventoryDashboardData> {
  const site = getFixtureSite(siteOrId);
  const siteId = getFixtureSiteId(siteOrId);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createFixtureUrlInventoryDashboard(site);
  }

  try {
    const [urlsResponse, issuesResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/urls`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/seo-issues`, { cache: "no-store" })
    ]);
    if (!urlsResponse.ok) {
      throw new Error(`URL inventory request failed with ${urlsResponse.status}`);
    }
    if (!issuesResponse.ok) {
      throw new Error(`SEO issue request failed with ${issuesResponse.status}`);
    }

    const urls = UrlRecordListResponseSchema.parse(await urlsResponse.json()).urls;
    const issues = SeoIssueListResponseSchema.parse(await issuesResponse.json()).issues;
    return {
      errorMessage: null,
      rows: createUrlInventoryRowsFromApi(urls, issues),
      source: "api"
    };
  } catch (error) {
    return {
      ...createFixtureUrlInventoryDashboard(site),
      errorMessage: error instanceof Error ? error.message : "URL inventory request failed"
    };
  }
}

export async function loadSiteIssueDashboard(siteOrId: Site | string): Promise<IssueDashboardData> {
  const site = getFixtureSite(siteOrId);
  const siteId = getFixtureSiteId(siteOrId);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createFixtureIssueDashboard(site);
  }

  try {
    const response = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/seo-issues`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`SEO issue request failed with ${response.status}`);
    }

    const issues = SeoIssueListResponseSchema.parse(await response.json()).issues;
    return {
      errorMessage: null,
      rows: createIssueListRowsFromApi(issues),
      source: "api"
    };
  } catch (error) {
    return {
      ...createFixtureIssueDashboard(site),
      errorMessage: error instanceof Error ? error.message : "SEO issue request failed"
    };
  }
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
    return "대기 중";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function formatDateTime(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "대기 중";
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
    indexabilityReason: input.indexable ? "색인 허용" : "noindex 정책으로 제외"
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

function createFixtureUrlInventoryDashboard(site: Site): UrlInventoryDashboardData {
  return {
    errorMessage: null,
    rows: createSiteUrlInventoryRows(site),
    source: "fixture"
  };
}

function createFixtureIssueDashboard(site: Site): IssueDashboardData {
  return {
    errorMessage: null,
    rows: createSiteIssueListRows(site),
    source: "fixture"
  };
}

function createUrlInventoryRowsFromApi(
  urls: readonly UrlRecord[],
  issues: readonly SeoIssue[],
): UrlInventoryRow[] {
  return urls.map((urlRecord) => {
    const relatedIssues = issues.filter((issue) => getIssueUrl(issue) === urlRecord.url);
    const indexable = urlRecord.statusCode === null || urlRecord.statusCode < 400;

    return {
      ...urlRecord,
      indexable,
      indexability: indexable ? "indexable" : "not_indexable",
      indexabilityReason: indexable ? "색인 허용" : "HTTP 오류로 확인 필요",
      issueCount: relatedIssues.length,
      path: formatUrlPath(urlRecord.url),
      primarySignal: relatedIssues[0]?.title ?? "정상"
    };
  });
}

function createIssueListRowsFromApi(issues: readonly SeoIssue[]): IssueListRow[] {
  return issues.map((issue) => ({
    ...issue,
    category: getIssueCategory(issue.ruleId),
    ownerHint: getIssueOwnerHint(issue.ruleId),
    priority: getIssuePriority(issue.severity),
    url: getIssueUrl(issue)
  }));
}

function getIssueUrl(issue: SeoIssue) {
  const url = issue.evidence?.url;
  return typeof url === "string" ? url : "unknown";
}

function getIssuePriority(severity: string): WorkOrderPriority {
  if (severity === "critical") {
    return "p0";
  }

  if (severity === "high") {
    return "p1";
  }

  if (severity === "medium") {
    return "p2";
  }

  return "p3";
}

function getIssueCategory(ruleId: string) {
  if (ruleId.includes("TITLE") || ruleId.includes("META")) {
    return "metadata";
  }

  if (ruleId.includes("H1")) {
    return "headings";
  }

  if (ruleId.includes("CANONICAL")) {
    return "canonical";
  }

  if (ruleId.includes("IMAGE")) {
    return "images";
  }

  if (ruleId.includes("SCHEMA")) {
    return "schema";
  }

  return "content";
}

function getIssueOwnerHint(ruleId: string) {
  if (ruleId.includes("META")) {
    return "marketer";
  }

  if (ruleId.includes("TITLE") || ruleId.includes("H1") || ruleId.includes("CANONICAL")) {
    return "developer";
  }

  if (ruleId.includes("SCHEMA")) {
    return "developer";
  }

  return "content";
}

function formatUrlPath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return url;
  }
}
