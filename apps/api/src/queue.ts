import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  GeoAnswerMonitorJobPayloadSchema,
  QueuedConnectorSyncJobSchema,
  QueuedCrawlJobSchema,
  QueuedGeoAnswerMonitorJobSchema,
  connectorSyncJobName,
  geoAnswerMonitorJobName,
  type ConnectorSyncJobPayload,
  type CrawlJobPayload,
  type GeoAnswerMonitorJobPayload,
  type QueuedConnectorSyncJob,
  type QueuedCrawlJob,
  type QueuedGeoAnswerMonitorJob
} from "@searchops/types";

export interface CrawlRunQueue {
  enqueueCrawl(payload: CrawlJobPayload): Promise<QueuedCrawlJob>;
}

export interface ConnectorSyncQueue {
  enqueueConnectorSync(payload: ConnectorSyncJobPayload): Promise<QueuedConnectorSyncJob>;
}

export interface GeoAnswerMonitorQueue {
  enqueueGeoAnswerMonitor(payload: GeoAnswerMonitorJobPayload): Promise<QueuedGeoAnswerMonitorJob>;
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

export function createMemoryGeoAnswerMonitorQueue(): MemoryGeoAnswerMonitorQueue {
  const jobs: QueuedGeoAnswerMonitorJob[] = [];
  let jobCounter = 1;

  return {
    async enqueueGeoAnswerMonitor(payload) {
      const job = QueuedGeoAnswerMonitorJobSchema.parse({
        id: createJobId(jobCounter),
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
