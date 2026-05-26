import { Queue, Worker, type Job } from "bullmq";

import {
  createPrismaConnectorSyncPersistenceClient,
  createPrismaCrawlPersistenceClient,
  createPrismaGeoVisibilityPersistenceClient,
  createPrismaSchemaRecommendationRecheckPersistenceClient,
  createSearchOpsPrismaClient,
  type ConnectorSyncPersistenceClient,
  type CrawlPersistenceClient,
  type GeoVisibilityPersistenceClient,
  type SearchOpsPrismaClient
} from "@searchops/db";
import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  connectorQueueName,
  crawlQueueName,
  GeoAnswerMonitorJobPayloadSchema,
  GeoAnswerMonitorJobResultSchema,
  geoAnswerMonitorQueueName,
  type connectorSyncJobName,
  type geoAnswerMonitorJobName,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type CrawlJobPayload,
  type CrawlJobResult,
  type DeadLetterJobPayload,
  type GeoAnswerMonitorJobPayload,
  type GeoAnswerMonitorJobResult
} from "@searchops/types";

import { buildDeadLetterJobPayload, deadLetterJobName } from "./dead-letter.js";
import {
  processAndPersistConnectorSyncJob,
  processAndPersistCrawlJob,
  processAndPersistGeoAnswerMonitorJob,
  type ProcessAndPersistCrawlJobOptions,
  type ProcessConnectorSyncJobOptions,
  type ProcessGeoAnswerMonitorJobOptions
} from "./processor.js";

export interface CreateCrawlWorkerOptions {
  readonly redisUrl: string;
  readonly prisma?: SearchOpsPrismaClient;
  readonly concurrency?: number;
  readonly deadLetterQueueName?: string;
  readonly enableDeadLetterQueue?: boolean;
  readonly failedAt?: () => Date;
  readonly queueName?: string;
  readonly processorOptions?: ProcessAndPersistCrawlJobOptions;
}

export interface CreateConnectorSyncWorkerOptions {
  readonly redisUrl: string;
  readonly prisma?: SearchOpsPrismaClient;
  readonly concurrency?: number;
  readonly deadLetterQueueName?: string;
  readonly enableDeadLetterQueue?: boolean;
  readonly failedAt?: () => Date;
  readonly processorOptions?: ProcessConnectorSyncJobOptions;
  readonly queueName?: string;
}

export interface CreateGeoAnswerMonitorWorkerOptions {
  readonly redisUrl: string;
  readonly prisma?: SearchOpsPrismaClient;
  readonly concurrency?: number;
  readonly deadLetterQueueName?: string;
  readonly enableDeadLetterQueue?: boolean;
  readonly failedAt?: () => Date;
  readonly processorOptions?: ProcessGeoAnswerMonitorJobOptions;
  readonly queueName?: string;
}

function createDeadLetterQueue(
  queueName: string,
  redisUrl: string,
  deadLetterQueueName?: string,
) {
  return new Queue<DeadLetterJobPayload>(deadLetterQueueName ?? `${queueName}:dead-letter`, {
    connection: {
      url: redisUrl
    }
  });
}

function registerDeadLetterHandler<DataType, ResultType, NameType extends string>(
  worker: Worker<DataType, ResultType, NameType>,
  queueName: string,
  deadLetterQueue: Queue<DeadLetterJobPayload> | null,
  failedAt: () => Date,
) {
  if (deadLetterQueue === null) {
    return;
  }

  worker.on("failed", (job, error) => {
    if (job === undefined) {
      return;
    }

    void deadLetterQueue
      .add(
        deadLetterJobName,
        buildDeadLetterJobPayload({
          error,
          failedAt: failedAt(),
          job,
          queueName
        }),
        {
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 1000
        },
      )
      .catch(() => undefined);
  });
}

export function createCrawlJobProcessor(
  persistenceClient: CrawlPersistenceClient,
  options: ProcessAndPersistCrawlJobOptions = {},
) {
  return async (job: Pick<Job<CrawlJobPayload, CrawlJobResult, "crawl">, "data">) => {
    const payload = CrawlJobPayloadSchema.parse(job.data);
    const result = await processAndPersistCrawlJob(payload, persistenceClient, options);
    return CrawlJobResultSchema.parse(result);
  };
}

export function createConnectorSyncJobProcessor(
  persistenceClient: ConnectorSyncPersistenceClient,
  options: ProcessConnectorSyncJobOptions = {},
) {
  return async (
    job: Pick<
      Job<ConnectorSyncJobPayload, ConnectorSyncJobResult, typeof connectorSyncJobName>,
      "data"
    >,
  ) => {
    const payload = ConnectorSyncJobPayloadSchema.parse(job.data);
    return processAndPersistConnectorSyncJob(payload, persistenceClient, options);
  };
}

export function createGeoAnswerMonitorJobProcessor(
  persistenceClient: GeoVisibilityPersistenceClient,
  options: ProcessGeoAnswerMonitorJobOptions = {},
) {
  return async (
    job: Pick<Job<GeoAnswerMonitorJobPayload, GeoAnswerMonitorJobResult, typeof geoAnswerMonitorJobName>, "data">,
  ) => {
    const payload = GeoAnswerMonitorJobPayloadSchema.parse(job.data);
    const result = await processAndPersistGeoAnswerMonitorJob(payload, persistenceClient, options);
    return GeoAnswerMonitorJobResultSchema.parse(result);
  };
}

export function createCrawlWorker(options: CreateCrawlWorkerOptions) {
  const prisma = options.prisma ?? createSearchOpsPrismaClient();
  const persistenceClient = createPrismaCrawlPersistenceClient(prisma);
  const schemaRecommendationRecheckClient =
    createPrismaSchemaRecommendationRecheckPersistenceClient(prisma);
  const processorOptions: ProcessAndPersistCrawlJobOptions = {
    schemaRecommendationRecheckClient,
    ...options.processorOptions
  };
  const queueName = options.queueName ?? crawlQueueName;
  const worker = new Worker<CrawlJobPayload, CrawlJobResult, "crawl">(
    queueName,
    createCrawlJobProcessor(persistenceClient, processorOptions),
    {
      concurrency: options.concurrency ?? 2,
      connection: {
        url: options.redisUrl
      }
    },
  );
  const deadLetterQueue =
    options.enableDeadLetterQueue === false
      ? null
      : createDeadLetterQueue(queueName, options.redisUrl, options.deadLetterQueueName);
  registerDeadLetterHandler(worker, queueName, deadLetterQueue, options.failedAt ?? (() => new Date()));

  return {
    worker,
    async close() {
      await worker.close();
      await deadLetterQueue?.close();
      if (options.prisma === undefined) {
        await prisma.$disconnect();
      }
    }
  };
}

export function createConnectorSyncWorker(options: CreateConnectorSyncWorkerOptions) {
  const prisma = options.prisma ?? createSearchOpsPrismaClient();
  const persistenceClient = createPrismaConnectorSyncPersistenceClient(prisma);
  const queueName = options.queueName ?? connectorQueueName;
  const worker = new Worker<
    ConnectorSyncJobPayload,
    ConnectorSyncJobResult,
    typeof connectorSyncJobName
  >(
    queueName,
    createConnectorSyncJobProcessor(persistenceClient, options.processorOptions),
    {
      concurrency: options.concurrency ?? 2,
      connection: {
        url: options.redisUrl
      }
    },
  );
  const deadLetterQueue =
    options.enableDeadLetterQueue === false
      ? null
      : createDeadLetterQueue(queueName, options.redisUrl, options.deadLetterQueueName);
  registerDeadLetterHandler(worker, queueName, deadLetterQueue, options.failedAt ?? (() => new Date()));

  return {
    worker,
    async close() {
      await worker.close();
      await deadLetterQueue?.close();
      if (options.prisma === undefined) {
        await prisma.$disconnect();
      }
    }
  };
}

export function createGeoAnswerMonitorWorker(options: CreateGeoAnswerMonitorWorkerOptions) {
  const prisma = options.prisma ?? createSearchOpsPrismaClient();
  const persistenceClient = createPrismaGeoVisibilityPersistenceClient(prisma);
  const queueName = options.queueName ?? geoAnswerMonitorQueueName;
  const worker = new Worker<
    GeoAnswerMonitorJobPayload,
    GeoAnswerMonitorJobResult,
    typeof geoAnswerMonitorJobName
  >(
    queueName,
    createGeoAnswerMonitorJobProcessor(persistenceClient, options.processorOptions),
    {
      concurrency: options.concurrency ?? 2,
      connection: {
        url: options.redisUrl
      }
    },
  );
  const deadLetterQueue =
    options.enableDeadLetterQueue === false
      ? null
      : createDeadLetterQueue(queueName, options.redisUrl, options.deadLetterQueueName);
  registerDeadLetterHandler(worker, queueName, deadLetterQueue, options.failedAt ?? (() => new Date()));

  return {
    worker,
    async close() {
      await worker.close();
      await deadLetterQueue?.close();
      if (options.prisma === undefined) {
        await prisma.$disconnect();
      }
    }
  };
}
