import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  GeoAnswerMonitorJobPayloadSchema,
  SchemaRichResultValidationJobPayloadSchema,
  QueuedConnectorSyncJobSchema,
  QueuedCrawlJobSchema,
  QueuedGeoAnswerMonitorJobSchema,
  QueuedSchemaRichResultValidationJobSchema,
  connectorSyncJobName,
  geoAnswerMonitorJobName,
  schemaRichResultValidationJobName,
  type ConnectorSyncJobPayload,
  type CrawlJobPayload,
  type GeoAnswerMonitorJobPayload,
  type SchemaRichResultValidationJobPayload,
  type QueuedConnectorSyncJob,
  type QueuedCrawlJob,
  type QueuedGeoAnswerMonitorJob,
  type QueuedSchemaRichResultValidationJob
} from "@searchops/types";

export interface CrawlRunQueue {
  enqueueCrawl(payload: CrawlJobPayload, options?: EnqueueJobOptions): Promise<QueuedCrawlJob>;
}

export interface ConnectorSyncQueue {
  enqueueConnectorSync(
    payload: ConnectorSyncJobPayload,
    options?: EnqueueJobOptions,
  ): Promise<QueuedConnectorSyncJob>;
}

export interface GeoAnswerMonitorQueue {
  enqueueGeoAnswerMonitor(
    payload: GeoAnswerMonitorJobPayload,
    options?: EnqueueJobOptions,
  ): Promise<QueuedGeoAnswerMonitorJob>;
}

export interface SchemaRichResultValidationQueue {
  enqueueSchemaRichResultValidation(
    payload: SchemaRichResultValidationJobPayload,
    options?: EnqueueJobOptions,
  ): Promise<QueuedSchemaRichResultValidationJob>;
}

export interface EnqueueJobOptions {
  readonly jobId?: string;
}

export interface MemoryCrawlRunQueue extends CrawlRunQueue {
  listQueuedCrawlJobs(): readonly QueuedCrawlJob[];
}

export interface MemoryConnectorSyncQueue extends ConnectorSyncQueue {
  listQueuedConnectorSyncJobs(): readonly QueuedConnectorSyncJob[];
}

export interface MemoryGeoAnswerMonitorQueue extends GeoAnswerMonitorQueue {
  listQueuedGeoAnswerMonitorJobs(): readonly QueuedGeoAnswerMonitorJob[];
}

export interface MemorySchemaRichResultValidationQueue
  extends SchemaRichResultValidationQueue {
  listQueuedSchemaRichResultValidationJobs(): readonly QueuedSchemaRichResultValidationJob[];
}

function createJobId(index: number) {
  return `job_${index.toString().padStart(4, "0")}`;
}

function createMemoryJobId(options: EnqueueJobOptions | undefined, index: number) {
  return options?.jobId ?? createJobId(index);
}

function findExistingMemoryJob<Job extends { readonly id: string }>(
  jobs: readonly Job[],
  options: EnqueueJobOptions | undefined,
) {
  return options?.jobId === undefined ? undefined : jobs.find((job) => job.id === options.jobId);
}

export function createMemoryCrawlRunQueue(): MemoryCrawlRunQueue {
  const jobs: QueuedCrawlJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueCrawl(payload, options) {
      const existingJob = findExistingMemoryJob(jobs, options);
      if (existingJob !== undefined) {
        return existingJob;
      }

      const job = QueuedCrawlJobSchema.parse({
        id: createMemoryJobId(options, jobCounter),
        name: "crawl",
        payload: CrawlJobPayloadSchema.parse(payload)
      });
      jobCounter += 1;
      jobs.push(job);
      return job;
    },

    listQueuedCrawlJobs() {
      return jobs;
    }
  };
}

export function createMemoryConnectorSyncQueue(): MemoryConnectorSyncQueue {
  const jobs: QueuedConnectorSyncJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueConnectorSync(payload, options) {
      const existingJob = findExistingMemoryJob(jobs, options);
      if (existingJob !== undefined) {
        return existingJob;
      }

      const job = QueuedConnectorSyncJobSchema.parse({
        id: createMemoryJobId(options, jobCounter),
        name: connectorSyncJobName,
        payload: ConnectorSyncJobPayloadSchema.parse(payload)
      });
      jobCounter += 1;
      jobs.push(job);
      return job;
    },

    listQueuedConnectorSyncJobs() {
      return jobs;
    }
  };
}

export function createMemoryGeoAnswerMonitorQueue(): MemoryGeoAnswerMonitorQueue {
  const jobs: QueuedGeoAnswerMonitorJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueGeoAnswerMonitor(payload, options) {
      const existingJob = findExistingMemoryJob(jobs, options);
      if (existingJob !== undefined) {
        return existingJob;
      }

      const job = QueuedGeoAnswerMonitorJobSchema.parse({
        id: createMemoryJobId(options, jobCounter),
        name: geoAnswerMonitorJobName,
        payload: GeoAnswerMonitorJobPayloadSchema.parse(payload)
      });
      jobCounter += 1;
      jobs.push(job);
      return job;
    },

    listQueuedGeoAnswerMonitorJobs() {
      return jobs;
    }
  };
}

export function createMemorySchemaRichResultValidationQueue(): MemorySchemaRichResultValidationQueue {
  const jobs: QueuedSchemaRichResultValidationJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueSchemaRichResultValidation(payload, options) {
      const existingJob = findExistingMemoryJob(jobs, options);
      if (existingJob !== undefined) {
        return existingJob;
      }

      const job = QueuedSchemaRichResultValidationJobSchema.parse({
        id: createMemoryJobId(options, jobCounter),
        name: schemaRichResultValidationJobName,
        payload: SchemaRichResultValidationJobPayloadSchema.parse(payload)
      });
      jobCounter += 1;
      jobs.push(job);
      return job;
    },

    listQueuedSchemaRichResultValidationJobs() {
      return jobs;
    }
  };
}
