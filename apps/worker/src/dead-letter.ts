import type { Job } from "bullmq";

import {
  DeadLetterJobPayloadSchema,
  type DeadLetterJobPayload,
} from "@searchops/types";

export const deadLetterJobName = "failed-job" as const;

export interface BuildDeadLetterJobPayloadInput {
  readonly queueName: string;
  readonly job: Pick<Job, "attemptsMade" | "id" | "name">;
  readonly error: unknown;
  readonly failedAt: Date;
}

function getFailedReason(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown worker failure";
}

export function buildDeadLetterJobPayload(
  input: BuildDeadLetterJobPayloadInput,
): DeadLetterJobPayload {
  return DeadLetterJobPayloadSchema.parse({
    originalQueue: input.queueName,
    originalJobName: input.job.name,
    originalJobId: input.job.id === undefined ? null : String(input.job.id),
    failedReason: getFailedReason(input.error),
    attemptsMade: input.job.attemptsMade,
    failedAt: input.failedAt.toISOString(),
  });
}
