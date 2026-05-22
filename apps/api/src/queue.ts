import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  QueuedConnectorSyncJobSchema,
  QueuedCrawlJobSchema,
  connectorSyncJobName,
  type ConnectorSyncJobPayload,
  type CrawlJobPayload,
  type QueuedConnectorSyncJob,
  type QueuedCrawlJob
} from "@searchops/types";

export interface CrawlRunQueue {
  enqueueCrawl(payload: CrawlJobPayload): Promise<QueuedCrawlJob>;
}

export interface ConnectorSyncQueue {
  enqueueConnectorSync(payload: ConnectorSyncJobPayload): Promise<QueuedConnectorSyncJob>;
}

export interface MemoryCrawlRunQueue extends CrawlRunQueue {
  listQueuedCrawlJobs(): readonly QueuedCrawlJob[];
}

export interface MemoryConnectorSyncQueue extends ConnectorSyncQueue {
  listQueuedConnectorSyncJobs(): readonly QueuedConnectorSyncJob[];
}

function createJobId(index: number) {
  return `job_${index.toString().padStart(4, "0")}`;
}

export function createMemoryCrawlRunQueue(): MemoryCrawlRunQueue {
  const jobs: QueuedCrawlJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueCrawl(payload) {
      const job = QueuedCrawlJobSchema.parse({
        id: createJobId(jobCounter),
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
    async enqueueConnectorSync(payload) {
      const job = QueuedConnectorSyncJobSchema.parse({
        id: createJobId(jobCounter),
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
