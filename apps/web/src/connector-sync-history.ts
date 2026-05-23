import {
  ConnectorSyncRunDetailResponseSchema,
  ConnectorSyncRunListResponseSchema,
  type ConnectorProvider,
  type ConnectorSyncResult,
  type ConnectorSyncRun
} from "@searchops/types";

import { demoSite } from "./work-order-board";

export type ConnectorSyncHistorySource = "api" | "fixture";
export type ConnectorSyncRunTone = "complete" | "failed" | "partial" | "queued";
export type ConnectorSyncResultTone = "failed" | "ok" | "partial";

export interface ConnectorSyncHistoryData {
  readonly errorMessage: string | null;
  readonly resultsByRunId: Readonly<Record<string, readonly ConnectorSyncResult[]>>;
  readonly runs: readonly ConnectorSyncRun[];
  readonly source: ConnectorSyncHistorySource;
}

export interface ConnectorSyncHistorySummary {
  readonly completed: number;
  readonly failed: number;
  readonly latestStatus: string;
  readonly okResults: number;
  readonly partial: number;
  readonly queued: number;
  readonly total: number;
  readonly totalRecords: number;
}

const fixtureStartedAt = "2026-05-22T00:00:00.000Z";
const fixtureEndedAt = "2026-05-22T00:01:00.000Z";

export const demoConnectorSyncRuns: ConnectorSyncRun[] = [
  {
    id: "sync_demo_003",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    status: "completed",
    providers: ["gsc", "ga4", "pagespeed"],
    requestedByUserId: "user_demo",
    fixture: true,
    startedAt: "2026-05-22T09:00:00.000Z",
    endedAt: "2026-05-22T09:01:18.000Z",
    summary: {
      failedProviders: 0,
      okProviders: 3,
      partialProviders: 0,
      recordCountsByProvider: {
        bing: 0,
        cms: 0,
        ga4: 1,
        gsc: 1,
        pagespeed: 1
      },
      totalProviders: 3,
      totalRecords: 3
    }
  },
  {
    id: "sync_demo_002",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    status: "partial",
    providers: ["gsc", "pagespeed", "cms"],
    requestedByUserId: "user_demo",
    fixture: true,
    startedAt: "2026-05-21T09:00:00.000Z",
    endedAt: "2026-05-21T09:02:04.000Z",
    summary: {
      failedProviders: 1,
      okProviders: 1,
      partialProviders: 1,
      recordCountsByProvider: {
        bing: 0,
        cms: 1,
        ga4: 0,
        gsc: 0,
        pagespeed: 1
      },
      totalProviders: 3,
      totalRecords: 2
    }
  },
  {
    id: "sync_demo_001",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    status: "failed",
    providers: ["ga4"],
    requestedByUserId: "user_demo",
    fixture: true,
    startedAt: "2026-05-20T09:00:00.000Z",
    endedAt: "2026-05-20T09:00:25.000Z",
    summary: {
      failedProviders: 1,
      okProviders: 0,
      partialProviders: 0,
      recordCountsByProvider: {
        bing: 0,
        cms: 0,
        ga4: 0,
        gsc: 0,
        pagespeed: 0
      },
      totalProviders: 1,
      totalRecords: 0
    }
  }
];

export const demoConnectorSyncResults: ConnectorSyncResult[] = [
  {
    id: "sync_result_demo_gsc_003",
    syncRunId: "sync_demo_003",
    provider: "gsc",
    status: "ok",
    fetchedAt: fixtureStartedAt,
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "gsc",
        siteUrl: "https://example-clinic.com/",
        query: "seo clinic",
        page: "https://example-clinic.com/service/seo",
        country: "KR",
        device: "mobile",
        clicks: 12,
        impressions: 120,
        ctr: 0.1,
        position: 3.2,
        startDate: "2026-05-01",
        endDate: "2026-05-20"
      }
    ],
    createdAt: fixtureEndedAt
  },
  {
    id: "sync_result_demo_ga4_003",
    syncRunId: "sync_demo_003",
    provider: "ga4",
    status: "ok",
    fetchedAt: fixtureStartedAt,
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "ga4",
        propertyId: "demo-property",
        pagePath: "/service/seo",
        sessions: 94,
        engagedSessions: 61,
        conversions: 4,
        totalUsers: 73,
        startDate: "2026-05-01",
        endDate: "2026-05-20"
      }
    ],
    createdAt: fixtureEndedAt
  },
  {
    id: "sync_result_demo_pagespeed_003",
    syncRunId: "sync_demo_003",
    provider: "pagespeed",
    status: "ok",
    fetchedAt: fixtureStartedAt,
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "pagespeed",
        url: "https://example-clinic.com/",
        strategy: "mobile",
        performanceScore: 91,
        accessibilityScore: 88,
        seoScore: 95,
        largestContentfulPaintMs: 2120,
        cumulativeLayoutShift: 0.03,
        interactionToNextPaintMs: 180,
        fetchedAt: fixtureStartedAt
      }
    ],
    createdAt: fixtureEndedAt
  },
  {
    id: "sync_result_demo_cms_002",
    syncRunId: "sync_demo_002",
    provider: "cms",
    status: "partial",
    fetchedAt: "2026-05-21T09:00:00.000Z",
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "cms",
        cmsType: "headless",
        externalId: "page_service_seo",
        url: "https://example-clinic.com/service/seo",
        title: "SEO service page",
        status: "published",
        updatedAt: "2026-05-20T06:30:00.000Z"
      }
    ],
    createdAt: "2026-05-21T09:02:04.000Z"
  },
  {
    id: "sync_result_demo_gsc_002",
    syncRunId: "sync_demo_002",
    provider: "gsc",
    status: "failed",
    fetchedAt: "2026-05-21T09:00:00.000Z",
    fixture: true,
    recordCount: 0,
    records: [],
    createdAt: "2026-05-21T09:02:04.000Z"
  },
  {
    id: "sync_result_demo_pagespeed_002",
    syncRunId: "sync_demo_002",
    provider: "pagespeed",
    status: "ok",
    fetchedAt: "2026-05-21T09:00:00.000Z",
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "pagespeed",
        url: "https://example-clinic.com/service/seo",
        strategy: "desktop",
        performanceScore: 84,
        accessibilityScore: 90,
        seoScore: 86,
        largestContentfulPaintMs: 1840,
        cumulativeLayoutShift: 0.04,
        interactionToNextPaintMs: 130,
        fetchedAt: "2026-05-21T09:00:00.000Z"
      }
    ],
    createdAt: "2026-05-21T09:02:04.000Z"
  },
  {
    id: "sync_result_demo_ga4_001",
    syncRunId: "sync_demo_001",
    provider: "ga4",
    status: "failed",
    fetchedAt: "2026-05-20T09:00:00.000Z",
    fixture: true,
    recordCount: 0,
    records: [],
    createdAt: "2026-05-20T09:00:25.000Z"
  }
];

export async function loadConnectorSyncHistory(siteId: string): Promise<ConnectorSyncHistoryData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoConnectorSyncHistory(siteId);
  }

  try {
    const listResponse = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connector-sync-runs`, {
      cache: "no-store"
    });
    if (!listResponse.ok) {
      throw new Error(`Connector sync history request failed with ${listResponse.status}`);
    }

    const list = ConnectorSyncRunListResponseSchema.parse(await listResponse.json());
    const details = await Promise.all(
      list.connectorSyncRuns.map(async (run) => {
        const detailResponse = await fetch(`${apiBaseUrl}/connector-sync-runs/${encodeURIComponent(run.id)}`, {
          cache: "no-store"
        });
        if (!detailResponse.ok) {
          throw new Error(`Connector sync detail request failed with ${detailResponse.status}`);
        }

        return ConnectorSyncRunDetailResponseSchema.parse(await detailResponse.json());
      }),
    );

    return {
      errorMessage: null,
      resultsByRunId: groupConnectorSyncResultsByRun(details.flatMap((detail) => detail.results)),
      runs: list.connectorSyncRuns,
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoConnectorSyncHistory(siteId);
    return {
      ...fallback,
      errorMessage: error instanceof Error ? error.message : "Connector sync history request failed"
    };
  }
}

export function createDemoConnectorSyncHistory(siteId: string = demoSite.id): ConnectorSyncHistoryData {
  return {
    errorMessage: null,
    resultsByRunId: groupConnectorSyncResultsByRun(demoConnectorSyncResults),
    runs: demoConnectorSyncRuns.map((run) => ({ ...run, siteId })),
    source: "fixture"
  };
}

export function groupConnectorSyncResultsByRun(
  results: readonly ConnectorSyncResult[],
): Readonly<Record<string, readonly ConnectorSyncResult[]>> {
  return results.reduce<Record<string, ConnectorSyncResult[]>>((grouped, result) => {
    grouped[result.syncRunId] = [...(grouped[result.syncRunId] ?? []), result];
    return grouped;
  }, {});
}

export function summarizeConnectorSyncHistory(
  history: ConnectorSyncHistoryData,
): ConnectorSyncHistorySummary {
  const allResults = Object.values(history.resultsByRunId).flat();

  return {
    completed: history.runs.filter((run) => run.status === "completed").length,
    failed: history.runs.filter((run) => run.status === "failed").length,
    latestStatus: history.runs[0]?.status ?? "none",
    okResults: allResults.filter((result) => result.status === "ok").length,
    partial: history.runs.filter((run) => run.status === "partial").length,
    queued: history.runs.filter((run) => run.status === "queued" || run.status === "running").length,
    total: history.runs.length,
    totalRecords: allResults.reduce((total, result) => total + result.recordCount, 0)
  };
}

export function getConnectorSyncRunTone(status: string): ConnectorSyncRunTone {
  if (status === "completed") {
    return "complete";
  }

  if (status === "partial") {
    return "partial";
  }

  if (status === "failed") {
    return "failed";
  }

  return "queued";
}

export function getConnectorSyncResultTone(status: string): ConnectorSyncResultTone {
  if (status === "ok") {
    return "ok";
  }

  if (status === "partial") {
    return "partial";
  }

  return "failed";
}

export function formatConnectorProvider(provider: ConnectorProvider) {
  const labels = {
    bing: "Bing",
    cms: "CMS",
    ga4: "GA4",
    gsc: "GSC",
    pagespeed: "PageSpeed"
  } as const satisfies Record<ConnectorProvider, string>;

  return labels[provider];
}

export function formatConnectorProviders(providers: readonly ConnectorProvider[]) {
  return providers.map(formatConnectorProvider).join(", ");
}

export function formatSyncDuration(startedAt: string, endedAt: string | null) {
  if (endedAt === null) {
    return "Pending";
  }

  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
