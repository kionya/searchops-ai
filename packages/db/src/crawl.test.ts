import { describe, expect, it } from "vitest";

import type { JsonLdRecommendation } from "@searchops/types";

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
        },
        async updateMany(args) {
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
      // 이슈 정체성은 크롤 실행이 아니라 (페이지, 규칙)이다.
      where: {
        urlRecordId_ruleId: {
          ruleId: "TITLE_MISSING",
          urlRecordId: "url_1"
        }
      },
      update: {
        // 마지막 관측 런 갱신이 빠지면 크롤런 단위 조회에서 이슈가 사라진다.
        crawlRunId: "crawl_1",
        status: "open"
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

  // 2026-11-15 고운몸: 추천은 upsert 로만 쌓여 JSON-LD 를 고친 페이지의 추천이 영영 열려 있었다.
  // 이번 크롤이 읽은 페이지에서 더 이상 나오지 않는 열린 추천은 해결로 닫는다.
  it("resolves open schema recommendations no longer generated for a crawled page", async () => {
    const updates: unknown[] = [];
    const client: CrawlAnalysisPersistenceClient = {
      schemaRecommendation: {
        async updateMany(args) {
          updates.push(args);
          return { count: 1 };
        },
        async upsert(args) {
          return args;
        }
      },
      seoIssue: { async upsert() { return { id: "issue_1" }; } },
      site: { async findUnique() { return { id: "site_1", organizationId: "org_1" }; } },
      urlRecord: { async findUnique() { return { id: "url_1" }; } },
      workOrder: { async upsert(args) { return args; } }
    };

    await persistCrawlAnalysisResult(client, {
      crawlRunId: "crawl_1",
      schemaRecommendationSets: [
        { generatedBy: "deterministic", pageUrl: "https://example.com/fixed", recommendations: [], siteId: "site_1" }
      ],
      schemaReconcilePageUrls: ["https://example.com/fixed", "https://example.com/a"],
      seoIssueWorkOrders: [],
      siteId: "site_1"
    });

    expect(updates).toEqual([
      {
        data: { status: "resolved" },
        where: { pageUrl: "https://example.com/fixed", siteId: "site_1", status: "open", type: { notIn: [] } }
      }
    ]);
  });

  // 해결로 닫힌 추천의 문제가 다시 보이면 다시 연다 — 사람이 정한 converted·dismissed 는 두고.
  it("reopens resolved schema recommendations that are generated again", async () => {
    const updates: unknown[] = [];
    const client: CrawlAnalysisPersistenceClient = {
      schemaRecommendation: {
        async updateMany(args) {
          updates.push(args);
          return { count: 0 };
        },
        async upsert(args) {
          return args;
        }
      },
      seoIssue: { async upsert() { return { id: "issue_1" }; } },
      site: { async findUnique() { return { id: "site_1", organizationId: "org_1" }; } },
      urlRecord: { async findUnique() { return { id: "url_1" }; } },
      workOrder: { async upsert(args) { return args; } }
    };
    const recommendation: JsonLdRecommendation = {
      evidence: { expectedType: "WebPage", observedTypes: [], sourceField: "jsonLd", url: "https://example.com/a" },
      generatedBy: "deterministic",
      instructions: ["Add WebPage JSON-LD."],
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "A" },
      priority: "p2",
      reason: "missing",
      recommendedFields: [],
      requiredFields: ["name"],
      type: "WebPage",
      url: "https://example.com/a"
    };

    await persistCrawlAnalysisResult(client, {
      crawlRunId: "crawl_1",
      schemaRecommendationSets: [
        { generatedBy: "deterministic", pageUrl: "https://example.com/a", recommendations: [recommendation], siteId: "site_1" }
      ],
      schemaReconcilePageUrls: ["https://example.com/fixed", "https://example.com/a"],
      seoIssueWorkOrders: [],
      siteId: "site_1"
    });

    expect(updates).toContainEqual({
      data: { status: "open" },
      where: { pageUrl: "https://example.com/a", siteId: "site_1", status: "resolved", type: { in: ["WebPage"] } }
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
