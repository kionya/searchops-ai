import { describe, expect, it } from "vitest";

import {
  buildConnectorSyncResultUpsertArgs,
  classifyConnectorSyncRunStatus,
  createConnectorSyncRun,
  getProviderAccountForConnectorSync,
  getSiteConnectorForConnectorSync,
  getSiteForConnectorSync,
  listConnectorOAuthCredentialsForSync,
  markConnectorSyncRunFailed,
  persistConnectorSyncJobResult,
  updateConnectorOAuthCredentialForSync,
  updateProviderAccountCredentialForConnectorSync,
  updateProviderAccountStatusForConnectorSync,
  updateSiteConnectorStatusForConnectorSync,
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
  setupRequiredProviders: 0,
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
    expect(
      classifyConnectorSyncRunStatus({
        connectorSyncRunId: "sync_3",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        results: [],
        summary: {
          ...summary,
          okProviders: 0,
          setupRequiredProviders: 1,
          totalProviders: 1
        }
      }),
    ).toBe("partial");
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

  it("lists and updates OAuth credentials for live connector sync", async () => {
    const updates: unknown[] = [];
    const client = createMockClient({
      findCredentials(args) {
          expect(args).toEqual({
            where: {
              organizationId: "org_1",
              provider: {
              in: ["gsc", "ga4"]
            },
            siteId: "site_1",
            status: "connected"
          }
        });
      },
      updateCredential(args) {
        updates.push(args);
      }
    });

    await expect(
      listConnectorOAuthCredentialsForSync(client, {
        organizationId: "org_1",
        providers: ["gsc", "ga4"],
        siteId: "site_1"
      }),
    ).resolves.toEqual([
      {
        accessToken: "access",
        externalAccountEmail: null,
        provider: "gsc",
        refreshToken: "refresh",
        status: "connected",
        tokenExpiresAt: new Date("2026-05-27T11:00:00.000Z"),
        tokenType: "Bearer"
      }
    ]);
    await expect(
      updateConnectorOAuthCredentialForSync(client, {
        accessToken: "fresh",
        provider: "gsc",
        siteId: "site_1",
        tokenExpiresAt: new Date("2026-05-27T12:00:00.000Z"),
        tokenType: "Bearer"
      }),
    ).resolves.toMatchObject({
      accessToken: "fresh",
      provider: "gsc"
    });
    expect(updates[0]).toMatchObject({
      data: {
        accessToken: "fresh",
        tokenExpiresAt: new Date("2026-05-27T12:00:00.000Z")
      },
      where: {
        siteId_provider: {
          provider: "gsc",
          siteId: "site_1"
        }
      }
    });
  });

  it("keeps encrypted credential reads and writes tenant scoped", async () => {
    const calls: unknown[] = [];
    const account = {
      authType: "oauth2" as const,
      credentialAuthTag: "tag",
      credentialCiphertext: "ciphertext",
      credentialIv: "iv",
      encryptionKeyId: "v1",
      encryptionVersion: 1 as const,
      id: "pa_1",
      organizationId: "org_1",
      provider: "google" as const,
      scopes: ["scope"],
      status: "connected" as const,
      tokenExpiresAt: null,
      updatedAt: "2026-07-14T00:00:00.000Z"
    };
    const connector = {
      config: {},
      createdAt: "2026-07-14T00:00:00.000Z",
      externalResourceId: "properties/111",
      id: "sc_1",
      lastCheckedAt: null,
      lastErrorCode: null,
      organizationId: "org_1",
      provider: "ga4" as const,
      providerAccountId: "pa_1",
      siteId: "site_1",
      status: "connected" as const,
      updatedAt: "2026-07-14T00:00:00.000Z"
    };
    const client: ConnectorSyncPersistenceClient = {
      ...createMockClient({}),
      providerCredentials: {
        async getProviderAccount(input) {
          calls.push(["account", input]);
          return account;
        },
        async getSite(input) {
          calls.push(["site", input]);
          return { id: input.siteId, organizationId: input.organizationId };
        },
        async getSiteConnector(input) {
          calls.push(["connector", input]);
          return connector;
        },
        async updateProviderAccountCredential(input) {
          calls.push(["account-credential", input]);
          return true;
        },
        async updateProviderAccountStatus(input) {
          calls.push(["account-status", input]);
        },
        async updateSiteConnectorStatus(input) {
          calls.push(["connector-status", input]);
        }
      }
    };

    await expect(
      getSiteForConnectorSync(client, { organizationId: "org_1", siteId: "site_1" }),
    ).resolves.toEqual({ id: "site_1", organizationId: "org_1" });
    await expect(
      getSiteConnectorForConnectorSync(client, {
        organizationId: "org_1",
        provider: "ga4",
        siteId: "site_1"
      }),
    ).resolves.toEqual(connector);
    await expect(
      getProviderAccountForConnectorSync(client, {
        organizationId: "org_1",
        providerAccountId: "pa_1"
      }),
    ).resolves.toEqual(account);
    await expect(
      updateProviderAccountCredentialForConnectorSync(client, {
        encryptedCredential: {
          credentialAuthTag: "new-tag",
          credentialCiphertext: "new-ciphertext",
          credentialIv: "new-iv",
          encryptionKeyId: "v2",
          encryptionVersion: 1
        },
        expectedUpdatedAt: "2026-07-14T00:00:00.000Z",
        organizationId: "org_1",
        providerAccountId: "pa_1",
        status: "connected",
        tokenExpiresAt: new Date("2026-07-14T01:00:00.000Z")
      }),
    ).resolves.toBe(true);
    await updateProviderAccountStatusForConnectorSync(client, {
      organizationId: "org_1",
      providerAccountId: "pa_1",
      status: "expired"
    });
    await updateSiteConnectorStatusForConnectorSync(client, {
      lastCheckedAt: new Date("2026-07-14T00:00:00.000Z"),
      lastErrorCode: "credential_expired",
      organizationId: "org_1",
      provider: "ga4",
      siteId: "site_1",
      status: "expired"
    });

    expect(calls).toEqual([
      ["site", { organizationId: "org_1", siteId: "site_1" }],
      ["connector", { organizationId: "org_1", provider: "ga4", siteId: "site_1" }],
      ["account", { organizationId: "org_1", providerAccountId: "pa_1" }],
      [
        "account-credential",
        expect.objectContaining({
          expectedUpdatedAt: "2026-07-14T00:00:00.000Z",
          organizationId: "org_1",
          providerAccountId: "pa_1"
        })
      ],
      ["account-status", { organizationId: "org_1", providerAccountId: "pa_1", status: "expired" }],
      [
        "connector-status",
        expect.objectContaining({ organizationId: "org_1", provider: "ga4", siteId: "site_1" })
      ]
    ]);
  });

  it("persists only approved credential source values in the batch summary", async () => {
    const updates: unknown[] = [];
    const client = createMockClient({ updateRun: (args) => updates.push(args) });

    await persistConnectorSyncJobResult(client, {
      connectorSyncRunId: "sync_sources",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      organizationId: "org_1",
      requestedByUserId: "user_1",
      results: [providerResult],
      siteDomain: "example.com",
      siteId: "site_1",
      summary: {
        ...summary,
        credentialSources: { ga4: "encrypted", pagespeed: "platform" }
      }
    });

    expect(updates[0]).toMatchObject({
      data: {
        summary: {
          credentialSources: { ga4: "encrypted", pagespeed: "platform" }
        }
      }
    });
    await expect(
      persistConnectorSyncJobResult(client, {
        connectorSyncRunId: "sync_invalid_source",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        organizationId: "org_1",
        requestedByUserId: "user_1",
        results: [],
        siteDomain: "example.com",
        siteId: "site_1",
        summary: {
          ...summary,
          credentialSources: { ga4: "plaintext" as "encrypted" }
        }
      }),
    ).rejects.toThrow();
  });
});

function createMockClient(overrides: {
  createRun?: (args: unknown) => void;
  findCredentials?: (args: unknown) => void;
  updateRun?: (args: unknown) => void;
  updateCredential?: (args: unknown) => void;
  upsertResult?: (args: unknown) => void;
}): ConnectorSyncPersistenceClient {
  return {
    connectorOAuthCredential: {
      async findMany(args) {
        overrides.findCredentials?.(args);
        return [
          {
            accessToken: "access",
            externalAccountEmail: null,
            provider: "gsc",
            refreshToken: "refresh",
            status: "connected",
            tokenExpiresAt: new Date("2026-05-27T11:00:00.000Z"),
            tokenType: "Bearer"
          }
        ];
      },
      async update(args) {
        overrides.updateCredential?.(args);
        return {
          accessToken: args.data.accessToken,
          externalAccountEmail: null,
          provider: args.where.siteId_provider.provider,
          refreshToken: "refresh",
          status: "connected",
          tokenExpiresAt: args.data.tokenExpiresAt,
          tokenType: args.data.tokenType ?? "Bearer"
        };
      }
    },
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
