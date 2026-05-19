import { Queue, type JobsOptions } from "bullmq";

import {
  CrawlJobPayloadSchema,
  QueuedCrawlJobSchema,
  crawlQueueName,
  type CrawlJobPayload
} from "@searchops/types";

import type { CrawlRunQueue } from "./queue.js";

export interface BullMqQueuePort {
  add(
    name: "crawl",
    data: CrawlJobPayload,
    options: JobsOptions,
  ): Promise<{
    id?: string | number;
  }>;
  close(): Promise<void>;
}

export interface BullMqCrawlRunQueue extends CrawlRunQueue {
  close(): Promise<void>;
}

export interface CreateBullMqCrawlRunQueueOptions {
  readonly redisUrl: string;
  readonly queueName?: string;
}

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  },
  removeOnComplete: 100,
  removeOnFail: 1000
};

export function createBullMqCrawlRunQueueFromQueue(queue: BullMqQueuePort): BullMqCrawlRunQueue {
  return {
    async enqueueCrawl(input) {
      const payload = CrawlJobPayloadSchema.parse(input);
      const job = await queue.add("crawl", payload, defaultJobOptions);

      return QueuedCrawlJobSchema.parse({
        id: String(job.id ?? `${payload.crawlRunId}:crawl`),
        name: "crawl",
        payload
      });
    },

    async close() {
      await queue.close();
    }
  };
}

export function createBullMqCrawlRunQueue(
  options: CreateBullMqCrawlRunQueueOptions,
): BullMqCrawlRunQueue {
  return createBullMqCrawlRunQueueFromQueue(
    new Queue<CrawlJobPayload>(options.queueName ?? crawlQueueName, {
      connection: {
        url: options.redisUrl
      },
      defaultJobOptions
    }),
  );
}
