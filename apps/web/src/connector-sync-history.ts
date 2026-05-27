import {
  ConnectorProviderListSchema,
  ConnectorSyncRunDetailResponseSchema,
  ConnectorSyncRunListResponseSchema,
  CreateConnectorSyncRunRequestSchema,
  CreateConnectorSyncRunResponseSchema,
  type ConnectorProvider,
  type ConnectorSyncResult,
  type ConnectorSyncRun
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import { demoSite } from "./work-order-board";

export type ConnectorSyncHistorySource = "api" | "fixture";
export type ConnectorSyncTriggerStatus = "failed" | "fixture" | "queued";
export type ConnectorSyncRunTone = "complete" | "failed" | "partial" | "queued";
export type ConnectorSyncResultTone = "failed" | "ok" | "partial";

export const connectorProviderOptions = ["gsc", "ga4", "pagespeed", "bing", "cms"] as const satisfies readonly ConnectorProvider[];

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

export interface ConnectorSyncTriggerResult {
  readonly connectorSyncRunId: string | null;
  readonly errorMessage: string | null;
  readonly jobId: string | null;
  readonly providers: readonly ConnectorProvider[];
  readonly source: ConnectorSyncHistorySource;
  readonly status: ConnectorSyncTriggerStatus;
}

export interface ConnectorSyncTriggerFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
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
        query: "SEO 클리닉",
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
        title: "SEO 서비스 페이지",
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
      throw new Error(`커넥터 동기화 이력 요청 실패: ${listResponse.status}`);
    }

    const list = ConnectorSyncRunListResponseSchema.parse(await listResponse.json());
    const details = await Promise.all(
      list.connectorSyncRuns.map(async (run) => {
        const detailResponse = await fetch(`${apiBaseUrl}/connector-sync-runs/${encodeURIComponent(run.id)}`, {
          cache: "no-store"
        });
        if (!detailResponse.ok) {
          throw new Error(`커넥터 동기화 상세 요청 실패: ${detailResponse.status}`);
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
      errorMessage: error instanceof Error ? error.message : "커넥터 동기화 이력 요청에 실패했습니다"
    };
  }
}

export async function triggerConnectorSync(
  siteId: string,
  providers: readonly ConnectorProvider[],
): Promise<ConnectorSyncTriggerResult> {
  const input = CreateConnectorSyncRunRequestSchema.parse({ providers });
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      connectorSyncRunId: null,
      errorMessage: null,
      jobId: null,
      providers: input.providers,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/connector-sync-runs`, {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`커넥터 동기화 실행 요청 실패: ${response.status}`);
    }

    const output = CreateConnectorSyncRunResponseSchema.parse(await response.json());
    return {
      connectorSyncRunId: output.connectorSyncRun.id,
      errorMessage: null,
      jobId: output.job.id,
      providers: output.connectorSyncRun.providers,
      source: "api",
      status: "queued"
    };
  } catch (error) {
    return {
      connectorSyncRunId: null,
      errorMessage: error instanceof Error ? error.message : "커넥터 동기화 실행 요청에 실패했습니다",
      jobId: null,
      providers: input.providers,
      source: "api",
      status: "failed"
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

export function parseConnectorProviders(input: readonly FormDataEntryValue[]) {
  return ConnectorProviderListSchema.parse(input.map((value) => String(value)));
}

export function getConnectorSyncTriggerFeedback(
  status: string | undefined,
  runId: string | undefined,
): ConnectorSyncTriggerFeedback | null {
  if (status === "queued") {
    return {
      message: runId ? `커넥터 동기화가 대기열에 등록되었습니다: ${runId}` : "커넥터 동기화가 대기열에 등록되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: 실제 커넥터 동기화 작업을 대기열에 넣으려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "커넥터 동기화 요청에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
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

export function getConnectorSyncRunErrorMessage(run: ConnectorSyncRun): string | null {
  if (run.summary === null) {
    return null;
  }

  const summary = run.summary as Record<string, unknown>;
  const error = summary.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    return typeof message === "string" && message.length > 0 ? message : null;
  }

  return null;
}

export function getConnectorSyncRunProviderErrorMessages(run: ConnectorSyncRun): string[] {
  if (run.summary === null) {
    return [];
  }

  const summary = run.summary as Record<string, unknown>;
  const providerErrors = summary.providerErrors;
  if (!providerErrors || typeof providerErrors !== "object" || Array.isArray(providerErrors)) {
    return [];
  }

  return Object.entries(providerErrors)
    .map(([provider, error]) => {
      if (!error || typeof error !== "object" || Array.isArray(error)) {
        return null;
      }

      const message = (error as Record<string, unknown>).message;
      if (typeof message !== "string" || message.length === 0) {
        return null;
      }

      return `${formatConnectorProvider(provider as ConnectorProvider)}: ${message}`;
    })
    .filter((message): message is string => message !== null);
}

export function getConnectorSyncProviderErrorMessage(
  run: ConnectorSyncRun | undefined,
  provider: ConnectorProvider,
): string | null {
  if (!run || run.summary === null) {
    return null;
  }

  const summary = run.summary as Record<string, unknown>;
  const providerErrors = summary.providerErrors;
  if (!providerErrors || typeof providerErrors !== "object" || Array.isArray(providerErrors)) {
    return null;
  }

  const error = (providerErrors as Record<string, unknown>)[provider];
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return null;
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message.length > 0 ? message : null;
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
    return "대기 중";
  }

  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
