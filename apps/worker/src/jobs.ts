import type { JobsOptions } from "bullmq";
import type {
  ConnectorSyncJobPayload,
  CrawlJobPayload,
  GeoAnswerMonitorJobPayload,
  SchemaRichResultValidationJobPayload
} from "@searchops/types";

export const workerJobNames = [
  "crawl",
  "connector-sync",
  "geo-answer-monitor",
  "schema-rich-result-validation",
  "analyze",
  "generate",
  "recheck"
] as const;

export type WorkerJobName = (typeof workerJobNames)[number];

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
  readonly "connector-sync": ConnectorSyncJobPayload;
  readonly "geo-answer-monitor": GeoAnswerMonitorJobPayload;
  readonly "schema-rich-result-validation": SchemaRichResultValidationJobPayload;
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
