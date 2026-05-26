import { describe, expect, it } from "vitest";

import { defaultJobOptions, workerJobNames, type WorkerJobPayloadMap } from "./jobs.js";

describe("worker foundation", () => {
  it("declares the core job names", () => {
    expect(workerJobNames).toEqual([
      "crawl",
      "connector-sync",
      "geo-answer-monitor",
      "schema-rich-result-validation",
      "analyze",
      "generate",
      "recheck"
    ]);
  });

  it("uses retry defaults for future BullMQ jobs", () => {
    expect(defaultJobOptions.attempts).toBe(3);
  });

  it("types future job payload contracts", () => {
    const payloads: WorkerJobPayloadMap = {
      crawl: {
        crawlRunId: "crawl_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 25,
        pages: []
      },
      "connector-sync": {
        connectorSyncRunId: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        providers: ["gsc", "ga4"]
      },
      "geo-answer-monitor": {
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
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
      },
      "schema-rich-result-validation": {
        recommendationId: "schema_rec_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
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
      },
      analyze: { crawlRunId: "crawl_1" },
      generate: { workOrderId: "wo_1" },
      recheck: { workOrderId: "wo_1", siteId: "site_1" }
    };

    expect(payloads.crawl.siteId).toBe("site_1");
    expect(payloads["connector-sync"].providers).toEqual(["gsc", "ga4"]);
    expect(payloads["geo-answer-monitor"].providers).toEqual(["chatgpt"]);
    expect(payloads["schema-rich-result-validation"].type).toBe("Service");
  });
});
