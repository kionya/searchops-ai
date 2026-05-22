import { Queue, type JobsOptions } from "bullmq";

import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  QueuedConnectorSyncJobSchema,
  QueuedCrawlJobSchema,
  connectorQueueName,
  connectorSyncJobName,
  crawlQueueName,
  type ConnectorSyncJobPayload,
  type CrawlJobPayload
} from "@searchops/types";

import type { ConnectorSyncQueue, CrawlRunQueue } from "./queue.js";

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

export interface BullMqConnectorQueuePort {
  add(
    name: typeof connectorSyncJobName,
    data: ConnectorSyncJobPayload,
    options: JobsOptions,
  ): Promise<{
    id?: string | number;
  }>;
  close(): Promise<void>;
}

export interface BullMqCrawlRunQueue extends CrawlRunQueue {
  close(): Promise<void>;
}

export interface BullMqConnectorSyncQueue extends ConnectorSyncQueue {
  close(): Promise<void>;
}

export interface CreateBullMqCrawlRunQueueOptions {
  readonly redisUrl: string;
  readonly queueName?: string;
}

export interface CreateBullMqConnectorSyncQueueOptions {
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

export function createBullMqConnectorSyncQueueFromQueue(
  queue: BullMqConnectorQueuePort,
): BullMqConnectorSyncQueue {
  return {
    async enqueueConnectorSync(input) {
      const payload = ConnectorSyncJobPayloadSchema.parse(input);
      const job = await queue.add(connectorSyncJobName, payload, defaultJobOptions);

      return QueuedConnectorSyncJobSchema.parse({
        id: String(job.id ?? `${payload.connectorSyncRunId}:connector-sync`),
        name: connectorSyncJobName,
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

export function createBullMqConnectorSyncQueue(
  options: CreateBullMqConnectorSyncQueueOptions,
): BullMqConnectorSyncQueue {
  return createBullMqConnectorSyncQueueFromQueue(
    new Queue<ConnectorSyncJobPayload>(options.queueName ?? connectorQueueName, {
      connection: {
        url: options.redisUrl
      },
      defaultJobOptions
    }),
  );
}
