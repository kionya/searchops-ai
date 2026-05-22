import { describe, expect, it } from "vitest";

import { defaultJobOptions, workerJobNames, type WorkerJobPayloadMap } from "./jobs.js";

describe("worker foundation", () => {
  it("declares the core job names", () => {
    expect(workerJobNames).toEqual(["crawl", "connector-sync", "analyze", "generate", "recheck"]);
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
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        providers: ["gsc", "ga4"]
      },
      analyze: { crawlRunId: "crawl_1" },
      generate: { workOrderId: "wo_1" },
      recheck: { workOrderId: "wo_1", siteId: "site_1" }
    };

    expect(payloads.crawl.siteId).toBe("site_1");
    expect(payloads["connector-sync"].providers).toEqual(["gsc", "ga4"]);
  });
});
