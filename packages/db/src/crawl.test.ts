import { describe, expect, it } from "vitest";

import {
  buildUrlRecordUpsertArgs,
  markCrawlRunFailed,
  persistCrawlAnalysisResult,
  persistCrawlJobResult,
  type CrawlAnalysisPersistenceClient,
  type CrawlPersistenceClient
} from "./crawl.js";

const duplicateHash = "a".repeat(64);

const snapshot = {
  url: "https://example.com/",
  finalUrl: null,
  title: "Home",
  metaDescription: "Home page",
  robotsMeta: null,
  canonicalUrl: "https://example.com/",
  h1Count: 1,
  h2Count: 0,
  headings: {
    h1: ["Home"],
    h2: []
  },
  links: {
    internal: [],
    external: []
  },
  images: [],
  jsonLd: [],
  indexability: {
    noindex: false,
    nofollow: false,
    canonicalMismatch: false,
    robotsBlocked: null
  },
  content: {
    textLength: 4,
    wordCount: 1,
    duplicateHash
  }
};

describe("crawl persistence helpers", () => {
  it("builds deterministic UrlRecord upsert args", () => {
    expect(
      buildUrlRecordUpsertArgs({
        crawlRunId: "crawl_1",
        siteId: "site_1",
        snapshot,
        statusCode: 200
      }),
    ).toEqual({
      where: {
        siteId_url: {
          siteId: "site_1",
          url: "https://example.com/"
        }
      },
      create: {
        siteId: "site_1",
        crawlRunId: "crawl_1",
        url: "https://example.com/",
        statusCode: 200,
        title: "Home",
        metaDescription: "Home page"
      },
      update: {
        crawlRunId: "crawl_1",
        statusCode: 200,
        title: "Home",
        metaDescription: "Home page"
      }
    });
  });

  it("upserts URL records and completes the crawl run", async () => {
    const urlRecordUpserts: unknown[] = [];
    const crawlRunUpdates: unknown[] = [];
    const client: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          urlRecordUpserts.push(args);
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          crawlRunUpdates.push(args);
          return args;
        }
      }
    };

    const output = await persistCrawlJobResult(
      client,
      {
        crawlRunId: "crawl_1",
        siteId: "site_1",
        status: "completed",
        snapshots: [snapshot],
        summary: {
          pagesRequested: 1,
          pagesProcessed: 1,
          internalLinks: 0,
          externalLinks: 0,
          images: 0,
          jsonLdBlocks: 0,
          noindexPages: 0
        }
      },
      [
        {
          url: "https://example.com/",
          statusCode: 200,
          html: "<html></html>"
        }
      ],
    );

    expect(output).toEqual({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      status: "completed",
      urlRecordsUpserted: 1
    });
    expect(urlRecordUpserts).toHaveLength(1);
    expect(crawlRunUpdates).toHaveLength(1);
    expect(crawlRunUpdates[0]).toMatchObject({
      where: { id: "crawl_1" },
      data: {
        status: "completed",
        summary: {
          pagesProcessed: 1
        }
      }
    });
    expect((crawlRunUpdates[0] as { data: { endedAt: unknown } }).data.endedAt).toBeInstanceOf(
      Date,
    );
  });

  it("matches status codes against final URLs when redirects are present", async () => {
    const redirectedSnapshot = {
      ...snapshot,
      url: "https://example.com/new",
      finalUrl: "https://example.com/new"
    };
    const urlRecordUpserts: unknown[] = [];
    const client: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          urlRecordUpserts.push(args);
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          return args;
        }
      }
    };

    await persistCrawlJobResult(
      client,
      {
        crawlRunId: "crawl_1",
        siteId: "site_1",
        status: "completed",
        snapshots: [redirectedSnapshot],
        summary: {
          pagesRequested: 1,
          pagesProcessed: 1,
          internalLinks: 0,
          externalLinks: 0,
          images: 0,
          jsonLdBlocks: 0,
          noindexPages: 0
        }
      },
      [
        {
          url: "https://example.com/old",
          finalUrl: "https://example.com/new",
          statusCode: 301,
          html: "<html></html>"
        }
      ],
    );

    expect(urlRecordUpserts[0]).toMatchObject({
      create: {
        url: "https://example.com/new",
        statusCode: 301
      }
    });
  });

  it("upserts deterministic crawl analysis artifacts", async () => {
    const siteReads: unknown[] = [];
    const urlReads: unknown[] = [];
    const seoIssueUpserts: unknown[] = [];
    const workOrderUpserts: unknown[] = [];
    const schemaRecommendationUpserts: unknown[] = [];
    const client: CrawlAnalysisPersistenceClient = {
      site: {
        async findUnique(args) {
          siteReads.push(args);
          return {
            id: "site_1",
            organizationId: "org_1"
          };
        }
      },
      urlRecord: {
        async findUnique(args) {
          urlReads.push(args);
          return {
            id: "url_1"
          };
        }
      },
      seoIssue: {
        async upsert(args) {
          seoIssueUpserts.push(args);
          return {
            id: "issue_1"
          };
        }
      },
      workOrder: {
        async upsert(args) {
          workOrderUpserts.push(args);
          return args;
        }
      },
      schemaRecommendation: {
        async upsert(args) {
          schemaRecommendationUpserts.push(args);
          return args;
        }
      }
    };

    const output = await persistCrawlAnalysisResult(client, {
      crawlRunId: "crawl_1",
      siteId: "site_1",
      seoIssueWorkOrders: [
        {
          issue: {
            category: "metadata",
            effortScore: 20,
            evidence: {
              expectedValue: "present",
              observedValue: null,
              sourceField: "title",
              url: "https://example.com/"
            },
            impactScore: 70,
            priority: "p1",
            priorityScore: 76,
            ruleId: "TITLE_MISSING",
            severity: "high",
            title: "Missing title"
          },
          workOrder: {
            acceptanceCriteria: ["Title tag is present."],
            estimatedEffort: "s",
            evidence: {
              expectedValue: "present",
              observedValue: null,
              sourceField: "title",
              url: "https://example.com/"
            },
            impact: "Search snippets need a title.",
            instructions: ["Add a descriptive title tag."],
            ownerType: "developer",
            priority: "p1",
            problem: "The page has no title.",
            relatedIssues: ["TITLE_MISSING"],
            title: "Add title tag",
            verificationMethod: "Re-run crawl."
          }
        }
      ],
      schemaRecommendationSets: [
        {
          generatedBy: "deterministic",
          pageUrl: "https://example.com/",
          recommendations: [
            {
              evidence: {
                expectedType: "WebPage",
                observedTypes: [],
                sourceField: "jsonLd",
                url: "https://example.com/"
              },
              generatedBy: "deterministic",
              instructions: ["Add WebPage JSON-LD."],
              jsonLd: {
                "@context": "https://schema.org",
                "@type": "WebPage",
                name: "Example"
              },
              priority: "p1",
              reason: "WebPage JSON-LD is missing.",
              recommendedFields: ["description"],
              requiredFields: ["name"],
              type: "WebPage",
              url: "https://example.com/"
            }
          ],
          siteId: "site_1"
        }
      ]
    });

    expect(output).toEqual({
      schemaRecommendationsUpserted: 1,
      seoIssuesUpserted: 1,
      workOrdersUpserted: 1
    });
    expect(siteReads).toEqual([{ where: { id: "site_1" } }]);
    expect(urlReads).toEqual([
      {
        where: {
          siteId_url: {
            siteId: "site_1",
            url: "https://example.com/"
          }
        }
      }
    ]);
    expect(seoIssueUpserts[0]).toMatchObject({
      where: {
        crawlRunId_urlRecordId_ruleId: {
          crawlRunId: "crawl_1",
          ruleId: "TITLE_MISSING",
          urlRecordId: "url_1"
        }
      },
      create: {
        crawlRunId: "crawl_1",
        ruleId: "TITLE_MISSING",
        severity: "high",
        title: "Missing title",
        urlRecordId: "url_1"
      }
    });
    expect(workOrderUpserts[0]).toMatchObject({
      where: {
        seoIssueId: "issue_1"
      },
      create: {
        organizationId: "org_1",
        priority: "p1",
        seoIssueId: "issue_1",
        siteId: "site_1",
        title: "Add title tag"
      }
    });
    expect(schemaRecommendationUpserts[0]).toMatchObject({
      where: {
        siteId_pageUrl_type: {
          pageUrl: "https://example.com/",
          siteId: "site_1",
          type: "WebPage"
        }
      },
      create: {
        generatedBy: "deterministic",
        pageUrl: "https://example.com/",
        priority: "p1",
        siteId: "site_1",
        type: "WebPage"
      }
    });
  });

  it("marks crawl runs as failed with an error summary", async () => {
    const crawlRunUpdates: unknown[] = [];
    const client: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          crawlRunUpdates.push(args);
          return args;
        }
      }
    };

    const output = await markCrawlRunFailed(client, {
      crawlRunId: "crawl_1",
      error: new Error("network failed")
    });

    expect(output).toEqual({
      crawlRunId: "crawl_1",
      status: "failed"
    });
    expect(crawlRunUpdates[0]).toMatchObject({
      where: { id: "crawl_1" },
      data: {
        status: "failed",
        summary: {
          error: {
            message: "network failed",
            name: "Error"
          }
        }
      }
    });
  });
});
