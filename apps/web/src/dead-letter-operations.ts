import {
  DeadLetterJobListResponseSchema,
  DeleteDeadLetterJobResponseSchema,
  type DeadLetterJobRecord,
  type DeadLetterJobStatus,
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";

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
      failedReason: "fetch 시간이 초과되었습니다",
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
      failedReason: "provider 데모 배치가 실패했습니다",
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
      throw new Error(`실패 작업 조회 요청 실패: ${response.status}`);
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
        error instanceof Error ? error.message : "실패 작업 조회 요청에 실패했습니다",
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
      throw new Error(`실패 작업 정리 요청 실패: ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "실패 작업 정리 요청에 실패했습니다",
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
      message: jobId ? `실패 작업 항목을 정리했습니다: ${jobId}` : "실패 작업 항목을 정리했습니다.",
      tone: "success",
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: 실제 실패 작업을 정리하려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info",
    };
  }

  if (status === "failed") {
    return {
      message: "실패 작업 정리 요청에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
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
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "대기 중";
}
