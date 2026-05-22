import { describe, expect, it } from "vitest";

import {
  buildConnectorSyncResultUpsertArgs,
  classifyConnectorSyncRunStatus,
  createConnectorSyncRun,
  markConnectorSyncRunFailed,
  persistConnectorSyncJobResult,
  type ConnectorSyncPersistenceClient
} from "./connector-sync.js";

const providerResult = {
  provider: "pagespeed" as const,
  status: "ok" as const,
  fetchedAt: "2026-05-22T00:00:00.000Z",
  fixture: true,
  records: [
    {
      provider: "pagespeed" as const,
      url: "https://example.com/",
      strategy: "mobile" as const,
      performanceScore: 91,
      accessibilityScore: 88,
      seoScore: 95,
      largestContentfulPaintMs: 2120,
      cumulativeLayoutShift: 0.03,
      interactionToNextPaintMs: 180,
      fetchedAt: "2026-05-22T00:00:00.000Z"
    }
  ]
};

const summary = {
  failedProviders: 0,
  okProviders: 1,
  partialProviders: 0,
  recordCountsByProvider: {
    bing: 0,
    cms: 0,
    ga4: 0,
    gsc: 0,
    pagespeed: 1
  },
  totalProviders: 1,
  totalRecords: 1
};

describe("connector sync persistence helpers", () => {
  it("builds deterministic connector result upsert args", () => {
    expect(
      buildConnectorSyncResultUpsertArgs({
        syncRunId: "sync_1",
        providerResult
      }),
    ).toMatchObject({
      where: {
        syncRunId_provider: {
          syncRunId: "sync_1",
          provider: "pagespeed"
        }
      },
      create: {
        syncRunId: "sync_1",
        provider: "pagespeed",
        status: "ok",
        fixture: true,
        recordCount: 1,
        records: providerResult.records
      },
      update: {
        status: "ok",
        fixture: true,
        recordCount: 1,
        records: providerResult.records
      }
    });
  });

  it("creates queued connector sync runs", async () => {
    const creates: unknown[] = [];
    const client = createMockClient({
      createRun(args) {
        creates.push(args);
      }
    });

    const output = await createConnectorSyncRun(client, {
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      providers: ["pagespeed"]
    });

    expect(output).toEqual({ connectorSyncRunId: "sync_1", status: "queued" });
    expect(creates[0]).toMatchObject({
      data: {
        id: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        status: "queued",
        providers: ["pagespeed"],
        requestedByUserId: "user_1",
        fixture: true
      }
    });
  });

  it("upserts provider results and completes connector sync runs", async () => {
    const upserts: unknown[] = [];
    const updates: unknown[] = [];
    const client = createMockClient({
      updateRun(args) {
        updates.push(args);
      },
      upsertResult(args) {
        upserts.push(args);
      }
    });

    const output = await persistConnectorSyncJobResult(client, {
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      results: [providerResult],
      summary
    });

    expect(output).toEqual({
      connectorSyncRunId: "sync_1",
      resultsUpserted: 1,
      siteId: "site_1",
      status: "completed"
    });
    expect(upserts).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      where: { id: "sync_1" },
      data: {
        status: "completed",
        summary: {
          totalRecords: 1
        }
      }
    });
    expect((updates[0] as { data: { endedAt: unknown } }).data.endedAt).toBeInstanceOf(Date);
  });

  it("classifies partial and failed connector sync runs", () => {
    expect(
      classifyConnectorSyncRunStatus({
        connectorSyncRunId: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        results: [],
        summary: {
          ...summary,
          failedProviders: 1,
          okProviders: 1,
          totalProviders: 2
        }
      }),
    ).toBe("partial");
    expect(
      classifyConnectorSyncRunStatus({
        connectorSyncRunId: "sync_2",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        results: [],
        summary: {
          ...summary,
          failedProviders: 2,
          okProviders: 0,
          totalProviders: 2
        }
      }),
    ).toBe("failed");
  });

  it("marks connector sync runs failed with an error summary", async () => {
    const updates: unknown[] = [];
    const client = createMockClient({
      updateRun(args) {
        updates.push(args);
      }
    });

    const output = await markConnectorSyncRunFailed(client, {
      connectorSyncRunId: "sync_1",
      error: new Error("connector failed")
    });

    expect(output).toEqual({ connectorSyncRunId: "sync_1", status: "failed" });
    expect(updates[0]).toMatchObject({
      where: { id: "sync_1" },
      data: {
        status: "failed",
        summary: {
          error: {
            message: "connector failed",
            name: "Error"
          }
        }
      }
    });
  });
});

function createMockClient(overrides: {
  createRun?: (args: unknown) => void;
  updateRun?: (args: unknown) => void;
  upsertResult?: (args: unknown) => void;
}): ConnectorSyncPersistenceClient {
  return {
    connectorSyncRun: {
      async create(args) {
        overrides.createRun?.(args);
        return args;
      },
      async update(args) {
        overrides.updateRun?.(args);
        return args;
      }
    },
    connectorSyncResult: {
      async upsert(args) {
        overrides.upsertResult?.(args);
        return args;
      }
    }
  };
}
