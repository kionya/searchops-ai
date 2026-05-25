import { describe, expect, it } from "vitest";

import type { ConnectorSyncPersistenceClient, CrawlPersistenceClient } from "@searchops/db";

import { buildDeadLetterJobPayload } from "./dead-letter.js";
import { createConnectorSyncJobProcessor, createCrawlJobProcessor } from "./runtime.js";

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

  it("processes BullMQ connector sync job data through fixture sync", async () => {
    const runUpdates: unknown[] = [];
    const resultUpserts: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorSyncRun: {
        async create(args) {
          return args;
        },
        async update(args) {
          runUpdates.push(args);
          return args;
        }
      },
      connectorSyncResult: {
        async upsert(args) {
          resultUpserts.push(args);
          return args;
        }
      }
    };
    const processor = createConnectorSyncJobProcessor(persistenceClient, {
      async syncConnectors(input) {
        expect(input).toEqual({
          fetchedAt: "2026-05-22T00:00:00.000Z",
          providers: ["gsc", "ga4"]
        });

        return {
          results: [],
          summary: {
            failedProviders: 0,
            okProviders: 0,
            partialProviders: 0,
            recordCountsByProvider: {
              bing: 0,
              cms: 0,
              ga4: 0,
              gsc: 0,
              pagespeed: 0
            },
            totalProviders: 0,
            totalRecords: 0
          }
        };
      }
    });

    const result = await processor({
      data: {
        connectorSyncRunId: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        providers: ["gsc", "ga4"]
      }
    });
    expect(runUpdates).toHaveLength(1);
    expect(resultUpserts).toHaveLength(0);

    expect(result).toMatchObject({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      summary: {
        totalRecords: 0
      }
    });
  });

  it("builds deterministic dead-letter payloads for failed worker jobs", () => {
    expect(
      buildDeadLetterJobPayload({
        error: new Error("Fetch timed out"),
        failedAt: new Date("2026-05-25T00:00:00.000Z"),
        job: {
          attemptsMade: 3,
          id: "42",
          name: "crawl"
        },
        queueName: "searchops-crawl"
      }),
    ).toEqual({
      originalQueue: "searchops-crawl",
      originalJobName: "crawl",
      originalJobId: "42",
      failedReason: "Fetch timed out",
      attemptsMade: 3,
      failedAt: "2026-05-25T00:00:00.000Z"
    });
  });
});
