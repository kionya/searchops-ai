import { Queue, type JobsOptions } from "bullmq";

import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  GeoAnswerMonitorJobPayloadSchema,
  SchemaRichResultValidationJobPayloadSchema,
  QueuedConnectorSyncJobSchema,
  QueuedCrawlJobSchema,
  QueuedGeoAnswerMonitorJobSchema,
  QueuedSchemaRichResultValidationJobSchema,
  connectorQueueName,
  connectorSyncJobName,
  crawlQueueName,
  geoAnswerMonitorJobName,
  geoAnswerMonitorQueueName,
  schemaRichResultValidationJobName,
  schemaRichResultValidationQueueName,
  type ConnectorSyncJobPayload,
  type CrawlJobPayload,
  type GeoAnswerMonitorJobPayload,
  type SchemaRichResultValidationJobPayload
} from "@searchops/types";

import type {
  ConnectorSyncQueue,
  CrawlRunQueue,
  EnqueueJobOptions,
  GeoAnswerMonitorQueue,
  SchemaRichResultValidationQueue
} from "./queue.js";

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

export interface BullMqGeoAnswerMonitorQueuePort {
  add(
    name: typeof geoAnswerMonitorJobName,
    data: GeoAnswerMonitorJobPayload,
    options: JobsOptions,
  ): Promise<{
    id?: string | number;
  }>;
  close(): Promise<void>;
}

export interface BullMqSchemaRichResultValidationQueuePort {
  add(
    name: typeof schemaRichResultValidationJobName,
    data: SchemaRichResultValidationJobPayload,
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

export interface BullMqGeoAnswerMonitorQueue extends GeoAnswerMonitorQueue {
  close(): Promise<void>;
}

export interface BullMqSchemaRichResultValidationQueue
  extends SchemaRichResultValidationQueue {
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

export interface CreateBullMqGeoAnswerMonitorQueueOptions {
  readonly redisUrl: string;
  readonly queueName?: string;
}

export interface CreateBullMqSchemaRichResultValidationQueueOptions {
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

function createBullMqJobOptions(options: EnqueueJobOptions | undefined) {
  return options?.jobId === undefined
    ? defaultJobOptions
    : {
        ...defaultJobOptions,
        jobId: options.jobId
      };
}

export function createBullMqCrawlRunQueueFromQueue(queue: BullMqQueuePort): BullMqCrawlRunQueue {
  return {
    async enqueueCrawl(input, options) {
      const payload = CrawlJobPayloadSchema.parse(input);
      const job = await queue.add("crawl", payload, createBullMqJobOptions(options));

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
    async enqueueConnectorSync(input, options) {
      const payload = ConnectorSyncJobPayloadSchema.parse(input);
      const job = await queue.add(
        connectorSyncJobName,
        payload,
        createBullMqJobOptions(options),
      );

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

export function createBullMqGeoAnswerMonitorQueueFromQueue(
  queue: BullMqGeoAnswerMonitorQueuePort,
): BullMqGeoAnswerMonitorQueue {
  return {
    async enqueueGeoAnswerMonitor(input, options) {
      const payload = GeoAnswerMonitorJobPayloadSchema.parse(input);
      const job = await queue.add(
        geoAnswerMonitorJobName,
        payload,
        createBullMqJobOptions(options),
      );

      return QueuedGeoAnswerMonitorJobSchema.parse({
        id: String(job.id ?? `${payload.siteId}:geo-answer-monitor`),
        name: geoAnswerMonitorJobName,
        payload
      });
    },

    async close() {
      await queue.close();
    }
  };
}

export function createBullMqSchemaRichResultValidationQueueFromQueue(
  queue: BullMqSchemaRichResultValidationQueuePort,
): BullMqSchemaRichResultValidationQueue {
  return {
    async enqueueSchemaRichResultValidation(input, options) {
      const payload = SchemaRichResultValidationJobPayloadSchema.parse(input);
      const job = await queue.add(
        schemaRichResultValidationJobName,
        payload,
        createBullMqJobOptions(options),
      );

      return QueuedSchemaRichResultValidationJobSchema.parse({
        id: String(job.id ?? `${payload.recommendationId}:schema-rich-result-validation`),
        name: schemaRichResultValidationJobName,
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

export function createBullMqGeoAnswerMonitorQueue(
  options: CreateBullMqGeoAnswerMonitorQueueOptions,
): BullMqGeoAnswerMonitorQueue {
  return createBullMqGeoAnswerMonitorQueueFromQueue(
    new Queue<GeoAnswerMonitorJobPayload>(options.queueName ?? geoAnswerMonitorQueueName, {
      connection: {
        url: options.redisUrl
      },
      defaultJobOptions
    }),
  );
}

export function createBullMqSchemaRichResultValidationQueue(
  options: CreateBullMqSchemaRichResultValidationQueueOptions,
): BullMqSchemaRichResultValidationQueue {
  return createBullMqSchemaRichResultValidationQueueFromQueue(
    new Queue<SchemaRichResultValidationJobPayload>(
      options.queueName ?? schemaRichResultValidationQueueName,
      {
        connection: {
          url: options.redisUrl
        },
        defaultJobOptions
      },
    ),
  );
}
