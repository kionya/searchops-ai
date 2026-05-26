import { describe, expect, it } from "vitest";

import { createOperationalMetricsExport } from "./observability.js";

describe("observability export", () => {
  it("creates deterministic operational metrics and alerts", () => {
    const exportPayload = createOperationalMetricsExport({
      generatedAt: new Date("2026-05-26T00:00:12.000Z"),
      metricsStartedAtMs: new Date("2026-05-26T00:00:00.000Z").getTime(),
      requestMetrics: {
        total: 5,
        byStatus: {
          "200": 3,
          "429": 1,
          "500": 1,
        },
      },
      workerDeadLetterSummary: {
        total: 2,
        byQueue: {
          "searchops-crawl": 2,
        },
        byStatus: {
          waiting: 2,
        },
      },
    });

    expect(exportPayload).toEqual({
      service: "api",
      generatedAt: "2026-05-26T00:00:12.000Z",
      uptimeSeconds: 12,
      requests: {
        total: 5,
        byStatus: {
          "200": 3,
          "429": 1,
          "500": 1,
        },
      },
      workers: {
        deadLetterJobs: {
          total: 2,
          byQueue: {
            "searchops-crawl": 2,
          },
          byStatus: {
            waiting: 2,
          },
        },
      },
      alerts: [
        {
          id: "api_5xx_responses",
          message: "API returned 1 5xx responses during this process lifetime",
          severity: "critical",
          source: "api",
        },
        {
          id: "api_rate_limited_requests",
          message: "API rate limit returned 1 429 responses during this process lifetime",
          severity: "warning",
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
  });

  it("keeps export clear when no warning signals exist", () => {
    expect(
      createOperationalMetricsExport({
        generatedAt: new Date("2026-05-26T00:00:00.000Z"),
        metricsStartedAtMs: new Date("2026-05-26T00:00:30.000Z").getTime(),
        requestMetrics: {
          total: 1,
          byStatus: {
            "200": 1,
          },
        },
        workerDeadLetterSummary: {
          total: 0,
          byQueue: {},
          byStatus: {},
        },
      }),
    ).toMatchObject({
      uptimeSeconds: 0,
      alerts: [],
    });
  });
});
