import { describe, expect, it } from "vitest";

import { defaultJobOptions, workerJobNames, type WorkerJobPayloadMap } from "./jobs.js";

describe("worker foundation", () => {
  it("declares the core job names", () => {
    expect(workerJobNames).toEqual(["crawl", "analyze", "generate", "recheck"]);
  });

  it("uses retry defaults for future BullMQ jobs", () => {
    expect(defaultJobOptions.attempts).toBe(3);
  });

  it("types future job payload contracts", () => {
    const payloads: WorkerJobPayloadMap = {
      crawl: { siteId: "site_1", requestedByUserId: "user_1" },
      analyze: { crawlRunId: "crawl_1" },
      generate: { workOrderId: "wo_1" },
      recheck: { workOrderId: "wo_1", siteId: "site_1" }
    };

    expect(payloads.crawl.siteId).toBe("site_1");
  });
});