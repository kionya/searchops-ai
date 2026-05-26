import { describe, expect, it } from "vitest";

import type { DeadLetterJobRecord } from "@searchops/types";

import {
  createBullMqDeadLetterJobStoreFromQueues,
  createMemoryDeadLetterJobStore,
  decodeDeadLetterJobId,
  encodeDeadLetterJobId,
  getDefaultDeadLetterQueueNames,
  summarizeDeadLetterJobs,
  type BullMqDeadLetterQueuePort,
} from "./dead-letter-store.js";

const deadLetterJob: DeadLetterJobRecord = {
  id: "searchops-crawl:dead-letter|42",
  queueName: "searchops-crawl:dead-letter",
  jobId: "42",
  status: "waiting",
  enqueuedAt: "2026-05-25T00:00:01.000Z",
  processedAt: null,
  payload: {
    originalQueue: "searchops-crawl",
    originalJobName: "crawl",
    originalJobId: "job_42",
    failedReason: "Fetch timed out",
    attemptsMade: 3,
    failedAt: "2026-05-25T00:00:00.000Z",
  },
};

describe("dead-letter job store", () => {
  it("encodes and decodes queue-scoped dead-letter job ids", () => {
    const id = encodeDeadLetterJobId("searchops-crawl:dead-letter", "42");

    expect(id).toBe("searchops-crawl:dead-letter|42");
    expect(decodeDeadLetterJobId(id)).toEqual({
      jobId: "42",
      queueName: "searchops-crawl:dead-letter",
    });
    expect(decodeDeadLetterJobId("invalid")).toBeNull();
  });

  it("lists and removes memory dead-letter records deterministically", async () => {
    const store = createMemoryDeadLetterJobStore([deadLetterJob]);

    await expect(store.listDeadLetterJobs()).resolves.toEqual([deadLetterJob]);
    await expect(store.removeDeadLetterJob(deadLetterJob.id)).resolves.toBe(true);
    await expect(store.listDeadLetterJobs()).resolves.toEqual([]);
  });

  it("summarizes dead-letter records by original queue and status", () => {
    expect(summarizeDeadLetterJobs([deadLetterJob])).toEqual({
      total: 1,
      byQueue: {
        "searchops-crawl": 1,
      },
      byStatus: {
        waiting: 1,
      },
    });
  });

  it("creates default dead-letter queue names for all runtime queues", () => {
    expect(getDefaultDeadLetterQueueNames()).toEqual([
      "searchops-crawl:dead-letter",
      "searchops-connectors:dead-letter",
      "searchops-geo-answer-monitor:dead-letter",
      "searchops-schema-rich-result-validation:dead-letter",
    ]);
  });

  it("adapts BullMQ dead-letter queues without leaking raw job data", async () => {
    let removed = false;
    const queue: BullMqDeadLetterQueuePort = {
      name: "searchops-crawl:dead-letter",
      async getJobs(types) {
        if (types[0] !== "waiting") {
          return [];
        }

        return [
          {
            id: 42,
            name: "failed-job",
            timestamp: Date.parse("2026-05-25T00:00:01.000Z"),
            data: deadLetterJob.payload,
          },
        ];
      },
      async getJob(id) {
        if (id !== "42") {
          return undefined;
        }

        return {
          async remove() {
            removed = true;
          },
        };
      },
      async close() {
        return undefined;
      },
    };
    const store = createBullMqDeadLetterJobStoreFromQueues([queue]);

    await expect(store.listDeadLetterJobs()).resolves.toEqual([
      {
        ...deadLetterJob,
        id: "searchops-crawl:dead-letter|42",
      },
    ]);
    await expect(store.removeDeadLetterJob("searchops-crawl:dead-letter|42")).resolves.toBe(true);
    expect(removed).toBe(true);
  });
});
