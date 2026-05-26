import { OperationalMetricsExportResponseSchema } from "@searchops/types";

export interface RequestMetricsSnapshot {
  readonly total: number;
  readonly byStatus: Record<string, number>;
}

export interface WorkerDeadLetterSummary {
  readonly total: number;
  readonly byQueue: Record<string, number>;
  readonly byStatus: Record<string, number>;
}

export interface CreateOperationalMetricsExportInput {
  readonly generatedAt: Date;
  readonly metricsStartedAtMs: number;
  readonly requestMetrics: RequestMetricsSnapshot;
  readonly workerDeadLetterSummary: WorkerDeadLetterSummary;
}

export function createOperationalMetricsExport(input: CreateOperationalMetricsExportInput) {
  const uptimeSeconds = Math.max(
    0,
    (input.generatedAt.getTime() - input.metricsStartedAtMs) / 1000,
  );

  return OperationalMetricsExportResponseSchema.parse({
    service: "api",
    generatedAt: input.generatedAt.toISOString(),
    uptimeSeconds,
    requests: input.requestMetrics,
    workers: {
      deadLetterJobs: input.workerDeadLetterSummary,
    },
    alerts: createOperationalAlerts({
      requestMetrics: input.requestMetrics,
      workerDeadLetterSummary: input.workerDeadLetterSummary,
    }),
  });
}

function createOperationalAlerts({
  requestMetrics,
  workerDeadLetterSummary,
}: {
  readonly requestMetrics: RequestMetricsSnapshot;
  readonly workerDeadLetterSummary: WorkerDeadLetterSummary;
}) {
  const serverErrorCount = countStatuses(requestMetrics.byStatus, 500, 599);
  const rateLimitedCount = requestMetrics.byStatus["429"] ?? 0;
  const alerts = [];

  if (serverErrorCount > 0) {
    alerts.push({
      id: "api_5xx_responses",
      message: `API returned ${serverErrorCount} 5xx responses during this process lifetime`,
      severity: "critical" as const,
      source: "api" as const,
    });
  }

  if (rateLimitedCount > 0) {
    alerts.push({
      id: "api_rate_limited_requests",
      message: `API rate limit returned ${rateLimitedCount} 429 responses during this process lifetime`,
      severity: "warning" as const,
      source: "api" as const,
    });
  }

  if (workerDeadLetterSummary.total > 0) {
    const jobLabel = workerDeadLetterSummary.total === 1 ? "job" : "jobs";
    alerts.push({
      id: "worker_dead_letter_jobs",
      message: `Worker dead-letter queues contain ${workerDeadLetterSummary.total} ${jobLabel}`,
      severity: "warning" as const,
      source: "worker" as const,
    });
  }

  return alerts.sort((left, right) => left.id.localeCompare(right.id));
}

function countStatuses(byStatus: Record<string, number>, minStatus: number, maxStatus: number) {
  return Object.entries(byStatus).reduce((total, [status, count]) => {
    const numericStatus = Number(status);
    if (!Number.isInteger(numericStatus)) {
      return total;
    }

    return numericStatus >= minStatus && numericStatus <= maxStatus ? total + count : total;
  }, 0);
}
