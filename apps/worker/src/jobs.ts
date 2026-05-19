import type { JobsOptions } from "bullmq";

export const workerJobNames = ["crawl", "analyze", "generate", "recheck"] as const;

export type WorkerJobName = (typeof workerJobNames)[number];

export interface CrawlJobPayload {
  readonly siteId: string;
  readonly requestedByUserId: string;
}

export interface AnalyzeJobPayload {
  readonly crawlRunId: string;
}

export interface GenerateJobPayload {
  readonly workOrderId: string;
}

export interface RecheckJobPayload {
  readonly workOrderId: string;
  readonly siteId: string;
}

export interface WorkerJobPayloadMap {
  readonly crawl: CrawlJobPayload;
  readonly analyze: AnalyzeJobPayload;
  readonly generate: GenerateJobPayload;
  readonly recheck: RecheckJobPayload;
}

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  },
  removeOnComplete: 100,
  removeOnFail: 1000
};