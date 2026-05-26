import {
  OperationalMetricsExportResponseSchema,
  type OperationalAlert,
  type OperationalMetricsExportResponse,
} from "@searchops/types";

export type ObservabilityDashboardSource = "api" | "fixture";
export type ObservabilityAlertTone = "critical" | "info" | "warning";

export interface ObservabilityDashboardData {
  readonly errorMessage: string | null;
  readonly metrics: OperationalMetricsExportResponse;
  readonly source: ObservabilityDashboardSource;
  readonly summary: ObservabilityDashboardSummary;
}

export interface ObservabilityDashboardSummary {
  readonly alertCount: number;
  readonly criticalAlertCount: number;
  readonly deadLetterTotal: number;
  readonly requestTotal: number;
  readonly serverErrorCount: number;
  readonly uptimeSeconds: number;
}

export const demoOperationalMetricsExport = OperationalMetricsExportResponseSchema.parse({
  service: "api",
  generatedAt: "2026-05-26T00:00:00.000Z",
  uptimeSeconds: 360,
  requests: {
    total: 128,
    byStatus: {
      "200": 120,
      "429": 4,
      "500": 4,
    },
  },
  workers: {
    deadLetterJobs: {
      total: 2,
      byQueue: {
        "searchops-crawl": 1,
        "searchops-connectors": 1,
      },
      byStatus: {
        failed: 1,
        waiting: 1,
      },
    },
  },
  alerts: [
    {
      id: "api_5xx_responses",
      message: "API returned 4 5xx responses during this process lifetime",
      severity: "critical",
      source: "api",
    },
    {
      id: "worker_dead_letter_jobs",
      message: "Worker dead-letter queues contain 2 jobs",
      severity: "warning",
      source: "worker",
    },
  ],
});

export async function loadObservabilityDashboard(): Promise<ObservabilityDashboardData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoObservabilityDashboard();
  }

  try {
    const response = await fetch(`${apiBaseUrl}/ops/metrics-export`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Observability metrics request failed with ${response.status}`);
    }

    const metrics = OperationalMetricsExportResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      metrics,
      source: "api",
      summary: summarizeOperationalMetrics(metrics),
    };
  } catch (error) {
    const fallback = createDemoObservabilityDashboard();
    return {
      ...fallback,
      errorMessage:
        error instanceof Error ? error.message : "Observability metrics request failed",
    };
  }
}

export function createDemoObservabilityDashboard(): ObservabilityDashboardData {
  return {
    errorMessage: null,
    metrics: demoOperationalMetricsExport,
    source: "fixture",
    summary: summarizeOperationalMetrics(demoOperationalMetricsExport),
  };
}

export function summarizeOperationalMetrics(
  metrics: OperationalMetricsExportResponse,
): ObservabilityDashboardSummary {
  return {
    alertCount: metrics.alerts.length,
    criticalAlertCount: metrics.alerts.filter((alert) => alert.severity === "critical").length,
    deadLetterTotal: metrics.workers.deadLetterJobs.total,
    requestTotal: metrics.requests.total,
    serverErrorCount: countStatuses(metrics.requests.byStatus, 500, 599),
    uptimeSeconds: metrics.uptimeSeconds,
  };
}

export function getObservabilityAlertTone(alert: OperationalAlert): ObservabilityAlertTone {
  return alert.severity;
}

export function formatOperationalDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function formatUptime(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
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

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
