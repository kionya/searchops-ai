import { describe, expect, it } from "vitest";

import { buildUrlRecordUpsertArgs, persistCrawlJobResult, type CrawlPersistenceClient } from "./crawl.js";

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
});
