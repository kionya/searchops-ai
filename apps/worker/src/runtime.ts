import { Worker, type Job } from "bullmq";

import {
  createPrismaCrawlPersistenceClient,
  createSearchOpsPrismaClient,
  type CrawlPersistenceClient,
  type SearchOpsPrismaClient
} from "@searchops/db";
import {
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  crawlQueueName,
  type CrawlJobPayload,
  type CrawlJobResult
} from "@searchops/types";

import { processAndPersistCrawlJob, type ProcessAndPersistCrawlJobOptions } from "./processor.js";

export interface CreateCrawlWorkerOptions {
  readonly redisUrl: string;
  readonly prisma?: SearchOpsPrismaClient;
  readonly concurrency?: number;
  readonly queueName?: string;
  readonly processorOptions?: ProcessAndPersistCrawlJobOptions;
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

export function createCrawlWorker(options: CreateCrawlWorkerOptions) {
  const prisma = options.prisma ?? createSearchOpsPrismaClient();
  const persistenceClient = createPrismaCrawlPersistenceClient(prisma);
  const worker = new Worker<CrawlJobPayload, CrawlJobResult, "crawl">(
    options.queueName ?? crawlQueueName,
    createCrawlJobProcessor(persistenceClient, options.processorOptions),
    {
      concurrency: options.concurrency ?? 2,
      connection: {
        url: options.redisUrl
      }
    },
  );

  return {
    worker,
    async close() {
      await worker.close();
      if (options.prisma === undefined) {
        await prisma.$disconnect();
      }
    }
  };
}
