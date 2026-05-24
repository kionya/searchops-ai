import { describe, expect, it } from "vitest";

import type {
  AeoReadinessReportRecord,
  ComplianceFlag,
  ConnectorSyncResult,
  ConnectorSyncRun,
  ContentBrief,
  CrawlerPageSnapshot,
  GeoVisibilityReportRecord,
  Organization,
  SchemaRecommendationRecord,
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
const seededGeoVisibilityReport: GeoVisibilityReportRecord = {
  id: "geo_report_seed",
  siteId: "site_seed",
  brandName: "Example Clinic",
  domain: "exampleclinic.com",
  locale: "ko-KR",
  market: "KR",
  status: "visible",
  score: 72,
  mentionRate: 67,
  citationRate: 67,
  competitorCitationRate: 33,
  queryCount: 3,
  providerCount: 2,
  observations: [
    {
      provider: "chatgpt",
      query: "seo clinic",
      locale: "ko-KR",
      answerText: "Example Clinic is mentioned for SEO clinic research.",
      citedUrls: ["https://exampleclinic.com/services/seo"],
      observedAt: "2026-05-24T00:00:00.000Z",
      source: "fixture"
    }
  ],
  citations: [
    {
      url: "https://exampleclinic.com/services/seo",
      domain: "exampleclinic.com",
      owned: true
    }
  ],
  checks: [
    {
      checkId: "BRAND_MENTIONED",
      status: "warning",
      score: 60,
      evidence: {
        observedValue: 67,
        expectedValue: ">= 70",
        sourceField: "observations.answerText"
      }
    }
  ],
  generatedBy: "deterministic",
  evaluatedAt: "2026-05-24T00:00:00.000Z",
  createdAt
};
const seededComplianceFlag: ComplianceFlag = {
  id: "compliance_flag_seed",
  organizationId: "org_seed",
  siteId: "site_seed",
  workOrderId: null,
  subjectType: "page_copy",
  subjectId: "page_seed",
  ruleId: "ABSOLUTE_SAFETY_CLAIM",
  url: "https://exampleclinic.com/services/botox",
  riskLevel: "high",
  status: "open",
  title: "Absolute safety claim",
  message: "The content uses absolute safety language.",
  evidence: {
    url: "https://exampleclinic.com/services/botox",
    excerpt: "This clinic treatment is completely safe.",
    observedValue: "completely safe",
    expectedValue: "Medical content should avoid absolute safety claims.",
    sourceField: "text",
    match: "completely safe"
  },
  recommendation: "Replace absolute safety language with balanced wording.",
  replacementSuggestion: "Explain that risks vary by individual.",
  generatedBy: "deterministic",
  createdAt,
  updatedAt: createdAt
};
const seededSchemaRecommendation: SchemaRecommendationRecord = {
  id: "schema_rec_seed",
  siteId: "site_seed",
  pageUrl: "https://exampleclinic.com/services/seo",
  type: "Service",
  priority: "p1",
  status: "open",
  reason: "The service page has no Service JSON-LD block.",
  evidence: {
    url: "https://exampleclinic.com/services/seo",
    observedTypes: ["WebPage"],
    expectedType: "Service",
    sourceField: "jsonLd"
  },
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "SEO clinic",
    provider: {
      "@type": "MedicalClinic",
      name: "Example Clinic"
    },
    url: "https://exampleclinic.com/services/seo"
  },
  instructions: ["Add Service JSON-LD to the service detail page."],
  requiredFields: ["@context", "@type", "name", "provider", "url"],
  recommendedFields: ["description", "serviceType"],
  generatedBy: "deterministic",
  createdAt,
  updatedAt: createdAt
};
const seededWorkOrder: WorkOrder = {
  id: "wo_seed",
  organizationId: "org_seed",
  siteId: "site_seed",
  seoIssueId: "issue_seed",
  schemaRecommendationId: null,
  geoVisibilityReportId: null,
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

function buildGeoVisibilityTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      geoVisibilityReports: [seededGeoVisibilityReport]
    })
  });
}

function buildComplianceTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      complianceFlags: [seededComplianceFlag]
    })
  });
}

function buildSchemaRecommendationTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      schemaRecommendations: [seededSchemaRecommendation]
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

function createSchemaSnapshot(overrides: Partial<CrawlerPageSnapshot> = {}): CrawlerPageSnapshot {
  return {
    canonicalUrl: "https://exampleclinic.com/services/seo",
    content: {
      duplicateHash: "a".repeat(64),
      textLength: 900,
      wordCount: 140
    },
    finalUrl: null,
    h1Count: 1,
    h2Count: 1,
    headings: {
      h1: ["SEO Clinic"],
      h2: ["What does SEO clinic include?"]
    },
    images: [],
    indexability: {
      canonicalMismatch: false,
      nofollow: false,
      noindex: false,
      robotsBlocked: null
    },
    jsonLd: [],
    links: {
      external: [],
      internal: []
    },
    metaDescription: "SEO clinic service page",
    robotsMeta: "index,follow",
    title: "SEO Clinic Service",
    url: "https://exampleclinic.com/services/seo",
    ...overrides
  };
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
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()[0]?.payload.providers).toEqual(["pagespeed", "cms"]);
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

  it("creates deterministic GEO visibility reports and persists them", async () => {
    const server = buildGeoVisibilityTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "Example Clinic",
          domain: "exampleclinic.com"
        },
        observations: [
          {
            provider: "chatgpt",
            query: "best seo clinic",
            answerText: "Example Clinic is a visible SEO clinic option.",
            citedUrls: ["https://exampleclinic.com/services/seo"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture"
          },
          {
            provider: "perplexity",
            query: "medical seo checklist",
            answerText: "Example Clinic publishes a medical SEO checklist.",
            citedUrls: ["https://exampleclinic.com/blog/medical-seo-checklist"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture"
          },
          {
            provider: "gemini",
            query: "seo clinic near gangnam",
            answerText: "Example Clinic appears for local SEO clinic research.",
            citedUrls: ["https://exampleclinic.com/locations/gangnam"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture"
          }
        ],
        evaluatedAt: "2026-05-24T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        siteId: "site_seed",
        brandName: "Example Clinic",
        status: "strong",
        score: 100,
        mentionRate: 100,
        citationRate: 100,
        generatedBy: "deterministic"
      },
      visibilityReport: {
        target: {
          siteId: "site_seed"
        },
        status: "strong",
        queryCount: 3,
        providerCount: 3
      }
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/geo-visibility-reports"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().reports).toHaveLength(2);
  });

  it("lists persisted GEO visibility report history", async () => {
    const server = buildGeoVisibilityTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/geo-visibility-reports"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reports).toEqual([
      expect.objectContaining({
        id: "geo_report_seed",
        status: "visible",
        generatedBy: "deterministic"
      })
    ]);
  });

  it("converts GEO visibility reports to idempotent work orders", async () => {
    const server = buildGeoVisibilityTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_seed/work-order"
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_seed/work-order"
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      report: {
        id: "geo_report_seed",
        status: "visible"
      },
      workOrder: {
        geoVisibilityReportId: "geo_report_seed",
        ownerType: "marketer",
        priority: "p2",
        status: "open",
        title: "Example Clinic GEO visibility improvement"
      }
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toEqual([
      expect.objectContaining({
        geoVisibilityReportId: "geo_report_seed",
        title: "Example Clinic GEO visibility improvement"
      })
    ]);
  });

  it("returns 404 for missing GEO visibility report work order conversion", async () => {
    const server = buildGeoVisibilityTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_missing/work-order"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "GEO visibility report not found"
    });
  });

  it("returns 404 for missing GEO visibility report site resources", async () => {
    const server = buildGeoVisibilityTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/geo-visibility-reports"
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_missing",
          brandName: "Example Clinic",
          domain: "exampleclinic.com"
        },
        observations: [
          {
            provider: "manual",
            query: "seo clinic",
            answerText: "",
            citedUrls: [],
            observedAt: "2026-05-24T00:00:00.000Z"
          }
        ]
      }
    });

    expect(listResponse.statusCode).toBe(404);
    expect(createResponse.statusCode).toBe(404);
  });

  it("validates GEO visibility report request payloads and domain scope", async () => {
    const server = buildGeoVisibilityTestServer();
    const invalidPayloadResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "",
          domain: "exampleclinic.com"
        },
        observations: []
      }
    });
    const outOfScopeResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "Example Clinic",
          domain: "example.net"
        },
        observations: [
          {
            provider: "manual",
            query: "seo clinic",
            answerText: "",
            citedUrls: [],
            observedAt: "2026-05-24T00:00:00.000Z"
          }
        ]
      }
    });

    expect(invalidPayloadResponse.statusCode).toBe(400);
    expect(invalidPayloadResponse.json().message).toContain("brandName");
    expect(outOfScopeResponse.statusCode).toBe(400);
    expect(outOfScopeResponse.json().message).toContain("site domain");
  });

  it("creates deterministic compliance reviews and persists flags", async () => {
    const server = buildComplianceTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_seed",
        subjectType: "page_copy",
        subjectId: "page_botox",
        url: "https://exampleclinic.com/services/botox",
        title: "Botox service draft",
        text: "Our medical clinic offers guaranteed treatment outcomes and is completely safe.",
        publishState: "draft",
        source: "fixture",
        evaluatedAt: "2026-05-24T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        status: "blocked",
        overallRiskLevel: "critical",
        generatedBy: "deterministic",
        publishPolicy: "draft_only",
        rulePackId: "kr-medical"
      }
    });
    expect(response.json().complianceFlags.map((flag: { ruleId: string }) => flag.ruleId)).toEqual([
      "GUARANTEED_RESULT_CLAIM",
      "ABSOLUTE_SAFETY_CLAIM"
    ]);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/compliance-flags"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().complianceFlags).toHaveLength(3);
  });

  it("applies KR medical compliance refinements through the API", async () => {
    const server = buildComplianceTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_seed",
        subjectType: "page_copy",
        subjectId: "page_korean",
        url: "https://exampleclinic.com/services/laser",
        locale: "ko-KR",
        title: "레이저 시술 안내",
        text: "이 의료 클리닉은 부작용 없는 레이저 치료와 선착순 할인 이벤트를 안내합니다.",
        publishState: "draft",
        source: "fixture",
        evaluatedAt: "2026-05-24T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        rulePackId: "kr-medical",
        status: "blocked"
      }
    });
    expect(response.json().complianceFlags.map((flag: { ruleId: string }) => flag.ruleId)).toEqual([
      "ABSOLUTE_SAFETY_CLAIM",
      "PRICE_DISCOUNT_PROMOTION"
    ]);
  });

  it("lists and updates persisted compliance flags", async () => {
    const server = buildComplianceTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/compliance-flags"
    });
    const updateResponse = await server.inject({
      method: "PATCH",
      url: "/compliance-flags/compliance_flag_seed",
      payload: {
        status: "approved"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().complianceFlags).toEqual([
      expect.objectContaining({
        id: "compliance_flag_seed",
        ruleId: "ABSOLUTE_SAFETY_CLAIM",
        status: "open"
      })
    ]);
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: "compliance_flag_seed",
      status: "approved"
    });
  });

  it("converts compliance flags to idempotent work orders", async () => {
    const server = buildComplianceTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order"
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order"
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "in_review",
        workOrderId: "wo_0001"
      },
      workOrder: {
        id: "wo_0001",
        ownerType: "legal",
        priority: "p1",
        title: "/services/botox Absolute safety claim"
      }
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toEqual([
      expect.objectContaining({
        ownerType: "legal",
        title: "/services/botox Absolute safety claim"
      })
    ]);
  });

  it("rechecks revised compliance copy and resolves linked work orders", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order"
    });

    const response = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        evaluatedAt: "2026-05-24T01:00:00.000Z",
        text: "This clinic explains consultation steps, possible discomfort, and individual variation.",
        url: "https://exampleclinic.com/services/botox"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resolved: true,
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "resolved",
        workOrderId: "wo_0001"
      },
      report: {
        flags: [],
        status: "clear"
      },
      workOrder: {
        id: "wo_0001",
        status: "done"
      }
    });
  });

  it("keeps compliance flags actionable when recheck still finds the same rule", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order"
    });

    const response = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        text: "This clinic treatment is completely safe for every patient.",
        url: "https://exampleclinic.com/services/botox"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resolved: false,
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "in_review",
        ruleId: "ABSOLUTE_SAFETY_CLAIM"
      },
      report: {
        status: "blocked"
      },
      workOrder: {
        id: "wo_0001",
        status: "open"
      }
    });
  });

  it("triggers compliance rechecks from CMS content updated events", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order"
    });

    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      payload: {
        siteId: "site_seed",
        cmsType: "wordpress",
        externalId: "page_seed",
        url: "https://exampleclinic.com/services/botox",
        title: "Botox service page",
        text: "This clinic explains consultation steps, possible discomfort, and individual variation.",
        status: "draft",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      event: {
        provider: "cms",
        source: "cms",
        status: "draft"
      },
      matchedFlagCount: 1,
      skippedFlagCount: 0,
      rechecks: [
        {
          resolved: true,
          complianceFlag: {
            id: "compliance_flag_seed",
            status: "resolved"
          },
          report: {
            input: {
              source: "cms",
              subjectId: "page_seed",
              subjectType: "page_copy"
            },
            flags: [],
            status: "clear"
          },
          workOrder: {
            id: "wo_0001",
            status: "done"
          }
        }
      ]
    });
  });

  it("keeps CMS-triggered compliance rechecks open when the rule still fails", async () => {
    const server = buildComplianceTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      payload: {
        siteId: "site_seed",
        cmsType: "wordpress",
        externalId: "page_seed",
        url: "https://exampleclinic.com/services/botox",
        text: "This clinic treatment is completely safe for every patient.",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchedFlagCount: 1,
      rechecks: [
        {
          resolved: false,
          complianceFlag: {
            id: "compliance_flag_seed",
            ruleId: "ABSOLUTE_SAFETY_CLAIM",
            status: "open"
          },
          report: {
            status: "blocked"
          },
          workOrder: null
        }
      ]
    });
  });

  it("ignores CMS content events that do not match active compliance flags", async () => {
    const server = buildComplianceTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      payload: {
        siteId: "site_seed",
        cmsType: "wordpress",
        externalId: "page_other",
        url: "https://exampleclinic.com/services/laser",
        text: "This clinic explains risks and consultation steps.",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchedFlagCount: 0,
      rechecks: [],
      skippedFlagCount: 0
    });
  });

  it("validates compliance review route scope and missing resources", async () => {
    const server = buildComplianceTestServer();
    const siteMismatchResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_other",
        subjectType: "page_copy",
        text: "This medical clinic is completely safe."
      }
    });
    const outOfScopeResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_seed",
        subjectType: "page_copy",
        url: "https://example.net/services/botox",
        text: "This medical clinic is completely safe."
      }
    });
    const missingSiteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/compliance-flags"
    });
    const missingFlagResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_missing/work-order"
    });
    const outOfScopeRecheckResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        text: "This clinic explains risks and consultation steps.",
        url: "https://example.net/services/botox"
      }
    });
    const missingRecheckResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_missing/recheck",
      payload: {
        text: "This clinic explains risks and consultation steps."
      }
    });
    const eventSiteMismatchResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      payload: {
        siteId: "site_other",
        cmsType: "wordpress",
        externalId: "page_seed",
        url: "https://exampleclinic.com/services/botox",
        text: "This clinic explains risks and consultation steps.",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });
    const eventOutOfScopeResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      payload: {
        siteId: "site_seed",
        cmsType: "wordpress",
        externalId: "page_seed",
        url: "https://example.net/services/botox",
        text: "This clinic explains risks and consultation steps.",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });
    const missingSiteEventResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/cms/content-updated-events",
      payload: {
        siteId: "site_missing",
        cmsType: "wordpress",
        externalId: "page_seed",
        url: "https://exampleclinic.com/services/botox",
        text: "This clinic explains risks and consultation steps.",
        updatedAt: "2026-05-24T02:00:00.000Z"
      }
    });

    expect(siteMismatchResponse.statusCode).toBe(400);
    expect(siteMismatchResponse.json().message).toContain("siteId");
    expect(outOfScopeResponse.statusCode).toBe(400);
    expect(outOfScopeResponse.json().message).toContain("site domain");
    expect(missingSiteResponse.statusCode).toBe(404);
    expect(missingFlagResponse.statusCode).toBe(404);
    expect(outOfScopeRecheckResponse.statusCode).toBe(400);
    expect(outOfScopeRecheckResponse.json().message).toContain("site domain");
    expect(missingRecheckResponse.statusCode).toBe(404);
    expect(eventSiteMismatchResponse.statusCode).toBe(400);
    expect(eventSiteMismatchResponse.json().message).toContain("siteId");
    expect(eventOutOfScopeResponse.statusCode).toBe(400);
    expect(eventOutOfScopeResponse.json().message).toContain("site domain");
    expect(missingSiteEventResponse.statusCode).toBe(404);
  });

  it("creates deterministic schema recommendations and persists them", async () => {
    const server = buildSchemaRecommendationTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/schema-recommendations",
      payload: {
        organizationName: "Example Group",
        snapshots: [createSchemaSnapshot()]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      recommendationSets: [
        {
          siteId: "site_seed",
          pageUrl: "https://exampleclinic.com/services/seo",
          generatedBy: "deterministic"
        }
      ]
    });
    expect(response.json().recommendations.map((recommendation: { type: string }) => recommendation.type)).toEqual([
      "WebPage",
      "BreadcrumbList",
      "FAQPage",
      "Service",
      "MedicalClinic"
    ]);
    expect(response.json().recommendations[3]).toMatchObject({
      siteId: "site_seed",
      pageUrl: "https://exampleclinic.com/services/seo",
      type: "Service",
      priority: "p1",
      status: "open",
      generatedBy: "deterministic"
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/schema-recommendations"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().recommendations).toHaveLength(5);
  });

  it("updates existing schema recommendations idempotently", async () => {
    const server = buildSchemaRecommendationTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/schema-recommendations",
      payload: {
        snapshots: [createSchemaSnapshot()]
      }
    });

    expect(response.statusCode).toBe(201);
    const serviceRecommendation = response
      .json()
      .recommendations.find((recommendation: { type: string }) => recommendation.type === "Service");
    expect(serviceRecommendation).toMatchObject({
      id: "schema_rec_seed",
      type: "Service",
      status: "open"
    });
  });

  it("lists and reads persisted schema recommendations", async () => {
    const server = buildSchemaRecommendationTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/schema-recommendations"
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/schema-recommendations/schema_rec_seed"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().recommendations).toHaveLength(1);
    expect(listResponse.json().recommendations[0]).toMatchObject({
      id: "schema_rec_seed",
      type: "Service",
      generatedBy: "deterministic"
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      recommendation: {
        id: "schema_rec_seed",
        pageUrl: "https://exampleclinic.com/services/seo"
      }
    });
  });

  it("converts a schema recommendation to an idempotent work order", async () => {
    const server = buildSchemaRecommendationTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order"
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order"
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      recommendation: {
        id: "schema_rec_seed",
        status: "converted"
      },
      workOrder: {
        id: "wo_0001",
        siteId: "site_seed",
        seoIssueId: null,
        schemaRecommendationId: "schema_rec_seed",
        priority: "p1",
        title: "/services/seo Service JSON-LD implementation",
        ownerType: "developer",
        relatedIssues: ["SCHEMA_MISSING"]
      }
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toHaveLength(1);
    expect(listResponse.json().workOrders[0]).toMatchObject({
      schemaRecommendationId: "schema_rec_seed"
    });
  });

  it("marks schema recommendations and linked work orders resolved after recheck", async () => {
    const server = buildSchemaRecommendationTestServer();
    await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order"
    });

    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot({
          jsonLd: [
            {
              raw: '{"@context":"https://schema.org","@type":"Service"}',
              parsed: {
                "@context": "https://schema.org",
                "@type": "Service"
              }
            }
          ]
        })
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      expectedType: "Service",
      observedTypes: ["Service"],
      resolved: true,
      recommendation: {
        id: "schema_rec_seed",
        status: "resolved",
        evidence: {
          observedTypes: ["Service"]
        }
      },
      workOrder: {
        schemaRecommendationId: "schema_rec_seed",
        status: "done"
      }
    });
  });

  it("keeps unresolved schema recommendations actionable after recheck", async () => {
    const server = buildSchemaRecommendationTestServer();
    await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order"
    });

    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot()
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      expectedType: "Service",
      observedTypes: [],
      resolved: false,
      recommendation: {
        id: "schema_rec_seed",
        status: "converted",
        evidence: {
          observedTypes: []
        }
      },
      workOrder: {
        schemaRecommendationId: "schema_rec_seed",
        status: "open"
      }
    });
  });

  it("rejects dismissed schema recommendation work order conversion", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
        schemaRecommendations: [
          {
            ...seededSchemaRecommendation,
            id: "schema_rec_dismissed",
            status: "dismissed"
          }
        ]
      })
    });
    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_dismissed/work-order"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Dismissed");
  });

  it("returns 404 for missing schema recommendation resources", async () => {
    const server = buildSchemaRecommendationTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/schema-recommendations"
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/schema-recommendations",
      payload: {
        snapshots: [createSchemaSnapshot()]
      }
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/schema-recommendations/schema_rec_missing"
    });
    const workOrderResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/work-order"
    });
    const recheckResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/recheck",
      payload: {
        snapshot: createSchemaSnapshot()
      }
    });

    expect(listResponse.statusCode).toBe(404);
    expect(createResponse.statusCode).toBe(404);
    expect(detailResponse.statusCode).toBe(404);
    expect(workOrderResponse.statusCode).toBe(404);
    expect(recheckResponse.statusCode).toBe(404);
  });

  it("validates schema recommendation request payloads", async () => {
    const server = buildSchemaRecommendationTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/schema-recommendations",
      payload: {
        snapshots: []
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("snapshots");
  });

  it("rejects schema recommendation snapshots outside the site scope", async () => {
    const server = buildSchemaRecommendationTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/schema-recommendations",
      payload: {
        snapshots: [
          createSchemaSnapshot({
            canonicalUrl: "https://example.net/services/seo",
            url: "https://example.net/services/seo"
          })
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("snapshot URLs");
  });

  it("rejects schema recommendation rechecks for mismatched or out-of-scope URLs", async () => {
    const server = buildSchemaRecommendationTestServer();
    const mismatchResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot({
          url: "https://exampleclinic.com/services/other"
        })
      }
    });
    const scopeResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot({
          finalUrl: "https://example.net/services/seo"
        })
      }
    });

    expect(mismatchResponse.statusCode).toBe(400);
    expect(mismatchResponse.json().message).toContain("pageUrl");
    expect(scopeResponse.statusCode).toBe(400);
    expect(scopeResponse.json().message).toContain("site domain");
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
