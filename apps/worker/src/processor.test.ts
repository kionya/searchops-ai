import { describe, expect, it } from "vitest";

import type { CrawlPersistenceClient } from "@searchops/db";

import { processAndPersistCrawlJob, processCrawlJob } from "./processor.js";

const normalHtml = `
<!doctype html>
<html>
  <head>
    <title>Crawl Fixture</title>
    <meta name="description" content="Fixture page for crawl worker." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://example.com/" />
  </head>
  <body>
    <h1>Crawl Fixture</h1>
    <a href="/about">About</a>
    <a href="https://external.example/reference">Reference</a>
    <img src="/hero.png" alt="Hero image" />
  </body>
</html>
`;

const noindexHtml = `
<!doctype html>
<html>
  <head>
    <title>Noindex Fixture</title>
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <h1>Noindex Fixture</h1>
  </body>
</html>
`;

describe("processCrawlJob", () => {
  it("returns an empty deterministic result when no page HTML is supplied", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 25,
      pages: []
    });

    expect(result).toEqual({
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
    });
  });

  it("processes supplied HTML pages through crawler-core", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_2",
      siteId: "site_1",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 25,
      pages: [
        {
          url: "https://example.com/",
          statusCode: null,
          html: normalHtml
        }
      ]
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toMatchObject({
      pagesRequested: 1,
      pagesProcessed: 1,
      internalLinks: 1,
      externalLinks: 1,
      images: 1,
      noindexPages: 0
    });
    expect(result.snapshots[0]?.title).toBe("Crawl Fixture");
  });

  it("respects maxPages when processing queued page inputs", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_3",
      siteId: "site_1",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 1,
      pages: [
        {
          url: "https://example.com/",
          statusCode: null,
          html: normalHtml
        },
        {
          url: "https://example.com/noindex",
          statusCode: null,
          html: noindexHtml
        }
      ]
    });

    expect(result.summary.pagesRequested).toBe(2);
    expect(result.summary.pagesProcessed).toBe(1);
    expect(result.summary.noindexPages).toBe(0);
  });

  it("persists processed crawl results through the DB boundary", async () => {
    const upserts: unknown[] = [];
    const updates: unknown[] = [];
    const persistenceClient: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          upserts.push(args);
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          updates.push(args);
          return args;
        }
      }
    };

    const result = await processAndPersistCrawlJob(
      {
        crawlRunId: "crawl_4",
        siteId: "site_1",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 25,
        pages: [
          {
            url: "https://example.com/",
            statusCode: 200,
            html: normalHtml
          }
        ]
      },
      persistenceClient,
    );

    expect(result.status).toBe("completed");
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      create: {
        crawlRunId: "crawl_4",
        siteId: "site_1",
        url: "https://example.com/",
        statusCode: 200,
        title: "Crawl Fixture"
      }
    });
    expect(updates[0]).toMatchObject({
      where: { id: "crawl_4" },
      data: {
        status: "completed",
        summary: {
          pagesProcessed: 1
        }
      }
    });
  });

  it("fetches pages through the crawler when a runtime crawl job has no page fixtures", async () => {
    const upserts: unknown[] = [];
    const updates: unknown[] = [];
    const persistenceClient: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          upserts.push(args);
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          updates.push(args);
          return args;
        }
      }
    };

    const result = await processAndPersistCrawlJob(
      {
        crawlRunId: "crawl_live",
        siteId: "site_1",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 2,
        pages: []
      },
      persistenceClient,
      {
        async crawlSite(input) {
          expect(input).toMatchObject({
            maxPages: 2,
            startUrl: "https://example.com/"
          });
          return [
            {
              url: "https://example.com/",
              statusCode: 200,
              html: normalHtml
            }
          ];
        }
      },
    );

    expect(result.status).toBe("completed");
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });
});
