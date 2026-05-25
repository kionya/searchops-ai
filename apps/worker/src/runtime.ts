import { Queue, Worker, type Job } from "bullmq";

import {
  createPrismaConnectorSyncPersistenceClient,
  createPrismaCrawlPersistenceClient,
  createSearchOpsPrismaClient,
  type ConnectorSyncPersistenceClient,
  type CrawlPersistenceClient,
  type SearchOpsPrismaClient
} from "@searchops/db";
import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  connectorQueueName,
  crawlQueueName,
  type connectorSyncJobName,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type CrawlJobPayload,
  type CrawlJobResult,
  type DeadLetterJobPayload
} from "@searchops/types";

import { buildDeadLetterJobPayload, deadLetterJobName } from "./dead-letter.js";
import {
  processAndPersistConnectorSyncJob,
  processAndPersistCrawlJob,
  type ProcessAndPersistCrawlJobOptions,
  type ProcessConnectorSyncJobOptions
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

export function createCrawlWorker(options: CreateCrawlWorkerOptions) {
  const prisma = options.prisma ?? createSearchOpsPrismaClient();
  const persistenceClient = createPrismaCrawlPersistenceClient(prisma);
  const queueName = options.queueName ?? crawlQueueName;
  const worker = new Worker<CrawlJobPayload, CrawlJobResult, "crawl">(
    queueName,
    createCrawlJobProcessor(persistenceClient, options.processorOptions),
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
