import { describe, expect, it } from "vitest";

import type {
  ConnectorSyncPersistenceClient,
  CrawlPersistenceClient,
  GeoVisibilityPersistenceClient,
  SchemaRichResultValidationPersistenceClient
} from "@searchops/db";

import { buildDeadLetterJobPayload } from "./dead-letter.js";
import {
  createConnectorSyncJobProcessor,
  createCrawlJobProcessor,
  createGeoAnswerMonitorJobProcessor,
  createSchemaRichResultValidationJobProcessor,
  formatWorkerFailureLog,
  shouldEnableGeoLiveApis
} from "./runtime.js";

const html = `
<!doctype html>
<html>
  <head><title>Runtime Fixture</title></head>
  <body><h1>Runtime Fixture</h1></body>
</html>
`;

describe("worker runtime", () => {
  it("processes BullMQ crawl job data through persistence", async () => {
    const upserts: unknown[] = [];
    const updates: unknown[] = [];
    const persistenceClient: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          upserts.push(args);
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          updates.push(args);
          return args;
        }
      }
    };
    const processor = createCrawlJobProcessor(persistenceClient, {
      async crawlSite() {
        return [
          {
            url: "https://example.com/",
            statusCode: 200,
            html
          }
        ];
      }
    });

    const result = await processor({
      data: {
        crawlRunId: "crawl_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 1,
        pages: []
      }
    });

    expect(result).toMatchObject({
      crawlRunId: "crawl_1",
      status: "completed",
      summary: {
        pagesProcessed: 1
      }
    });
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it("processes BullMQ connector sync job data through fixture sync", async () => {
    const runUpdates: unknown[] = [];
    const resultUpserts: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorSyncOwnership: createOwnedConnectorSyncPort(runUpdates, resultUpserts),
      connectorSyncRun: {
        async create(args) {
          return args;
        },
        async update(args) {
          runUpdates.push(args);
          return args;
        }
      },
      connectorSyncResult: {
        async upsert(args) {
          resultUpserts.push(args);
          return args;
        }
      }
    };
    const processor = createConnectorSyncJobProcessor(persistenceClient, {
      async syncConnectors(input) {
        expect(input).toEqual({
          fetchedAt: "2026-05-22T00:00:00.000Z",
          providers: ["gsc", "ga4"]
        });

        return {
          results: [],
          summary: {
            failedProviders: 0,
            okProviders: 0,
            partialProviders: 0,
            recordCountsByProvider: {
              bing: 0,
              cms: 0,
              ga4: 0,
              gsc: 0,
              pagespeed: 0
            },
            setupRequiredProviders: 0,
            totalProviders: 0,
            totalRecords: 0
          }
        };
      }
    });

    const result = await processor({
      data: {
        connectorSyncRunId: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        providers: ["gsc", "ga4"]
      }
    });
    expect(runUpdates).toHaveLength(1);
    expect(resultUpserts).toHaveLength(0);

    expect(result).toMatchObject({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      summary: {
        totalRecords: 0
      }
    });
  });

  it("forwards the connector job tenant context to live credential resolution", async () => {
    const resolvedJobs: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorSyncOwnership: createOwnedConnectorSyncPort([], []),
      connectorSyncRun: {
        async create(args) {
          return args;
        },
        async update(args) {
          return args;
        }
      },
      connectorSyncResult: {
        async upsert(args) {
          return args;
        }
      }
    };
    const processor = createConnectorSyncJobProcessor(persistenceClient, {
      liveExternalApis: "enabled",
      async resolveConnectorProviderConfigs(job) {
        resolvedJobs.push(job);
        return {
          configs: {},
          credentialSources: {},
          failures: { ga4: "account_missing" }
        };
      }
    });

    const result = await processor({
      data: {
        connectorSyncRunId: "sync_live_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        providers: ["ga4"]
      }
    });

    expect(resolvedJobs).toEqual([
      expect.objectContaining({
        organizationId: "org_1",
        providers: ["ga4"],
        siteId: "site_1"
      })
    ]);
    expect(result.results).toEqual([
      expect.objectContaining({
        fixture: false,
        provider: "ga4",
        status: "setup_required"
      })
    ]);
  });

  it("processes BullMQ GEO answer monitor job data through persistence", async () => {
    const creates: unknown[] = [];
    const persistenceClient: GeoVisibilityPersistenceClient = {
      geoVisibilityOwnership: createOwnedGeoVisibilityPort(creates),
      geoVisibilityReport: {
        async create(args) {
          creates.push(args);
          return args;
        }
      }
    };
    const processor = createGeoAnswerMonitorJobProcessor(persistenceClient);

    const result = await processor({
      data: {
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_1",
        observedAt: "2026-05-26T00:00:00.000Z",
        providers: ["chatgpt"],
        target: {
          siteId: "site_1",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
          locale: "ko-KR",
          market: "KR"
        },
        queries: [{ query: "best seo clinic", locale: "ko-KR" }]
      }
    });

    expect(result).toMatchObject({
      organizationId: "org_1",
      siteId: "site_1",
      monitorResults: [
        {
          provider: "chatgpt",
          generatedBy: "fixture"
        }
      ],
      visibilityReport: {
        generatedBy: "deterministic",
        observations: [expect.objectContaining({ source: "fixture" })]
      }
    });
    expect(creates).toHaveLength(1);
  });

  it("forwards GEO job organization and site identity to the per-job resolver", async () => {
    const resolvedJobs: unknown[] = [];
    const persistenceClient: GeoVisibilityPersistenceClient = {
      geoVisibilityOwnership: createOwnedGeoVisibilityPort([]),
      geoVisibilityReport: {
        async create(args) {
          return args;
        }
      }
    };
    const processor = createGeoAnswerMonitorJobProcessor(persistenceClient, {
      liveExternalApis: "enabled",
      async resolveGeoProviderAdapters(job) {
        resolvedJobs.push(job);
        return { adapters: {}, credentialSources: {}, failures: {} };
      }
    });

    const result = await processor({
      data: {
        organizationId: "org_geo_runtime",
        siteId: "site_geo_runtime",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_geo",
        observedAt: "2026-07-14T00:00:00.000Z",
        providers: ["gemini"],
        target: {
          siteId: "site_geo_runtime",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
          locale: "ko-KR",
          market: "KR"
        },
        queries: [{ query: "best seo clinic", locale: "ko-KR" }]
      }
    });

    expect(resolvedJobs).toEqual([
      expect.objectContaining({
        organizationId: "org_geo_runtime",
        providers: ["gemini"],
        siteId: "site_geo_runtime"
      })
    ]);
    expect(result.monitorResults).toEqual([
      expect.objectContaining({ provider: "gemini", status: "setup_required" })
    ]);
  });

  it("does not forward a foreign GEO site to the per-job resolver", async () => {
    let resolverCalls = 0;
    let writes = 0;
    const persistenceClient: GeoVisibilityPersistenceClient = {
      geoVisibilityOwnership: {
        async verify() { return false; },
        async persist() { writes += 1; return false; }
      },
      geoVisibilityReport: {
        async create(args) { writes += 1; return args; }
      }
    };
    const processor = createGeoAnswerMonitorJobProcessor(persistenceClient, {
      liveExternalApis: "enabled",
      async resolveGeoProviderAdapters() {
        resolverCalls += 1;
        return { adapters: {}, credentialSources: {}, failures: {} };
      }
    });

    await expect(processor({ data: geoRuntimeJob() })).rejects.toThrow(
      "geo_site_ownership_mismatch",
    );
    expect(resolverCalls).toBe(0);
    expect(writes).toBe(0);
  });

  it("enables GEO live mode only for supported platform keys or encrypted BYOK", () => {
    expect(
      shouldEnableGeoLiveApis({ geoPlatformApiKeys: { geo_chatgpt: "platform-key" } }),
    ).toBe(true);
    expect(shouldEnableGeoLiveApis({ credentialStorageMode: "encrypted" })).toBe(true);
    expect(
      shouldEnableGeoLiveApis({
        bingApiKey: "unrelated-bing-key",
        pagespeedApiKey: "unrelated-pagespeed-key",
      } as never),
    ).toBe(false);
    expect(
      shouldEnableGeoLiveApis({
        geoPlatformApiKeys: { geo_copilot: "unsupported-key" },
      } as never),
    ).toBe(false);
  });

  it("processes BullMQ schema rich-result validation job data through persistence", async () => {
    const updates: unknown[] = [];
    const persistenceClient: SchemaRichResultValidationPersistenceClient = {
      schemaRecommendation: {
        async findUnique() {
          return {
            evidence: {
              expectedType: "Service",
              observedTypes: []
            },
            id: "schema_rec_1"
          };
        },
        async update(args) {
          updates.push(args);
          return {
            evidence: {
              persisted: true
            },
            id: args.where.id
          };
        }
      }
    };
    const processor = createSchemaRichResultValidationJobProcessor(persistenceClient, {
      async validateRichResult(input) {
        expect(input.type).toBe("Service");

        return {
          type: "Service",
          url: "https://example.com/services/seo",
          status: "eligible",
          eligible: true,
          requiredFields: ["@context", "@type", "name", "provider", "url"],
          missingRequiredFields: [],
          recommendedFields: [],
          missingRecommendedFields: [],
          issues: [],
          generatedBy: "connector",
          liveExternalApis: "enabled"
        };
      }
    });

    const result = await processor({
      data: {
        recommendationId: "schema_rec_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_schema",
        requestedAt: "2026-05-26T00:00:00.000Z",
        url: "https://example.com/services/seo",
        type: "Service",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Service",
          name: "SEO service",
          provider: {
            "@type": "Organization",
            name: "Example"
          },
          url: "https://example.com/services/seo"
        },
        requiredFields: ["@context", "@type", "name", "provider", "url"],
        recommendedFields: []
      }
    });

    expect(result).toMatchObject({
      recommendationId: "schema_rec_1",
      validationResult: {
        generatedBy: "connector",
        status: "eligible"
      }
    });
    expect(updates).toHaveLength(1);
  });

  it("builds deterministic dead-letter payloads for failed worker jobs", () => {
    expect(
      buildDeadLetterJobPayload({
        error: new Error("https://provider.test?access_token=tenant-secret"),
        failedAt: new Date("2026-05-25T00:00:00.000Z"),
        job: {
          attemptsMade: 3,
          id: "42",
          name: "crawl"
        },
        queueName: "searchops-crawl"
      }),
    ).toEqual({
      originalQueue: "searchops-crawl",
      originalJobName: "crawl",
      originalJobId: "42",
      failedReason: "worker_job_failed",
      attemptsMade: 3,
      failedAt: "2026-05-25T00:00:00.000Z"
    });
  });

  it("formats worker failure logs without external error details", () => {
    const message = formatWorkerFailureLog(
      new Error("https://provider.test?client_secret=tenant-secret"),
    );

    expect(message).toBe("SearchOps worker job failed code=worker_job_failed");
    expect(message).not.toContain("tenant-secret");
  });
});

function createOwnedConnectorSyncPort(
  runUpdates: unknown[],
  resultUpserts: unknown[],
): ConnectorSyncPersistenceClient["connectorSyncOwnership"] {
  return {
    async markFailed(input) {
      runUpdates.push(input);
      return true;
    },
    async persist(input) {
      resultUpserts.push(...input.result.results);
      runUpdates.push(input);
      return true;
    },
    async verify() {
      return true;
    }
  };
}

function createOwnedGeoVisibilityPort(
  writes: unknown[],
): GeoVisibilityPersistenceClient["geoVisibilityOwnership"] {
  return {
    async persist(input) {
      writes.push(input.result);
      return true;
    },
    async verify() {
      return true;
    }
  };
}

function geoRuntimeJob() {
  return {
    organizationId: "org_geo_runtime",
    siteId: "site_geo_runtime",
    siteDomain: "exampleclinic.com",
    requestedByUserId: "user_geo",
    observedAt: "2026-07-14T00:00:00.000Z",
    providers: ["gemini" as const],
    target: {
      siteId: "site_geo_runtime",
      brandName: "Example Clinic",
      domain: "exampleclinic.com",
      locale: "ko-KR",
      market: "KR"
    },
    queries: [{ query: "best seo clinic", locale: "ko-KR" }]
  };
}
