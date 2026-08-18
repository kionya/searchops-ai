import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  AeoReadinessReportRecord,
  ComplianceFlag,
  ConnectorSyncResult,
  ConnectorSyncRun,
  ContentBrief,
  CmsContentUpdatedEventRequest,
  CrawlRun,
  CrawlerPageSnapshot,
  DeadLetterJobRecord,
  GeoVisibilityReportRecord,
  KeywordDiscoveryCandidateRecord,
  Organization,
  ProviderAccountMetadata,
  SchemaRecommendationRecord,
  SeoIssue,
  Site,
  SiteConnector,
  UrlRecord,
  WorkOrder,
} from "@searchops/types";
import { CmsContentUpdatedEventRequestSchema } from "@searchops/types";
import { normalizeCmsWebhookPayload } from "@searchops/connectors";
import type {
  ConnectorCredentialReadinessSnapshot,
  ProviderCredentialStore,
} from "@searchops/db";

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
import {
  ProviderAccountServiceError,
  type ProviderAccountService,
} from "./provider-account-service.js";
import {
  createCmsNativeWebhookSignature,
  createCmsWebhookSignature,
} from "./webhook-security.js";
import {
  createHmacJwtIdpTokenVerifier,
  createRequestAuthContextResolver,
  type AuthContextResolver,
} from "./auth.js";
import type { GoogleConnectorOAuthClient } from "./google-oauth.js";
import type { GoogleOAuthStateStore } from "./google-oauth-state-store.js";
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
    setupRequiredProviders: 0,
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
    setupRequiredProviders: 0,
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
  credentialSources: {},
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
  urlRecordId: "url_seed",
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
const seededCrawlRun: CrawlRun = {
  id: "crawl_seed",
  siteId: "site_seed",
  status: "completed",
  startedAt: createdAt,
  endedAt: createdAt,
  summary: {
    pagesProcessed: 1,
  },
};
const seededUrlRecord: UrlRecord = {
  id: "url_seed",
  siteId: "site_seed",
  crawlRunId: "crawl_seed",
  url: "https://exampleclinic.com/services",
  statusCode: 200,
  title: "Services",
  metaDescription: null,
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
        stateIdentifier: "start-nonce",
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
        externalAccountId: "google-sub-123",
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
        nonce: "callback-nonce",
        organizationId: seededSite.organizationId,
        providers: ["gsc", "ga4"],
        requestedByUserId: "user_connector",
        returnTo: null,
        siteId: seededSite.id,
      };
    },
  };
}

function createFakeGoogleOAuthStateStore(
  initialIdentifiers: readonly string[] = ["callback-nonce"],
): GoogleOAuthStateStore {
  const active = new Set(initialIdentifiers);
  return {
    async issue(input) {
      if (active.has(input.identifier)) {
        return false;
      }
      active.add(input.identifier);
      return true;
    },
    async consume(identifier) {
      if (!active.has(identifier)) {
        return false;
      }
      active.delete(identifier);
      return true;
    },
  };
}

const googleOAuthProviderAccount: ProviderAccountMetadata = {
  id: "pa_google_canonical",
  organizationId: "org_demo",
  provider: "google",
  authType: "oauth2",
  externalAccountId: "google-sub-123",
  accountEmail: "owner@example.com",
  displayName: "owner@example.com",
  status: "connected",
  scopes: [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
  ],
  tokenExpiresAt: "2026-05-27T01:00:00.000Z",
  isDefault: false,
  legacyCredentialId: null,
  connectedByUserId: "user_connector",
  connectedAt: "2026-05-27T00:00:00.000Z",
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z",
  credentialSource: "encrypted",
};

function googleOAuthPlaceholder(provider: "gsc" | "ga4"): SiteConnector {
  return {
    id: `connector_${provider}`,
    organizationId: seededSite.organizationId,
    siteId: seededSite.id,
    provider,
    providerAccountId: googleOAuthProviderAccount.id,
    externalResourceId: null,
    config: {},
    status: "needs_configuration",
    lastErrorCode: null,
    lastCheckedAt: null,
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
  };
}

function googleOAuthConnectorFromInput(
  input: Parameters<ProviderAccountService["upsertSiteConnector"]>[0],
): SiteConnector {
  const metadata = input as typeof input & {
    readonly config?: SiteConnector["config"];
    readonly lastCheckedAt?: string | null;
    readonly lastErrorCode?: string | null;
    readonly status?: SiteConnector["status"];
  };
  return {
    ...googleOAuthPlaceholder(input.provider as "gsc" | "ga4"),
    config: metadata.config ?? {},
    externalResourceId: input.externalResourceId,
    lastCheckedAt: metadata.lastCheckedAt ?? null,
    lastErrorCode: metadata.lastErrorCode ?? null,
    organizationId: input.organizationId,
    providerAccountId: input.providerAccountId,
    siteId: input.siteId,
    status:
      metadata.status ??
      (input.externalResourceId === null ? "needs_configuration" : "connected"),
  };
}

function createFakeProviderAccountService(
  overrides: Partial<ProviderAccountService> = {},
): ProviderAccountService {
  return {
    async createApiKeyAccount() {
      return googleOAuthProviderAccount;
    },
    async updateAccountMetadata() {
      return googleOAuthProviderAccount;
    },
    async replaceApiKeyCredential() {
      return googleOAuthProviderAccount;
    },
    async upsertGoogleAccount() {
      return googleOAuthProviderAccount;
    },
    async prepareGoogleConnectors() {
      return { requiredScopes: [] };
    },
    async listAccounts() {
      return [{ ...googleOAuthProviderAccount, bindingCount: 0 }];
    },
    async deleteAccount() {},
    async listSiteConnectors() {
      return [];
    },
    async upsertSiteConnector(input) {
      if (input.provider !== "gsc" && input.provider !== "ga4") {
        throw new ProviderAccountServiceError("validation_error");
      }
      return googleOAuthConnectorFromInput(input);
    },
    async deleteSiteConnector() {},
    ...overrides,
  };
}

function buildConnectorOAuthTestContext(options: {
  readonly authContextResolver?: AuthContextResolver;
  readonly googleOAuthClient?: GoogleConnectorOAuthClient;
  readonly googleOAuthStateStore?: GoogleOAuthStateStore;
  readonly includeGoogleOAuthClient?: boolean;
  readonly includeGoogleOAuthStateStore?: boolean;
  readonly includeProviderAccountService?: boolean;
  readonly providerAccountService?: ProviderAccountService;
  readonly publicAppUrl?: string;
  readonly sites?: readonly Site[];
} = {}) {
  const repository = createMemoryRepository({
    organizations: [seededOrganization, otherOrganization],
    sites: [...(options.sites ?? [seededSite])],
  });
  const googleOAuthClient = options.googleOAuthClient ?? createFakeGoogleOAuthClient();
  const googleOAuthStateStore =
    options.googleOAuthStateStore ?? createFakeGoogleOAuthStateStore();
  const providerAccountService =
    options.providerAccountService ?? createFakeProviderAccountService();
  const server = buildApiServer({
    authContextResolver: options.authContextResolver,
    currentTime: () => new Date("2026-05-27T00:00:00.000Z"),
    googleOAuthClient:
      options.includeGoogleOAuthClient === false ? undefined : googleOAuthClient,
    googleOAuthStateStore:
      options.includeGoogleOAuthStateStore === false ? undefined : googleOAuthStateStore,
    providerAccountService:
      options.includeProviderAccountService === false ? undefined : providerAccountService,
    publicAppUrl: options.publicAppUrl,
    repository,
  });

  return {
    googleOAuthClient,
    googleOAuthStateStore,
    providerAccountService,
    repository,
    server,
  };
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
      crawlRuns: [seededCrawlRun],
      seoIssues: [seededSeoIssue],
      urlRecords: [seededUrlRecord],
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

  it("loads operational readiness only for the verified user organization", async () => {
    const organizations: string[] = [];
    const connectorCredentials = {
      configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
      encryptedAccounts: 2,
      unmigratedLegacyCredentials: 0,
      observedLegacyFallbacks: 0,
      credentialCiphertext: "must-not-leak",
    } as unknown as ConnectorCredentialReadinessSnapshot;
    const server = buildApiServer({
      authContextResolver: () => ({
        email: "owner@example.test",
        organizationId: "org_demo",
        principalType: "user",
        provider: "supabase",
        role: "owner",
        source: "idp",
        userId: "user_owner",
      }),
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      providerCredentialStore: readinessStore(async (organizationId) => {
        organizations.push(organizationId);
        return connectorCredentials;
      }),
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });
    const response = await server.inject({
      method: "GET",
      url: "/ops/readiness?organizationId=org_other",
    });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(organizations).toEqual(["org_demo"]);
    expect(payload.generatedAt).toBe("2026-05-26T00:00:00.000Z");
    expect(payload.summary.total).toBeGreaterThanOrEqual(20);
    expect(payload.items.map((item: { id: string }) => item.id)).toContain("live-gsc");
    expect(payload.items.map((item: { id: string }) => item.id)).toContain("idp-verification");
    expect(payload.items.find((item: { id: string }) => item.id === "live-ga4").status).toBe(
      "configured",
    );
    expect(JSON.stringify(payload)).not.toContain("must-not-leak");
    expect(JSON.stringify(payload)).not.toContain("credentialCiphertext");
  });

  it("loads readiness from the organization in a verified bearer principal", async () => {
    const organizations: string[] = [];
    const server = buildApiServer({
      authContextResolver: createRequestAuthContextResolver({
        allowMockFallback: false,
        allowTrustedHeaders: false,
        tokenVerifier: createHmacJwtIdpTokenVerifier({
          audience: "searchops-api",
          currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
          issuer: "https://idp.example.com/",
          organizationIdClaim: "org_id",
          provider: "supabase",
          secret: "idp_secret",
        }),
      }),
      providerCredentialStore: readinessStore(async (organizationId) => {
        organizations.push(organizationId);
        return {
          configuredByProvider: { gsc: 0, ga4: 0, bing: 1 },
          encryptedAccounts: 1,
          unmigratedLegacyCredentials: 0,
          observedLegacyFallbacks: 0,
        };
      }),
      repository: createMemoryRepository({
        organizations: [seededOrganization, otherOrganization],
        sites: [seededSite, otherSite],
      }),
    });
    const token = createSignedIdpToken({
      aud: "searchops-api",
      email: "owner@example.test",
      exp: 1_779_756_000,
      iss: "https://idp.example.com/",
      org_id: "org_other",
      role: "owner",
      sub: "idp_owner_other",
    });

    const response = await server.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/ops/readiness?organizationId=org_demo",
    });

    expect(response.statusCode).toBe(200);
    expect(organizations).toEqual(["org_other"]);
    expect(response.json().items.find((item: { id: string }) => item.id === "live-bing")).toMatchObject({
      status: "configured",
    });
  });

  it("rejects service and unverified mock principals from tenant readiness", async () => {
    let snapshotCalls = 0;
    const providerCredentialStore = readinessStore(async () => {
      snapshotCalls += 1;
      return {
        configuredByProvider: { gsc: 0, ga4: 0, bing: 0 },
        encryptedAccounts: 0,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 0,
      };
    });

    for (const principal of [
      { principalType: "service" as const, source: "idp" as const },
      { principalType: "user" as const, source: "mock" as const },
    ]) {
      const server = buildApiServer({
        authContextResolver: () => ({
          email: null,
          organizationId: "org_demo",
          provider: principal.source === "idp" ? "searchops" : null,
          role: "system",
          userId: "principal_1",
          ...principal,
        }),
        providerCredentialStore,
      });
      const response = await server.inject({ method: "GET", url: "/ops/readiness" });

      expect(response.statusCode).toBe(403);
    }
    expect(snapshotCalls).toBe(0);
  });

  it("does not fall back to global readiness when the credential store is unavailable", async () => {
    const server = buildApiServer({
      authContextResolver: () => ({
        email: "owner@example.test",
        organizationId: "org_demo",
        principalType: "user",
        provider: "supabase",
        role: "owner",
        source: "idp",
        userId: "user_owner",
      }),
    });
    const response = await server.inject({ method: "GET", url: "/ops/readiness" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "credential_readiness_unavailable" });
  });

  it("reports productization readiness without live provider calls", async () => {
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => new Date("2026-05-27T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "GET",
      url: "/ops/productization",
      headers: {
        "x-mock-user-role": "owner",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      canLaunch: false,
      generatedAt: "2026-05-27T00:00:00.000Z",
      items: expect.arrayContaining([
        expect.objectContaining({
          id: "tenant-isolation-e2e",
          status: "configured",
        }),
        expect.objectContaining({
          id: "billing-subscription",
          status: "manual_followup",
        }),
        expect.objectContaining({
          id: "production-domain",
          status: "needs_provisioning",
        }),
      ]),
    });
  });

  it("reports connector live setup without exposing secret values", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public",
      REDIS_URL: "redis://localhost:6379",
      SEARCHOPS_API_BASE_URL: "http://localhost:4000",
      SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
      SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET: "super-secret-client-secret",
      SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI: "https://api.searchops.test/connectors/google/oauth/callback",
      SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET: "super-secret-state",
      SEARCHOPS_PUBLIC_APP_URL: "http://localhost:3000",
      SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
    };
    const server = buildApiServer({
      authContextResolver: () => ({
        email: "owner@example.test",
        organizationId: "org_demo",
        principalType: "user",
        provider: "supabase",
        role: "owner",
        source: "idp",
        userId: "user_owner",
      }),
      currentTime: () => new Date("2026-06-07T00:00:00.000Z"),
      providerCredentialStore: readinessStore(async () => ({
        configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
        encryptedAccounts: 2,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 0,
      })),
      repository: createMemoryRepository({
        organizations: [seededOrganization],
        sites: [seededSite],
      }),
    });

    try {
      const response = await server.inject({
        method: "GET",
        url: "/ops/connector-live-setup",
      });
      const payload = response.json();

      expect(response.statusCode).toBe(200);
      expect(payload.generatedAt).toBe("2026-06-07T00:00:00.000Z");
      expect(payload.liveExternalApis).toBe("disabled");
      expect(payload.canRunLiveConnectorSync).toBe(false);
      expect(payload.checks.map((check: { id: string }) => check.id)).toContain(
        "google-oauth-env",
      );
      expect(
        payload.checks.find((check: { id: string }) => check.id === "google-worker-refresh-env"),
      ).toMatchObject({ status: "warning" });
      expect(
        payload.checks.find((check: { id: string }) => check.id === "worker-live-mode-gate"),
      ).toMatchObject({ status: "warning" });
      expect(JSON.stringify(payload)).not.toContain("super-secret");
    } finally {
      process.env = originalEnv;
    }
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

  it("creates migration deployment gate plans for operations", async () => {
    const { server } = buildDeadLetterOperationsTestContext({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
    });
    const response = await server.inject({
      method: "GET",
      url: "/ops/migration-deployment-gate-plan?environment=production",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "migration_gate_production_20260526",
      environment: "production",
      status: "ready",
      requiredInputs: [
        "DATABASE_URL",
        "packages/db/prisma/schema.prisma",
        "packages/db/prisma/migrations",
      ],
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

  it("fails requests explicitly when the configured rate-limit store is unavailable", async () => {
    const rateLimitStore: ApiRateLimitStore = {
      async consume() {
        throw new Error("redis unavailable");
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

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "rate_limit_store_unavailable",
      message: "Rate limit store unavailable.",
    });
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
      principalType: "user",
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
      principalType: "user",
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

  it("lists crawl runs for a site", async () => {
    const server = buildWorkOrderTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/sites/site_seed/crawl-runs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      crawlRuns: [seededCrawlRun],
    });
  });

  it("registers a site and queues the initial crawl in one request", async () => {
    const { server, crawlRunQueue } = buildCrawlRunTestContext();
    const response = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/sites/register",
      headers: {
        "x-mock-user-id": "user_site_register",
      },
      payload: {
        site: {
          country: "KR",
          domain: "newclinic.example",
          industry: "medical",
          language: "ko",
          name: "New Clinic",
        },
        initialCrawl: {
          enabled: true,
          maxPages: 5,
          startUrl: "https://newclinic.example/",
        },
        automation: {
          generateSchemaRecommendations: true,
          generateSeoIssues: true,
          generateWorkOrders: true,
        },
        connectors: {
          requestedProviders: ["gsc", "ga4", "bing", "cms"],
        },
      },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.site).toMatchObject({
      organizationId: "org_demo",
      domain: "newclinic.example",
      name: "New Clinic",
    });
    expect(body.crawlRun).toMatchObject({
      siteId: body.site.id,
      status: "queued",
      summary: {
        startUrl: "https://newclinic.example/",
        maxPages: 5,
      },
    });
    expect(body.job).toMatchObject({
      name: "crawl",
      payload: {
        crawlRunId: body.crawlRun.id,
        siteId: body.site.id,
        siteDomain: "newclinic.example",
        requestedByUserId: "user_site_register",
        startUrl: "https://newclinic.example/",
        maxPages: 5,
        analysis: {
          generateSchemaRecommendations: true,
          generateSeoIssues: true,
          generateWorkOrders: true,
        },
        pages: [],
      },
    });
    expect(body.next).toEqual({
      dashboardUrl: `/sites/${body.site.id}?crawl=queued&crawlRunId=${body.crawlRun.id}`,
      connectors: [
        { provider: "gsc", status: "setup_required" },
        { provider: "ga4", status: "setup_required" },
        { provider: "bing", status: "setup_required" },
        { provider: "cms", status: "setup_required" },
      ],
      automation: {
        generateSchemaRecommendations: true,
        generateSeoIssues: true,
        generateWorkOrders: true,
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
    const secretQueueError =
      "redis://default:tenant-secret@cache.internal:6379/0?token=queue-secret";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const connectorSyncQueue: ConnectorSyncQueue = {
      async enqueueConnectorSync() {
        throw new Error(secretQueueError, {
          cause: { response: "authorization=Bearer queue-secret" },
        });
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
      version: 1,
      error: "queue_enqueue_failed",
      message: "Connector sync queue enqueue failed.",
      connectorSyncRun: {
        id: "sync_0001",
        status: "failed",
        summary: {
          version: 1,
          error: {
            code: "queue_enqueue_failed",
            message: "Connector sync queue enqueue failed.",
          },
        },
      },
    });
    await expect(repository.getConnectorSyncRun("sync_0001")).resolves.toMatchObject({
      connectorSyncRun: {
        status: "failed",
        summary: {
          version: 1,
          error: {
            code: "queue_enqueue_failed",
            message: "Connector sync queue enqueue failed.",
          },
        },
      },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[api] connector sync enqueue failed code=queue_enqueue_failed run=sync_0001",
    );
    const publicAndDurableOutput = JSON.stringify({
      logs: consoleError.mock.calls,
      response: response.json(),
      run: await repository.getConnectorSyncRun("sync_0001"),
    });
    expect(publicAndDurableOutput).not.toContain("tenant-secret");
    expect(publicAndDurableOutput).not.toContain("queue-secret");
    expect(publicAndDurableOutput).not.toContain("cache.internal");
    consoleError.mockRestore();
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

  describe("canonical Google OAuth", () => {
    const userHeaders = (role: "owner" | "admin" | "editor" | "viewer" | "system") => ({
      "x-mock-organization-id": "org_demo",
      "x-mock-user-id": `user_${role}`,
      "x-mock-user-role": role,
    });

    it.each(["owner", "admin", "system"] as const)(
      "allows a user %s to start Google OAuth with exact signed context",
      async (role) => {
        const client = createFakeGoogleOAuthClient();
        const createAuthorizationUrl = vi.spyOn(client, "createAuthorizationUrl");
        const { googleOAuthStateStore, server } = buildConnectorOAuthTestContext({
          googleOAuthClient: client,
          publicAppUrl: "https://app.searchops.test",
        });
        const issue = vi.spyOn(googleOAuthStateStore, "issue");
        const response = await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed&providers=gsc,ga4&format=json&returnTo=https%3A%2F%2Fapp.searchops.test%2Fsites%2Fsite_seed%2Fconnectors",
          headers: userHeaders(role),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          authorizationUrl: expect.stringContaining("https://accounts.google.com/o/oauth2/v2/auth"),
          providers: ["gsc", "ga4"],
          stateExpiresAt: "2026-05-27T00:10:00.000Z",
        });
        expect(createAuthorizationUrl).toHaveBeenCalledWith({
          organizationId: "org_demo",
          providers: ["gsc", "ga4"],
          requestedByUserId: `user_${role}`,
          returnTo: "https://app.searchops.test/sites/site_seed/connectors",
          siteId: "site_seed",
        });
        expect(issue).toHaveBeenCalledWith({
          expiresAt: "2026-05-27T00:10:00.000Z",
          identifier: "start-nonce",
        });
      },
    );

    it.each(["editor", "viewer"] as const)(
      "rejects a user %s before the Google client is called",
      async (role) => {
        const client = createFakeGoogleOAuthClient();
        const createAuthorizationUrl = vi.spyOn(client, "createAuthorizationUrl");
        const { server } = buildConnectorOAuthTestContext({ googleOAuthClient: client });
        const response = await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed",
          headers: userHeaders(role),
        });

        expect(response.statusCode).toBe(403);
        expect(createAuthorizationUrl).not.toHaveBeenCalled();
      },
    );

    it.each(["owner", "admin", "editor", "viewer", "system"] as const)(
      "rejects a service %s before the Google client is called",
      async (role) => {
        const client = createFakeGoogleOAuthClient();
        const createAuthorizationUrl = vi.spyOn(client, "createAuthorizationUrl");
        const { server } = buildConnectorOAuthTestContext({
          authContextResolver: () => ({
            email: null,
            organizationId: "org_demo",
            principalType: "service",
            provider: "searchops",
            role,
            source: "idp",
            userId: `service_${role}`,
          }),
          googleOAuthClient: client,
        });
        const response = await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed",
        });

        expect(response.statusCode).toBe(403);
        expect(createAuthorizationUrl).not.toHaveBeenCalled();
      },
    );

    it("validates site ownership and returnTo origin before Google client access", async () => {
      const client = createFakeGoogleOAuthClient();
      const createAuthorizationUrl = vi.spyOn(client, "createAuthorizationUrl");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        publicAppUrl: "https://app.searchops.test",
        sites: [seededSite, otherSite],
      });

      const foreignSite = await server.inject({
        method: "GET",
        url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_other",
        headers: userHeaders("owner"),
      });
      const foreignReturnTo = await server.inject({
        method: "GET",
        url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed&returnTo=https%3A%2F%2Fevil.test%2Fsteal",
        headers: userHeaders("owner"),
      });

      expect(foreignSite.statusCode).toBe(404);
      expect(foreignReturnTo.statusCode).toBe(400);
      expect(foreignReturnTo.body).not.toContain("evil.test");
      expect(createAuthorizationUrl).not.toHaveBeenCalled();
    });

    it.each([
      [false, true, true],
      [true, false, true],
      [true, true, false],
    ] as const)(
      "returns a generic 503 when OAuth dependencies are unavailable",
      async (
        includeGoogleOAuthClient,
        includeProviderAccountService,
        includeGoogleOAuthStateStore,
      ) => {
        const { server } = buildConnectorOAuthTestContext({
          includeGoogleOAuthClient,
          includeGoogleOAuthStateStore,
          includeProviderAccountService,
        });
        const response = await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed",
          headers: userHeaders("owner"),
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
          error: "oauth_service_unavailable",
          message: "Google OAuth service is unavailable",
        });
      },
    );

    it.each([false, "throw"] as const)(
      "fails closed without exposing authorization state when registration returns %s",
      async (failure) => {
        const stateStore: GoogleOAuthStateStore = {
          async issue() {
            if (failure === "throw") {
              throw new Error("redis-registration-detail");
            }
            return false;
          },
          async consume() {
            return false;
          },
        };
        const { server } = buildConnectorOAuthTestContext({
          googleOAuthStateStore: stateStore,
        });
        const response = await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts/google/oauth/start?siteId=site_seed&format=json",
          headers: userHeaders("owner"),
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
          error: "oauth_state_store_unavailable",
          message: "Google OAuth state could not be registered",
        });
        expect(response.body).not.toContain("accounts.google.com");
        expect(response.body).not.toContain("fake_state");
        expect(response.body).not.toContain("redis-registration-detail");
      },
    );

    it("keeps the site start route as a compatibility redirect without calling Google", async () => {
      const client = createFakeGoogleOAuthClient();
      const createAuthorizationUrl = vi.spyOn(client, "createAuthorizationUrl");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        publicAppUrl: "https://app.searchops.test",
      });
      const response = await server.inject({
        method: "GET",
        url: "/sites/site_seed/connectors/google/oauth/start?providers=ga4&format=json&returnTo=https%3A%2F%2Fapp.searchops.test%2Freturn",
        headers: userHeaders("owner"),
      });

      expect(response.statusCode).toBe(302);
      const location = new URL(response.headers.location!, "http://localhost");
      expect(location.pathname).toBe(
        "/organizations/org_demo/provider-accounts/google/oauth/start",
      );
      expect(Object.fromEntries(location.searchParams)).toEqual({
        format: "json",
        providers: "ga4",
        returnTo: "https://app.searchops.test/return",
        siteId: "site_seed",
      });
      expect(createAuthorizationUrl).not.toHaveBeenCalled();
    });

    it("upserts the canonical account and exact unconfigured placeholders without legacy writes", async () => {
      const accountInputs: Parameters<ProviderAccountService["upsertGoogleAccount"]>[0][] = [];
      const connectorInputs: Parameters<ProviderAccountService["upsertSiteConnector"]>[0][] = [];
      const service = createFakeProviderAccountService({
        async upsertGoogleAccount(input) {
          accountInputs.push(input);
          return googleOAuthProviderAccount;
        },
        async upsertSiteConnector(input) {
          connectorInputs.push(input);
          return googleOAuthPlaceholder(input.provider as "gsc" | "ga4");
        },
      });
      const { repository, server } = buildConnectorOAuthTestContext({
        providerAccountService: service,
      });
      const legacyWrite = vi.spyOn(repository, "upsertConnectorOAuthCredentials");
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(response.statusCode).toBe(200);
      expect(accountInputs).toEqual([
        {
          accessToken: "access_token",
          actorUserId: "user_connector",
          displayName: "owner@example.com",
          organizationId: "org_demo",
          refreshToken: "refresh_token",
          scopes: [
            "https://www.googleapis.com/auth/webmasters.readonly",
            "https://www.googleapis.com/auth/analytics.readonly",
          ],
          selectedProviders: ["gsc", "ga4"],
          status: "connected",
          tokenExpiresAt: "2026-05-27T01:00:00.000Z",
          tokenType: "Bearer",
          verifiedAccountEmail: "owner@example.com",
          verifiedExternalAccountId: "google-sub-123",
        },
      ]);
      expect(connectorInputs).toEqual([
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "gsc",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "ga4",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
      ]);
      expect(legacyWrite).not.toHaveBeenCalled();
      expect(response.json()).toEqual({
        account: googleOAuthProviderAccount,
        siteConnectors: [googleOAuthPlaceholder("gsc"), googleOAuthPlaceholder("ga4")],
        status: "connected",
      });
      const serialized = response.body;
      for (const forbidden of [
        "access_token",
        "refresh_token",
        "accessToken",
        "refreshToken",
        "credentialCiphertext",
        "credentialIv",
        "credentialAuthTag",
        "encryptionKeyId",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });

    it("accepts Google extension query params while verifying and consuming state", async () => {
      const client = createFakeGoogleOAuthClient();
      const verifyState = vi.spyOn(client, "verifyState");
      const { googleOAuthStateStore, server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
      });
      const consume = vi.spyOn(googleOAuthStateStore, "consume");
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123&scope=openid%20email&authuser=0&prompt=consent&hd=example.com&future_google_param=ignored-secret",
      });

      expect(response.statusCode).toBe(200);
      expect(verifyState).toHaveBeenCalledWith("fake_state");
      expect(consume).toHaveBeenCalledWith("callback-nonce");
      expect(response.body).not.toContain("ignored-secret");
      expect(response.body).not.toContain("future_google_param");
    });

    it("preserves exact same-account metadata and creates a new-provider placeholder", async () => {
      const configuredGsc: SiteConnector = {
        ...googleOAuthPlaceholder("gsc"),
        config: { resourceResolution: "legacy_auto" },
        externalResourceId: "sc-domain:configured.example",
        lastCheckedAt: "2026-05-26T23:55:00.000Z",
        lastErrorCode: "google_permission_denied",
        providerAccountId: googleOAuthProviderAccount.id,
        status: "error",
      };
      const connectorInputs: Parameters<ProviderAccountService["upsertSiteConnector"]>[0][] = [];
      const listInputs: Parameters<ProviderAccountService["listSiteConnectors"]>[0][] = [];
      const service = createFakeProviderAccountService({
        async listSiteConnectors(input) {
          listInputs.push(input);
          return [configuredGsc];
        },
        async upsertSiteConnector(input) {
          connectorInputs.push(input);
          return googleOAuthConnectorFromInput(input);
        },
      });
      const { repository, server } = buildConnectorOAuthTestContext({
        providerAccountService: service,
      });
      const legacyWrite = vi.spyOn(repository, "upsertConnectorOAuthCredentials");

      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code-a",
      });

      expect(response.statusCode).toBe(200);
      expect(listInputs).toEqual([{ organizationId: "org_demo", siteId: "site_seed" }]);
      expect(connectorInputs).toEqual([
        {
          config: { resourceResolution: "legacy_auto" },
          externalResourceId: "sc-domain:configured.example",
          lastCheckedAt: "2026-05-26T23:55:00.000Z",
          lastErrorCode: "google_permission_denied",
          organizationId: "org_demo",
          provider: "gsc" as const,
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
          status: "error",
        },
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "ga4" as const,
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
      ]);
      expect(response.json()).toMatchObject({
        siteConnectors: [
          {
            config: { resourceResolution: "legacy_auto" },
            externalResourceId: "sc-domain:configured.example",
            lastCheckedAt: "2026-05-26T23:55:00.000Z",
            lastErrorCode: "google_permission_denied",
            provider: "gsc",
            status: "error",
          },
          {
            config: {},
            externalResourceId: null,
            lastCheckedAt: null,
            lastErrorCode: null,
            provider: "ga4",
            status: "needs_configuration",
          },
        ],
      });
      expect(legacyWrite).not.toHaveBeenCalled();
    });

    it("does not transfer connector metadata across Google accounts or tenants", async () => {
      const oldAccountConnector: SiteConnector = {
        ...googleOAuthPlaceholder("gsc"),
        config: { resourceResolution: "legacy_auto" },
        externalResourceId: "sc-domain:old-account.example",
        lastCheckedAt: "2026-05-26T23:50:00.000Z",
        lastErrorCode: "old-account-error",
        providerAccountId: "pa_previous_google",
        status: "revoked",
      };
      const connectorInputs: Parameters<ProviderAccountService["upsertSiteConnector"]>[0][] = [];
      const listInputs: Parameters<ProviderAccountService["listSiteConnectors"]>[0][] = [];
      const service = createFakeProviderAccountService({
        async listSiteConnectors(input) {
          listInputs.push(input);
          return [
            oldAccountConnector,
            {
              ...oldAccountConnector,
              organizationId: "org_foreign",
              providerAccountId: googleOAuthProviderAccount.id,
            },
            {
              ...oldAccountConnector,
              providerAccountId: googleOAuthProviderAccount.id,
              siteId: "site_foreign",
            },
          ];
        },
        async upsertSiteConnector(input) {
          connectorInputs.push(input);
          return googleOAuthConnectorFromInput(input);
        },
      });
      const client = createFakeGoogleOAuthClient();
      vi.spyOn(client, "verifyState").mockReturnValue({
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "callback-nonce",
        organizationId: "org_demo",
        providers: ["gsc"],
        requestedByUserId: "user_connector",
        returnTo: null,
        siteId: "site_seed",
      });
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        providerAccountService: service,
      });

      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code-switch",
      });

      expect(response.statusCode).toBe(200);
      expect(listInputs).toEqual([{ organizationId: "org_demo", siteId: "site_seed" }]);
      expect(connectorInputs).toEqual([
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "gsc",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
      ]);
      expect(response.json()).toMatchObject({
        siteConnectors: [
          {
            config: {},
            externalResourceId: null,
            lastCheckedAt: null,
            lastErrorCode: null,
            organizationId: "org_demo",
            providerAccountId: "pa_google_canonical",
            siteId: "site_seed",
            status: "needs_configuration",
          },
        ],
      });
    });

    it("rejects replay before provider calls and consumes provider-declined callbacks", async () => {
      const client = createFakeGoogleOAuthClient();
      const exchange = vi.spyOn(client, "exchangeCodeForTokens");
      const service = createFakeProviderAccountService();
      const accountUpsert = vi.spyOn(service, "upsertGoogleAccount");
      const stateStore = createFakeGoogleOAuthStateStore();
      const consume = vi.spyOn(stateStore, "consume");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        googleOAuthStateStore: stateStore,
        providerAccountService: service,
      });

      const declined = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&error=access_denied&error_description=provider-secret&scope=openid",
      });
      const replay = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=different-valid-code",
      });

      expect(declined.statusCode).toBe(400);
      expect(declined.json()).toEqual({
        error: "oauth_error",
        message: "Google OAuth authorization was not completed",
      });
      expect(declined.body).not.toContain("provider-secret");
      expect(replay.statusCode).toBe(400);
      expect(replay.json()).toEqual({
        error: "oauth_state_replayed",
        message: "Google OAuth state is invalid or already used",
      });
      expect(consume).toHaveBeenCalledTimes(2);
      expect(exchange).not.toHaveBeenCalled();
      expect(accountUpsert).not.toHaveBeenCalled();
    });

    it("does not consume a malformed completion missing code and provider error", async () => {
      const stateStore = createFakeGoogleOAuthStateStore();
      const consume = vi.spyOn(stateStore, "consume");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthStateStore: stateStore,
      });

      const malformed = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&scope=openid",
      });
      const valid = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code-after-malformed",
      });

      expect(malformed.statusCode).toBe(400);
      expect(consume).toHaveBeenCalledTimes(1);
      expect(valid.statusCode).toBe(200);
    });

    it("returns scope_missing without connector or legacy writes", async () => {
      let connectorWrites = 0;
      const service = createFakeProviderAccountService({
        async upsertGoogleAccount() {
          throw new ProviderAccountServiceError("scope_missing");
        },
        async upsertSiteConnector() {
          connectorWrites += 1;
          return googleOAuthPlaceholder("gsc");
        },
      });
      const { repository, server } = buildConnectorOAuthTestContext({
        providerAccountService: service,
      });
      const legacyWrite = vi.spyOn(repository, "upsertConnectorOAuthCredentials");
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "scope_missing",
        message: "Required provider scope is missing",
      });
      expect(connectorWrites).toBe(0);
      expect(legacyWrite).not.toHaveBeenCalled();
    });

    it("requires a fresh OAuth state to idempotently repair a partial connector failure", async () => {
      const client = createFakeGoogleOAuthClient();
      vi.spyOn(client, "verifyState").mockImplementation((state) => ({
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: state === "partial-state" ? "partial-nonce" : "retry-nonce",
        organizationId: "org_demo",
        providers: ["gsc", "ga4"],
        requestedByUserId: "user_connector",
        returnTo: null,
        siteId: "site_seed",
      }));
      const stateStore = createFakeGoogleOAuthStateStore([
        "partial-nonce",
        "retry-nonce",
      ]);
      const configuredGsc: SiteConnector = {
        ...googleOAuthPlaceholder("gsc"),
        externalResourceId: "sc-domain:configured.example",
        status: "connected",
      };
      const existing: SiteConnector[] = [configuredGsc];
      const connectorInputs: Parameters<ProviderAccountService["upsertSiteConnector"]>[0][] = [];
      let failGa4 = true;
      const service = createFakeProviderAccountService({
        async listSiteConnectors() {
          return [...existing];
        },
        async upsertSiteConnector(input) {
          connectorInputs.push(input);
          if (input.provider === "ga4" && failGa4) {
            failGa4 = false;
            throw new Error("binding-failure-access-token-sentinel");
          }
          const saved =
            input.provider === "gsc"
              ? { ...configuredGsc, providerAccountId: input.providerAccountId }
              : googleOAuthPlaceholder("ga4");
          const index = existing.findIndex((connector) => connector.provider === input.provider);
          if (index === -1) {
            existing.push(saved);
          } else {
            existing[index] = saved;
          }
          return saved;
        },
      });
      const accountUpsert = vi.spyOn(service, "upsertGoogleAccount");
      const { repository, server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        googleOAuthStateStore: stateStore,
        providerAccountService: service,
      });
      const legacyWrite = vi.spyOn(repository, "upsertConnectorOAuthCredentials");

      const partial = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=partial-state&code=partial-code",
      });
      const replay = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=partial-state&code=replay-code",
      });
      const repaired = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=retry-state&code=retry-code",
      });

      expect(partial.statusCode).toBe(502);
      expect(partial.json()).toEqual({
        error: "oauth_binding_failed",
        message: "Google OAuth connector binding could not be completed",
      });
      expect(partial.body).not.toContain("binding-failure-access-token-sentinel");
      expect(partial.body).not.toContain('"status":"connected"');
      expect(replay.statusCode).toBe(400);
      expect(replay.json()).toMatchObject({ error: "oauth_state_replayed" });
      expect(repaired.statusCode).toBe(200);
      expect(accountUpsert).toHaveBeenCalledTimes(2);
      expect(connectorInputs).toEqual([
        {
          config: {},
          externalResourceId: "sc-domain:configured.example",
          lastCheckedAt: null,
          lastErrorCode: null,
          organizationId: "org_demo",
          provider: "gsc",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
          status: "connected",
        },
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "ga4",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
        {
          config: {},
          externalResourceId: "sc-domain:configured.example",
          lastCheckedAt: null,
          lastErrorCode: null,
          organizationId: "org_demo",
          provider: "gsc",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
          status: "connected",
        },
        {
          externalResourceId: null,
          organizationId: "org_demo",
          provider: "ga4",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        },
      ]);
      for (const input of connectorInputs) {
        expect(input).toMatchObject({
          organizationId: "org_demo",
          providerAccountId: "pa_google_canonical",
          siteId: "site_seed",
        });
      }
      expect(legacyWrite).not.toHaveBeenCalled();
    });

    it("fails closed when state consumption storage is unavailable", async () => {
      const client = createFakeGoogleOAuthClient();
      const exchange = vi.spyOn(client, "exchangeCodeForTokens");
      const service = createFakeProviderAccountService();
      const accountUpsert = vi.spyOn(service, "upsertGoogleAccount");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        googleOAuthStateStore: {
          async issue() {
            return true;
          },
          async consume() {
            throw new Error("redis-consume-detail-sentinel");
          },
        },
        providerAccountService: service,
      });
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: "oauth_state_store_unavailable",
        message: "Google OAuth state could not be consumed",
      });
      expect(response.body).not.toContain("redis-consume-detail-sentinel");
      expect(exchange).not.toHaveBeenCalled();
      expect(accountUpsert).not.toHaveBeenCalled();
    });

    it("returns generic callback failures without provider details or token values", async () => {
      const failingClient = createFakeGoogleOAuthClient();
      vi.spyOn(failingClient, "exchangeCodeForTokens").mockRejectedValue(
        new Error("userinfo failed with access_token and refresh_token"),
      );
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: failingClient,
        googleOAuthStateStore: {
          async issue() {
            return true;
          },
          async consume() {
            return true;
          },
        },
      });
      const userinfoFailure = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });
      const oauthQueryError = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&error=provider_secret_detail",
      });
      const invalidState = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=bad_state&code=code_123",
      });

      expect(userinfoFailure.statusCode).toBe(502);
      expect(userinfoFailure.json()).toEqual({
        error: "oauth_exchange_failed",
        message: "Google OAuth authorization could not be completed",
      });
      expect(oauthQueryError.statusCode).toBe(400);
      expect(oauthQueryError.json()).toEqual({
        error: "oauth_error",
        message: "Google OAuth authorization was not completed",
      });
      expect(invalidState.statusCode).toBe(400);
      expect(invalidState.json()).toEqual({
        error: "validation_error",
        message: "Google OAuth state is invalid or expired",
      });
      expect(userinfoFailure.body).not.toContain("access_token");
      expect(userinfoFailure.body).not.toContain("refresh_token");
      expect(oauthQueryError.body).not.toContain("provider_secret_detail");
    });

    it("returns 503 before exchange when the provider account service is missing", async () => {
      const client = createFakeGoogleOAuthClient();
      const exchange = vi.spyOn(client, "exchangeCodeForTokens");
      const { server } = buildConnectorOAuthTestContext({
        googleOAuthClient: client,
        includeProviderAccountService: false,
      });
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: "oauth_service_unavailable",
        message: "Google OAuth service is unavailable",
      });
      expect(exchange).not.toHaveBeenCalled();
    });

    it("rejects a callback whose signed site and organization no longer match", async () => {
      const client = createFakeGoogleOAuthClient();
      vi.spyOn(client, "verifyState").mockReturnValue({
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "callback-nonce",
        organizationId: "org_other",
        providers: ["gsc"],
        requestedByUserId: "user_connector",
        returnTo: null,
        siteId: "site_seed",
      });
      const exchange = vi.spyOn(client, "exchangeCodeForTokens");
      const { server } = buildConnectorOAuthTestContext({ googleOAuthClient: client });
      const response = await server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not_found", message: "OAuth site not found" });
      expect(exchange).not.toHaveBeenCalled();
    });

    it("revalidates same-origin callback redirects and rejects a foreign origin", async () => {
      const safeClient = createFakeGoogleOAuthClient();
      vi.spyOn(safeClient, "verifyState").mockReturnValue({
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "callback-nonce",
        organizationId: "org_demo",
        providers: ["gsc", "ga4"],
        requestedByUserId: "user_connector",
        returnTo: "https://app.searchops.test/sites/site_seed/connectors?tab=google",
        siteId: "site_seed",
      });
      const safe = buildConnectorOAuthTestContext({
        googleOAuthClient: safeClient,
        publicAppUrl: "https://app.searchops.test",
      });
      const safeResponse = await safe.server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });
      const safeLocation = new URL(safeResponse.headers.location!);
      expect(safeResponse.statusCode).toBe(302);
      expect(safeLocation.origin).toBe("https://app.searchops.test");
      expect(safeLocation.searchParams.get("connectorOAuth")).toBe("connected");
      expect(safeLocation.searchParams.get("providers")).toBe("gsc,ga4");

      const foreignClient = createFakeGoogleOAuthClient();
      vi.spyOn(foreignClient, "verifyState").mockReturnValue({
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "callback-nonce",
        organizationId: "org_demo",
        providers: ["gsc"],
        requestedByUserId: "user_connector",
        returnTo: "https://evil.test/steal",
        siteId: "site_seed",
      });
      const foreign = buildConnectorOAuthTestContext({
        googleOAuthClient: foreignClient,
        publicAppUrl: "https://app.searchops.test",
      });
      const foreignResponse = await foreign.server.inject({
        method: "GET",
        url: "/connectors/google/oauth/callback?state=fake_state&code=code_123",
      });

      expect(foreignResponse.statusCode).toBe(400);
      expect(foreignResponse.json()).toEqual({
        error: "validation_error",
        message: "OAuth return URL is invalid",
      });
      expect(foreignResponse.body).not.toContain("evil.test");
      expect(foreignResponse.headers.location).toBeUndefined();
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
          domain: "exampleclinic.com",
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
            domain: "exampleclinic.com",
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
        title: "Example Clinic GEO 노출 개선",
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
        title: "Example Clinic GEO 노출 개선",
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

  it("accepts selected CMS native signatures for provider-specific webhooks", async () => {
    const server = buildSecuredComplianceTestServer();
    const timestamp = "2026-05-24T02:00:00.000Z";
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
    const signature = createCmsNativeWebhookSignature({
      cmsType: "wordpress",
      payload,
      secret: "cms_secret_1",
      timestamp,
    });

    const response = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/webhooks/wordpress",
      headers: {
        "x-wp-webhook-signature": signature,
        "x-wp-webhook-timestamp": timestamp,
      },
    });
    const invalidResponse = await server.inject({
      method: "POST",
      payload,
      url: "/sites/site_seed/cms/webhooks/wordpress",
      headers: {
        "x-wp-webhook-signature":
          "sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "x-wp-webhook-timestamp": timestamp,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      event: {
        cmsType: "wordpress",
        externalId: "page_seed",
      },
      matchedFlagCount: 1,
      rechecks: [
        {
          resolved: true,
        },
      ],
    });
    expect(invalidResponse.statusCode).toBe(401);
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
        title: "/services/seo Service JSON-LD 적용",
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

  it("lists crawled URLs and SEO issues for a site", async () => {
    const server = buildWorkOrderTestServer();
    const urlsResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/urls",
    });
    const issuesResponse = await server.inject({
      method: "GET",
      url: "/sites/site_seed/seo-issues",
    });

    expect(urlsResponse.statusCode).toBe(200);
    expect(urlsResponse.json()).toEqual({
      urls: [seededUrlRecord],
    });
    expect(issuesResponse.statusCode).toBe(200);
    expect(issuesResponse.json()).toEqual({
      issues: [seededSeoIssue],
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

  it("creates, lists, and accepts organization invitations with RBAC", async () => {
    const sent: Array<{ to: string; token: string; role: string }> = [];
    const clock = new Date("2026-06-23T00:00:00.000Z");
    const server = buildApiServer({
      currentTime: () => clock,
      inviteEmailSender: {
        async send(request) {
          sent.push({ role: request.role, to: request.to, token: request.token });
        },
      },
      repository: createMemoryRepository({ organizations: [seededOrganization] }),
    });

    const denied = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/invites",
      headers: { "x-mock-user-role": "viewer" },
      payload: { email: "newmember@example.com", role: "editor" },
    });
    expect(denied.statusCode).toBe(403);

    const created = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/invites",
      payload: { email: "newmember@example.com", role: "editor" },
    });
    expect(created.statusCode).toBe(201);
    const invitation = created.json();
    expect(invitation).toMatchObject({
      email: "newmember@example.com",
      organizationId: "org_demo",
      role: "editor",
      status: "pending",
    });
    expect(invitation.token).toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ role: "editor", to: "newmember@example.com" });
    const token = sent[0]!.token;

    const listed = await server.inject({ method: "GET", url: "/organizations/org_demo/invites" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().invitations).toHaveLength(1);

    const accepted = await server.inject({ method: "POST", url: `/invites/${token}/accept` });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      invitation: { organizationId: "org_demo", status: "accepted" },
      user: { email: "newmember@example.com", organizationId: "org_demo", role: "editor" },
    });

    const reAccept = await server.inject({ method: "POST", url: `/invites/${token}/accept` });
    expect(reAccept.statusCode).toBe(409);
  });

  it("returns 404 when accepting an unknown invitation token", async () => {
    const server = buildApiServer({
      repository: createMemoryRepository({ organizations: [seededOrganization] }),
    });
    const response = await server.inject({ method: "POST", url: "/invites/does-not-exist/accept" });
    expect(response.statusCode).toBe(404);
  });

  it("rejects an expired invitation on accept", async () => {
    const sent: Array<{ token: string }> = [];
    let clock = new Date("2026-06-23T00:00:00.000Z");
    const server = buildApiServer({
      currentTime: () => clock,
      inviteEmailSender: {
        async send(request) {
          sent.push({ token: request.token });
        },
      },
      repository: createMemoryRepository({ organizations: [seededOrganization] }),
    });
    const created = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/invites",
      payload: { email: "late@example.com" },
    });
    expect(created.statusCode).toBe(201);

    clock = new Date("2026-07-05T00:00:00.000Z");
    const accepted = await server.inject({ method: "POST", url: `/invites/${sent[0]!.token}/accept` });
    expect(accepted.statusCode).toBe(409);
    expect(accepted.json().message).toMatch(/expired/i);
  });

  it("revokes an organization invitation and blocks its acceptance", async () => {
    const sent: Array<{ token: string }> = [];
    const server = buildApiServer({
      inviteEmailSender: {
        async send(request) {
          sent.push({ token: request.token });
        },
      },
      repository: createMemoryRepository({ organizations: [seededOrganization] }),
    });
    const created = await server.inject({
      method: "POST",
      url: "/organizations/org_demo/invites",
      payload: { email: "revoke@example.com" },
    });
    const invitationId = created.json().id;

    const revoked = await server.inject({
      method: "POST",
      url: `/organizations/org_demo/invites/${invitationId}/revoke`,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json()).toMatchObject({ id: invitationId, status: "revoked" });

    const accepted = await server.inject({ method: "POST", url: `/invites/${sent[0]!.token}/accept` });
    expect(accepted.statusCode).toBe(409);
  });

  describe("provider accounts and site connectors", () => {
    const providerAccount: ProviderAccountMetadata = {
      id: "pa_api_key",
      organizationId: "org_demo",
      provider: "bing",
      authType: "api_key",
      externalAccountId: null,
      accountEmail: null,
      displayName: "Bing primary",
      status: "connected",
      scopes: [],
      tokenExpiresAt: null,
      isDefault: false,
      legacyCredentialId: null,
      connectedByUserId: "user_owner",
      connectedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      credentialSource: "encrypted",
    };
    const siteConnector: SiteConnector = {
      id: "connector_ga4",
      organizationId: "org_demo",
      siteId: "site_seed",
      provider: "ga4",
      providerAccountId: "pa_google",
      externalResourceId: "properties/123456789",
      config: {},
      status: "connected",
      lastErrorCode: null,
      lastCheckedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    function providerService(
      overrides: Partial<ProviderAccountService> = {},
    ): ProviderAccountService {
      return {
        async createApiKeyAccount() {
          return providerAccount;
        },
        async updateAccountMetadata() {
          return providerAccount;
        },
        async replaceApiKeyCredential() {
          return providerAccount;
        },
        async upsertGoogleAccount() {
          return { ...providerAccount, provider: "google", authType: "oauth2" };
        },
        async prepareGoogleConnectors() {
          return { requiredScopes: [] };
        },
        async listAccounts() {
          return [{ ...providerAccount, bindingCount: 0 }];
        },
        async deleteAccount() {},
        async listSiteConnectors() {
          return [siteConnector];
        },
        async upsertSiteConnector() {
          return siteConnector;
        },
        async deleteSiteConnector() {},
        ...overrides,
      };
    }

    function buildProviderServer(
      service?: ProviderAccountService,
      authContextResolver?: AuthContextResolver,
    ) {
      return buildApiServer({
        authContextResolver,
        providerAccountService: service,
        repository: createMemoryRepository({
          organizations: [seededOrganization, otherOrganization],
          sites: [seededSite, otherSite],
        }),
      });
    }

    function authHeaders(role: "owner" | "admin" | "editor" | "viewer" | "system") {
      return {
        "x-mock-organization-id": "org_demo",
        "x-mock-user-id": `user_${role}`,
        "x-mock-user-role": role,
      };
    }

    function expectNoCredentialFields(
      value: unknown,
      forbiddenValues: readonly string[] = [],
    ) {
      const forbiddenKeys = new Set([
        "apikey",
        "accesstoken",
        "refreshtoken",
        "ciphertext",
        "credentialciphertext",
        "iv",
        "credentialiv",
        "tag",
        "credentialauthtag",
        "encryptionkeyid",
      ]);

      function visit(current: unknown) {
        if (Array.isArray(current)) {
          current.forEach(visit);
          return;
        }
        if (typeof current !== "object" || current === null) {
          return;
        }
        for (const [key, nested] of Object.entries(current)) {
          expect(forbiddenKeys.has(key.toLowerCase())).toBe(false);
          visit(nested);
        }
      }

      visit(value);
      const serialized = JSON.stringify(value);
      forbiddenValues.forEach((forbiddenValue) => {
        expect(serialized).not.toContain(forbiddenValue);
      });
    }

    it("allows viewer metadata reads and keeps the response credential-free", async () => {
      const response = await buildProviderServer(providerService()).inject({
        method: "GET",
        url: "/organizations/org_demo/provider-accounts",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        providerAccounts: [{ ...providerAccount, bindingCount: 0 }],
      });
      expectNoCredentialFields(response.json());
    });

    it.each(["owner", "admin", "system"] as const)(
      "allows %s to create an API-key account",
      async (role) => {
        let actorUserId: string | undefined;
        const response = await buildProviderServer(
          providerService({
            async createApiKeyAccount(input) {
              actorUserId = input.actorUserId;
              return providerAccount;
            },
          }),
        ).inject({
          method: "POST",
          url: "/organizations/org_demo/provider-accounts/bing/api-key",
          headers: authHeaders(role),
          payload: {
            provider: "bing",
            displayName: "Bing primary",
            apiKey: "request-secret",
          },
        });

        expect(response.statusCode).toBe(201);
        expect(actorUserId).toBe(`user_${role}`);
        expectNoCredentialFields(response.json());
      },
    );

    it("rejects editor provider-account mutations before service access", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async createApiKeyAccount() {
            calls += 1;
            return providerAccount;
          },
        }),
      ).inject({
        method: "POST",
        url: "/organizations/org_demo/provider-accounts/bing/api-key",
        headers: authHeaders("editor"),
        payload: {
          provider: "bing",
          displayName: "Bing primary",
          apiKey: "request-secret",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it.each(["owner", "admin", "system"] as const)(
      "rejects a service %s provider-account mutation before service access",
      async (role) => {
        let calls = 0;
        const response = await buildProviderServer(
          providerService({
            async createApiKeyAccount() {
              calls += 1;
              return providerAccount;
            },
          }),
          () => ({
            email: null,
            organizationId: "org_demo",
            principalType: "service",
            provider: "searchops",
            role,
            source: "idp",
            userId: `service_${role}`,
          }),
        ).inject({
          method: "POST",
          url: "/organizations/org_demo/provider-accounts/bing/api-key",
          payload: {
            provider: "bing",
            displayName: "Bing primary",
            apiKey: "request-secret",
          },
        });

        expect(response.statusCode).toBe(403);
        expect(calls).toBe(0);
        expectNoCredentialFields(response.json(), ["request-secret"]);
      },
    );

    it("rejects cross-organization account paths before service access", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async listAccounts() {
            calls += 1;
            return [];
          },
        }),
      ).inject({
        method: "GET",
        url: "/organizations/org_other/provider-accounts",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("rejects API-key body/path provider mismatches", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async createApiKeyAccount() {
            calls += 1;
            return providerAccount;
          },
        }),
      ).inject({
        method: "POST",
        url: "/organizations/org_demo/provider-accounts/bing/api-key",
        headers: authHeaders("owner"),
        payload: {
          provider: "geo_chatgpt",
          displayName: "Mismatch",
          apiKey: "request-secret",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "validation_error" });
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("supports strict metadata updates and API-key replacement", async () => {
      const service = providerService();
      const server = buildProviderServer(service);
      const patchResponse = await server.inject({
        method: "PATCH",
        url: "/organizations/org_demo/provider-accounts/pa_api_key",
        headers: authHeaders("admin"),
        payload: { displayName: "Renamed" },
      });
      const replaceResponse = await server.inject({
        method: "PUT",
        url: "/organizations/org_demo/provider-accounts/pa_api_key/credential",
        headers: authHeaders("owner"),
        payload: { apiKey: "new-request-secret" },
      });

      expect(patchResponse.statusCode).toBe(200);
      expect(replaceResponse.statusCode).toBe(200);
      expectNoCredentialFields(patchResponse.json());
      expectNoCredentialFields(replaceResponse.json());
    });

    it("forwards exact tenant and resource identifiers through all eight routes", async () => {
      const calls: Array<{ method: string; input: unknown }> = [];
      const server = buildProviderServer(
        providerService({
          async listAccounts(input) {
            calls.push({ method: "listAccounts", input });
            return [{ ...providerAccount, bindingCount: 0 }];
          },
          async createApiKeyAccount(input) {
            calls.push({ method: "createApiKeyAccount", input });
            return providerAccount;
          },
          async updateAccountMetadata(input) {
            calls.push({ method: "updateAccountMetadata", input });
            return providerAccount;
          },
          async replaceApiKeyCredential(input) {
            calls.push({ method: "replaceApiKeyCredential", input });
            return providerAccount;
          },
          async deleteAccount(input) {
            calls.push({ method: "deleteAccount", input });
          },
          async listSiteConnectors(input) {
            calls.push({ method: "listSiteConnectors", input });
            return [siteConnector];
          },
          async upsertSiteConnector(input) {
            calls.push({ method: "upsertSiteConnector", input });
            return siteConnector;
          },
          async deleteSiteConnector(input) {
            calls.push({ method: "deleteSiteConnector", input });
          },
        }),
      );

      const responses = [
        await server.inject({
          method: "GET",
          url: "/organizations/org_demo/provider-accounts",
          headers: authHeaders("viewer"),
        }),
        await server.inject({
          method: "POST",
          url: "/organizations/org_demo/provider-accounts/bing/api-key",
          headers: authHeaders("owner"),
          payload: {
            apiKey: "route-create-secret",
            displayName: "Bing primary",
            provider: "bing",
          },
        }),
        await server.inject({
          method: "PATCH",
          url: "/organizations/org_demo/provider-accounts/pa_api_key",
          headers: authHeaders("admin"),
          payload: { displayName: "Renamed" },
        }),
        await server.inject({
          method: "PUT",
          url: "/organizations/org_demo/provider-accounts/pa_api_key/credential",
          headers: authHeaders("owner"),
          payload: { apiKey: "route-replace-secret" },
        }),
        await server.inject({
          method: "DELETE",
          url: "/organizations/org_demo/provider-accounts/pa_api_key",
          headers: authHeaders("owner"),
        }),
        await server.inject({
          method: "GET",
          url: "/sites/site_seed/connectors",
          headers: authHeaders("viewer"),
        }),
        await server.inject({
          method: "PUT",
          url: "/sites/site_seed/connectors/ga4",
          headers: authHeaders("owner"),
          payload: {
            externalResourceId: "123456789",
            providerAccountId: "pa_google_foreign_check",
          },
        }),
        await server.inject({
          method: "DELETE",
          url: "/sites/site_seed/connectors/ga4",
          headers: authHeaders("owner"),
        }),
      ];

      expect(responses.map((response) => response.statusCode)).toEqual([
        200, 201, 200, 200, 204, 200, 200, 204,
      ]);
      expect(calls).toEqual([
        { method: "listAccounts", input: { organizationId: "org_demo" } },
        {
          method: "createApiKeyAccount",
          input: {
            accountEmail: null,
            actorUserId: "user_owner",
            apiKey: "route-create-secret",
            displayName: "Bing primary",
            externalAccountId: null,
            isDefault: false,
            organizationId: "org_demo",
            provider: "bing",
          },
        },
        {
          method: "updateAccountMetadata",
          input: {
            organizationId: "org_demo",
            providerAccountId: "pa_api_key",
            update: { displayName: "Renamed" },
          },
        },
        {
          method: "replaceApiKeyCredential",
          input: {
            apiKey: "route-replace-secret",
            organizationId: "org_demo",
            providerAccountId: "pa_api_key",
          },
        },
        {
          method: "deleteAccount",
          input: { organizationId: "org_demo", providerAccountId: "pa_api_key" },
        },
        {
          method: "listSiteConnectors",
          input: { organizationId: "org_demo", siteId: "site_seed" },
        },
        {
          method: "upsertSiteConnector",
          input: {
            externalResourceId: "123456789",
            organizationId: "org_demo",
            provider: "ga4",
            providerAccountId: "pa_google_foreign_check",
            siteId: "site_seed",
          },
        },
        {
          method: "deleteSiteConnector",
          input: { organizationId: "org_demo", provider: "ga4", siteId: "site_seed" },
        },
      ]);
      responses.forEach((response) => {
        if (response.body.length > 0) {
          expectNoCredentialFields(response.json(), [
            "route-create-secret",
            "route-replace-secret",
          ]);
        }
      });
    });

    it("maps same-site foreign-account binding rejection without changing route tenant IDs", async () => {
      let received: Parameters<ProviderAccountService["upsertSiteConnector"]>[0] | undefined;
      const response = await buildProviderServer(
        providerService({
          async upsertSiteConnector(input) {
            received = input;
            throw new ProviderAccountServiceError("provider_account_not_in_organization");
          },
        }),
      ).inject({
        method: "PUT",
        url: "/sites/site_seed/connectors/gsc",
        headers: authHeaders("owner"),
        payload: {
          externalResourceId: "sc-domain:example.com",
          providerAccountId: "pa_other_tenant",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "provider_account_not_in_organization",
      });
      expect(received).toEqual({
        externalResourceId: "sc-domain:example.com",
        organizationId: "org_demo",
        provider: "gsc",
        providerAccountId: "pa_other_tenant",
        siteId: "site_seed",
      });
      expectNoCredentialFields(response.json());
    });

    it("maps rejected Bing default PATCH to validation_error without a mutation response", async () => {
      const response = await buildProviderServer(
        providerService({
          async updateAccountMetadata() {
            throw new ProviderAccountServiceError("validation_error");
          },
        }),
      ).inject({
        method: "PATCH",
        url: "/organizations/org_demo/provider-accounts/pa_api_key",
        headers: authHeaders("owner"),
        payload: { isDefault: true },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "validation_error",
        message: "Provider account request is invalid",
      });
      expectNoCredentialFields(response.json());
    });

    it("maps credential decryption failures to a redacted stable 500 without logging details", async () => {
      const rawSentinel = "raw-replacement-sentinel";
      const encryptedSentinels = [
        "ciphertext-sentinel",
        "iv-sentinel",
        "tag-sentinel",
        "key-id-sentinel",
      ];
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const response = await buildProviderServer(
          providerService({
            async replaceApiKeyCredential() {
              throw new ProviderAccountServiceError("credential_decryption_failed");
            },
          }),
        ).inject({
          method: "PUT",
          url: "/organizations/org_demo/provider-accounts/pa_api_key/credential",
          headers: authHeaders("owner"),
          payload: { apiKey: rawSentinel },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({
          error: "credential_decryption_failed",
          message: "Stored provider credential could not be read",
        });
        expectNoCredentialFields(response.json(), [rawSentinel, ...encryptedSentinels]);
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain(rawSentinel);
        encryptedSentinels.forEach((sentinel) => {
          expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
        });
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("maps provider credential concurrency exhaustion to a redacted stable 409", async () => {
      const rawSentinel = "raw-concurrent-replacement-sentinel";
      const response = await buildProviderServer(
        providerService({
          async replaceApiKeyCredential(input) {
            expect(input).toEqual({
              apiKey: rawSentinel,
              organizationId: "org_demo",
              providerAccountId: "pa_api_key",
            });
            throw new ProviderAccountServiceError("provider_account_concurrent_update");
          },
        }),
      ).inject({
        method: "PUT",
        url: "/organizations/org_demo/provider-accounts/pa_api_key/credential",
        headers: authHeaders("owner"),
        payload: { apiKey: rawSentinel },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "provider_account_concurrent_update",
        message: "Provider account was updated concurrently",
      });
      expectNoCredentialFields(response.json(), [
        rawSentinel,
        "ciphertext-concurrent-sentinel",
        "iv-concurrent-sentinel",
        "tag-concurrent-sentinel",
        "key-id-concurrent-sentinel",
      ]);
    });

    it("maps in-use account deletion to 409 without credential fields", async () => {
      const response = await buildProviderServer(
        providerService({
          async deleteAccount() {
            throw new ProviderAccountServiceError("account_in_use");
          },
        }),
      ).inject({
        method: "DELETE",
        url: "/organizations/org_demo/provider-accounts/pa_api_key",
        headers: authHeaders("owner"),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: "account_in_use",
        message: "Provider account is in use",
      });
      expectNoCredentialFields(response.json());
    });

    it("derives site tenant access and allows viewer connector reads", async () => {
      const response = await buildProviderServer(providerService()).inject({
        method: "GET",
        url: "/sites/site_seed/connectors",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ siteConnectors: [siteConnector] });
      expectNoCredentialFields(response.json());
    });

    it("rejects editor connector mutations before service access", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async upsertSiteConnector() {
            calls += 1;
            return siteConnector;
          },
        }),
      ).inject({
        method: "PUT",
        url: "/sites/site_seed/connectors/ga4",
        headers: authHeaders("editor"),
        payload: {
          providerAccountId: "pa_google",
          externalResourceId: "123456789",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("rejects a service owner connector mutation before service access", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async upsertSiteConnector() {
            calls += 1;
            return siteConnector;
          },
        }),
        () => ({
          email: null,
          organizationId: "org_demo",
          principalType: "service",
          provider: "searchops",
          role: "owner",
          source: "idp",
          userId: "service_owner",
        }),
      ).inject({
        method: "PUT",
        url: "/sites/site_seed/connectors/ga4",
        payload: {
          externalResourceId: "123456789",
          providerAccountId: "pa_google",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("rejects cross-tenant connector reads before service access", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async listSiteConnectors() {
            calls += 1;
            return [];
          },
        }),
      ).inject({
        method: "GET",
        url: "/sites/site_other/connectors",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("rejects malformed connector resources before service persistence", async () => {
      const response = await buildProviderServer(
        providerService({
          async upsertSiteConnector() {
            throw new ProviderAccountServiceError("validation_error");
          },
        }),
      ).inject({
        method: "PUT",
        url: "/sites/site_seed/connectors/ga4",
        headers: authHeaders("owner"),
        payload: {
          providerAccountId: "pa_google",
          externalResourceId: "properties/not-digits",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "validation_error" });
      expectNoCredentialFields(response.json());
    });

    it("keeps internal connector metadata fields out of the public PUT body", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async upsertSiteConnector(input) {
            calls += 1;
            return { ...siteConnector, provider: input.provider };
          },
        }),
      ).inject({
        method: "PUT",
        url: "/sites/site_seed/connectors/gsc",
        headers: authHeaders("owner"),
        payload: {
          config: { resourceResolution: "legacy_auto" },
          externalResourceId: "sc-domain:example.com",
          providerAccountId: "pa_google",
          status: "connected",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "validation_error" });
      expect(calls).toBe(0);
    });

    it("returns 404 for missing sites without calling the provider service", async () => {
      let calls = 0;
      const response = await buildProviderServer(
        providerService({
          async listSiteConnectors() {
            calls += 1;
            return [];
          },
        }),
      ).inject({
        method: "GET",
        url: "/sites/site_missing/connectors",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(404);
      expect(calls).toBe(0);
      expectNoCredentialFields(response.json());
    });

    it("returns a redacted 503 when provider credential storage is unavailable", async () => {
      const response = await buildProviderServer(undefined).inject({
        method: "GET",
        url: "/organizations/org_demo/provider-accounts",
        headers: authHeaders("viewer"),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: "provider_account_service_unavailable",
        message: "Provider account service is unavailable",
      });
      expectNoCredentialFields(response.json());
    });
  });
});

function installApiEntrypointMocks(options: {
  readonly credentialStorageMode?: "encrypted";
  readonly googleOAuthConfigured?: boolean;
  readonly keyringError?: Error;
}) {
  vi.resetModules();
  vi.restoreAllMocks();

  const parseSearchOpsEnv = vi.fn(() => ({
    DATABASE_URL: "postgresql://localhost/searchops_test",
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    SEARCHOPS_CREDENTIAL_STORAGE_MODE: options.credentialStorageMode,
    SEARCHOPS_RATE_LIMIT_ENABLED: false,
  }));
  const parseCredentialKeyring = vi.fn(() => {
    if (options.keyringError !== undefined) {
      throw options.keyringError;
    }
    return { activeKeyId: "test-key", keys: new Map() };
  });
  const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
  const createSearchOpsPrismaClient = vi.fn(() => prisma);
  const providerStore = { kind: "provider-store" };
  const createPrismaProviderCredentialStore = vi.fn(() => providerStore);
  const providerAccountService = { kind: "provider-account-service" };
  const createProviderAccountService = vi.fn(() => providerAccountService);
  const googleOAuthClient = { kind: "google-oauth-client" };
  const createGoogleConnectorOAuthClientFromEnv = vi.fn(() =>
    options.googleOAuthConfigured === true ? googleOAuthClient : undefined,
  );
  const googleOAuthStateStore = {
    close: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn(),
    issue: vi.fn(),
  };
  const createIoredisGoogleOAuthStateStore = vi.fn(() => googleOAuthStateStore);
  const repository = { kind: "repository" };
  const createPrismaRepository = vi.fn(() => repository);
  const closeable = () => ({ close: vi.fn().mockResolvedValue(undefined) });
  const server = {
    addHook: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
  };
  const buildApiServer = vi.fn(() => server);

  vi.doMock("@searchops/types", () => ({ parseSearchOpsEnv }));
  vi.doMock("@searchops/db", () => ({
    createPrismaProviderCredentialStore,
    createRichdocContractBridge: vi.fn(),
    createSearchOpsPrismaClient,
    parseCredentialKeyring,
    parseRichdocContractConfigFromEnv: vi.fn(() => undefined),
  }));
  vi.doMock("./bullmq-queue.js", () => ({
    createBullMqConnectorSyncQueue: vi.fn(closeable),
    createBullMqCrawlRunQueue: vi.fn(closeable),
    createBullMqGeoAnswerMonitorQueue: vi.fn(closeable),
    createBullMqSchemaRichResultValidationQueue: vi.fn(closeable),
  }));
  vi.doMock("./auth.js", () => ({
    createHmacJwtIdpTokenVerifier: vi.fn(),
    createJwksIdpTokenVerifier: vi.fn(),
    createRequestAuthContextResolver: vi.fn(),
    parseJwksJson: vi.fn(),
  }));
  vi.doMock("./dead-letter-store.js", () => ({
    createBullMqDeadLetterJobStore: vi.fn(closeable),
  }));
  vi.doMock("./observability.js", () => ({
    createHttpOperationalAlertRouter: vi.fn(),
    createHttpOperationalLogDrain: vi.fn(),
  }));
  vi.doMock("./operations-hardening.js", () => ({
    createHttpBackupRestoreDrillScheduler: vi.fn(),
    createHttpSecretRotationExecutor: vi.fn(),
  }));
  vi.doMock("./redis-rate-limit.js", () => ({
    createIoredisApiRateLimitStore: vi.fn(),
  }));
  vi.doMock("./google-oauth.js", () => ({
    createGoogleConnectorOAuthClientFromEnv,
  }));
  vi.doMock("./google-oauth-state-store.js", () => ({
    createIoredisGoogleOAuthStateStore,
  }));
  vi.doMock("./prisma-repository.js", () => ({ createPrismaRepository }));
  vi.doMock("./provider-account-service.js", () => ({ createProviderAccountService }));
  vi.doMock("./server.js", () => ({ buildApiServer }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  return {
    buildApiServer,
    createIoredisGoogleOAuthStateStore,
    createPrismaProviderCredentialStore,
    createProviderAccountService,
    googleOAuthStateStore,
    parseCredentialKeyring,
    server,
  };
}

function readinessStore(
  getCredentialReadinessSnapshot: ProviderCredentialStore["getCredentialReadinessSnapshot"],
): Pick<ProviderCredentialStore, "getCredentialReadinessSnapshot"> {
  return { getCredentialReadinessSnapshot };
}

describe.sequential("provider credential startup wiring", () => {
  it("keeps metadata readiness available without enabling credential decryption", async () => {
    const mocks = installApiEntrypointMocks({});

    await import("./index.js");

    expect(mocks.parseCredentialKeyring).not.toHaveBeenCalled();
    expect(mocks.createPrismaProviderCredentialStore).toHaveBeenCalledOnce();
    expect(mocks.createProviderAccountService).not.toHaveBeenCalled();
    expect(mocks.createIoredisGoogleOAuthStateStore).not.toHaveBeenCalled();
    expect(mocks.buildApiServer).toHaveBeenCalledWith(
      expect.objectContaining({
        googleOAuthStateStore: undefined,
        providerAccountService: undefined,
        providerCredentialStore: { kind: "provider-store" },
      }),
    );
    expect(mocks.server.listen).toHaveBeenCalledOnce();
  });

  it("reports database reachability without authentication and without leaking values", async () => {
    const server = buildApiServer({ databaseProbe: async () => undefined });
    const response = await server.inject({ method: "GET", url: "/ops/deployment" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
    connectors: { credentialStore: false, googleOAuthClient: false, stateStore: true },
      database: { reachable: true },
    });
  });

  it("classifies a missing pgbouncer option instead of reporting a generic failure", async () => {
    // Supabase 트랜잭션 풀러에 ?pgbouncer=true 를 빠뜨리면 접속은 되는데 첫 쿼리에서만
    // 깨진다. "DB 가 안 된다" 로만 보이면 원인을 엉뚱한 데서 찾게 된다.
    const server = buildApiServer({
      databaseProbe: async () => {
        throw new Error('prepared statement "s0" already exists');
      },
    });
    const response = await server.inject({ method: "GET", url: "/ops/deployment" });

    expect(response.json()).toEqual({
    connectors: { credentialStore: false, googleOAuthClient: false, stateStore: true },
      database: { reachable: false, reason: "pgbouncer_option_missing" },
    });
  });

  it("never puts the original database error text in the probe response", async () => {
    const server = buildApiServer({
      databaseProbe: async () => {
        throw new Error("connect ECONNREFUSED db.secret-host.supabase.co:5432");
      },
    });
    const response = await server.inject({ method: "GET", url: "/ops/deployment" });

    expect(response.payload).not.toContain("secret-host");
    expect(response.json()).toEqual({
    connectors: { credentialStore: false, googleOAuthClient: false, stateStore: true },
      database: { reachable: false, reason: "unreachable" },
    });
  });

  // 커넥터가 안 붙을 때 API 는 503 하나만 낸다. 어느 조각이 빠졌는지 밖에서 볼 수
  // 없으면 env 를 하나씩 찍어보는 수밖에 없다 — 실제로 그렇게 반나절을 썼다.
  it("reports which connector dependency is missing without leaking any value", async () => {
    const server = buildApiServer({
      databaseProbe: async () => undefined,
      googleOAuthClient: {
        createAuthorizationUrl: () => {
          throw new Error("unused");
        },
      } as never,
      googleOAuthStateStore: {
        consume: async () => true,
        issue: async () => {
          throw new Error("connect ECONNREFUSED red-secret-host:6379");
        },
      },
      providerAccountService: undefined,
    });

    const response = await server.inject({ method: "GET", url: "/ops/deployment" });

    expect(response.payload).not.toContain("red-secret-host");
    expect(response.json().connectors).toEqual({
      credentialStore: false,
      googleOAuthClient: true,
      // Redis 왕복이 실패하면 "구성됐다" 가 아니라 false 여야 한다.
      stateStore: false,
    });
  });

  it("fails closed before server construction when configured keyring parsing fails", async () => {
    const keyringError = new Error("malformed credential keyring");
    const mocks = installApiEntrypointMocks({
      credentialStorageMode: "encrypted",
      keyringError,
    });

    // 부팅을 끊는다는 계약은 그대로다. 다만 운영자가 고칠 수 있도록 원인을 덧붙여
    // 다시 던지므로, 원래 오류는 cause 에 남는다.
    await expect(import("./index.js")).rejects.toMatchObject({
      cause: keyringError,
      message: expect.stringContaining("자격증명 키링을 읽지 못했다"),
    });

    expect(mocks.parseCredentialKeyring).toHaveBeenCalledOnce();
    expect(mocks.createPrismaProviderCredentialStore).not.toHaveBeenCalled();
    expect(mocks.createProviderAccountService).not.toHaveBeenCalled();
    expect(mocks.buildApiServer).not.toHaveBeenCalled();
    expect(mocks.server.listen).not.toHaveBeenCalled();
  });

  it("wires a Redis OAuth state store only when Google OAuth is configured and closes it", async () => {
    const mocks = installApiEntrypointMocks({ googleOAuthConfigured: true });

    await import("./index.js");

    expect(mocks.createIoredisGoogleOAuthStateStore).toHaveBeenCalledWith({
      redisUrl: "redis://localhost:6379",
    });
    expect(mocks.buildApiServer).toHaveBeenCalledWith(
      expect.objectContaining({ googleOAuthStateStore: mocks.googleOAuthStateStore }),
    );
    const onClose = mocks.server.addHook.mock.calls.find(
      ([hookName]) => hookName === "onClose",
    )?.[1] as (() => Promise<void>) | undefined;
    expect(onClose).toBeTypeOf("function");
    await onClose?.();
    expect(mocks.googleOAuthStateStore.close).toHaveBeenCalledOnce();
  });
});
