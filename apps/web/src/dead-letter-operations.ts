import {
  DeadLetterJobListResponseSchema,
  DeleteDeadLetterJobResponseSchema,
  type DeadLetterJobRecord,
  type DeadLetterJobStatus,
} from "@searchops/types";

export type DeadLetterOperationsSource = "api" | "fixture";
export type DeadLetterClearStatus = "cleared" | "failed" | "fixture";
export type DeadLetterStatusTone = "done" | "failed" | "queued" | "running";

export interface DeadLetterOperationsData {
  readonly deadLetterJobs: readonly DeadLetterJobRecord[];
  readonly errorMessage: string | null;
  readonly source: DeadLetterOperationsSource;
  readonly summary: DeadLetterOperationsSummary;
}

export interface DeadLetterOperationsSummary {
  readonly active: number;
  readonly failed: number;
  readonly latestFailure: string;
  readonly queueCount: number;
  readonly total: number;
  readonly waiting: number;
}

export interface DeadLetterClearResult {
  readonly deadLetterJobId: string | null;
  readonly errorMessage: string | null;
  readonly source: DeadLetterOperationsSource;
  readonly status: DeadLetterClearStatus;
}

export interface DeadLetterClearFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export const demoDeadLetterJobs: DeadLetterJobRecord[] = [
  {
    id: "searchops-crawl-dead-letter|42",
    queueName: "searchops-crawl-dead-letter",
    jobId: "42",
    status: "waiting",
    enqueuedAt: "2026-05-25T00:00:01.000Z",
    processedAt: null,
    payload: {
      originalQueue: "searchops-crawl",
      originalJobName: "crawl",
      originalJobId: "job_42",
      failedReason: "Fetch timed out",
      attemptsMade: 3,
      failedAt: "2026-05-25T00:00:00.000Z",
    },
  },
  {
    id: "searchops-connectors-dead-letter|43",
    queueName: "searchops-connectors-dead-letter",
    jobId: "43",
    status: "failed",
    enqueuedAt: "2026-05-24T09:10:01.000Z",
    processedAt: "2026-05-24T09:10:03.000Z",
    payload: {
      originalQueue: "searchops-connectors",
      originalJobName: "connector-sync",
      originalJobId: "sync_job_43",
      failedReason: "Provider fixture batch failed",
      attemptsMade: 3,
      failedAt: "2026-05-24T09:10:00.000Z",
    },
  },
];

export async function loadDeadLetterOperations(): Promise<DeadLetterOperationsData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoDeadLetterOperations();
  }

  try {
    const response = await fetch(`${apiBaseUrl}/ops/dead-letter-jobs`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Dead-letter operations request failed with ${response.status}`);
    }

    const output = DeadLetterJobListResponseSchema.parse(await response.json());
    return {
      deadLetterJobs: output.deadLetterJobs,
      errorMessage: null,
      source: "api",
      summary: summarizeDeadLetterOperations(output.deadLetterJobs),
    };
  } catch (error) {
    const fallback = createDemoDeadLetterOperations();
    return {
      ...fallback,
      errorMessage:
        error instanceof Error ? error.message : "Dead-letter operations request failed",
    };
  }
}

export async function clearDeadLetterJob(id: string): Promise<DeadLetterClearResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      deadLetterJobId: id,
      errorMessage: null,
      source: "fixture",
      status: "fixture",
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/ops/dead-letter-jobs/${encodeURIComponent(id)}`,
      {
        cache: "no-store",
        method: "DELETE",
      },
    );
    if (!response.ok) {
      throw new Error(`Dead-letter clear request failed with ${response.status}`);
    }

    const output = DeleteDeadLetterJobResponseSchema.parse(await response.json());
    return {
      deadLetterJobId: output.deadLetterJobId,
      errorMessage: null,
      source: "api",
      status: "cleared",
    };
  } catch (error) {
    return {
      deadLetterJobId: id,
      errorMessage: error instanceof Error ? error.message : "Dead-letter clear request failed",
      source: "api",
      status: "failed",
    };
  }
}

export function createDemoDeadLetterOperations(): DeadLetterOperationsData {
  return {
    deadLetterJobs: demoDeadLetterJobs,
    errorMessage: null,
    source: "fixture",
    summary: summarizeDeadLetterOperations(demoDeadLetterJobs),
  };
}

export function summarizeDeadLetterOperations(
  jobs: readonly DeadLetterJobRecord[],
): DeadLetterOperationsSummary {
  return {
    active: jobs.filter((job) => job.status === "active").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    latestFailure: jobs[0]?.payload.failedAt ?? "none",
    queueCount: new Set(jobs.map((job) => job.payload.originalQueue)).size,
    total: jobs.length,
    waiting: jobs.filter((job) => job.status === "waiting").length,
  };
}

export function getDeadLetterClearFeedback(
  status: string | undefined,
  jobId: string | undefined,
): DeadLetterClearFeedback | null {
  if (status === "cleared") {
    return {
      message: jobId ? `Dead-letter entry cleared: ${jobId}` : "Dead-letter entry cleared.",
      tone: "success",
    };
  }

  if (status === "fixture") {
    return {
      message: "Fixture mode: set SEARCHOPS_API_BASE_URL to clear real dead-letter entries.",
      tone: "info",
    };
  }

  if (status === "failed") {
    return {
      message: "Dead-letter clear request failed. Check the API server and retry.",
      tone: "warning",
    };
  }

  return null;
}

export function getDeadLetterStatusTone(status: DeadLetterJobStatus): DeadLetterStatusTone {
  if (status === "completed") {
    return "done";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "active") {
    return "running";
  }

  return "queued";
}

export function formatDeadLetterDate(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "Pending";
}

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
