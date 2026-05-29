import { describe, expect, it } from "vitest";

import type {
  ConnectorSyncPersistenceClient,
  CrawlPersistenceClient,
  GeoVisibilityPersistenceClient,
  SchemaRichResultValidationPersistenceClient,
  SchemaRecommendationRecheckPersistenceClient
} from "@searchops/db";

import {
  processAndPersistConnectorSyncJob,
  processAndPersistCrawlJob,
  processAndPersistGeoAnswerMonitorJob,
  processAndPersistSchemaRichResultValidationJob,
  processConnectorSyncJob,
  processCrawlJob,
  processGeoAnswerMonitorJob,
  processSchemaRichResultValidationJob
} from "./processor.js";

const normalHtml = `
<!doctype html>
<html>
  <head>
    <title>Crawl Fixture</title>
    <meta name="description" content="Fixture page for crawl worker." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://example.com/" />
  </head>
  <body>
    <h1>Crawl Fixture</h1>
    <a href="/about">About</a>
    <a href="https://external.example/reference">Reference</a>
    <img src="/hero.png" alt="Hero image" />
  </body>
</html>
`;

const noindexHtml = `
<!doctype html>
<html>
  <head>
    <title>Noindex Fixture</title>
    <meta name="robots" content="noindex" />
  </head>
  <body>
    <h1>Noindex Fixture</h1>
  </body>
</html>
`;

const serviceSchemaHtml = `
<!doctype html>
<html>
  <head>
    <title>Service Fixture</title>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": "SEO consulting"
      }
    </script>
  </head>
  <body>
    <h1>Service Fixture</h1>
  </body>
</html>
`;

describe("processCrawlJob", () => {
  it("returns an empty deterministic result when no page HTML is supplied", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 25,
      pages: []
    });

    expect(result).toEqual({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      status: "empty",
      snapshots: [],
      summary: {
        pagesRequested: 0,
        pagesProcessed: 0,
        internalLinks: 0,
        externalLinks: 0,
        images: 0,
        jsonLdBlocks: 0,
        noindexPages: 0
      }
    });
  });

  it("processes supplied HTML pages through crawler-core", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_2",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 25,
      pages: [
        {
          url: "https://example.com/",
          statusCode: null,
          html: normalHtml
        }
      ]
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toMatchObject({
      pagesRequested: 1,
      pagesProcessed: 1,
      internalLinks: 1,
      externalLinks: 1,
      images: 1,
      noindexPages: 0
    });
    expect(result.snapshots[0]?.title).toBe("Crawl Fixture");
  });

  it("respects maxPages when processing queued page inputs", () => {
    const result = processCrawlJob({
      crawlRunId: "crawl_3",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 1,
      pages: [
        {
          url: "https://example.com/",
          statusCode: null,
          html: normalHtml
        },
        {
          url: "https://example.com/noindex",
          statusCode: null,
          html: noindexHtml
        }
      ]
    });

    expect(result.summary.pagesRequested).toBe(2);
    expect(result.summary.pagesProcessed).toBe(1);
    expect(result.summary.noindexPages).toBe(0);
  });

  it("persists processed crawl results through the DB boundary", async () => {
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

    const result = await processAndPersistCrawlJob(
      {
        crawlRunId: "crawl_4",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 25,
        pages: [
          {
            url: "https://example.com/",
            statusCode: 200,
            html: normalHtml
          }
        ]
      },
      persistenceClient,
    );

    expect(result.status).toBe("completed");
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      create: {
        crawlRunId: "crawl_4",
        siteId: "site_1",
        url: "https://example.com/",
        statusCode: 200,
        title: "Crawl Fixture"
      }
    });
    expect(updates[0]).toMatchObject({
      where: { id: "crawl_4" },
      data: {
        status: "completed",
        summary: {
          pagesProcessed: 1
        }
      }
    });
  });

  it("fetches pages through the crawler when a runtime crawl job has no page fixtures", async () => {
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

    const result = await processAndPersistCrawlJob(
      {
        crawlRunId: "crawl_live",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        startUrl: "https://example.com/",
        maxPages: 2,
        pages: []
      },
      persistenceClient,
      {
        async crawlSite(input) {
          expect(input).toMatchObject({
            maxPages: 2,
            siteDomain: "example.com",
            startUrl: "https://example.com/"
          });
          return [
            {
              url: "https://example.com/",
              statusCode: 200,
              html: normalHtml
            }
          ];
        }
      },
    );

    expect(result.status).toBe("completed");
    expect(upserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
  });

  it("hands schema recommendation recheck crawl results to persistence", async () => {
    const recommendationUpdates: unknown[] = [];
    const workOrderUpdates: unknown[] = [];
    const persistenceClient: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
          return args;
        }
      },
      crawlRun: {
        async update(args) {
          return args;
        }
      }
    };
    const schemaRecommendationRecheckClient: SchemaRecommendationRecheckPersistenceClient = {
      schemaRecommendation: {
        async findUnique(args) {
          expect(args.where.id).toBe("schema_rec_1");
          return {
            evidence: {
              expectedType: "Service",
              observedTypes: []
            },
            id: "schema_rec_1",
            status: "converted",
            type: "Service",
            workOrder: {
              id: "wo_schema_1",
              status: "in_review"
            }
          };
        },
        async update(args) {
          recommendationUpdates.push(args);
          return {
            evidence: args.data.evidence,
            id: args.where.id,
            status: args.data.status
          };
        }
      },
      workOrder: {
        async update(args) {
          workOrderUpdates.push(args);
          return {
            id: args.where.id,
            status: args.data.status
          };
        }
      }
    };

    const result = await processAndPersistCrawlJob(
      {
        crawlRunId: "crawl_schema_recheck",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        schemaRecommendationId: "schema_rec_1",
        startUrl: "https://example.com/services/seo",
        maxPages: 1,
        pages: [
          {
            url: "https://example.com/services/seo",
            statusCode: 200,
            html: serviceSchemaHtml
          }
        ]
      },
      persistenceClient,
      {
        schemaRecommendationRecheckClient
      },
    );

    expect(result.status).toBe("completed");
    expect(recommendationUpdates[0]).toMatchObject({
      data: {
        evidence: {
          observedTypes: ["Service"]
        },
        status: "resolved"
      },
      where: {
        id: "schema_rec_1"
      }
    });
    expect(workOrderUpdates[0]).toEqual({
      data: {
        status: "done"
      },
      where: {
        id: "wo_schema_1"
      }
    });
  });

  it("marks the crawl run as failed when runtime crawling fails", async () => {
    const updates: unknown[] = [];
    const persistenceClient: CrawlPersistenceClient = {
      urlRecord: {
        async upsert(args) {
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

    await expect(
      processAndPersistCrawlJob(
        {
          crawlRunId: "crawl_failed",
          siteId: "site_1",
          siteDomain: "example.com",
          requestedByUserId: "user_1",
          startUrl: "https://example.com/",
          maxPages: 2,
          pages: []
        },
        persistenceClient,
        {
          async crawlSite() {
            throw new Error("crawl failed");
          }
        },
      ),
    ).rejects.toThrow(/crawl failed/);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      where: { id: "crawl_failed" },
      data: {
        status: "failed",
        summary: {
          error: {
            message: "crawl failed"
          }
        }
      }
    });
  });

  it("processes connector sync jobs through fixture batch sync", async () => {
    const result = await processConnectorSyncJob({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      providers: ["pagespeed", "gsc"]
    });

    expect(result).toMatchObject({
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      summary: {
        failedProviders: 0,
        okProviders: 2,
        totalProviders: 2
      }
    });
    expect(result.results.map((syncResult) => syncResult.provider)).toEqual(["gsc", "pagespeed"]);
    expect(result.summary.totalRecords).toBeGreaterThan(0);
  });

  it("passes connector sync payload fields into the sync adapter", async () => {
    const result = await processConnectorSyncJob(
      {
        organizationId: "org_2",
        connectorSyncRunId: "sync_2",
        siteId: "site_2",
        siteDomain: "example.org",
        requestedByUserId: "user_2",
        fetchedAt: "2026-05-22T01:00:00.000Z",
        providers: ["cms"]
      },
      {
        async syncConnectors(input) {
          expect(input).toEqual({
            fetchedAt: "2026-05-22T01:00:00.000Z",
            providers: ["cms"]
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
      },
    );

    expect(result).toMatchObject({
      organizationId: "org_2",
      connectorSyncRunId: "sync_2",
      siteId: "site_2",
      summary: {
        totalRecords: 0
      }
    });
  });

  it("persists connector sync job results through the DB boundary", async () => {
    const runUpdates: unknown[] = [];
    const resultUpserts: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
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

    const result = await processAndPersistConnectorSyncJob(
      {
        connectorSyncRunId: "sync_3",
        organizationId: "org_3",
        siteId: "site_3",
        siteDomain: "example.net",
        requestedByUserId: "user_3",
        fetchedAt: "2026-05-22T02:00:00.000Z",
        providers: ["pagespeed"]
      },
      persistenceClient,
    );

    expect(result).toMatchObject({
      connectorSyncRunId: "sync_3",
      summary: {
        totalProviders: 1
      }
    });
    expect(resultUpserts).toHaveLength(1);
    expect(runUpdates[0]).toMatchObject({
      where: { id: "sync_3" },
      data: {
        status: "completed",
        summary: {
          totalProviders: 1
        }
      }
    });
  });

  it("reads stored OAuth credentials when live connector sync is enabled", async () => {
    const runUpdates: unknown[] = [];
    const resultUpserts: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorOAuthCredential: {
        async findMany(args) {
          expect(args).toEqual({
            where: {
              provider: {
                in: ["gsc", "ga4"]
              },
              siteId: "site_live",
              status: "connected"
            }
          });

          return [
            {
              accessToken: "gsc_token",
              externalAccountEmail: null,
              provider: "gsc",
              refreshToken: null,
              status: "connected",
              tokenExpiresAt: null,
              tokenType: "Bearer"
            },
            {
              accessToken: "ga4_token",
              externalAccountEmail: null,
              provider: "ga4",
              refreshToken: null,
              status: "connected",
              tokenExpiresAt: null,
              tokenType: "Bearer"
            }
          ];
        },
        async update(args) {
          return {
            accessToken: args.data.accessToken,
            externalAccountEmail: null,
            provider: args.where.siteId_provider.provider,
            refreshToken: null,
            status: "connected",
            tokenExpiresAt: args.data.tokenExpiresAt,
            tokenType: args.data.tokenType ?? "Bearer"
          };
        }
      },
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

    const result = await processAndPersistConnectorSyncJob(
      {
        connectorSyncRunId: "sync_live",
        organizationId: "org_live",
        siteId: "site_live",
        siteDomain: "searchops-ai-web.vercel.app",
        requestedByUserId: "user_live",
        fetchedAt: "2026-05-27T00:00:00.000Z",
        providers: ["gsc", "ga4", "pagespeed"]
      },
      persistenceClient,
      {
        fetch: (async (url) => {
          const value = String(url);

          if (value.includes("searchAnalytics")) {
            return new Response(
              JSON.stringify({
                rows: [
                  {
                    keys: [
                      "searchops ai",
                      "https://searchops-ai-web.vercel.app/",
                      "kor",
                      "desktop"
                    ],
                    clicks: 1,
                    impressions: 10,
                    ctr: 0.1,
                    position: 2
                  }
                ]
              }),
              { status: 200 }
            );
          }

          if (value.includes("analyticsdata.googleapis.com")) {
            return new Response(
              JSON.stringify({
                rows: [
                  {
                    dimensionValues: [{ value: "/" }],
                    metricValues: [
                      { value: "5" },
                      { value: "4" },
                      { value: "1" },
                      { value: "5" }
                    ]
                  }
                ]
              }),
              { status: 200 }
            );
          }

          return new Response(
            JSON.stringify({
              lighthouseResult: {
                categories: {
                  accessibility: { score: 1 },
                  performance: { score: 1 },
                  seo: { score: 1 }
                },
                audits: {
                  "cumulative-layout-shift": { numericValue: 0 },
                  "interaction-to-next-paint": { numericValue: 100 },
                  "largest-contentful-paint": { numericValue: 1200 }
                }
              }
            }),
            { status: 200 }
          );
        }) as typeof fetch,
        ga4PropertyId: "123456789",
        liveExternalApis: "enabled",
        pagespeedApiKey: "pagespeed_key"
      },
    );

    expect(result.results.map((item) => [item.provider, item.fixture, item.status])).toEqual([
      ["gsc", false, "ok"],
      ["ga4", false, "ok"],
      ["pagespeed", false, "ok"]
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 0,
      okProviders: 3,
      totalRecords: 3
    });
    expect(resultUpserts).toHaveLength(3);
    expect(runUpdates[0]).toMatchObject({
      data: {
        status: "completed"
      },
      where: { id: "sync_live" }
    });
  });

  it("refreshes expired Google OAuth credentials before live connector sync", async () => {
    const credentialUpdates: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorOAuthCredential: {
        async findMany() {
          return [
            {
              accessToken: "expired_gsc_token",
              externalAccountEmail: null,
              provider: "gsc",
              refreshToken: "gsc_refresh",
              status: "connected",
              tokenExpiresAt: new Date("2026-05-27T10:00:00.000Z"),
              tokenType: "Bearer"
            }
          ];
        },
        async update(args) {
          credentialUpdates.push(args);
          return {
            accessToken: args.data.accessToken,
            externalAccountEmail: null,
            provider: args.where.siteId_provider.provider,
            refreshToken: "gsc_refresh",
            status: "connected",
            tokenExpiresAt: args.data.tokenExpiresAt,
            tokenType: args.data.tokenType ?? "Bearer"
          };
        }
      },
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
    const calls: string[] = [];

    const result = await processAndPersistConnectorSyncJob(
      {
        connectorSyncRunId: "sync_refresh",
        organizationId: "org_live",
        siteId: "site_live",
        siteDomain: "searchops-ai-web.vercel.app",
        requestedByUserId: "user_live",
        fetchedAt: "2026-05-27T12:10:00.000Z",
        providers: ["gsc"]
      },
      persistenceClient,
      {
        fetch: (async (url, init) => {
          calls.push(String(url));

          if (String(url).includes("oauth2.googleapis.com")) {
            expect(String(init?.body)).toContain("refresh_token=gsc_refresh");
            return new Response(
              JSON.stringify({
                access_token: "fresh_gsc_token",
                expires_in: 3600,
                token_type: "Bearer"
              }),
              { status: 200 }
            );
          }

          expect((init?.headers as Record<string, string>).authorization).toBe(
            "Bearer fresh_gsc_token",
          );
          return new Response(
            JSON.stringify({
              rows: [
                {
                  keys: [
                    "searchops ai",
                    "https://searchops-ai-web.vercel.app/",
                    "kor",
                    "desktop"
                  ],
                  clicks: 1,
                  impressions: 10,
                  ctr: 0.1,
                  position: 2
                }
              ]
            }),
            { status: 200 }
          );
        }) as typeof fetch,
        googleOAuthClientId: "client_id",
        googleOAuthClientSecret: "client_secret",
        liveExternalApis: "enabled",
        now: () => new Date("2026-05-27T12:10:00.000Z")
      },
    );

    expect(calls).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fsearchops-ai-web.vercel.app%2F/searchAnalytics/query"
    ]);
    expect(credentialUpdates[0]).toMatchObject({
      data: {
        accessToken: "fresh_gsc_token",
        tokenExpiresAt: new Date("2026-05-27T13:10:00.000Z"),
        tokenType: "Bearer"
      },
      where: {
        siteId_provider: {
          provider: "gsc",
          siteId: "site_live"
        }
      }
    });
    expect(result.results[0]).toMatchObject({
      fixture: false,
      provider: "gsc",
      status: "ok"
    });
  });

  it("scopes Google OAuth refresh failures to provider results", async () => {
    const runUpdates: unknown[] = [];
    const resultUpserts: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
      connectorOAuthCredential: {
        async findMany() {
          return [
            {
              accessToken: "expired_gsc_token",
              externalAccountEmail: null,
              provider: "gsc",
              refreshToken: "revoked_refresh",
              status: "connected",
              tokenExpiresAt: new Date("2026-05-27T10:00:00.000Z"),
              tokenType: "Bearer"
            }
          ];
        },
        async update(args) {
          return {
            accessToken: args.data.accessToken,
            externalAccountEmail: null,
            provider: args.where.siteId_provider.provider,
            refreshToken: "revoked_refresh",
            status: "connected",
            tokenExpiresAt: args.data.tokenExpiresAt,
            tokenType: args.data.tokenType ?? "Bearer"
          };
        }
      },
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

    const result = await processAndPersistConnectorSyncJob(
      {
        connectorSyncRunId: "sync_refresh_failed",
        organizationId: "org_live",
        siteId: "site_live",
        siteDomain: "searchops-ai-web.vercel.app",
        requestedByUserId: "user_live",
        fetchedAt: "2026-05-27T12:10:00.000Z",
        providers: ["gsc", "pagespeed"]
      },
      persistenceClient,
      {
        fetch: (async (url) => {
          if (String(url).includes("oauth2.googleapis.com")) {
            return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
          }

          if (String(url).includes("pagespeedonline")) {
            return new Response(
              JSON.stringify({
                lighthouseResult: {
                  categories: {
                    accessibility: { score: 1 },
                    performance: { score: 1 },
                    seo: { score: 1 }
                  },
                  audits: {
                    "cumulative-layout-shift": { numericValue: 0 },
                    "interaction-to-next-paint": { numericValue: 100 },
                    "largest-contentful-paint": { numericValue: 1200 }
                  }
                }
              }),
              { status: 200 }
            );
          }

          return new Response(JSON.stringify({ error: "expired" }), { status: 401 });
        }) as typeof fetch,
        googleOAuthClientId: "client_id",
        googleOAuthClientSecret: "client_secret",
        liveExternalApis: "enabled",
        now: () => new Date("2026-05-27T12:10:00.000Z"),
        pagespeedApiKey: "pagespeed_key"
      },
    );

    expect(result.results.map((item) => [item.provider, item.status])).toEqual([
      ["gsc", "failed"],
      ["pagespeed", "ok"]
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 1,
      okProviders: 1,
      totalProviders: 2
    });
    expect(resultUpserts).toHaveLength(2);
    expect(runUpdates[0]).toMatchObject({
      data: {
        status: "partial"
      },
      where: { id: "sync_refresh_failed" }
    });
  });

  it("marks connector sync runs failed when connector processing fails", async () => {
    const runUpdates: unknown[] = [];
    const persistenceClient: ConnectorSyncPersistenceClient = {
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
          return args;
        }
      }
    };

    await expect(
      processAndPersistConnectorSyncJob(
        {
          connectorSyncRunId: "sync_failed",
          organizationId: "org_3",
          siteId: "site_3",
          siteDomain: "example.net",
          requestedByUserId: "user_3",
          fetchedAt: "2026-05-22T02:00:00.000Z",
          providers: ["pagespeed"]
        },
        persistenceClient,
        {
          async syncConnectors() {
            throw new Error("connector failed");
          }
        },
      ),
    ).rejects.toThrow(/connector failed/);

    expect(runUpdates[0]).toMatchObject({
      where: { id: "sync_failed" },
      data: {
        status: "failed",
        summary: {
          error: {
            message: "connector failed"
          }
        }
      }
    });
  });

  it("processes GEO answer monitor jobs through an injected monitor adapter", async () => {
    const result = await processGeoAnswerMonitorJob(
      {
        organizationId: "org_geo",
        siteId: "site_geo",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_geo",
        observedAt: "2026-05-26T00:00:00.000Z",
        providers: ["chatgpt"],
        target: {
          siteId: "site_geo",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
          locale: "ko-KR",
          market: "KR"
        },
        queries: [{ query: "best seo clinic", locale: "ko-KR" }]
      },
      {
        async monitorGeoAnswers(input) {
          expect(input).toMatchObject({
            observedAt: "2026-05-26T00:00:00.000Z",
            providers: ["chatgpt"],
            target: {
              siteId: "site_geo",
              domain: "exampleclinic.com"
            }
          });

          const observations = [
            {
              provider: "chatgpt" as const,
              query: "best seo clinic",
              locale: "ko-KR",
              answerText: "Example Clinic is cited for SEO clinic research.",
              citedUrls: ["https://exampleclinic.com/services/seo"],
              observedAt: "2026-05-26T00:00:00.000Z",
              source: "connector" as const
            }
          ];

          return {
            observations,
            results: [
              {
                provider: "chatgpt",
                observations,
                generatedBy: "connector",
                liveExternalApis: "enabled"
              }
            ]
          };
        }
      },
    );

    expect(result).toMatchObject({
      organizationId: "org_geo",
      siteId: "site_geo",
      observedAt: "2026-05-26T00:00:00.000Z",
      monitorResults: [
        {
          provider: "chatgpt",
          generatedBy: "connector",
          liveExternalApis: "enabled"
        }
      ],
      visibilityReport: {
        generatedBy: "deterministic",
        status: "strong",
        score: 90,
        mentionRate: 100,
        citationRate: 100
      }
    });
  });

  it("persists GEO answer monitor results through the DB boundary", async () => {
    const creates: unknown[] = [];
    const persistenceClient: GeoVisibilityPersistenceClient = {
      geoVisibilityReport: {
        async create(args) {
          creates.push(args);
          return args;
        }
      }
    };

    const result = await processAndPersistGeoAnswerMonitorJob(
      {
        organizationId: "org_geo",
        siteId: "site_geo",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_geo",
        observedAt: "2026-05-26T01:00:00.000Z",
        providers: ["perplexity"],
        target: {
          siteId: "site_geo",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
          locale: "ko-KR",
          market: "KR"
        },
        queries: [{ query: "medical seo checklist", locale: "ko-KR" }]
      },
      persistenceClient,
      {
        async monitorGeoAnswers() {
          const observations = [
            {
              provider: "perplexity" as const,
              query: "medical seo checklist",
              locale: "ko-KR",
              answerText: "Example Clinic publishes a medical SEO checklist.",
              citedUrls: ["https://exampleclinic.com/blog/medical-seo-checklist"],
              observedAt: "2026-05-26T01:00:00.000Z",
              source: "connector" as const
            }
          ];

          return {
            observations,
            results: [
              {
                provider: "perplexity",
                observations,
                generatedBy: "connector",
                liveExternalApis: "enabled"
              }
            ]
          };
        }
      },
    );

    expect(result.visibilityReport.generatedBy).toBe("deterministic");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      data: {
        brandName: "Example Clinic",
        domain: "exampleclinic.com",
        generatedBy: "deterministic",
        siteId: "site_geo",
        status: "strong"
      }
    });
  });

  it("processes schema rich-result validation jobs through an injected validator", async () => {
    const result = await processSchemaRichResultValidationJob(
      {
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
        recommendedFields: ["description"]
      },
      {
        async validateRichResult(input) {
          expect(input).toMatchObject({
            type: "Service",
            url: "https://example.com/services/seo"
          });

          return {
            type: "Service",
            url: "https://example.com/services/seo",
            status: "eligible",
            eligible: true,
            requiredFields: ["@context", "@type", "name", "provider", "url"],
            missingRequiredFields: [],
            recommendedFields: ["description"],
            missingRecommendedFields: [],
            issues: [],
            generatedBy: "connector",
            liveExternalApis: "enabled"
          };
        }
      },
    );

    expect(result).toMatchObject({
      recommendationId: "schema_rec_1",
      requestedAt: "2026-05-26T00:00:00.000Z",
      validationResult: {
        generatedBy: "connector",
        liveExternalApis: "enabled",
        status: "eligible"
      }
    });
  });

  it("persists schema rich-result validation results through the DB boundary", async () => {
    const updates: unknown[] = [];
    const persistenceClient: SchemaRichResultValidationPersistenceClient = {
      schemaRecommendation: {
        async findUnique(args) {
          expect(args.where.id).toBe("schema_rec_2");
          return {
            evidence: {
              expectedType: "Service",
              observedTypes: []
            },
            id: "schema_rec_2"
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

    const result = await processAndPersistSchemaRichResultValidationJob(
      {
        recommendationId: "schema_rec_2",
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
      },
      persistenceClient,
    );

    expect(result.validationResult.generatedBy).toBe("deterministic");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      data: {
        evidence: {
          richResultValidation: {
            result: {
              status: "eligible"
            }
          }
        }
      },
      where: {
        id: "schema_rec_2"
      }
    });
  });
});
