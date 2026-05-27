import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type {
  AeoReadinessReportRecord,
  ComplianceFlag,
  ConnectorSyncResult,
  ConnectorSyncRun,
  ContentBrief,
  CmsContentUpdatedEventRequest,
  CrawlerPageSnapshot,
  DeadLetterJobRecord,
  GeoVisibilityReportRecord,
  KeywordDiscoveryCandidateRecord,
  Organization,
  SchemaRecommendationRecord,
  SeoIssue,
  Site,
  WorkOrder,
} from "@searchops/types";
import { CmsContentUpdatedEventRequestSchema } from "@searchops/types";
import { normalizeCmsWebhookPayload } from "@searchops/connectors";

import {
  createMemoryConnectorSyncQueue,
  createMemoryCrawlRunQueue,
  createMemoryGeoAnswerMonitorQueue,
  createMemorySchemaRichResultValidationQueue,
} from "./queue.js";
import type { ConnectorSyncQueue } from "./queue.js";
import { createMemoryDeadLetterJobStore } from "./dead-letter-store.js";
import type { ApiRateLimitStore } from "./rate-limit.js";
import { createMemoryRepository } from "./repository.js";
import { buildApiServer } from "./server.js";
import { createCmsWebhookSignature } from "./webhook-security.js";
import {
  createHmacJwtIdpTokenVerifier,
  createRequestAuthContextResolver,
} from "./auth.js";
import type { GoogleConnectorOAuthClient } from "./google-oauth.js";
import {
  createMemoryOperationalAlertRouter,
  createMemoryOperationalLogDrain,
} from "./observability.js";
import { createMemoryOperationsExecutor } from "./operations-hardening.js";

const createdAt = "2026-05-19T00:00:00.000Z";
const seededOrganization: Organization = {
  id: "org_demo",
  name: "Seed Organization",
  createdAt,
};
const otherOrganization: Organization = {
  id: "org_other",
  name: "Other Organization",
  createdAt,
};
const seededSite: Site = {
  id: "site_seed",
  organizationId: "org_demo",
  domain: "exampleclinic.com",
  name: "Example Clinic",
  industry: "medical",
  language: "ko",
  country: "KR",
  createdAt,
};
const otherSite: Site = {
  id: "site_other",
  organizationId: "org_other",
  domain: "otherclinic.com",
  name: "Other Clinic",
  industry: "medical",
  language: "ko",
  country: "KR",
  createdAt,
};
const seededConnectorSyncRun: ConnectorSyncRun = {
  id: "sync_seed",
  organizationId: "org_demo",
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
      pagespeed: 1,
    },
    totalProviders: 1,
    totalRecords: 1,
  },
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
      fetchedAt: "2026-05-22T00:00:00.000Z",
    },
  ],
  createdAt,
};
const seededKeywordDiscoverySyncRun: ConnectorSyncRun = {
  id: "sync_keyword_seed",
  organizationId: "org_demo",
  siteId: "site_seed",
  status: "completed",
  providers: ["gsc", "cms"],
  requestedByUserId: "user_connector",
  fixture: true,
  startedAt: "2026-05-25T00:00:00.000Z",
  endedAt: "2026-05-25T00:01:00.000Z",
  summary: {
    failedProviders: 0,
    okProviders: 2,
    partialProviders: 0,
    recordCountsByProvider: {
      bing: 0,
      cms: 1,
      ga4: 0,
      gsc: 2,
      pagespeed: 0,
    },
    totalProviders: 2,
    totalRecords: 3,
  },
};
const seededKeywordDiscoveryResults: ConnectorSyncResult[] = [
  {
    id: "sync_result_keyword_gsc",
    syncRunId: "sync_keyword_seed",
    provider: "gsc",
    status: "ok",
    fetchedAt: "2026-05-25T00:00:00.000Z",
    fixture: true,
    recordCount: 2,
    records: [
      {
        provider: "gsc",
        siteUrl: "https://exampleclinic.com/",
        query: "seo clinic",
        page: "https://exampleclinic.com/service/seo",
        country: "KR",
        device: "mobile",
        clicks: 12,
        impressions: 120,
        ctr: 0.1,
        position: 3.2,
        startDate: "2026-05-01",
        endDate: "2026-05-20",
      },
      {
        provider: "gsc",
        siteUrl: "https://exampleclinic.com/",
        query: "low volume query",
        page: "https://exampleclinic.com/blog/low-volume",
        country: "KR",
        device: "desktop",
        clicks: 0,
        impressions: 1,
        ctr: 0,
        position: 42,
        startDate: "2026-05-01",
        endDate: "2026-05-20",
      },
    ],
    createdAt,
  },
  {
    id: "sync_result_keyword_cms",
    syncRunId: "sync_keyword_seed",
    provider: "cms",
    status: "ok",
    fetchedAt: "2026-05-25T00:00:00.000Z",
    fixture: true,
    recordCount: 1,
    records: [
      {
        provider: "cms",
        cmsType: "wordpress",
        externalId: "post_1",
        url: "https://exampleclinic.com/blog/medical-seo-checklist",
        title: "medical seo checklist",
        status: "published",
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
    ],
    createdAt,
  },
];
const seededKeywordDiscoveryCandidate: KeywordDiscoveryCandidateRecord = {
  id: "keyword_discovery_seed",
  siteId: "site_seed",
  keywordId: "keyword_seed",
  phrase: "seed keyword discovery",
  locale: "ko-KR",
  language: "ko",
  country: "KR",
  intent: null,
  source: "gsc",
  pageUrl: "https://exampleclinic.com/service/seed",
  score: 80,
  evidence: {
    provider: "gsc",
    pageUrl: "https://exampleclinic.com/service/seed",
    sourceField: "query",
    clicks: 4,
    impressions: 80,
    position: 8,
  },
  generatedBy: "deterministic",
  discoveredAt: "2026-05-24T00:00:00.000Z",
  createdAt,
  updatedAt: createdAt,
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
      acceptanceCriteria: ["Includes one concise answer block."],
    },
  ],
  faqQuestions: ["What does SEO clinic include?"],
  acceptanceCriteria: ["Do not auto-publish the brief to any CMS or external channel."],
  generationMode: "deterministic",
  publishPolicy: "draft_only",
  createdAt,
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
        sourceField: "answerBlocks",
      },
    },
  ],
  generatedBy: "deterministic",
  evaluatedAt: "2026-05-23T00:00:00.000Z",
  createdAt,
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
      source: "fixture",
    },
  ],
  citations: [
    {
      url: "https://exampleclinic.com/services/seo",
      domain: "exampleclinic.com",
      owned: true,
    },
  ],
  checks: [
    {
      checkId: "BRAND_MENTIONED",
      status: "warning",
      score: 60,
      evidence: {
        observedValue: 67,
        expectedValue: ">= 70",
        sourceField: "observations.answerText",
      },
    },
  ],
  generatedBy: "deterministic",
  evaluatedAt: "2026-05-24T00:00:00.000Z",
  createdAt,
};
const seededComplianceFlag: ComplianceFlag = {
  id: "compliance_flag_seed",
  organizationId: "org_demo",
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
    match: "completely safe",
  },
  recommendation: "Replace absolute safety language with balanced wording.",
  replacementSuggestion: "Explain that risks vary by individual.",
  generatedBy: "deterministic",
  createdAt,
  updatedAt: createdAt,
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
    sourceField: "jsonLd",
  },
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "SEO clinic",
    provider: {
      "@type": "MedicalClinic",
      name: "Example Clinic",
    },
    url: "https://exampleclinic.com/services/seo",
  },
  instructions: ["Add Service JSON-LD to the service detail page."],
  requiredFields: ["@context", "@type", "name", "provider", "url"],
  recommendedFields: ["description", "serviceType"],
  generatedBy: "deterministic",
  createdAt,
  updatedAt: createdAt,
};
const seededWorkOrder: WorkOrder = {
  id: "wo_seed",
  organizationId: "org_demo",
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
    sourceField: "h1Count",
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
  updatedAt: createdAt,
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
    sourceField: "h1Count",
  },
  createdAt,
};
const seededDeadLetterJob: DeadLetterJobRecord = {
  id: "searchops-crawl-dead-letter|42",
  queueName: "searchops-crawl-dead-letter",
  jobId: "42",
  status: "waiting",
  enqueuedAt: "2026-05-25T00:00:01.000Z",
  processedAt: null,
  payload: {
    originalQueue: "searchops-crawl",
    originalJobName: "crawl",
    originalJobId: "job_42",
    failedReason: "Fetch timed out",
    attemptsMade: 3,
    failedAt: "2026-05-25T00:00:00.000Z",
  },
};

function buildTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({ organizations: [seededOrganization] }),
  });
}

function buildDeadLetterOperationsTestContext(
  options: Parameters<typeof buildApiServer>[0] = {},
) {
  const deadLetterJobStore = createMemoryDeadLetterJobStore([seededDeadLetterJob]);
  const server = buildApiServer({
    ...options,
    deadLetterJobStore,
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
    }),
  });

  return { deadLetterJobStore, server };
}

function buildCrawlRunTestContext() {
  const crawlRunQueue = createMemoryCrawlRunQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
    }),
    crawlRunQueue,
  });

  return { server, crawlRunQueue };
}

function buildConnectorSyncTestContext() {
  const connectorSyncQueue = createMemoryConnectorSyncQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
    }),
    connectorSyncQueue,
  });

  return { server, connectorSyncQueue };
}

function createFakeGoogleOAuthClient(): GoogleConnectorOAuthClient {
  return {
    createAuthorizationUrl(input) {
      return {
        authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=fake_state&scope=${input.providers.join("+")}`,
        providers: input.providers,
        state: "fake_state",
        stateExpiresAt: "2026-05-27T00:10:00.000Z",
      };
    },
    async exchangeCodeForTokens(code) {
      if (code === "bad_code") {
        throw new Error("bad code");
      }
      return {
        accessToken: "access_token",
        expiresAt: "2026-05-27T01:00:00.000Z",
        externalAccountEmail: "owner@example.com",
        refreshToken: "refresh_token",
        scopes: [
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
        tokenType: "Bearer",
      };
    },
    verifyState(state) {
      if (state !== "fake_state") {
        throw new Error("invalid state");
      }
      return {
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "nonce",
        organizationId: seededSite.organizationId,
        providers: ["gsc", "ga4"],
        requestedByUserId: "user_connector",
        returnTo: null,
        siteId: seededSite.id,
      };
    },
  };
}

function buildConnectorOAuthTestContext() {
  const repository = createMemoryRepository({
    organizations: [seededOrganization],
    sites: [seededSite],
  });
  const server = buildApiServer({
    currentTime: () => new Date("2026-05-27T00:00:00.000Z"),
    googleOAuthClient: createFakeGoogleOAuthClient(),
    repository,
  });

  return { repository, server };
}

function buildGeoAnswerMonitorTestContext() {
  const geoAnswerMonitorQueue = createMemoryGeoAnswerMonitorQueue();
  const server = buildApiServer({
    currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
    }),
    geoAnswerMonitorQueue,
  });

  return { server, geoAnswerMonitorQueue };
}

function buildConnectorSyncHistoryTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      connectorSyncRuns: [seededConnectorSyncRun],
      connectorSyncResults: [seededConnectorSyncResult],
    }),
  });
}

function buildContentBriefTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      contentBriefs: [seededContentBrief],
    }),
  });
}

function buildAeoReadinessTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      aeoReadinessReports: [seededAeoReadinessReport],
    }),
  });
}

function buildKeywordDiscoveryTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      connectorSyncRuns: [seededKeywordDiscoverySyncRun],
      connectorSyncResults: seededKeywordDiscoveryResults,
      keywordDiscoveryCandidates: [seededKeywordDiscoveryCandidate],
    }),
  });
}

function buildGeoVisibilityTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      geoVisibilityReports: [seededGeoVisibilityReport],
    }),
  });
}

function buildComplianceTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      complianceFlags: [seededComplianceFlag],
    }),
  });
}

function buildSecuredComplianceTestServer() {
  return buildApiServer({
    cmsWebhookSecrets: {
      wordpress: "cms_secret_1",
    },
    currentTime: () => new Date("2026-05-24T02:01:00.000Z"),
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      complianceFlags: [seededComplianceFlag],
    }),
  });
}

function buildSecuredComplianceAuditTestServer() {
  const complianceWorkOrder: WorkOrder = {
    ...seededWorkOrder,
    id: "wo_compliance_seed",
    organizationId: seededOrganization.id,
    siteId: seededSite.id,
    seoIssueId: null,
    status: "in_review",
    title: "Resolve absolute safety claim",
    ownerType: "legal",
  };
  return buildApiServer({
    cmsWebhookSecrets: {
      wordpress: "cms_secret_1",
    },
    currentTime: () => new Date("2026-05-24T02:01:00.000Z"),
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      complianceFlags: [
        {
          ...seededComplianceFlag,
          workOrderId: complianceWorkOrder.id,
        },
      ],
      workOrders: [complianceWorkOrder],
    }),
  });
}

function createSignedCmsEventRequest(payload: Record<string, unknown>, secret = "cms_secret_1") {
  const event = CmsContentUpdatedEventRequestSchema.parse(payload);
  const timestamp = "2026-05-24T02:00:00.000Z";
  return {
    headers: {
      "x-searchops-cms-type": event.cmsType,
      "x-searchops-signature": createCmsWebhookSignature({ event, secret, timestamp }),
      "x-searchops-timestamp": timestamp,
    },
    payload,
  };
}

function createSignedIdpToken(payload: Record<string, unknown>, secret = "idp_secret") {
  const header = encodeJwtSegment({ alg: "HS256", typ: "JWT" });
  const body = encodeJwtSegment(payload);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function encodeJwtSegment(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function createSignedCmsProviderWebhookRequest({
  event,
  payload,
  secret = "cms_secret_1",
}: {
  readonly event: CmsContentUpdatedEventRequest;
  readonly payload: Record<string, unknown>;
  readonly secret?: string;
}) {
  const timestamp = "2026-05-24T02:00:00.000Z";
  return {
    headers: {
      "x-searchops-cms-type": event.cmsType,
      "x-searchops-signature": createCmsWebhookSignature({ event, secret, timestamp }),
      "x-searchops-timestamp": timestamp,
    },
    payload,
  };
}

function buildSchemaRecommendationTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      schemaRecommendations: [seededSchemaRecommendation],
    }),
  });
}

function buildSchemaRecommendationRecheckCrawlTestContext() {
  const crawlRunQueue = createMemoryCrawlRunQueue();
  const server = buildApiServer({
    crawlRunQueue,
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      schemaRecommendations: [seededSchemaRecommendation],
    }),
  });

  return { crawlRunQueue, server };
}

function buildSchemaRichResultValidationQueueTestContext() {
  const schemaRichResultValidationQueue = createMemorySchemaRichResultValidationQueue();
  const server = buildApiServer({
    currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      schemaRecommendations: [seededSchemaRecommendation],
    }),
    schemaRichResultValidationQueue,
  });

  return { schemaRichResultValidationQueue, server };
}

function buildWorkOrderTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      seoIssues: [seededSeoIssue],
      workOrders: [seededWorkOrder],
    }),
  });
}

function createSchemaSnapshot(overrides: Partial<CrawlerPageSnapshot> = {}): CrawlerPageSnapshot {
  return {
    canonicalUrl: "https://exampleclinic.com/services/seo",
    content: {
      duplicateHash: "a".repeat(64),
      textLength: 900,
      wordCount: 140,
    },
    finalUrl: null,
    h1Count: 1,
    h2Count: 1,
    headings: {
      h1: ["SEO Clinic"],
      h2: ["What does SEO clinic include?"],
    },
    images: [],
    indexability: {
      canonicalMismatch: false,
      nofollow: false,
      noindex: false,
      robotsBlocked: null,
    },
    jsonLd: [],
    links: {
      external: [],
      internal: [],
    },
    metaDescription: "SEO clinic service page",
    robotsMeta: "index,follow",
    title: "SEO Clinic Service",
    url: "https://exampleclinic.com/services/seo",
    ...overrides,
  };
}

function buildWorkOrderRecheckTestContext() {
  const crawlRunQueue = createMemoryCrawlRunQueue();
  const server = buildApiServer({
    repository: createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
      seoIssues: [seededSeoIssue],
      workOrders: [seededWorkOrder],
    }),
    crawlRunQueue,
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

  it("reports basic request metrics", async () => {
    let now = new Date("2026-05-25T00:00:00.000Z");
    const server = buildApiServer({
      currentTime: () => now,
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });

    const healthResponse = await server.inject({ method: "GET", url: "/health" });
    now = new Date("2026-05-25T00:00:12.000Z");
    const metricsResponse = await server.inject({ method: "GET", url: "/metrics" });

    expect(healthResponse.statusCode).toBe(200);
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.json()).toEqual({
      service: "api",
      uptimeSeconds: 12,
      requests: {
        total: 1,
        byStatus: {
          "200": 1,
        },
      },
    });
  });

  it("exports operational metrics with worker failure summary", async () => {
    let now = new Date("2026-05-26T00:00:00.000Z");
    const operationalLogDrain = createMemoryOperationalLogDrain();
    const operationalAlertRouter = createMemoryOperationalAlertRouter(() => now);
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => now,
      operationalAlertRouter,
      operationalLogDrain,
    });

    const healthResponse = await server.inject({ method: "GET", url: "/health" });
    now = new Date("2026-05-26T00:00:12.000Z");
    const response = await server.inject({
      method: "GET",
      url: "/ops/metrics-export",
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "api",
      generatedAt: "2026-05-26T00:00:12.000Z",
      uptimeSeconds: 12,
      requests: {
        total: 1,
        byStatus: {
          "200": 1,
        },
      },
      workers: {
        deadLetterJobs: {
          total: 1,
          byQueue: {
            "searchops-crawl": 1,
          },
          byStatus: {
            waiting: 1,
          },
        },
      },
      alerts: [
        {
          id: "worker_dead_letter_jobs",
          message: "Worker dead-letter queues contain 1 job",
          severity: "warning",
          source: "worker",
        },
      ],
    });
    expect(operationalLogDrain.listMetricsExports()).toEqual([response.json()]);
    expect(operationalAlertRouter.listAlertDeliveries()).toEqual([
      {
        alert: response.json().alerts[0],
        deliveredAt: "2026-05-26T00:00:12.000Z",
        generatedAt: "2026-05-26T00:00:12.000Z",
        routeKey: "worker:warning",
      },
    ]);
  });

  it("reports operational readiness for remaining production wiring", async () => {
    const server = buildApiServer({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });
    const response = await server.inject({
      method: "GET",
      url: "/ops/readiness",
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.generatedAt).toBe("2026-05-26T00:00:00.000Z");
    expect(payload.summary.total).toBeGreaterThanOrEqual(20);
    expect(payload.items.map((item: { id: string }) => item.id)).toContain("live-gsc");
    expect(payload.items.map((item: { id: string }) => item.id)).toContain("idp-verification");
  });

  it("lists worker dead-letter jobs for operations", async () => {
    const { server } = buildDeadLetterOperationsTestContext();
    const response = await server.inject({
      method: "GET",
      url: "/ops/dead-letter-jobs?limit=10",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deadLetterJobs: [seededDeadLetterJob],
      summary: {
        total: 1,
        byQueue: {
          "searchops-crawl": 1,
        },
        byStatus: {
          waiting: 1,
        },
      },
    });
  });

  it("removes worker dead-letter jobs through the operations API", async () => {
    const { server } = buildDeadLetterOperationsTestContext();
    const response = await server.inject({
      method: "DELETE",
      url: `/ops/dead-letter-jobs/${encodeURIComponent(seededDeadLetterJob.id)}`,
    });
    const listResponse = await server.inject({
      method: "GET",
      url: "/ops/dead-letter-jobs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deadLetterJobId: seededDeadLetterJob.id,
      removed: true,
    });
    expect(listResponse.json()).toMatchObject({
      deadLetterJobs: [],
      summary: {
        total: 0,
      },
    });
  });

  it("returns not found for missing dead-letter jobs", async () => {
    const { server } = buildDeadLetterOperationsTestContext();
    const response = await server.inject({
      method: "DELETE",
      url: "/ops/dead-letter-jobs/missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "Dead-letter job not found",
    });
  });

  it("creates backup restore drill plans for operations", async () => {
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "GET",
      url: "/ops/backup-restore-drill-plan?environment=staging",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "restore_drill_staging_20260526",
      environment: "staging",
      status: "ready",
      requiredInputs: ["DATABASE_URL", "RESTORE_DATABASE_URL", "private backup destination"],
    });
  });

  it("creates secret rotation plans without raw secret values", async () => {
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "POST",
      url: "/ops/secret-rotation-plan",
      payload: {
        provider: "wordpress",
        oldSecretRef: "cms/wordpress/old",
        newSecretRef: "cms/wordpress/new",
        verificationEvent: "signed WordPress webhook fixture",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "secret_rotation_wordpress_20260526",
      provider: "wordpress",
      status: "ready",
      verificationEvent: "signed WordPress webhook fixture",
    });
    expect(response.body).not.toContain("secret_value");
  });

  it("dispatches restore drill and secret rotation runs through configured executors", async () => {
    const operationsExecutor = createMemoryOperationsExecutor(
      () => new Date("2026-05-26T00:02:00.000Z"),
    );
    const { server } = buildDeadLetterOperationsTestContext({
      backupRestoreDrillScheduler: operationsExecutor,
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      secretRotationExecutor: operationsExecutor,
    });
    const restoreResponse = await server.inject({
      method: "POST",
      url: "/ops/backup-restore-drill-runs",
      payload: {
        environment: "production",
      },
    });
    const rotationResponse = await server.inject({
      method: "POST",
      url: "/ops/secret-rotations",
      payload: {
        dryRun: true,
        provider: "wordpress",
        oldSecretRef: "cms/wordpress/old",
        newSecretRef: "cms/wordpress/new",
      },
    });

    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json()).toMatchObject({
      dryRun: false,
      plan: {
        id: "restore_drill_production_20260526",
      },
      dispatch: {
        provider: "memory",
        status: "accepted",
      },
    });
    expect(rotationResponse.statusCode).toBe(200);
    expect(rotationResponse.json()).toMatchObject({
      dryRun: true,
      plan: {
        id: "secret_rotation_wordpress_20260526",
      },
      dispatch: {
        externalRunId: null,
        provider: "memory",
        status: "dry_run",
      },
    });
    expect(operationsExecutor.listDispatches()).toHaveLength(2);
  });

  it("creates dead-letter replay plans without auto-requeue side effects", async () => {
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "POST",
      url: `/ops/dead-letter-jobs/${encodeURIComponent(seededDeadLetterJob.id)}/replay-plan`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      deadLetterJobId: seededDeadLetterJob.id,
      originalQueue: "searchops-crawl",
      originalJobName: "crawl",
      status: "blocked",
    });
  });

  it("replays supported dead-letter jobs with queue-specific idempotent job ids", async () => {
    const crawlRunQueue = createMemoryCrawlRunQueue();
    const { server } = buildDeadLetterOperationsTestContext({
      crawlRunQueue,
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "POST",
      url: `/ops/dead-letter-jobs/${encodeURIComponent(seededDeadLetterJob.id)}/replay`,
      payload: {
        payload: {
          crawlRunId: "crawl_replay",
          maxPages: 1,
          pages: [],
          requestedByUserId: "user_ops",
          siteDomain: "exampleclinic.com",
          siteId: "site_seed",
          startUrl: "https://exampleclinic.com/",
        },
      },
    });
    const listResponse = await server.inject({
      method: "GET",
      url: "/ops/dead-letter-jobs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      removedDeadLetterJob: true,
      replayJob: {
        id: "replay_searchops-crawl-dead-letter_42",
        name: "crawl",
        payload: {
          crawlRunId: "crawl_replay",
          siteId: "site_seed",
        },
      },
      status: "replayed",
    });
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
    expect(listResponse.json()).toMatchObject({
      deadLetterJobs: [],
      summary: {
        total: 0,
      },
    });
  });

  it("keeps repeated dead-letter replay requests idempotent by replay job id", async () => {
    const crawlRunQueue = createMemoryCrawlRunQueue();
    const { server } = buildDeadLetterOperationsTestContext({
      crawlRunQueue,
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const request = {
      method: "POST" as const,
      url: `/ops/dead-letter-jobs/${encodeURIComponent(seededDeadLetterJob.id)}/replay`,
      payload: {
        removeDeadLetterJob: false,
        payload: {
          crawlRunId: "crawl_replay",
          maxPages: 1,
          pages: [],
          requestedByUserId: "user_ops",
          siteDomain: "exampleclinic.com",
          siteId: "site_seed",
          startUrl: "https://exampleclinic.com/",
        },
      },
    };

    const firstResponse = await server.inject(request);
    const secondResponse = await server.inject(request);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.json().replayJob.id).toBe(secondResponse.json().replayJob.id);
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
  });

  it("rate limits requests when enabled", async () => {
    const server = buildApiServer({
      rateLimit: {
        enabled: true,
        maxRequests: 2,
        windowMs: 60_000,
      },
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });

    const firstResponse = await server.inject({ method: "GET", url: "/health" });
    const secondResponse = await server.inject({ method: "GET", url: "/health" });
    const limitedResponse = await server.inject({ method: "GET", url: "/health" });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(limitedResponse.statusCode).toBe(429);
    expect(limitedResponse.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests.",
    });
  });

  it("resets rate-limit buckets after the configured window", async () => {
    let now = new Date("2026-05-25T00:00:00.000Z");
    const server = buildApiServer({
      currentTime: () => now,
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowMs: 1000,
      },
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });

    const firstResponse = await server.inject({ method: "GET", url: "/health" });
    const limitedResponse = await server.inject({ method: "GET", url: "/health" });
    now = new Date("2026-05-25T00:00:01.000Z");
    const resetResponse = await server.inject({ method: "GET", url: "/health" });

    expect(firstResponse.statusCode).toBe(200);
    expect(limitedResponse.statusCode).toBe(429);
    expect(resetResponse.statusCode).toBe(200);
  });

  it("can use an injected distributed rate-limit store boundary", async () => {
    const consumedKeys: string[] = [];
    const rateLimitStore: ApiRateLimitStore = {
      async consume(input) {
        consumedKeys.push(input.key);
        return {
          limited: true,
          remaining: 0,
          resetAtMs: input.nowMs + input.windowMs,
        };
      },
    };
    const server = buildApiServer({
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowMs: 1000,
      },
      rateLimitStore,
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });

    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
    });

    expect(response.statusCode).toBe(429);
    expect(consumedKeys).toEqual(["203.0.113.10"]);
  });

  it("provides mock auth context without real login", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-mock-user-id": "user_test",
        "x-mock-organization-id": "org_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: null,
      provider: null,
      userId: "user_test",
      organizationId: "org_demo",
      role: "admin",
      source: "mock",
    });
  });

  it("maps trusted external IdP claims into the API auth context", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-searchops-idp-email": "editor@example.com",
        "x-searchops-idp-organization-id": "org_demo",
        "x-searchops-idp-provider": "auth0",
        "x-searchops-idp-role": "editor",
        "x-searchops-idp-subject": "idp_user_1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: "editor@example.com",
      provider: "auth0",
      userId: "idp_user_1",
      organizationId: "org_demo",
      role: "editor",
      source: "idp",
    });
  });

  it("uses external IdP tenant and role claims for route authorization", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization, otherOrganization],
        sites: [seededSite, otherSite],
      }),
    });
    const sameTenantResponse = await server.inject({
      method: "PATCH",
      url: "/sites/site_seed",
      headers: {
        "x-searchops-idp-organization-id": "org_demo",
        "x-searchops-idp-provider": "clerk",
        "x-searchops-idp-role": "editor",
        "x-searchops-idp-subject": "idp_editor_1",
      },
      payload: {
        name: "IdP editor edit",
      },
    });
    const crossTenantResponse = await server.inject({
      method: "GET",
      url: "/sites/site_other",
      headers: {
        "x-searchops-idp-organization-id": "org_demo",
        "x-searchops-idp-provider": "clerk",
        "x-searchops-idp-role": "editor",
        "x-searchops-idp-subject": "idp_editor_1",
      },
    });

    expect(sameTenantResponse.statusCode).toBe(200);
    expect(crossTenantResponse.statusCode).toBe(403);
    expect(crossTenantResponse.json()).toEqual({
      error: "forbidden",
      message: "User cannot access this organization",
    });
  });

  it("uses verified bearer token claims for deployed IdP authorization", async () => {
    const server = buildApiServer({
      authContextResolver: createRequestAuthContextResolver({
        allowMockFallback: false,
        allowTrustedHeaders: false,
        tokenVerifier: createHmacJwtIdpTokenVerifier({
          audience: "searchops-api",
          currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
          issuer: "https://idp.example.com/",
          organizationIdClaim: "org_id",
          provider: "auth0",
          secret: "idp_secret",
        }),
      }),
      repository: createMemoryRepository({
        organizations: [seededOrganization, otherOrganization],
        sites: [seededSite, otherSite],
      }),
    });
    const token = createSignedIdpToken({
      aud: "searchops-api",
      email: "owner@example.com",
      exp: 1_779_756_000,
      iss: "https://idp.example.com/",
      org_id: "org_demo",
      role: "owner",
      sub: "idp_owner_1",
    });

    const contextResponse = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const sameTenantResponse = await server.inject({
      method: "PATCH",
      url: "/sites/site_seed",
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        name: "Verified IdP edit",
      },
    });
    const crossTenantResponse = await server.inject({
      method: "GET",
      url: "/sites/site_other",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toMatchObject({
      email: "owner@example.com",
      organizationId: "org_demo",
      provider: "auth0",
      role: "owner",
      source: "idp",
      userId: "idp_owner_1",
    });
    expect(sameTenantResponse.statusCode).toBe(200);
    expect(crossTenantResponse.statusCode).toBe(403);
  });

  it("rejects incomplete external IdP claim headers before authorization side effects", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-searchops-idp-provider": "auth0",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error",
    });
  });

  it("rejects lone external IdP email headers instead of falling back to mock auth", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-searchops-idp-email": "editor@example.com",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error",
    });
  });

  it("limits organization lists to the authenticated tenant", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization, otherOrganization],
        sites: [seededSite, otherSite],
      }),
    });
    const response = await server.inject({
      method: "GET",
      url: "/organizations",
      headers: {
        "x-mock-organization-id": "org_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      organizations: [seededOrganization],
    });
  });

  it("blocks cross-tenant organization and site access", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization, otherOrganization],
        sites: [seededSite, otherSite],
      }),
    });
    const organizationResponse = await server.inject({
      method: "GET",
      url: "/organizations/org_other/sites",
      headers: {
        "x-mock-organization-id": "org_demo",
      },
    });
    const siteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_other",
      headers: {
        "x-mock-organization-id": "org_demo",
      },
    });

    expect(organizationResponse.statusCode).toBe(403);
    expect(organizationResponse.json()).toEqual({
      error: "forbidden",
      message: "User cannot access this organization",
    });
    expect(siteResponse.statusCode).toBe(403);
    expect(siteResponse.json()).toEqual({
      error: "forbidden",
      message: "User cannot access this organization",
    });
  });

  it("allows same-tenant reads but blocks viewer writes", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });
    const readResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed",
      headers: {
        "x-mock-organization-id": "org_demo",
        "x-mock-user-role": "viewer",
      },
    });
    const writeResponse = await server.inject({
      method: "PATCH",
      url: "/sites/site_seed",
      headers: {
        "x-mock-organization-id": "org_demo",
        "x-mock-user-role": "viewer",
      },
      payload: {
        name: "Viewer edit",
      },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
    expect(writeResponse.json()).toEqual({
      error: "forbidden",
      message: "User role cannot modify this resource",
    });
  });

  it("creates and lists organizations", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      payload: { name: "New Organization" },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ name: "New Organization" });

    const listResponse = await server.inject({
      method: "GET",
      url: "/organizations",
      headers: {
        "x-mock-user-role": "system",
      },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().organizations).toHaveLength(2);
  });

  it("creates, reads, updates, lists, and deletes sites", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/sites",
      payload: {
        domain: "ExampleClinic.COM",
        name: "Example Clinic",
        industry: "medical",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({
      organizationId: "org_demo",
      domain: "exampleclinic.com",
      name: "Example Clinic",
      industry: "medical",
      language: "ko",
      country: "KR",
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/organizations/org_demo/sites",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().sites).toHaveLength(1);

    const readResponse = await server.inject({ method: "GET", url: `/sites/${created.id}` });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().domain).toBe("exampleclinic.com");

    const updateResponse = await server.inject({
      method: "PATCH",
      url: `/sites/${created.id}`,
      payload: { name: "Updated Clinic", language: "en" },
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
      url: "/organizations/org_demo/sites",
      payload: { domain: "not-a-domain" },
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
        "x-mock-user-id": "user_crawler",
      },
      payload: {
        maxPages: 3,
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.crawlRun).toMatchObject({
      siteId: "site_seed",
      status: "queued",
      endedAt: null,
      summary: {
        startUrl: "https://exampleclinic.com/",
        maxPages: 3,
      },
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
        pages: [],
      },
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
        maxPages: 3,
      },
    });

    expect(response.statusCode).toBe(202);
    expect(crawlRunQueue.listQueuedCrawlJobs()[0]?.payload).toMatchObject({
      siteDomain: "exampleclinic.com",
      startUrl: "https://blog.exampleclinic.com/",
    });
  });

  it("rejects crawl start URLs outside the site domain or private network", async () => {
    const { server } = buildCrawlRunTestContext();
    const externalResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        startUrl: "https://example.net/",
        maxPages: 3,
      },
    });
    const privateResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/crawl-runs",
      payload: {
        startUrl: "http://169.254.169.254/latest/meta-data",
        maxPages: 3,
      },
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
      payload: {},
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
        "x-mock-user-id": "user_connector",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.connectorSyncRun).toMatchObject({
      id: "sync_0001",
      organizationId: "org_demo",
      siteId: "site_seed",
      status: "queued",
      providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
      requestedByUserId: "user_connector",
      fixture: true,
      endedAt: null,
      summary: null,
    });
    expect(body.job).toMatchObject({
      id: "job_0001",
      name: "connector-sync",
      payload: {
        connectorSyncRunId: "sync_0001",
        organizationId: "org_demo",
        siteId: "site_seed",
        siteDomain: "exampleclinic.com",
        requestedByUserId: "user_connector",
        providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
      },
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
        providers: ["pagespeed", "cms"],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().connectorSyncRun).toMatchObject({
      id: "sync_0001",
      providers: ["pagespeed", "cms"],
      status: "queued",
    });
    expect(response.json().job.payload).toMatchObject({
      connectorSyncRunId: "sync_0001",
      providers: ["pagespeed", "cms"],
    });
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()[0]?.payload.providers).toEqual([
      "pagespeed",
      "cms",
    ]);
  });

  it("marks connector sync runs failed when queue enqueue fails", async () => {
    const connectorSyncQueue: ConnectorSyncQueue = {
      async enqueueConnectorSync() {
        throw new Error("redis enqueue unavailable");
      },
    };
    const repository = createMemoryRepository({
      organizations: [seededOrganization],
      sites: [seededSite],
    });
    const server = buildApiServer({
      connectorSyncQueue,
      repository,
    });
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/connector-sync-runs",
      payload: {
        providers: ["pagespeed"],
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "queue_enqueue_failed",
      connectorSyncRun: {
        id: "sync_0001",
        status: "failed",
        summary: {
          error: {
            message: "redis enqueue unavailable",
            name: "Error",
          },
        },
      },
    });
    await expect(repository.getConnectorSyncRun("sync_0001")).resolves.toMatchObject({
      connectorSyncRun: {
        status: "failed",
        summary: {
          error: {
            message: "redis enqueue unavailable",
          },
        },
      },
    });
  });

  it("validates connector sync provider lists", async () => {
    const { server, connectorSyncQueue } = buildConnectorSyncTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/connector-sync-runs",
      payload: {
        providers: ["gsc", "gsc"],
      },
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
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(connectorSyncQueue.listQueuedConnectorSyncJobs()).toHaveLength(0);
  });

  it("lists connector sync run history for a site", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/connector-sync-runs",
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
        totalRecords: 1,
      },
    });
  });

  it("reads connector sync run details with persisted results", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/connector-sync-runs/sync_seed",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connectorSyncRun: {
        id: "sync_seed",
        status: "completed",
      },
      results: [
        {
          id: "sync_result_seed",
          provider: "pagespeed",
          recordCount: 1,
        },
      ],
    });
  });

  it("returns 404 for missing connector sync history resources", async () => {
    const server = buildConnectorSyncHistoryTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/connector-sync-runs",
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/connector-sync-runs/sync_missing",
    });

    expect(listResponse.statusCode).toBe(404);
    expect(detailResponse.statusCode).toBe(404);
    expect(listResponse.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(detailResponse.json()).toEqual({
      error: "not_found",
      message: "Connector sync run not found",
    });
  });

  it("starts Google OAuth for GSC and GA4 connectors", async () => {
    const { server } = buildConnectorOAuthTestContext();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/connectors/google/oauth/start?providers=gsc,ga4&format=json",
      headers: {
        "x-mock-user-id": "user_connector",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      authorizationUrl: expect.stringContaining("https://accounts.google.com/o/oauth2/v2/auth"),
      providers: ["gsc", "ga4"],
      stateExpiresAt: "2026-05-27T00:10:00.000Z",
    });
  });

  it("stores Google OAuth callback credentials without returning tokens", async () => {
    const { server } = buildConnectorOAuthTestContext();
    const response = await server.inject({
      method: "GET",
      url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "connected",
      credentials: [
        {
          provider: "ga4",
          status: "connected",
          externalAccountEmail: "owner@example.com",
        },
        {
          provider: "gsc",
          status: "connected",
          externalAccountEmail: "owner@example.com",
        },
      ],
    });
    expect(response.json().credentials[0]).not.toHaveProperty("accessToken");

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/connectors/oauth",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().credentials).toHaveLength(2);
  });

  it("rejects invalid Google OAuth callback state", async () => {
    const { server } = buildConnectorOAuthTestContext();
    const response = await server.inject({
      method: "GET",
      url: "/connectors/google/oauth/callback?state=bad_state&code=code_123",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("invalid state");
  });

  it("creates deterministic AEO readiness reports and persists them", async () => {
    const server = buildAeoReadinessTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/aeo-readiness-reports",
      payload: {
        keyword: {
          phrase: "seo clinic price comparison",
          intent: "commercial",
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
          answerBlocks: [],
        },
        evaluatedAt: "2026-05-23T00:00:00.000Z",
      },
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
        evaluatedAt: "2026-05-23T00:00:00.000Z",
      },
      readinessReport: {
        status: "needs_work",
        generatedBy: "deterministic",
      },
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/aeo-readiness-reports",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().reports).toHaveLength(2);
    expect(listResponse.json().reports[0]).toMatchObject({
      phrase: "seo clinic price comparison",
      generatedBy: "deterministic",
    });
  });

  it("lists persisted AEO readiness report history", async () => {
    const server = buildAeoReadinessTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/aeo-readiness-reports",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reports).toHaveLength(1);
    expect(response.json().reports[0]).toMatchObject({
      id: "aeo_report_seed",
      phrase: "seo clinic",
      score: 68,
      generatedBy: "deterministic",
    });
  });

  it("returns 404 for missing AEO readiness report site resources", async () => {
    const server = buildAeoReadinessTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/aeo-readiness-reports",
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/aeo-readiness-reports",
      payload: {
        keyword: {
          phrase: "seo clinic",
        },
      },
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
          phrase: "",
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("keyword");
  });

  it("creates deterministic keyword discoveries from connector sync results", async () => {
    const server = buildKeywordDiscoveryTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/keyword-discoveries",
      payload: {
        connectorSyncRunId: "sync_keyword_seed",
        discoveredAt: "2026-05-25T00:00:00.000Z",
        minImpressions: 10,
        maxCandidates: 10,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      discoverySet: {
        siteId: "site_seed",
        generatedBy: "deterministic",
        discoveredAt: "2026-05-25T00:00:00.000Z",
      },
      candidates: [
        {
          siteId: "site_seed",
          phrase: "seo clinic",
          source: "gsc",
          pageUrl: "https://exampleclinic.com/service/seo",
          generatedBy: "deterministic",
        },
        {
          siteId: "site_seed",
          phrase: "medical seo checklist",
          source: "cms",
          pageUrl: "https://exampleclinic.com/blog/medical-seo-checklist",
          generatedBy: "deterministic",
        },
      ],
    });
    expect(response.json().discoverySet.candidates.map((candidate: { keyword: { phrase: string } }) => candidate.keyword.phrase)).toEqual([
      "seo clinic",
      "medical seo checklist",
    ]);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/keyword-discoveries",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().candidates.map((candidate: { phrase: string }) => candidate.phrase)).toEqual([
      "seo clinic",
      "seed keyword discovery",
      "medical seo checklist",
    ]);
  });

  it("lists persisted keyword discovery candidates", async () => {
    const server = buildKeywordDiscoveryTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/keyword-discoveries",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().candidates).toHaveLength(1);
    expect(response.json().candidates[0]).toMatchObject({
      id: "keyword_discovery_seed",
      phrase: "seed keyword discovery",
      source: "gsc",
      generatedBy: "deterministic",
    });
  });

  it("rejects keyword discovery for missing or cross-site connector sync history", async () => {
    const otherSite: Site = {
      ...seededSite,
      id: "site_other",
      domain: "other.exampleclinic.com",
    };
    const server = buildApiServer({
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite, otherSite],
        connectorSyncRuns: [seededKeywordDiscoverySyncRun],
        connectorSyncResults: seededKeywordDiscoveryResults,
      }),
    });

    const missingSiteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/keyword-discoveries",
    });
    const missingSyncResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/keyword-discoveries",
      payload: {
        connectorSyncRunId: "sync_missing",
      },
    });
    const crossSiteResponse = await server.inject({
      method: "POST",
      url: "/sites/site_other/keyword-discoveries",
      payload: {
        connectorSyncRunId: "sync_keyword_seed",
      },
    });

    expect(missingSiteResponse.statusCode).toBe(404);
    expect(missingSyncResponse.statusCode).toBe(404);
    expect(crossSiteResponse.statusCode).toBe(400);
    expect(crossSiteResponse.json().message).toContain("connectorSyncRunId");
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
          domain: "exampleclinic.com",
        },
        observations: [
          {
            provider: "chatgpt",
            query: "best seo clinic",
            answerText: "Example Clinic is a visible SEO clinic option.",
            citedUrls: ["https://exampleclinic.com/services/seo"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture",
          },
          {
            provider: "perplexity",
            query: "medical seo checklist",
            answerText: "Example Clinic publishes a medical SEO checklist.",
            citedUrls: ["https://exampleclinic.com/blog/medical-seo-checklist"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture",
          },
          {
            provider: "gemini",
            query: "seo clinic near gangnam",
            answerText: "Example Clinic appears for local SEO clinic research.",
            citedUrls: ["https://exampleclinic.com/locations/gangnam"],
            observedAt: "2026-05-24T00:00:00.000Z",
            source: "fixture",
          },
        ],
        evaluatedAt: "2026-05-24T00:00:00.000Z",
      },
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
        generatedBy: "deterministic",
      },
      visibilityReport: {
        target: {
          siteId: "site_seed",
        },
        status: "strong",
        queryCount: 3,
        providerCount: 3,
      },
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/geo-visibility-reports",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().reports).toHaveLength(2);
  });

  it("enqueues GEO answer monitor jobs for deterministic worker evaluation", async () => {
    const { server, geoAnswerMonitorQueue } = buildGeoAnswerMonitorTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-answer-monitor-jobs",
      headers: {
        "x-mock-user-id": "user_geo",
      },
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "Example Clinic",
          domain: "answers.exampleclinic.com",
          locale: "ko-KR",
          market: "KR",
        },
        queries: [
          {
            query: "best seo clinic",
            locale: "ko-KR",
          },
        ],
        providers: ["chatgpt"],
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      job: {
        id: "job_0001",
        name: "geo-answer-monitor",
        payload: {
          organizationId: "org_demo",
          siteId: "site_seed",
          siteDomain: "exampleclinic.com",
          requestedByUserId: "user_geo",
          observedAt: "2026-05-26T00:00:00.000Z",
          providers: ["chatgpt"],
          target: {
            siteId: "site_seed",
            brandName: "Example Clinic",
            domain: "answers.exampleclinic.com",
          },
        },
      },
    });
    expect(geoAnswerMonitorQueue.listQueuedGeoAnswerMonitorJobs()).toHaveLength(1);
  });

  it("rejects GEO answer monitor jobs outside the routed site scope", async () => {
    const { server, geoAnswerMonitorQueue } = buildGeoAnswerMonitorTestContext();
    const mismatchedSiteResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-answer-monitor-jobs",
      payload: {
        target: {
          siteId: "site_other",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
        },
        queries: [{ query: "best seo clinic" }],
      },
    });
    const outOfScopeDomainResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-answer-monitor-jobs",
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "Example Clinic",
          domain: "example.net",
        },
        queries: [{ query: "best seo clinic" }],
      },
    });
    const missingSiteResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/geo-answer-monitor-jobs",
      payload: {
        target: {
          siteId: "site_missing",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
        },
        queries: [{ query: "best seo clinic" }],
      },
    });

    expect(mismatchedSiteResponse.statusCode).toBe(400);
    expect(mismatchedSiteResponse.json().message).toContain("siteId");
    expect(outOfScopeDomainResponse.statusCode).toBe(400);
    expect(outOfScopeDomainResponse.json().message).toContain("site domain");
    expect(missingSiteResponse.statusCode).toBe(404);
    expect(geoAnswerMonitorQueue.listQueuedGeoAnswerMonitorJobs()).toHaveLength(0);
  });

  it("lists persisted GEO visibility report history", async () => {
    const server = buildGeoVisibilityTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/geo-visibility-reports",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reports).toEqual([
      expect.objectContaining({
        id: "geo_report_seed",
        status: "visible",
        generatedBy: "deterministic",
      }),
    ]);
  });

  it("converts GEO visibility reports to idempotent work orders", async () => {
    const server = buildGeoVisibilityTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_seed/work-order",
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_seed/work-order",
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      report: {
        id: "geo_report_seed",
        status: "visible",
      },
      workOrder: {
        geoVisibilityReportId: "geo_report_seed",
        ownerType: "marketer",
        priority: "p2",
        status: "open",
        title: "Example Clinic GEO visibility improvement",
      },
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toEqual([
      expect.objectContaining({
        geoVisibilityReportId: "geo_report_seed",
        title: "Example Clinic GEO visibility improvement",
      }),
    ]);
  });

  it("returns 404 for missing GEO visibility report work order conversion", async () => {
    const server = buildGeoVisibilityTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/geo-visibility-reports/geo_report_missing/work-order",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "not_found",
      message: "GEO visibility report not found",
    });
  });

  it("returns 404 for missing GEO visibility report site resources", async () => {
    const server = buildGeoVisibilityTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/geo-visibility-reports",
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_missing",
          brandName: "Example Clinic",
          domain: "exampleclinic.com",
        },
        observations: [
          {
            provider: "manual",
            query: "seo clinic",
            answerText: "",
            citedUrls: [],
            observedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
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
          domain: "exampleclinic.com",
        },
        observations: [],
      },
    });
    const outOfScopeResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/geo-visibility-reports",
      payload: {
        target: {
          siteId: "site_seed",
          brandName: "Example Clinic",
          domain: "example.net",
        },
        observations: [
          {
            provider: "manual",
            query: "seo clinic",
            answerText: "",
            citedUrls: [],
            observedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
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
        evaluatedAt: "2026-05-24T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        status: "blocked",
        overallRiskLevel: "critical",
        generatedBy: "deterministic",
        publishPolicy: "draft_only",
        rulePackId: "kr-medical",
      },
    });
    expect(response.json().complianceFlags.map((flag: { ruleId: string }) => flag.ruleId)).toEqual([
      "GUARANTEED_RESULT_CLAIM",
      "ABSOLUTE_SAFETY_CLAIM",
    ]);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/compliance-flags",
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
        evaluatedAt: "2026-05-24T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      report: {
        rulePackId: "kr-medical",
        status: "blocked",
      },
    });
    expect(response.json().complianceFlags.map((flag: { ruleId: string }) => flag.ruleId)).toEqual([
      "ABSOLUTE_SAFETY_CLAIM",
      "PRICE_DISCOUNT_PROMOTION",
    ]);
  });

  it("lists and updates persisted compliance flags", async () => {
    const server = buildComplianceTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/compliance-flags",
    });
    const updateResponse = await server.inject({
      method: "PATCH",
      url: "/compliance-flags/compliance_flag_seed",
      payload: {
        status: "approved",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().complianceFlags).toEqual([
      expect.objectContaining({
        id: "compliance_flag_seed",
        ruleId: "ABSOLUTE_SAFETY_CLAIM",
        status: "open",
      }),
    ]);
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: "compliance_flag_seed",
      status: "approved",
    });
  });

  it("converts compliance flags to idempotent work orders", async () => {
    const server = buildComplianceTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order",
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order",
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "in_review",
        workOrderId: "wo_0001",
      },
      workOrder: {
        id: "wo_0001",
        ownerType: "legal",
        priority: "p1",
        title: "/services/botox Absolute safety claim",
      },
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toEqual([
      expect.objectContaining({
        ownerType: "legal",
        title: "/services/botox Absolute safety claim",
      }),
    ]);
  });

  it("rechecks revised compliance copy and resolves linked work orders", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order",
    });

    const response = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        evaluatedAt: "2026-05-24T01:00:00.000Z",
        text: "This clinic explains consultation steps, possible discomfort, and individual variation.",
        url: "https://exampleclinic.com/services/botox",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resolved: true,
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "resolved",
        workOrderId: "wo_0001",
      },
      report: {
        flags: [],
        status: "clear",
      },
      workOrder: {
        id: "wo_0001",
        status: "done",
      },
    });
  });

  it("keeps compliance flags actionable when recheck still finds the same rule", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order",
    });

    const response = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        text: "This clinic treatment is completely safe for every patient.",
        url: "https://exampleclinic.com/services/botox",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resolved: false,
      complianceFlag: {
        id: "compliance_flag_seed",
        status: "in_review",
        ruleId: "ABSOLUTE_SAFETY_CLAIM",
      },
      report: {
        status: "blocked",
      },
      workOrder: {
        id: "wo_0001",
        status: "open",
      },
    });
  });

  it("triggers compliance rechecks from CMS content updated events", async () => {
    const server = buildComplianceTestServer();
    await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/work-order",
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      event: {
        provider: "cms",
        source: "cms",
        status: "draft",
      },
      matchedFlagCount: 1,
      skippedFlagCount: 0,
      rechecks: [
        {
          resolved: true,
          complianceFlag: {
            id: "compliance_flag_seed",
            status: "resolved",
          },
          report: {
            input: {
              source: "cms",
              subjectId: "page_seed",
              subjectType: "page_copy",
            },
            flags: [],
            status: "clear",
          },
          workOrder: {
            id: "wo_0001",
            status: "done",
          },
        },
      ],
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
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
            status: "open",
          },
          report: {
            status: "blocked",
          },
          workOrder: null,
        },
      ],
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchedFlagCount: 0,
      rechecks: [],
      skippedFlagCount: 0,
    });
  });

  it("accepts signed CMS content events when webhook security is configured", async () => {
    const server = buildSecuredComplianceTestServer();
    const request = createSignedCmsEventRequest({
      siteId: "site_seed",
      cmsType: "wordpress",
      externalId: "page_seed",
      url: "https://exampleclinic.com/services/botox",
      text: "This clinic explains consultation steps, possible discomfort, and individual variation.",
      updatedAt: "2026-05-24T02:00:00.000Z",
    });

    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      ...request,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchedFlagCount: 1,
      rechecks: [
        {
          resolved: true,
        },
      ],
    });
  });

  it("normalizes signed provider-specific CMS webhook payloads before recheck", async () => {
    const server = buildSecuredComplianceTestServer();
    const payload = {
      id: "page_seed",
      link: "https://exampleclinic.com/services/botox",
      content: {
        rendered:
          "<p>This clinic explains consultation steps, possible discomfort, and individual variation.</p>",
      },
      modified_gmt: "2026-05-24T02:00:00",
      status: "publish",
      title: {
        rendered: "Botox guide",
      },
    };
    const event = normalizeCmsWebhookPayload("wordpress", {
      defaultIndustry: seededSite.industry,
      defaultLocale: `${seededSite.language}-${seededSite.country}`,
      payload,
      receivedAt: "2026-05-24T02:01:00.000Z",
      siteDomain: seededSite.domain,
      siteId: seededSite.id,
    });
    const request = createSignedCmsProviderWebhookRequest({ event, payload });

    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/webhooks/wordpress",
      ...request,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      event: {
        cmsType: "wordpress",
        externalId: "page_seed",
        status: "published",
      },
      matchedFlagCount: 1,
      rechecks: [
        {
          resolved: true,
        },
      ],
    });
  });

  it("records closed-loop audit events for CMS-triggered compliance resolution", async () => {
    const server = buildSecuredComplianceAuditTestServer();
    const request = createSignedCmsEventRequest({
      siteId: "site_seed",
      cmsType: "wordpress",
      externalId: "page_seed",
      url: "https://exampleclinic.com/services/botox",
      text: "This clinic explains consultation steps, possible discomfort, and individual variation.",
      updatedAt: "2026-05-24T02:00:00.000Z",
    });

    const cmsResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/cms/content-updated-events",
      ...request,
    });
    const auditResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/closed-loop-audit-events",
    });

    expect(cmsResponse.statusCode).toBe(200);
    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json()).toMatchObject({
      auditEvents: expect.arrayContaining([
        expect.objectContaining({
          eventType: "cms_content_updated",
          status: "received",
        }),
        expect.objectContaining({
          eventType: "compliance_recheck",
          status: "resolved",
          complianceFlagId: "compliance_flag_seed",
          workOrderId: "wo_compliance_seed",
        }),
        expect.objectContaining({
          eventType: "compliance_flag_resolved",
          status: "resolved",
        }),
        expect.objectContaining({
          eventType: "work_order_done",
          status: "done",
          workOrderId: "wo_compliance_seed",
        }),
      ]),
    });
  });

  it("rejects unsigned, stale, mismatched, or invalid CMS webhook signatures", async () => {
    const server = buildSecuredComplianceTestServer();
    const payload = {
      siteId: "site_seed",
      cmsType: "wordpress",
      externalId: "page_seed",
      url: "https://exampleclinic.com/services/botox",
      text: "This clinic explains risks and consultation steps.",
      updatedAt: "2026-05-24T02:00:00.000Z",
    };
    const signedRequest = createSignedCmsEventRequest(payload);
    const staleRequest = createSignedCmsEventRequest(payload);
    staleRequest.headers["x-searchops-timestamp"] = "2026-05-24T01:55:00.000Z";
    staleRequest.headers["x-searchops-signature"] = createCmsWebhookSignature({
      event: CmsContentUpdatedEventRequestSchema.parse(payload),
      secret: "cms_secret_1",
      timestamp: "2026-05-24T01:55:00.000Z",
    });

    const unsignedResponse = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/content-updated-events",
    });
    const invalidSignatureResponse = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/content-updated-events",
      headers: {
        ...signedRequest.headers,
        "x-searchops-signature":
          "sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
    const staleTimestampResponse = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/content-updated-events",
      headers: staleRequest.headers,
    });
    const cmsTypeMismatchResponse = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/content-updated-events",
      headers: {
        ...signedRequest.headers,
        "x-searchops-cms-type": "webflow",
      },
    });

    expect(unsignedResponse.statusCode).toBe(401);
    expect(invalidSignatureResponse.statusCode).toBe(401);
    expect(staleTimestampResponse.statusCode).toBe(401);
    expect(cmsTypeMismatchResponse.statusCode).toBe(401);
  });

  it("validates compliance review route scope and missing resources", async () => {
    const server = buildComplianceTestServer();
    const siteMismatchResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_other",
        subjectType: "page_copy",
        text: "This medical clinic is completely safe.",
      },
    });
    const outOfScopeResponse = await server.inject({
      method: "POST",
      url: "/sites/site_seed/compliance-reviews",
      payload: {
        siteId: "site_seed",
        subjectType: "page_copy",
        url: "https://example.net/services/botox",
        text: "This medical clinic is completely safe.",
      },
    });
    const missingSiteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/compliance-flags",
    });
    const missingFlagResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_missing/work-order",
    });
    const outOfScopeRecheckResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_seed/recheck",
      payload: {
        text: "This clinic explains risks and consultation steps.",
        url: "https://example.net/services/botox",
      },
    });
    const missingRecheckResponse = await server.inject({
      method: "POST",
      url: "/compliance-flags/compliance_flag_missing/recheck",
      payload: {
        text: "This clinic explains risks and consultation steps.",
      },
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
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
        updatedAt: "2026-05-24T02:00:00.000Z",
      },
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
        snapshots: [createSchemaSnapshot()],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      recommendationSets: [
        {
          siteId: "site_seed",
          pageUrl: "https://exampleclinic.com/services/seo",
          generatedBy: "deterministic",
        },
      ],
    });
    expect(
      response
        .json()
        .recommendations.map((recommendation: { type: string }) => recommendation.type),
    ).toEqual(["WebPage", "BreadcrumbList", "FAQPage", "Service", "MedicalClinic"]);
    expect(response.json().recommendations[3]).toMatchObject({
      siteId: "site_seed",
      pageUrl: "https://exampleclinic.com/services/seo",
      type: "Service",
      priority: "p1",
      status: "open",
      generatedBy: "deterministic",
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/schema-recommendations",
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
        snapshots: [createSchemaSnapshot()],
      },
    });

    expect(response.statusCode).toBe(201);
    const serviceRecommendation = response
      .json()
      .recommendations.find(
        (recommendation: { type: string }) => recommendation.type === "Service",
      );
    expect(serviceRecommendation).toMatchObject({
      id: "schema_rec_seed",
      type: "Service",
      status: "open",
    });
  });

  it("lists and reads persisted schema recommendations", async () => {
    const server = buildSchemaRecommendationTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/schema-recommendations",
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/schema-recommendations/schema_rec_seed",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().recommendations).toHaveLength(1);
    expect(listResponse.json().recommendations[0]).toMatchObject({
      id: "schema_rec_seed",
      type: "Service",
      generatedBy: "deterministic",
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      recommendation: {
        id: "schema_rec_seed",
        pageUrl: "https://exampleclinic.com/services/seo",
      },
    });
  });

  it("converts a schema recommendation to an idempotent work order", async () => {
    const server = buildSchemaRecommendationTestServer();
    const firstResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order",
    });
    const secondResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order",
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      recommendation: {
        id: "schema_rec_seed",
        status: "converted",
      },
      workOrder: {
        id: "wo_0001",
        siteId: "site_seed",
        seoIssueId: null,
        schemaRecommendationId: "schema_rec_seed",
        priority: "p1",
        title: "/services/seo Service JSON-LD implementation",
        ownerType: "developer",
        relatedIssues: ["SCHEMA_MISSING"],
      },
    });
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json().workOrder.id).toBe(firstResponse.json().workOrder.id);

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().workOrders).toHaveLength(1);
    expect(listResponse.json().workOrders[0]).toMatchObject({
      schemaRecommendationId: "schema_rec_seed",
    });
  });

  it("marks schema recommendations and linked work orders resolved after recheck", async () => {
    const server = buildSchemaRecommendationTestServer();
    await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order",
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
                "@type": "Service",
              },
            },
          ],
        }),
      },
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
          observedTypes: ["Service"],
        },
      },
      workOrder: {
        schemaRecommendationId: "schema_rec_seed",
        status: "done",
      },
    });
  });

  it("queues one-page crawl orchestration for schema recommendation rechecks", async () => {
    const { crawlRunQueue, server } = buildSchemaRecommendationRecheckCrawlTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck-crawl",
      headers: {
        "x-mock-user-id": "user_schema",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      crawlRun: {
        siteId: "site_seed",
        status: "queued",
      },
      job: {
        name: "crawl",
        payload: {
          maxPages: 1,
          requestedByUserId: "user_schema",
          schemaRecommendationId: "schema_rec_seed",
          siteDomain: "exampleclinic.com",
          startUrl: "https://exampleclinic.com/services/seo",
        },
      },
      recommendation: {
        id: "schema_rec_seed",
        pageUrl: "https://exampleclinic.com/services/seo",
      },
    });
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
  });

  it("queues rich-result validation jobs for schema recommendations", async () => {
    const { schemaRichResultValidationQueue, server } =
      buildSchemaRichResultValidationQueueTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/rich-result-validation-jobs",
      headers: {
        "x-mock-user-id": "user_schema",
      },
      payload: {
        requestedAt: "2026-05-26T01:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      recommendation: {
        id: "schema_rec_seed",
      },
      job: {
        id: "job_0001",
        name: "schema-rich-result-validation",
        payload: {
          recommendationId: "schema_rec_seed",
          siteId: "site_seed",
          siteDomain: "exampleclinic.com",
          requestedByUserId: "user_schema",
          requestedAt: "2026-05-26T01:00:00.000Z",
          url: "https://exampleclinic.com/services/seo",
          type: "Service",
        },
      },
    });
    expect(
      schemaRichResultValidationQueue.listQueuedSchemaRichResultValidationJobs(),
    ).toHaveLength(1);
  });

  it("keeps unresolved schema recommendations actionable after recheck", async () => {
    const server = buildSchemaRecommendationTestServer();
    await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/work-order",
    });

    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot(),
      },
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
          observedTypes: [],
        },
      },
      workOrder: {
        schemaRecommendationId: "schema_rec_seed",
        status: "open",
      },
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
            status: "dismissed",
          },
        ],
      }),
    });
    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_dismissed/work-order",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Dismissed");
  });

  it("returns 404 for missing schema recommendation resources", async () => {
    const server = buildSchemaRecommendationTestServer();
    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/schema-recommendations",
    });
    const createResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/schema-recommendations",
      payload: {
        snapshots: [createSchemaSnapshot()],
      },
    });
    const detailResponse = await server.inject({
      method: "GET",
      url: "/schema-recommendations/schema_rec_missing",
    });
    const workOrderResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/work-order",
    });
    const recheckResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/recheck",
      payload: {
        snapshot: createSchemaSnapshot(),
      },
    });
    const recheckCrawlResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/recheck-crawl",
    });
    const richResultValidationResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_missing/rich-result-validation-jobs",
    });

    expect(listResponse.statusCode).toBe(404);
    expect(createResponse.statusCode).toBe(404);
    expect(detailResponse.statusCode).toBe(404);
    expect(workOrderResponse.statusCode).toBe(404);
    expect(recheckResponse.statusCode).toBe(404);
    expect(recheckCrawlResponse.statusCode).toBe(404);
    expect(richResultValidationResponse.statusCode).toBe(404);
  });

  it("validates schema recommendation request payloads", async () => {
    const server = buildSchemaRecommendationTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/schema-recommendations",
      payload: {
        snapshots: [],
      },
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
            url: "https://example.net/services/seo",
          }),
        ],
      },
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
          url: "https://exampleclinic.com/services/other",
        }),
      },
    });
    const scopeResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck",
      payload: {
        snapshot: createSchemaSnapshot({
          finalUrl: "https://example.net/services/seo",
        }),
      },
    });

    expect(mismatchResponse.statusCode).toBe(400);
    expect(mismatchResponse.json().message).toContain("pageUrl");
    expect(scopeResponse.statusCode).toBe(400);
    expect(scopeResponse.json().message).toContain("site domain");
  });

  it("rejects schema recommendation recheck crawl outside the site scope", async () => {
    const crawlRunQueue = createMemoryCrawlRunQueue();
    const schemaRichResultValidationQueue = createMemorySchemaRichResultValidationQueue();
    const server = buildApiServer({
      crawlRunQueue,
      schemaRichResultValidationQueue,
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
        schemaRecommendations: [
          {
            ...seededSchemaRecommendation,
            pageUrl: "https://example.net/services/seo",
          },
        ],
      }),
    });

    const response = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/recheck-crawl",
    });
    const validationResponse = await server.inject({
      method: "POST",
      url: "/schema-recommendations/schema_rec_seed/rich-result-validation-jobs",
    });

    expect(response.statusCode).toBe(400);
    expect(validationResponse.statusCode).toBe(400);
    expect(response.json().message).toContain("pageUrl");
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(0);
    expect(
      schemaRichResultValidationQueue.listQueuedSchemaRichResultValidationJobs(),
    ).toHaveLength(0);
  });

  it("creates deterministic content brief drafts and persists them", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic price comparison",
          intent: "commercial",
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
          answerBlocks: [],
        },
        evaluatedAt: "2026-05-23T00:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      contentBrief: {
        siteId: "site_seed",
        keywordId: "keyword_0001",
        primaryKeyword: "seo clinic price comparison",
        status: "draft",
        generationMode: "deterministic",
        publishPolicy: "draft_only",
      },
      draft: {
        keywordId: null,
        status: "draft",
        publishPolicy: "draft_only",
      },
      faqGapSet: {
        generatedBy: "deterministic",
        pageUrl: "https://exampleclinic.com/service/seo",
      },
      readinessReport: {
        status: "needs_work",
        generatedBy: "deterministic",
      },
    });
    expect(response.json().faqGapSet.gaps.map((gap: { question: string }) => gap.question)).toEqual(
      [
        "What does seo clinic price comparison include?",
        "How much does seo clinic price comparison cost?",
        "How should users compare seo clinic price comparison options?",
      ],
    );

    const listResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/content-briefs",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().contentBriefs).toHaveLength(2);
    expect(listResponse.json().contentBriefs[0]).toMatchObject({
      primaryKeyword: "seo clinic price comparison",
      publishPolicy: "draft_only",
    });
  });

  it("reads persisted content brief details", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/content-briefs/brief_seed",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      contentBrief: {
        id: "brief_seed",
        primaryKeyword: "seo clinic",
        status: "draft",
        outline: [
          {
            heading: "Direct answer",
          },
        ],
      },
    });
  });

  it("rejects invalid content brief mapper input", async () => {
    const server = buildContentBriefTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/sites/site_seed/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic",
        },
        readinessReport: {
          keyword: {
            siteId: "site_seed",
            phrase: "different keyword",
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
                sourceField: "keyword.intent",
              },
            },
          ],
          generatedBy: "deterministic",
          evaluatedAt: "2026-05-23T00:00:00.000Z",
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("readinessReport");
  });

  it("returns 404 for missing content brief resources", async () => {
    const server = buildContentBriefTestServer();
    const missingSiteListResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/content-briefs",
    });
    const missingSiteCreateResponse = await server.inject({
      method: "POST",
      url: "/sites/site_missing/content-briefs",
      payload: {
        keyword: {
          phrase: "seo clinic",
        },
      },
    });
    const missingBriefResponse = await server.inject({
      method: "GET",
      url: "/content-briefs/brief_missing",
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
        maxPages: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("maxPages");
  });

  it("lists work orders for a site", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/work-orders",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().workOrders).toHaveLength(1);
    expect(response.json().workOrders[0]).toMatchObject({
      id: "wo_seed",
      siteId: "site_seed",
      status: "open",
      priority: "p1",
      ownerType: "content",
    });
  });

  it("reads and updates work order board fields", async () => {
    const server = buildWorkOrderTestServer();
    const readResponse = await server.inject({
      method: "GET",
      url: "/work-orders/wo_seed",
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
        dueDate: "2026-05-21T00:00:00.000Z",
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: "wo_seed",
      status: "in_progress",
      priority: "p0",
      assignedTo: "user_content_1",
      dueDate: "2026-05-21T00:00:00.000Z",
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
        dueDate: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ assignedTo: null, dueDate: null });
  });

  it("returns 404 for missing work board resources", async () => {
    const server = buildWorkOrderTestServer();
    const missingSiteResponse = await server.inject({
      method: "GET",
      url: "/sites/site_missing/work-orders",
    });
    const missingWorkOrderResponse = await server.inject({
      method: "GET",
      url: "/work-orders/wo_missing",
    });

    expect(missingSiteResponse.statusCode).toBe(404);
    expect(missingSiteResponse.json()).toEqual({ error: "not_found", message: "Site not found" });
    expect(missingWorkOrderResponse.statusCode).toBe(404);
    expect(missingWorkOrderResponse.json()).toEqual({
      error: "not_found",
      message: "Work order not found",
    });
  });

  it("validates work order update payloads", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/work-orders/wo_seed",
      payload: {
        status: "shipped",
      },
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
        "x-mock-user-id": "user_recheck",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.workOrder).toMatchObject({
      id: "wo_seed",
      status: "in_review",
    });
    expect(body.crawlRun).toMatchObject({
      siteId: "site_seed",
      status: "queued",
      summary: {
        startUrl: "https://exampleclinic.com/services",
        maxPages: 1,
      },
    });
    expect(body.job.payload).toMatchObject({
      crawlRunId: body.crawlRun.id,
      siteId: "site_seed",
      siteDomain: "exampleclinic.com",
      requestedByUserId: "user_recheck",
      startUrl: "https://exampleclinic.com/services",
      maxPages: 1,
      pages: [],
    });
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(1);
  });

  it("rejects work order rechecks outside the site scope", async () => {
    const { server, crawlRunQueue } = buildWorkOrderRecheckTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/work-orders/wo_seed/recheck",
      payload: {
        startUrl: "https://example.net/services",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("recheck startUrl");
    expect(crawlRunQueue.listQueuedCrawlJobs()).toHaveLength(0);
  });

  it("marks a work order and linked SEO issue resolved", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/work-orders/wo_seed/resolve",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      workOrder: {
        id: "wo_seed",
        status: "done",
      },
      seoIssue: {
        id: "issue_seed",
        status: "resolved",
      },
    });
  });

  it("returns 404 for missing work order recheck resources", async () => {
    const { server } = buildWorkOrderRecheckTestContext();
    const recheckResponse = await server.inject({
      method: "POST",
      url: "/work-orders/wo_missing/recheck",
    });
    const resolveResponse = await server.inject({
      method: "POST",
      url: "/work-orders/wo_missing/resolve",
    });

    expect(recheckResponse.statusCode).toBe(404);
    expect(resolveResponse.statusCode).toBe(404);
  });
});
