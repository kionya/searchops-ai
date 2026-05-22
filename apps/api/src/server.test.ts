import { describe, expect, it } from "vitest";

import type { Organization, SeoIssue, Site, WorkOrder } from "@searchops/types";

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
