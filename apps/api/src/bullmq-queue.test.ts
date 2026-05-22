import { describe, expect, it } from "vitest";

import {
  createBullMqConnectorSyncQueueFromQueue,
  createBullMqCrawlRunQueueFromQueue,
  type BullMqConnectorQueuePort,
  type BullMqQueuePort
} from "./bullmq-queue.js";

describe("BullMQ queue adapters", () => {
  it("adds crawl jobs with validated payloads and retry defaults", async () => {
    const addedJobs: unknown[] = [];
    const queue: BullMqQueuePort = {
      async add(name, data, options) {
        addedJobs.push({ name, data, options });
        return { id: 42 };
      },
      async close() {
        return undefined;
      }
    };
    const crawlQueue = createBullMqCrawlRunQueueFromQueue(queue);

    const job = await crawlQueue.enqueueCrawl({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 3,
      pages: []
    });

    expect(job).toMatchObject({
      id: "42",
      name: "crawl",
      payload: {
        crawlRunId: "crawl_1",
        maxPages: 3
      }
    });
    expect(addedJobs[0]).toMatchObject({
      name: "crawl",
      options: {
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: 1000
      }
    });
  });

  it("adds connector sync jobs with validated payloads and retry defaults", async () => {
    const addedJobs: unknown[] = [];
    const queue: BullMqConnectorQueuePort = {
      async add(name, data, options) {
        addedJobs.push({ name, data, options });
        return { id: 43 };
      },
      async close() {
        return undefined;
      }
    };
    const connectorQueue = createBullMqConnectorSyncQueueFromQueue(queue);

    const job = await connectorQueue.enqueueConnectorSync({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      providers: ["gsc", "pagespeed"]
    });

    expect(job).toMatchObject({
      id: "43",
      name: "connector-sync",
      payload: {
        connectorSyncRunId: "sync_1",
        siteId: "site_1",
        providers: ["gsc", "pagespeed"]
      }
    });
    expect(addedJobs[0]).toMatchObject({
      name: "connector-sync",
      options: {
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: 1000
      }
    });
  });
});
