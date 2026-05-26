import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  DeadLetterReplayExecutionResponseSchema,
  GeoAnswerMonitorJobPayloadSchema,
  SchemaRichResultValidationJobPayloadSchema,
  connectorQueueName,
  connectorSyncJobName,
  crawlQueueName,
  geoAnswerMonitorJobName,
  geoAnswerMonitorQueueName,
  schemaRichResultValidationJobName,
  schemaRichResultValidationQueueName,
  type DeadLetterJobRecord,
  type DeadLetterReplayExecutionResponse,
  type DeadLetterReplayRequest,
} from "@searchops/types";

import type {
  ConnectorSyncQueue,
  CrawlRunQueue,
  GeoAnswerMonitorQueue,
  SchemaRichResultValidationQueue,
} from "./queue.js";
import type { DeadLetterJobStore } from "./dead-letter-store.js";
import { createDeadLetterReplayPlan } from "./operations-hardening.js";

export interface ReplayDeadLetterJobInput {
  readonly createdAt: Date;
  readonly deadLetterJob: DeadLetterJobRecord;
  readonly deadLetterJobStore: DeadLetterJobStore;
  readonly request: DeadLetterReplayRequest;
  readonly queues: DeadLetterReplayQueues;
}

export interface DeadLetterReplayQueues {
  readonly connectorSyncQueue: ConnectorSyncQueue;
  readonly crawlRunQueue: CrawlRunQueue;
  readonly geoAnswerMonitorQueue: GeoAnswerMonitorQueue;
  readonly schemaRichResultValidationQueue: SchemaRichResultValidationQueue;
}

export class DeadLetterReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadLetterReplayError";
  }
}

export async function replayDeadLetterJob({
  createdAt,
  deadLetterJob,
  deadLetterJobStore,
  queues,
  request,
}: ReplayDeadLetterJobInput): Promise<DeadLetterReplayExecutionResponse> {
  const replayJobId = createReplayJobId(deadLetterJob);
  const replayJob = await enqueueReplayJob({
    deadLetterJob,
    payload: request.payload,
    queues,
    replayJobId,
  });
  const removedDeadLetterJob = request.removeDeadLetterJob
    ? await deadLetterJobStore.removeDeadLetterJob(deadLetterJob.id)
    : false;

  return DeadLetterReplayExecutionResponseSchema.parse({
    plan: createDeadLetterReplayPlan({
      createdAt,
      job: deadLetterJob,
    }),
    removedDeadLetterJob,
    replayJob,
    status: "replayed",
  });
}

async function enqueueReplayJob({
  deadLetterJob,
  payload,
  queues,
  replayJobId,
}: {
  readonly deadLetterJob: DeadLetterJobRecord;
  readonly payload: unknown;
  readonly queues: DeadLetterReplayQueues;
  readonly replayJobId: string;
}) {
  const originalQueue = deadLetterJob.payload.originalQueue;
  const originalJobName = deadLetterJob.payload.originalJobName;

  if (originalQueue === crawlQueueName && originalJobName === "crawl") {
    return queues.crawlRunQueue.enqueueCrawl(CrawlJobPayloadSchema.parse(payload), {
      jobId: replayJobId,
    });
  }

  if (originalQueue === connectorQueueName && originalJobName === connectorSyncJobName) {
    return queues.connectorSyncQueue.enqueueConnectorSync(
      ConnectorSyncJobPayloadSchema.parse(payload),
      {
        jobId: replayJobId,
      },
    );
  }

  if (originalQueue === geoAnswerMonitorQueueName && originalJobName === geoAnswerMonitorJobName) {
    return queues.geoAnswerMonitorQueue.enqueueGeoAnswerMonitor(
      GeoAnswerMonitorJobPayloadSchema.parse(payload),
      {
        jobId: replayJobId,
      },
    );
  }

  if (
    originalQueue === schemaRichResultValidationQueueName &&
    originalJobName === schemaRichResultValidationJobName
  ) {
    return queues.schemaRichResultValidationQueue.enqueueSchemaRichResultValidation(
      SchemaRichResultValidationJobPayloadSchema.parse(payload),
      {
        jobId: replayJobId,
      },
    );
  }

  throw new DeadLetterReplayError(
    `Dead-letter replay is not implemented for ${originalQueue}/${originalJobName}`,
  );
}

function createReplayJobId(deadLetterJob: DeadLetterJobRecord) {
  return `replay_${deadLetterJob.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
}
