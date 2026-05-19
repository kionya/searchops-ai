import { describe, expect, it } from "vitest";

import type { CrawlPersistenceClient } from "@searchops/db";

import { createCrawlJobProcessor } from "./runtime.js";

const html = `
<!doctype html>
<html>
  <head><title>Runtime Fixture</title></head>
  <body><h1>Runtime Fixture</h1></body>
</html>
`;

describe("worker runtime", () => {
  it("processes BullMQ crawl job data through persistence", async () => {
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
    const processor = createCrawlJobProcessor(persistenceClient, {
      async crawlSite() {
        return [
          {
            url: "https://example.com/",
            statusCode: 200,
            html
          }
        ];
      }
    });

    const result = await processor({
      data: {
        crawlRunId: "crawl_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 1,
        pages: []
      }
    });

    expect(result).toMatchObject({
      crawlRunId: "crawl_1",
      status: "completed",
      summary: {
        pagesProcessed: 1
      }
    });
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });
});
