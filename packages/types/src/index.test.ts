import { describe, expect, it } from "vitest";

import {
  CreateCrawlRunRequestSchema,
  CreateSiteRequestSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  CrawlerPageSnapshotSchema,
  HealthResponseSchema,
  LinkSignalSchema,
  MockUserContextSchema,
  NormalizedUrlSchema,
  OrganizationSchema,
  ParsedSitemapSchema,
  RobotsTxtSchema,
  SearchOpsEnvSchema,
  SeoIssueDraftSchema,
  WorkOrderDraftSchema,
  WorkOrderOwnerTypeSchema,
  WorkOrderSchema,
  parseSearchOpsEnv,
  productName
} from "./index.js";

describe("types foundation", () => {
  it("exports the product name", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("validates health responses", () => {
    expect(HealthResponseSchema.parse({ ok: true, service: "api" })).toEqual({
      ok: true,
      service: "api"
    });
  });

  it("validates Phase 1 organization DTOs", () => {
    expect(
      OrganizationSchema.parse({
        id: "org_1",
        name: "Demo Clinic",
        createdAt: "2026-05-19T00:00:00.000Z"
      }),
    ).toMatchObject({ name: "Demo Clinic" });
  });

  it("normalizes site domains", () => {
    expect(CreateSiteRequestSchema.parse({ domain: "Example.COM" }).domain).toBe("example.com");
  });

  it("validates mock user context", () => {
    expect(
      MockUserContextSchema.parse({ userId: "usr_1", organizationId: "org_1", source: "mock" }),
    ).toEqual({ userId: "usr_1", organizationId: "org_1", source: "mock" });
  });

  it("fails env validation with clear field names", () => {
    expect(() => parseSearchOpsEnv({ REDIS_URL: "redis://localhost:6379" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("parses valid env", () => {
    expect(
      SearchOpsEnvSchema.parse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/searchops",
        REDIS_URL: "redis://localhost:6379"
      }),
    ).toMatchObject({ NODE_ENV: "development" });
  });

  it("validates normalized crawler URLs", () => {
    expect(NormalizedUrlSchema.parse("https://example.com/path?a=1")).toBe(
      "https://example.com/path?a=1",
    );
    expect(() => NormalizedUrlSchema.parse("mailto:hello@example.com")).toThrow();
  });

  it("validates crawler link signals", () => {
    expect(
      LinkSignalSchema.parse({
        href: "/about",
        url: "https://example.com/about",
        text: "About",
        rel: null,
        target: null,
        classification: "internal"
      }),
    ).toMatchObject({ classification: "internal" });
  });

  it("validates crawler page snapshots", () => {
    const parsed = CrawlerPageSnapshotSchema.parse({
      url: "https://example.com/services",
      finalUrl: null,
      title: "Services",
      metaDescription: "Service page",
      robotsMeta: "index,follow",
      canonicalUrl: "https://example.com/services",
      h1Count: 1,
      h2Count: 0,
      headings: { h1: ["Services"], h2: [] },
      links: { internal: [], external: [] },
      images: [],
      jsonLd: [],
      indexability: {
        noindex: false,
        nofollow: false,
        canonicalMismatch: false,
        robotsBlocked: null
      },
      content: {
        textLength: 13,
        wordCount: 2,
        duplicateHash: "a".repeat(64)
      }
    });

    expect(parsed.h1Count).toBe(1);
  });

  it("defaults crawl run request options", () => {
    expect(CreateCrawlRunRequestSchema.parse({})).toEqual({ maxPages: 25 });
  });

  it("validates queued crawl job payloads", () => {
    const parsed = CrawlJobPayloadSchema.parse({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 10
    });

    expect(parsed.pages).toEqual([]);
  });

  it("validates crawl job results", () => {
    expect(
      CrawlJobResultSchema.parse({
        crawlRunId: "crawl_1",
        siteId: "site_1",
        status: "empty",
        snapshots: [],
        summary: {
          pagesRequested: 0,
          pagesProcessed: 0,
          internalLinks: 0,
          externalLinks: 0,
          images: 0,
          jsonLdBlocks: 0,
          noindexPages: 0
        }
      }),
    ).toMatchObject({ status: "empty" });
  });

  it("validates robots parser output", () => {
    expect(
      RobotsTxtSchema.parse({
        rules: [
          {
            userAgents: ["*"],
            allow: ["/public"],
            disallow: ["/private"],
            crawlDelay: 2
          }
        ],
        sitemaps: ["https://example.com/sitemap.xml"]
      }),
    ).toMatchObject({ sitemaps: ["https://example.com/sitemap.xml"] });
  });

  it("validates sitemap parser output", () => {
    expect(
      ParsedSitemapSchema.parse({
        type: "urlset",
        urls: [
          {
            loc: "https://example.com/",
            lastmod: "2026-05-19",
            changefreq: "daily",
            priority: 0.8
          }
        ],
        sitemaps: []
      }),
    ).toMatchObject({ type: "urlset" });
  });

  it("validates deterministic SEO issue drafts", () => {
    expect(
      SeoIssueDraftSchema.parse({
        ruleId: "TITLE_MISSING",
        severity: "high",
        category: "metadata",
        priority: "p1",
        title: "Missing title",
        evidence: {
          url: "https://example.com/",
          observedValue: null,
          expectedValue: "Non-empty title",
          sourceField: "title"
        },
        impactScore: 80,
        effortScore: 20,
        priorityScore: 86
      }),
    ).toMatchObject({
      ruleId: "TITLE_MISSING",
      severity: "high",
      priority: "p1"
    });
  });

  it("validates work order owner types", () => {
    expect(WorkOrderOwnerTypeSchema.parse("developer")).toBe("developer");
    expect(() => WorkOrderOwnerTypeSchema.parse("designer")).toThrow();
  });

  it("validates deterministic work order drafts", () => {
    expect(
      WorkOrderDraftSchema.parse({
        title: "/services missing H1 fix",
        problem: "The page has no H1 heading.",
        evidence: {
          url: "https://example.com/services",
          observedValue: 0,
          expectedValue: 1,
          sourceField: "h1Count"
        },
        impact: "Search and answer engines may not identify the primary page topic.",
        instructions: ["Add one descriptive H1 near the top of the page."],
        ownerType: "content",
        priority: "p1",
        acceptanceCriteria: ["Re-crawl reports h1Count = 1."],
        verificationMethod: "Run a crawler recheck for the URL.",
        estimatedEffort: "s",
        relatedIssues: ["MULTIPLE_H1"]
      }),
    ).toMatchObject({
      ownerType: "content",
      priority: "p1",
      estimatedEffort: "s"
    });
  });

  it("validates persisted work orders", () => {
    expect(
      WorkOrderSchema.parse({
        id: "wo_1",
        organizationId: "org_1",
        siteId: "site_1",
        seoIssueId: "issue_1",
        status: "open",
        priority: "p1",
        title: "/services missing H1 fix",
        description: null,
        problem: "The page has no H1 heading.",
        evidence: {
          url: "https://example.com/services",
          observedValue: 0,
          expectedValue: 1,
          sourceField: "h1Count"
        },
        impact: "Search and answer engines may not identify the primary page topic.",
        instructions: ["Add one descriptive H1 near the top of the page."],
        ownerType: "content",
        acceptanceCriteria: ["Re-crawl reports h1Count = 1."],
        verificationMethod: "Run a crawler recheck for the URL.",
        estimatedEffort: "s",
        relatedIssues: ["MULTIPLE_H1"],
        assignedTo: null,
        dueDate: null,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z"
      }),
    ).toMatchObject({ status: "open", priority: "p1" });
  });
});
