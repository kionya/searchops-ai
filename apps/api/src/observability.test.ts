import { describe, expect, it } from "vitest";

import {
  createHttpOperationalAlertRouter,
  createHttpOperationalLogDrain,
  createMemoryOperationalAlertRouter,
  createMemoryOperationalLogDrain,
  createOperationalMetricsExport,
} from "./observability.js";

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

  it("stores metrics exports and routes alert deliveries through runtime adapters", async () => {
    const logDrain = createMemoryOperationalLogDrain();
    const alertRouter = createMemoryOperationalAlertRouter(
      () => new Date("2026-05-26T00:01:00.000Z"),
    );
    const exportPayload = createOperationalMetricsExport({
      generatedAt: new Date("2026-05-26T00:00:12.000Z"),
      metricsStartedAtMs: new Date("2026-05-26T00:00:00.000Z").getTime(),
      requestMetrics: {
        total: 1,
        byStatus: {
          "500": 1,
        },
      },
      workerDeadLetterSummary: {
        total: 0,
        byQueue: {},
        byStatus: {},
      },
    });

    await logDrain.writeMetricsExport(exportPayload);
    await alertRouter.routeAlerts(exportPayload.alerts, exportPayload);

    expect(logDrain.listMetricsExports()).toEqual([exportPayload]);
    expect(alertRouter.listAlertDeliveries()).toEqual([
      {
        alert: exportPayload.alerts[0],
        deliveredAt: "2026-05-26T00:01:00.000Z",
        generatedAt: "2026-05-26T00:00:12.000Z",
        routeKey: "api:critical",
      },
    ]);
  });

  it("posts metrics and alerts to configured HTTP drains", async () => {
    const requests: Array<{ readonly body: unknown; readonly url: string }> = [];
    const fetchFn: typeof fetch = async (url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
        url: String(url),
      });
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    };
    const exportPayload = createOperationalMetricsExport({
      generatedAt: new Date("2026-05-26T00:00:12.000Z"),
      metricsStartedAtMs: new Date("2026-05-26T00:00:00.000Z").getTime(),
      requestMetrics: {
        total: 1,
        byStatus: {
          "500": 1,
        },
      },
      workerDeadLetterSummary: {
        total: 0,
        byQueue: {},
        byStatus: {},
      },
    });
    const logDrain = createHttpOperationalLogDrain({
      bearerToken: "ops_token",
      endpointUrl: "https://ops.example.com/log-drain",
      fetchFn,
    });
    const alertRouter = createHttpOperationalAlertRouter({
      endpointUrl: "https://ops.example.com/alerts",
      fetchFn,
    });

    await logDrain.writeMetricsExport(exportPayload);
    await alertRouter.routeAlerts(exportPayload.alerts, exportPayload);

    expect(requests).toEqual([
      {
        url: "https://ops.example.com/log-drain",
        body: {
          kind: "searchops.metrics_export",
          payload: exportPayload,
        },
      },
      {
        url: "https://ops.example.com/alerts",
        body: {
          alerts: exportPayload.alerts,
          kind: "searchops.operational_alerts",
          payload: exportPayload,
        },
      },
    ]);
  });
});
