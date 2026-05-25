import { describe, expect, it } from "vitest";

import type {
  ConnectorSyncPersistenceClient,
  CrawlPersistenceClient,
  SchemaRecommendationRecheckPersistenceClient
} from "@searchops/db";

import {
  processAndPersistConnectorSyncJob,
  processAndPersistCrawlJob,
  processConnectorSyncJob,
  processCrawlJob
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
});
