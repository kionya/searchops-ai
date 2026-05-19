import { describe, expect, it } from "vitest";

import { processCrawlJob } from "./processor.js";

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
});
