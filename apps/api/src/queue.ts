import {
  CrawlJobPayloadSchema,
  QueuedCrawlJobSchema,
  type CrawlJobPayload,
  type QueuedCrawlJob
} from "@searchops/types";

export interface CrawlRunQueue {
  enqueueCrawl(payload: CrawlJobPayload): Promise<QueuedCrawlJob>;
}

export interface MemoryCrawlRunQueue extends CrawlRunQueue {
  listQueuedCrawlJobs(): readonly QueuedCrawlJob[];
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
