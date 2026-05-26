import { Queue, type JobType } from "bullmq";

import {
  DeadLetterJobPayloadSchema,
  DeadLetterJobRecordSchema,
  connectorQueueName,
  crawlQueueName,
  geoAnswerMonitorQueueName,
  schemaRichResultValidationQueueName,
  type DeadLetterJobPayload,
  type DeadLetterJobRecord,
  type DeadLetterJobStatus,
} from "@searchops/types";

export interface DeadLetterJobStore {
  listDeadLetterJobs(options?: { readonly limit?: number }): Promise<DeadLetterJobRecord[]>;
  removeDeadLetterJob(id: string): Promise<boolean>;
}

export interface CloseableDeadLetterJobStore extends DeadLetterJobStore {
  close(): Promise<void>;
}

export interface CreateBullMqDeadLetterJobStoreOptions {
  readonly redisUrl: string;
  readonly queueNames?: readonly string[];
}

interface BullMqDeadLetterJob {
  readonly id?: string | number;
  readonly name: string;
  readonly data: unknown;
  readonly timestamp?: number;
  readonly processedOn?: number;
  readonly finishedOn?: number;
}

interface RemovableBullMqJob {
  remove(): Promise<void>;
}

export interface BullMqDeadLetterQueuePort {
  readonly name: string;
  getJobs(
    types: JobType[],
    start?: number,
    end?: number,
    asc?: boolean,
  ): Promise<readonly BullMqDeadLetterJob[]>;
  getJob(id: string): Promise<RemovableBullMqJob | undefined>;
  close(): Promise<void>;
}

const deadLetterJobStatuses = [
  "waiting",
  "delayed",
  "paused",
  "active",
  "prioritized",
  "waiting-children",
  "completed",
  "failed",
] as const satisfies readonly DeadLetterJobStatus[];

export function getDefaultDeadLetterQueueNames() {
  return [
    crawlQueueName,
    connectorQueueName,
    geoAnswerMonitorQueueName,
    schemaRichResultValidationQueueName,
  ].map((queueName) => `${queueName}-dead-letter`);
}

export function encodeDeadLetterJobId(queueName: string, jobId: string) {
  return `${queueName}|${jobId}`;
}

export function decodeDeadLetterJobId(id: string) {
  const separatorIndex = id.lastIndexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= id.length - 1) {
    return null;
  }

  return {
    jobId: id.slice(separatorIndex + 1),
    queueName: id.slice(0, separatorIndex),
  };
}

export function summarizeDeadLetterJobs(jobs: readonly DeadLetterJobRecord[]) {
  return jobs.reduce(
    (summary, job) => {
      summary.total += 1;
      summary.byQueue[job.payload.originalQueue] =
        (summary.byQueue[job.payload.originalQueue] ?? 0) + 1;
      summary.byStatus[job.status] = (summary.byStatus[job.status] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      byQueue: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    },
  );
}

export function createMemoryDeadLetterJobStore(
  seed: readonly DeadLetterJobRecord[] = [],
): DeadLetterJobStore {
  const jobs = new Map(seed.map((job) => [job.id, DeadLetterJobRecordSchema.parse(job)]));

  return {
    async listDeadLetterJobs(options) {
      const limit = options?.limit ?? 50;
      return [...jobs.values()]
        .sort((left, right) => right.payload.failedAt.localeCompare(left.payload.failedAt))
        .slice(0, limit);
    },

    async removeDeadLetterJob(id) {
      return jobs.delete(id);
    },
  };
}

export function createBullMqDeadLetterJobStoreFromQueues(
  queues: readonly BullMqDeadLetterQueuePort[],
): CloseableDeadLetterJobStore {
  const queueByName = new Map(queues.map((queue) => [queue.name, queue]));

  return {
    async listDeadLetterJobs(options) {
      const limit = options?.limit ?? 50;
      const records: DeadLetterJobRecord[] = [];

      for (const queue of queues) {
        for (const status of deadLetterJobStatuses) {
          const jobs = await queue.getJobs([status], 0, limit - 1, false);
          for (const job of jobs) {
            records.push(createDeadLetterJobRecord(queue.name, status, job));
          }
        }
      }

      return records
        .sort((left, right) => right.payload.failedAt.localeCompare(left.payload.failedAt))
        .slice(0, limit);
    },

    async removeDeadLetterJob(id) {
      const decoded = decodeDeadLetterJobId(id);
      if (decoded === null) {
        return false;
      }

      const queue = queueByName.get(decoded.queueName);
      if (queue === undefined) {
        return false;
      }

      const job = await queue.getJob(decoded.jobId);
      if (job === undefined) {
        return false;
      }

      await job.remove();
      return true;
    },

    async close() {
      await Promise.all(queues.map((queue) => queue.close()));
    },
  };
}

export function createBullMqDeadLetterJobStore(
  options: CreateBullMqDeadLetterJobStoreOptions,
): CloseableDeadLetterJobStore {
  const queues = (options.queueNames ?? getDefaultDeadLetterQueueNames()).map(
    (queueName) =>
      new Queue<DeadLetterJobPayload>(queueName, {
        connection: {
          url: options.redisUrl,
        },
      }),
  );

  return createBullMqDeadLetterJobStoreFromQueues(queues);
}

function createDeadLetterJobRecord(
  queueName: string,
  status: DeadLetterJobStatus,
  job: BullMqDeadLetterJob,
) {
  const payload = DeadLetterJobPayloadSchema.parse(job.data);
  const jobId = job.id === undefined ? null : String(job.id);

  return DeadLetterJobRecordSchema.parse({
    id: encodeDeadLetterJobId(
      queueName,
      jobId ?? `${payload.originalQueue}:${payload.originalJobId ?? "unknown"}:${payload.failedAt}`,
    ),
    queueName,
    jobId,
    status,
    enqueuedAt: toIsoDateTime(job.timestamp),
    processedAt: toIsoDateTime(job.finishedOn ?? job.processedOn),
    payload,
  });
}

function toIsoDateTime(timestamp: number | undefined) {
  return timestamp === undefined ? null : new Date(timestamp).toISOString();
}
