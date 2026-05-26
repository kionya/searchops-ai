import { describe, expect, it } from "vitest";

import {
  createBullMqConnectorSyncQueueFromQueue,
  createBullMqCrawlRunQueueFromQueue,
  createBullMqGeoAnswerMonitorQueueFromQueue,
  createBullMqSchemaRichResultValidationQueueFromQueue,
  type BullMqConnectorQueuePort,
  type BullMqGeoAnswerMonitorQueuePort,
  type BullMqQueuePort,
  type BullMqSchemaRichResultValidationQueuePort
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
        backoff: {
          delay: 1000,
          type: "exponential"
        },
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
        backoff: {
          delay: 1000,
          type: "exponential"
        },
        removeOnComplete: 100,
        removeOnFail: 1000
      }
    });
  });

  it("adds GEO answer monitor jobs with validated payloads and retry defaults", async () => {
    const addedJobs: unknown[] = [];
    const queue: BullMqGeoAnswerMonitorQueuePort = {
      async add(name, data, options) {
        addedJobs.push({ name, data, options });
        return { id: 44 };
      },
      async close() {
        return undefined;
      }
    };
    const geoQueue = createBullMqGeoAnswerMonitorQueueFromQueue(queue);

    const job = await geoQueue.enqueueGeoAnswerMonitor({
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_geo",
      observedAt: "2026-05-26T00:00:00.000Z",
      providers: ["chatgpt"],
      target: {
        siteId: "site_1",
        brandName: "Example Clinic",
        domain: "example.com",
        locale: "ko-KR",
        market: "KR"
      },
      queries: [{ query: "best seo clinic", locale: "ko-KR" }]
    });

    expect(job).toMatchObject({
      id: "44",
      name: "geo-answer-monitor",
      payload: {
        siteId: "site_1",
        providers: ["chatgpt"]
      }
    });
    expect(addedJobs[0]).toMatchObject({
      name: "geo-answer-monitor",
      options: {
        attempts: 3,
        backoff: {
          delay: 1000,
          type: "exponential"
        }
      }
    });
  });

  it("adds schema rich-result validation jobs with validated payloads and retry defaults", async () => {
    const addedJobs: unknown[] = [];
    const queue: BullMqSchemaRichResultValidationQueuePort = {
      async add(name, data, options) {
        addedJobs.push({ name, data, options });
        return { id: 45 };
      },
      async close() {
        return undefined;
      }
    };
    const validationQueue = createBullMqSchemaRichResultValidationQueueFromQueue(queue);

    const job = await validationQueue.enqueueSchemaRichResultValidation({
      recommendationId: "schema_rec_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_schema",
      requestedAt: "2026-05-26T00:00:00.000Z",
      url: "https://example.com/services/seo",
      type: "Service",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "SEO service",
        provider: {
          "@type": "Organization",
          name: "Example"
        },
        url: "https://example.com/services/seo"
      },
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      recommendedFields: ["description"]
    });

    expect(job).toMatchObject({
      id: "45",
      name: "schema-rich-result-validation",
      payload: {
        recommendationId: "schema_rec_1",
        type: "Service"
      }
    });
    expect(addedJobs[0]).toMatchObject({
      name: "schema-rich-result-validation",
      options: {
        attempts: 3,
        backoff: {
          delay: 1000,
          type: "exponential"
        }
      }
    });
  });
});
