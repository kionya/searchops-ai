import { describe, expect, it } from "vitest";

import type {
  AeoReadinessReportRecord,
  ConnectorSyncResult,
  ConnectorSyncRun,
  ContentBrief,
  Organization,
  SeoIssue,
  Site,
  WorkOrder
} from "@searchops/types";

import { createMemoryConnectorSyncQueue, createMemoryCrawlRunQueue } from "./queue.js";
import { createMemoryRepository } from "./repository.js";
import { buildApiServer } from "./server.js";

const createdAt = "2026-05-19T00:00:00.000Z";
const seededOrganization: Organization = {
  id: "org_seed",
  name: "Seed Organization",
  createdAt
};
const seededSite: Site = {
  id: "site_seed",
  organizationId: "org_seed",
  domain: "exampleclinic.com",
  name: "Example Clinic",
  industry: "medical",
  language: "ko",
  country: "KR",
  createdAt
};
const seededConnectorSyncRun: ConnectorSyncRun = {
  id: "sync_seed",
  organizationId: "org_seed",
  siteId: "site_seed",
  status: "completed",
  providers: ["pagespeed"],
  requestedByUserId: "user_connector",
  fixture: true,
  startedAt: "2026-05-22T00:00:00.000Z",
  endedAt: "2026-05-22T00:01:00.000Z",
  summary: {
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
  }
};
const seededConnectorSyncResult: ConnectorSyncResult = {
  id: "sync_result_seed",
  syncRunId: "sync_seed",
  provider: "pagespeed",
  status: "ok",
  fetchedAt: "2026-05-22T00:00:00.000Z",
  fixture: true,
  recordCount: 1,
  records: [
    {
      provider: "pagespeed",
      url: "https://exampleclinic.com/",
      strategy: "mobile",
      performanceScore: 91,
      accessibilityScore: 88,
      seoScore: 95,
      largestContentfulPaintMs: 2120,
      cumulativeLayoutShift: 0.03,
      interactionToNextPaintMs: 180,
      fetchedAt: "2026-05-22T00:00:00.000Z"
    }
  ],
  createdAt
};
const seededContentBrief: ContentBrief = {
  id: "brief_seed",
  siteId: "site_seed",
  keywordId: "keyword_seed",
  primaryKeyword: "seo clinic",
  locale: "ko-KR",
  intent: "commercial",
  title: "SEO clinic content brief",
  status: "draft",
  summary: "Seed draft-only content brief.",
  outline: [
    {
      heading: "Direct answer",
      purpose: "Answer the target query.",
      targetQuestions: ["What does SEO clinic include?"],
      acceptanceCriteria: ["Includes one concise answer block."]
    }
  ],
  faqQuestions: ["What does SEO clinic include?"],
  acceptanceCriteria: ["Do not auto-publish the brief to any CMS or external channel."],
  generationMode: "deterministic",
  publishPolicy: "draft_only",
  createdAt
};
const seededAeoReadinessReport: AeoReadinessReportRecord = {
  id: "aeo_report_seed",
  siteId: "site_seed",
  keywordId: "keyword_seed",
  phrase: "seo clinic",
  locale: "ko-KR",
  intent: "commercial",
  pageUrl: "https://exampleclinic.com/service/seo",
  status: "needs_work",
  score: 68,
  checks: [
    {
      checkId: "ANSWER_SUMMARY_PRESENT",
      status: "warning",
      score: 60,
      evidence: {
        url: "https://exampleclinic.com/service/seo",
        observedValue: false,
        expectedValue: true,
        sourceField: "answerBlocks"
      }
    }
  ],
  generatedBy: "deterministic",
  evaluatedAt: "2026-05-23T00:00:00.000Z",
  createdAt
};
const seededWorkOrder: WorkOrder = {
  id: "wo_seed",
  organizationId: "org_seed",
  siteId: "site_seed",
  seoIssueId: "issue_seed",
  status: "open",
  priority: "p1",
  title: "/services missing H1 fix",
  description: null,
  problem: "The page has no H1 heading.",
  evidence: {
    url: "https://exampleclinic.com/services",
    observedValue: 0,
    expectedValue: 1,
    sourceField: "h1Count"
  },
  impact: "Search and answer engines may not identify the primary page topic.",
  instructions: ["Add one descriptive H1 near the top of the page."],
  ownerType: "content",
  acceptanceCriteria: ["Re-crawl reports h1Count = 1."],
  verificationMethod: "Run a crawler recheck for the URL.",
  estimatedEffort: "s",
  relatedIssues: ["MULTIPLE_H1", "TITLE_MISSING"],
  assignedTo: null,
  dueDate: null,
  createdAt,
  updatedAt: createdAt
};
const seededSeoIssue: SeoIssue = {
  id: "issue_seed",
  crawlRunId: "crawl_seed",
  urlRecordId: null,
  ruleId: "H1_MISSING",
  severity: "high",
  status: "open",
  title: "Missing H1",
  evidence: {
    url: "https://exampleclinic.com/services",
    observedValue: 0,
    expectedValue: 1,
    sourceField: "h1Count"
  },
  createdAt
};

function buildTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({ organizations: [seededOrganization] })
  });
}

function buildCrawlRunTestContext() {
  const crawlRunQueue = createMemoryCrawlRunQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite]
    }),
    crawlRunQueue
  });

  return { server, crawlRunQueue };
}

function buildConnectorSyncTestContext() {
  const connectorSyncQueue = createMemoryConnectorSyncQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite]
    }),
    connectorSyncQueue
  });

  return { server, connectorSyncQueue };
}

function buildConnectorSyncHistoryTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      connectorSyncRuns: [seededConnectorSyncRun],
      connectorSyncResults: [seededConnectorSyncResult]
    })
  });
}

function buildContentBriefTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      contentBriefs: [seededContentBrief]
    })
  });
}

function buildAeoReadinessTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      aeoReadinessReports: [seededAeoReadinessReport]
    })
  });
}

function buildWorkOrderTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      seoIssues: [seededSeoIssue],
      workOrders: [seededWorkOrder]
    })
  });
}

function buildWorkOrderRecheckTestContext() {
  const crawlRunQueue = createMemoryCrawlRunQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      seoIssues: [seededSeoIssue],
      workOrders: [seededWorkOrder]
    }),
    crawlRunQueue
  });

  return { server, crawlRunQueue };
}

describe("api foundation", () => {
  it("serves a health check", async () => {
    const server = buildTestServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "api" });
  }, 10_000);

  it("provides mock auth context without real login", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-mock-user-id": "user_test",
        "x-mock-organization-id": "org_seed"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: "user_test",
      organizationId: "org_seed",
      source: "mock"
    });
  });

  it("creates and lists organizations", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      payload: { name: "New Organization" }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ name: "New Organization" });

    const listResponse = await server.inject({ method: "GET", url: "/organizations" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().organizations).toHaveLength(2);
  });

  it("creates, reads, updates, lists, and deletes sites", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations/org_seed/sites",
      payload: {
        domain: "ExampleClinic.COM",
        name: "Example Clinic",
        industry: "medical"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({
      organizationId: "org_seed",
      domain: "exampleclinic.com",
      name: "Example Clinic",
      industry: "medical",
      language: "ko",
      country: "KR"
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/organizations/org_seed/sites"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().sites).toHaveLength(1);

    const readResponse = await server.inject({ method: "GET", url: `/sites/${created.id}` });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().domain).toBe("exampleclinic.com");

    const updateResponse = await server.inject({
      method: "PATCH",
      url: `/sites/${created.id}`,
      payload: { name: "Updated Clinic", language: "en" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ name: "Updated Clinic", language: "en" });

    const deleteResponse = await server.inject({ method: "DELETE", url: `/sites/${created.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const missingResponse = await server.inject({ method: "GET", url: `/sites/${created.id}` });
    expect(missingResponse.statusCode).toBe(404);
  });

  it("returns clear validation errors", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/organizations/org_seed/sites",
      payload: { domain: "not-a-domain" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("domain");
  });

  it("creates crawl runs and enqueues crawl jobs", async () => {
    const { server, crawlRunQueue } = buildCrawlRunTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      headers: {
        "x-mock-user-id": "user_crawler"
      },
      payload: {
        maxPages: 3
      }
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.crawlRun).toMatchObject({
      siteId: "site_seed",
      status: "queued",
      endedAt: null,
      summary: {
        startUrl: "https://exampleclinic.com/",
        maxPages: 3
      }
    });
    expect(body.job).toMatchObject({
      id: "job_0001",
      name: "crawl",
      payload: {
        crawlRunId: body.crawlRun.id,
        siteId: "site_seed",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_crawler",
        startUrl: "https://exampleclinic.com/",
        maxPages: 3,
        pages: []
      }
    });
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
  });

  it("allows crawl start URLs on site subdomains", async () => {
    const { server, crawlRunQueue } = buildCrawlRunTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        startUrl: "https://blog.exampleclinic.com/",
        maxPages: 3
      }
    });

    expect(response.statusCode).toBe(202);
    expect(crawlRunQueue.listQueuedCrawlJobs()[0]?.payload).toMatchObject({
      siteDomain: "exampleclinic.com",
      startUrl: "https://blog.exampleclinic.com/"
    });
  });

  it("rejects crawl start URLs outside the site domain or private network", async () => {
    const { server } = buildCrawlRunTestContext();
    const externalResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        startUrl: "https://example.net/",
        maxPages: 3
      }
    });
    const privateResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        startUrl: "http://169.254.169.254/latest/meta-data",
        maxPages: 3
      }
    });

    expect(externalResponse.statusCode).toBe(400);
    expect(privateResponse.statusCode).toBe(400);
    expect(externalResponse.json().message).toContain("startUrl");
    expect(privateResponse.json().message).toContain("startUrl");
  });

  it("returns 404 when creating a crawl run for a missing site", async () => {
    const { server } = buildCrawlRunTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_missing/crawl-runs",
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found", message: "Site not found" });
  });

  it("enqueues connector sync jobs with default providers", async () => {
    const { server, connectorSyncQueue } = buildConnectorSyncTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/connector-sync-runs",
      headers: {
        "x-mock-user-id": "user_connector"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.connectorSyncRun).toMatchObject({
      id: "sync_0001",
      organizationId: "org_seed",
      siteId: "site_seed",
      status: "queued",
      providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
      requestedByUserId: "user_connector",
      fixture: true,
      endedAt: null,
      summary: null
    });
    expect(body.job).toMatchObject({
      id: "job_0001",
      name: "connector-sync",
      payload: {
        connectorSyncRunId: "sync_0001",
        organizationId: "org_seed",
        siteId: "site_seed",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_connector",
        providers: ["gsc", "ga4", "pagespeed", "bing", "cms"]
      }
    });
    expect(body.job.payload.fetchedAt).toEqual(expect.any(String));
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()).toHaveLength(1);
  });

  it("enqueues connector sync jobs for selected providers", async () => {
    const { server, connectorSyncQueue } = buildConnectorSyncTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/connector-sync-runs",
      payload: {
        providers: ["pagespeed", "cms"]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().connectorSyncRun).toMatchObject({
      id: "sync_0001",
      providers: ["pagespeed", "cms"],
      status: "queued"
    });
    expect(response.json().job.payload).toMatchObject({
      connectorSyncRunId: "sync_0001",
      providers: ["pagespeed", "cms"]
    });
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()[0]?.payload.providers).toEqual([
      "pagespeed",
      "cms"
    ]);
  });

  it("validates connector sync provider lists", async () => {
    const { server, connectorSyncQueue } = buildConnectorSyncTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/connector-sync-runs",
      payload: {
        providers: ["gsc", "gsc"]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("providers");
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()).toHaveLength(0);
  });

  it("returns 404 when creating connector sync jobs for a missing site", async () => {
    const { server, connectorSyncQueue } = buildConnectorSyncTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_missing/connector-sync-runs",
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()).toHaveLength(0);
  });

  it("lists connector sync run history for a site", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/connector-sync-runs"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().connectorSyncRuns).toHaveLength(1);
    expect(response.json().connectorSyncRuns[0]).toMatchObject({
      id: "sync_seed",
      siteId: "site_seed",
      status: "completed",
      providers: ["pagespeed"],
      summary: {
        totalProviders: 1,
        totalRecords: 1
      }
    });
  });

  it("reads connector sync run details with persisted results", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/connector-sync-runs/sync_seed"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connectorSyncRun: {
        id: "sync_seed",
        status: "completed"
      },
      results: [
        {
          id: "sync_result_seed",
          provider: "pagespeed",
          recordCount: 1
        }
      ]
    });
  });

  it("returns 404 for missing connector sync history resources", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/connector-sync-runs"
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/connector-sync-runs/sync_missing"
    });

    expect(listResponse.statusCode).toBe(404);
    expect(detailResponse.statusCode).toBe(404);
    expect(listResponse.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(detailResponse.json()).toEqual({
      error: "not_found",
      message: "Connector sync run not found"
    });
  });

  it("creates deterministic AEO readiness reports and persists them", async () => {
    const server = buildAeoReadinessTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/aeo-readiness-reports",
      payload: {
        keyword: {
          phrase: "seo clinic price comparison",
          intent: "commercial"
        },
        candidatePage: {
          url: "https://exampleclinic.com/service/seo",
          title: "SEO clinic service",
          metaDescription: "SEO clinic service page",
          h1: "SEO clinic",
          h2: ["What does SEO clinic include?"],
          wordCount: 320,
          schemaTypes: [],
          questionHeadings: ["What does SEO clinic include?"],
          answerBlocks: []
        },
        evaluatedAt: "2026-05-23T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        siteId: "site_seed",
        keywordId: "keyword_0001",
        phrase: "seo clinic price comparison",
        locale: "ko-KR",
        intent: "commercial",
        status: "needs_work",
        generatedBy: "deterministic",
        evaluatedAt: "2026-05-23T00:00:00.000Z"
      },
      readinessReport: {
        status: "needs_work",
        generatedBy: "deterministic"
      }
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/aeo-readiness-reports"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().reports).toHaveLength(2);
    expect(listResponse.json().reports[0]).toMatchObject({
      phrase: "seo clinic price comparison",
      generatedBy: "deterministic"
    });
  });

  it("lists persisted AEO readiness report history", async () => {
    const server = buildAeoReadinessTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/aeo-readiness-reports"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reports).toHaveLength(1);
    expect(response.json().reports[0]).toMatchObject({
      id: "aeo_report_seed",
      phrase: "seo clinic",
      score: 68,
      generatedBy: "deterministic"
    });
  });

  it("returns 404 for missing AEO readiness report site resources", async () => {
    const server = buildAeoReadinessTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/aeo-readiness-reports"
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/aeo-readiness-reports",
      payload: {
        keyword: {
          phrase: "seo clinic"
        }
      }
    });

    expect(listResponse.statusCode).toBe(404);
    expect(createResponse.statusCode).toBe(404);
  });

  it("validates AEO readiness report request payloads", async () => {
    const server = buildAeoReadinessTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/aeo-readiness-reports",
      payload: {
        keyword: {
          phrase: ""
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("keyword");
  });

  it("creates deterministic content brief drafts and persists them", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic price comparison",
          intent: "commercial"
        },
        candidatePage: {
          url: "https://exampleclinic.com/service/seo",
          title: "SEO clinic service",
          metaDescription: "SEO clinic service page",
          h1: "SEO clinic",
          h2: ["What does SEO clinic include?"],
          wordCount: 320,
          schemaTypes: [],
          questionHeadings: ["What does SEO clinic include?"],
          answerBlocks: []
        },
        evaluatedAt: "2026-05-23T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      contentBrief: {
        siteId: "site_seed",
        keywordId: "keyword_0001",
        primaryKeyword: "seo clinic price comparison",
        status: "draft",
        generationMode: "deterministic",
        publishPolicy: "draft_only"
      },
      draft: {
        keywordId: null,
        status: "draft",
        publishPolicy: "draft_only"
      },
      readinessReport: {
        status: "needs_work",
        generatedBy: "deterministic"
      }
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/content-briefs"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().contentBriefs).toHaveLength(2);
    expect(listResponse.json().contentBriefs[0]).toMatchObject({
      primaryKeyword: "seo clinic price comparison",
      publishPolicy: "draft_only"
    });
  });

  it("reads persisted content brief details", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/content-briefs/brief_seed"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      contentBrief: {
        id: "brief_seed",
        primaryKeyword: "seo clinic",
        status: "draft",
        outline: [
          {
            heading: "Direct answer"
          }
        ]
      }
    });
  });

  it("rejects invalid content brief mapper input", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic"
        },
        readinessReport: {
          keyword: {
            siteId: "site_seed",
            phrase: "different keyword"
          },
          pageUrl: null,
          status: "not_ready",
          score: 14,
          checks: [
            {
              checkId: "KEYWORD_INTENT_DEFINED",
              status: "pass",
              score: 100,
              evidence: {
                url: null,
                observedValue: "informational",
                expectedValue: "Non-null deterministic keyword intent",
                sourceField: "keyword.intent"
              }
            }
          ],
          generatedBy: "deterministic",
          evaluatedAt: "2026-05-23T00:00:00.000Z"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("readinessReport");
  });

  it("returns 404 for missing content brief resources", async () => {
    const server = buildContentBriefTestServer();
    const missingSiteListResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/content-briefs"
    });
    const missingSiteCreateResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic"
        }
      }
    });
    const missingBriefResponse = await server.inject({
      method: "GET",
      url: "/content-briefs/brief_missing"
    });

    expect(missingSiteListResponse.statusCode).toBe(404);
    expect(missingSiteCreateResponse.statusCode).toBe(404);
    expect(missingBriefResponse.statusCode).toBe(404);
  });

  it("validates crawl run request payloads", async () => {
    const { server } = buildCrawlRunTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        maxPages: 0
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("maxPages");
  });

  it("lists work orders for a site", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workOrders).toHaveLength(1);
    expect(response.json().workOrders[0]).toMatchObject({
      id: "wo_seed",
      siteId: "site_seed",
      status: "open",
      priority: "p1",
      ownerType: "content"
    });
  });

  it("reads and updates work order board fields", async () => {
    const server = buildWorkOrderTestServer();
    const readResponse = await server.inject({
      method: "GET",
      url: "/work-orders/wo_seed"
    });

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toMatchObject({ id: "wo_seed", assignedTo: null });

    const updateResponse = await server.inject({
      method: "PATCH",
      url: "/work-orders/wo_seed",
      payload: {
        status: "in_progress",
        priority: "p0",
        assignedTo: "user_content_1",
        dueDate: "2026-05-21T00:00:00.000Z"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: "wo_seed",
      status: "in_progress",
      priority: "p0",
      assignedTo: "user_content_1",
      dueDate: "2026-05-21T00:00:00.000Z"
    });
    expect(updateResponse.json().updatedAt).not.toBe(createdAt);
  });

  it("clears work order assignee and due date", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/work-orders/wo_seed",
      payload: {
        assignedTo: null,
        dueDate: null
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ assignedTo: null, dueDate: null });
  });

  it("returns 404 for missing work board resources", async () => {
    const server = buildWorkOrderTestServer();
    const missingSiteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/work-orders"
    });
    const missingWorkOrderResponse = await server.inject({
      method: "GET",
      url: "/work-orders/wo_missing"
    });

    expect(missingSiteResponse.statusCode).toBe(404);
    expect(missingSiteResponse.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(missingWorkOrderResponse.statusCode).toBe(404);
    expect(missingWorkOrderResponse.json()).toEqual({
      error: "not_found",
      message: "Work order not found"
    });
  });

  it("validates work order update payloads", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/work-orders/wo_seed",
      payload: {
        status: "shipped"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("status");
  });

  it("queues a work order recheck from issue evidence", async () => {
    const { server, crawlRunQueue } = buildWorkOrderRecheckTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/work-orders/wo_seed/recheck",
      headers: {
        "x-mock-user-id": "user_recheck"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.workOrder).toMatchObject({
      id: "wo_seed",
      status: "in_review"
    });
    expect(body.crawlRun).toMatchObject({
      siteId: "site_seed",
      status: "queued",
      summary: {
        startUrl: "https://exampleclinic.com/services",
        maxPages: 1
      }
    });
    expect(body.job.payload).toMatchObject({
      crawlRunId: body.crawlRun.id,
      siteId: "site_seed",
      siteDomain: "exampleclinic.com",
      requestedByUserId: "user_recheck",
      startUrl: "https://exampleclinic.com/services",
      maxPages: 1,
      pages: []
    });
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
  });

  it("rejects work order rechecks outside the site scope", async () => {
    const { server, crawlRunQueue } = buildWorkOrderRecheckTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/work-orders/wo_seed/recheck",
      payload: {
        startUrl: "https://example.net/services"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("recheck startUrl");
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(0);
  });

  it("marks a work order and linked SEO issue resolved", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/work-orders/wo_seed/resolve"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      workOrder: {
        id: "wo_seed",
        status: "done"
      },
      seoIssue: {
        id: "issue_seed",
        status: "resolved"
      }
    });
  });

  it("returns 404 for missing work order recheck resources", async () => {
    const { server } = buildWorkOrderRecheckTestContext();
    const recheckResponse = await server.inject({
      method: "POST",
      url: "/work-orders/wo_missing/recheck"
    });
    const resolveResponse = await server.inject({
      method: "POST",
      url: "/work-orders/wo_missing/resolve"
    });

    expect(recheckResponse.statusCode).toBe(404);
    expect(resolveResponse.statusCode).toBe(404);
  });
});
