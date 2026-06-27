import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ContentBriefSchema,
  productName,
  SchemaRecommendationRecordSchema,
  SiteSchema,
  WorkOrderSchema
} from "@searchops/types";

import {
  dashboardPlaceholders,
  getSiteDashboardPath,
  loadDashboardSite,
  siteRouteItems
} from "./dashboard-shell";
import { getApiBaseUrl } from "./api-base-url";
import {
  createDemoConnectorLiveSetupData,
  formatConnectorLiveSetupStatus,
  getConnectorLiveSetupTone,
  getPageSpeedLiveSetupCheck,
  loadConnectorLiveSetupData
} from "./connector-live-setup";
import {
  createDemoConnectorOAuthData,
  formatConnectorOAuthStatus,
  getConnectorOAuthTone,
  loadConnectorOAuthData,
  summarizeConnectorOAuthProviders
} from "./connector-oauth";
import {
  createDemoConnectorSyncHistory,
  formatSyncDuration,
  getConnectorSyncProviderErrorMessage,
  getConnectorSyncResultTone,
  getConnectorSyncRunProviderErrorMessages,
  getConnectorSyncRunTone,
  getConnectorSyncTriggerFeedback,
  getConnectorSyncProviderErrorGuidance,
  loadConnectorSyncHistory,
  summarizeConnectorCommandCenter,
  summarizeConnectorOperations,
  summarizeConnectorSyncHistory,
  triggerConnectorSync
} from "./connector-sync-history";
import {
  convertComplianceFlagToWorkOrder,
  createComplianceReviewFromFixture,
  createDemoComplianceDashboard,
  demoComplianceFlags,
  formatComplianceRisk,
  getComplianceReviewCreateFeedback,
  getComplianceRecheckFeedback,
  getComplianceRiskTone,
  getComplianceStatusUpdateFeedback,
  getComplianceWorkOrderFeedback,
  loadComplianceDashboard,
  summarizeComplianceHardeningWorkflow,
  recheckComplianceFlagWithFixtureRevision,
  summarizeComplianceDashboard,
  updateComplianceFlagStatus
} from "./compliance-dashboard";
import {
  createContentBriefFromForm,
  createContentBriefRequestFromForm,
  createDemoContentBriefHistory,
  demoContentBriefs,
  formatContentBriefDate,
  getContentBriefCreateFeedback,
  getContentBriefStatusTone,
  loadContentBriefHistory,
  summarizeContentBriefHistory
} from "./content-brief-history";
import {
  createDemoDeadLetterReplayPlan,
  createDemoDeadLetterOperations,
  demoDeadLetterJobs,
  formatDeadLetterDate,
  getDeadLetterClearFeedback,
  getDeadLetterReplayFeedback,
  getDeadLetterStatusTone,
  loadDeadLetterReplayPlan,
  loadDeadLetterOperations,
  summarizeDeadLetterOperations
} from "./dead-letter-operations";
import {
  createDemoObservabilityDashboard,
  demoOperationalMetricsExport,
  formatOperationalDate,
  formatUptime,
  getObservabilityAlertTone,
  loadObservabilityDashboard,
  summarizeOperationalMetrics
} from "./observability-dashboard";
import {
  createOperatorConsoleSignals,
  summarizeOperatorConsoleSignals
} from "./operator-console";
import {
  createSiteRegistrationDraft,
  createSiteRegistrationRequestFromForm,
  createSiteRegistrationSearchParams,
  getInitialCrawlFeedback,
  mergeSitesWithCreatedPreview,
  resolveSiteFromRegistrationId
} from "./site-registry";
import {
  createDemoOperationsHardeningDashboard,
  getBackupRestoreDrillRunFeedback,
  loadOperationsHardeningDashboard,
  runBackupRestoreDrill,
  summarizeOperationsHardening
} from "./operations-hardening-dashboard";
import {
  createDemoOperationalReadinessDashboard,
  formatReadinessStatus,
  groupReadinessByCategory,
  loadOperationalReadiness
} from "./operational-readiness";
import {
  createDemoProductizationDashboard,
  formatProductizationArea,
  getProductizationTone,
  loadProductizationDashboard,
  onboardingSteps,
  summarizeOnboardingSteps
} from "./productization-dashboard";
import {
  futureModuleKeys,
  futureModuleSkeletons,
  summarizeFutureModules
} from "./future-module-skeletons";
import {
  convertGeoVisibilityReportToWorkOrder,
  createDemoGeoVisibilityDashboard,
  createGeoAnswerMonitorRequestFromForm,
  createGeoVisibilityReportFromFixture,
  defaultGeoAnswerMonitorProviders,
  demoGeoVisibilityReports,
  formatGeoDate,
  formatGeoProvider,
  formatGeoStatus,
  formatGeoWorkOrderCandidatePriority,
  getGeoAnswerMonitorQueueFeedback,
  getGeoVisibilityCreateFeedback,
  getGeoVisibilityStatusTone,
  getGeoVisibilityWorkOrderFeedback,
  loadGeoVisibilityDashboard,
  queueGeoAnswerMonitorJob,
  summarizeGeoWorkOrderBatchPreview,
  summarizeGeoVisibilityDashboard
} from "./geo-visibility-dashboard";
import {
  createKeywordDiscoveryFromConnectorRun,
  createKeywordDiscoveryRequestFromForm,
  createDemoKeywordAeoDashboard,
  findLatestGscKeywordDiscoveryRun,
  formatAeoCheckId,
  getAeoReadinessTone,
  getKeywordDiscoveryCreateFeedback,
  getWeakAeoChecks,
  loadKeywordAeoDashboard,
  summarizeKeywordAeoDashboard
} from "./keyword-aeo-dashboard";
import {
  convertSchemaRecommendationToWorkOrder,
  createDemoSchemaRecommendationDashboard,
  createResolvedSchemaSnapshot,
  demoSchemaRecommendations,
  formatSchemaJsonLdType,
  getSchemaRecommendationStatusTone,
  getSchemaRecheckFeedback,
  getSchemaRichResultValidationFeedback,
  getSchemaWorkOrderCreateFeedback,
  loadSchemaRecommendationDashboard,
  queueSchemaRichResultValidation,
  recheckSchemaRecommendationWithDraft,
  summarizeSchemaRecommendations
} from "./schema-recommendations";
import {
  calculateSiteOverviewKpis,
  createSiteOverviewInput,
  demoSiteOverviewInput,
  summarizeSiteOverview
} from "./site-overview-kpis";
import {
  createSiteCrawlRunRows,
  createSiteIssueListRows,
  createSiteUrlInventoryRows,
  demoCrawlRunRows,
  demoIssueListRows,
  demoUrlInventoryRows,
  formatDuration,
  loadSiteCrawlRunDashboard,
  loadSiteIssueDashboard,
  loadSiteUrlInventoryDashboard,
  summarizeCrawlRuns,
  summarizeIssues,
  summarizeUrlInventory
} from "./site-detail-views";
import {
  canRecheckWorkOrder,
  createSiteWorkOrders,
  demoSite,
  demoWorkOrders,
  groupWorkOrdersByStatus,
  summarizeWorkOrders
} from "./work-order-board";

describe("web foundation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("can import shared workspace types", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("can validate the dashboard site fixture shape", () => {
    expect(SiteSchema.parse(demoSite)).toMatchObject({ domain: "example-clinic.com" });
  });

  it("creates a deterministic dashboard site draft from registration input", () => {
    const site = createSiteRegistrationDraft({
      country: "kr",
      domain: "https://www.Example-Clinic.com/services?utm_source=test",
      industry: "medical",
      language: "KO",
      name: "Example Clinic"
    });

    expect(SiteSchema.parse(site)).toMatchObject({
      country: "KR",
      domain: "example-clinic.com",
      id: "site_example_dash_clinic_dot_com",
      industry: "medical",
      language: "ko",
      name: "Example Clinic",
      organizationId: "org_demo"
    });
  });

  it("builds a full site registration request from the form controls", () => {
    const formData = new FormData();
    formData.set("name", "Example Clinic");
    formData.set("domain", "example-clinic.com");
    formData.set("industry", "medical");
    formData.set("language", "ko");
    formData.set("country", "KR");
    formData.set("initialCrawlEnabled", "true");
    formData.set("startUrl", "https://example-clinic.com/services");
    formData.set("maxPages", "12");
    formData.set("respectRobotsTxt", "true");
    formData.set("discoverSitemap", "true");
    formData.set("generateSeoIssues", "true");
    formData.set("generateWorkOrders", "true");
    formData.set("generateSchemaRecommendations", "true");
    formData.append("connectorProvider", "gsc");
    formData.append("connectorProvider", "ga4");

    expect(createSiteRegistrationRequestFromForm(formData)).toEqual({
      automation: {
        generateSchemaRecommendations: true,
        generateSeoIssues: true,
        generateWorkOrders: true
      },
      connectors: {
        requestedProviders: ["gsc", "ga4"]
      },
      initialCrawl: {
        discoverSitemap: true,
        enabled: true,
        maxPages: 12,
        respectRobotsTxt: true,
        startUrl: "https://example-clinic.com/services"
      },
      site: {
        country: "KR",
        domain: "example-clinic.com",
        industry: "medical",
        language: "ko",
        name: "Example Clinic"
      }
    });
  });

  it("formats initial crawl queue feedback from registration redirects", () => {
    expect(
      getInitialCrawlFeedback({
        crawl: "queued",
        crawlRunId: "crawl_123"
      }),
    ).toEqual({
      crawlRunId: "crawl_123",
      message: "초기 crawl이 대기열에 등록됐습니다.",
      tone: "info"
    });
    expect(getInitialCrawlFeedback({ crawl: "completed" })).toBeNull();
  });

  it("keeps fixture-created sites visible from the sites list query string", () => {
    const site = createSiteRegistrationDraft({
      domain: "example-clinic.com",
      name: "Example Clinic"
    });
    const searchParams = createSiteRegistrationSearchParams(site, "fixture");
    const sites = mergeSitesWithCreatedPreview([demoSite], Object.fromEntries(searchParams));

    expect(sites.map((candidate) => candidate.id)).toContain("site_example_dash_clinic_dot_com");
    expect(sites.at(-1)).toMatchObject({
      domain: "example-clinic.com",
      name: "Example Clinic"
    });
  });

  it("resolves a registered dashboard site from its URL-safe id", () => {
    expect(resolveSiteFromRegistrationId("site_example_dash_clinic_dot_com")).toMatchObject({
      domain: "example-clinic.com",
      id: "site_example_dash_clinic_dot_com",
      name: "example-clinic.com"
    });
  });

  it("loads registered dashboard site metadata from the API", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/sites/site_api_clinic")) {
          return new Response(
            JSON.stringify({
              id: "site_api_clinic",
              organizationId: "org_demo",
              domain: "gangnam.rejuel.com",
              name: "리쥬엘의원 강남",
              industry: "medical",
              language: "ko",
              country: "KR",
              createdAt: "2026-06-07T00:00:00.000Z"
            }),
            { status: 200 },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    await expect(loadDashboardSite("site_api_clinic")).resolves.toMatchObject({
      domain: "gangnam.rejuel.com",
      id: "site_api_clinic",
      name: "리쥬엘의원 강남"
    });
  });

  it("applies a registered site domain across all dashboard module fixtures", () => {
    const registeredSite = createSiteRegistrationDraft({
      domain: "test-clinic.co.kr",
      industry: "medical",
      name: "테스트 피부과"
    });
    const crawlRows = createSiteCrawlRunRows(registeredSite);
    const urlRows = createSiteUrlInventoryRows(registeredSite);
    const issueRows = createSiteIssueListRows(registeredSite);
    const workOrders = createSiteWorkOrders(registeredSite);
    const overview = createSiteOverviewInput(registeredSite);
    const schema = createDemoSchemaRecommendationDashboard(registeredSite);
    const connector = createDemoConnectorSyncHistory(registeredSite);
    const keywordAeo = createDemoKeywordAeoDashboard(registeredSite);
    const content = createDemoContentBriefHistory(registeredSite);
    const geo = createDemoGeoVisibilityDashboard(registeredSite);
    const compliance = createDemoComplianceDashboard(registeredSite);
    const serialized = JSON.stringify({
      compliance,
      connector,
      content,
      crawlRows,
      geo,
      issueRows,
      keywordAeo,
      overview,
      schema,
      urlRows,
      workOrders
    });

    expect(crawlRows.map((row) => row.siteId)).toEqual(Array(crawlRows.length).fill(registeredSite.id));
    expect(urlRows.every((row) => row.url.includes(registeredSite.domain))).toBe(true);
    expect(issueRows.every((issue) => issue.url.includes(registeredSite.domain))).toBe(true);
    expect(workOrders.every((workOrder) => workOrder.siteId === registeredSite.id)).toBe(true);
    expect(schema.recommendations.every((recommendation) => recommendation.pageUrl.includes(registeredSite.domain))).toBe(true);
    expect(keywordAeo.reports.every((report) => report.pageUrl === null || report.pageUrl.includes(registeredSite.domain))).toBe(true);
    expect(geo.reports.every((report) => report.domain === registeredSite.domain)).toBe(true);
    expect(compliance.flags.every((flag) => flag.url?.includes(registeredSite.domain))).toBe(true);
    expect(serialized).toContain("test-clinic.co.kr");
    expect(serialized).not.toContain("example-clinic.com");
    expect(serialized).not.toContain("site_demo_rejuel");
  });

  it("loads URL inventory and SEO issues from the API before falling back to fixtures", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sites/${demoSite.id}/urls`)) {
          return new Response(
            JSON.stringify({
              urls: [
                {
                  id: "url_api_home",
                  siteId: demoSite.id,
                  crawlRunId: "crawl_api_1",
                  url: "https://example-clinic.com/",
                  statusCode: 200,
                  title: "Example Clinic",
                  metaDescription: null,
                  createdAt: "2026-06-07T00:00:00.000Z"
                }
              ]
            }),
            { status: 200 },
          );
        }

        if (url.endsWith(`/sites/${demoSite.id}/seo-issues`)) {
          return new Response(
            JSON.stringify({
              issues: [
                {
                  id: "issue_api_meta",
                  crawlRunId: "crawl_api_1",
                  urlRecordId: "url_api_home",
                  ruleId: "META_DESC_MISSING",
                  severity: "medium",
                  status: "open",
                  title: "Missing meta description",
                  evidence: {
                    expectedValue: "present",
                    observedValue: null,
                    sourceField: "metaDescription",
                    url: "https://example-clinic.com/"
                  },
                  createdAt: "2026-06-07T00:00:01.000Z"
                }
              ]
            }),
            { status: 200 },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const urls = await loadSiteUrlInventoryDashboard(demoSite);
    const issues = await loadSiteIssueDashboard(demoSite);

    expect(urls.source).toBe("api");
    expect(urls.rows).toHaveLength(1);
    expect(urls.rows[0]).toMatchObject({
      issueCount: 1,
      path: "/",
      primarySignal: "Missing meta description"
    });
    expect(issues.source).toBe("api");
    expect(issues.rows[0]).toMatchObject({
      category: "metadata",
      ownerHint: "marketer",
      priority: "p2",
      url: "https://example-clinic.com/"
    });
  });

  it("loads crawl history from the API instead of showing fixture 503 rows", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/sites/${demoSite.id}/crawl-runs`)) {
          return new Response(
            JSON.stringify({
              crawlRuns: [
                {
                  id: "crawl_api_completed",
                  siteId: demoSite.id,
                  status: "completed",
                  startedAt: "2026-06-07T00:00:00.000Z",
                  endedAt: "2026-06-07T00:00:12.000Z",
                  summary: {
                    pagesProcessed: 5,
                    pagesRequested: 5,
                    startUrl: "https://example-clinic.com/"
                  }
                }
              ]
            }),
            { status: 200 },
          );
        }

        if (url.endsWith(`/sites/${demoSite.id}/seo-issues`)) {
          return new Response(
            JSON.stringify({
              issues: [
                {
                  id: "issue_api_h1",
                  crawlRunId: "crawl_api_completed",
                  urlRecordId: "url_api_home",
                  ruleId: "H1_MISSING",
                  severity: "high",
                  status: "open",
                  title: "Missing H1",
                  evidence: { url: "https://example-clinic.com/" },
                  createdAt: "2026-06-07T00:00:01.000Z"
                },
                {
                  id: "issue_api_alt",
                  crawlRunId: "crawl_api_completed",
                  urlRecordId: "url_api_home",
                  ruleId: "IMAGE_ALT_MISSING",
                  severity: "low",
                  status: "open",
                  title: "Missing alt text",
                  evidence: { url: "https://example-clinic.com/" },
                  createdAt: "2026-06-07T00:00:02.000Z"
                }
              ]
            }),
            { status: 200 },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const dashboard = await loadSiteCrawlRunDashboard(demoSite);

    expect(dashboard.source).toBe("api");
    expect(dashboard.rows).toHaveLength(1);
    expect(dashboard.rows[0]).toMatchObject({
      durationSeconds: 12,
      failureReason: null,
      id: "crawl_api_completed",
      issuesFound: 2,
      pagesCrawled: 5,
      urlsDiscovered: 5
    });
    expect(dashboard.rows.map((row) => row.failureReason)).not.toContain("시작 URL이 503을 반환했습니다");
  });

  it("normalizes API base URLs for deployed web runtime fetches", () => {
    expect(getApiBaseUrl("searchops-api-production.up.railway.app")).toBe(
      "https://searchops-api-production.up.railway.app",
    );
    expect(getApiBaseUrl("https://searchops-api-production.up.railway.app/")).toBe(
      "https://searchops-api-production.up.railway.app",
    );
    expect(getApiBaseUrl("ftp://searchops-api.example")).toBeNull();
    expect(getApiBaseUrl("")).toBeNull();
  });

  it("can validate the work board fixtures", () => {
    expect(demoWorkOrders.map((workOrder) => WorkOrderSchema.parse(workOrder))).toHaveLength(5);
  });

  it("summarizes the work board fixture", () => {
    expect(summarizeWorkOrders(demoWorkOrders)).toEqual({
      total: 5,
      active: 4,
      inProgress: 1,
      inReview: 1,
      blocked: 1,
      urgent: 2
    });
  });

  it("groups work orders by deterministic board columns", () => {
    const grouped = groupWorkOrdersByStatus(demoWorkOrders);

    expect(grouped.open).toHaveLength(1);
    expect(grouped.in_progress[0]?.id).toBe("wo_h1_service");
    expect(grouped.done[0]?.id).toBe("wo_canonical_blog");
  });

  it("keeps recheck actions limited to active unblocked work", () => {
    const doneWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "done");
    const blockedWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "blocked");
    const openWorkOrder = demoWorkOrders.find((workOrder) => workOrder.status === "open");

    expect(doneWorkOrder && canRecheckWorkOrder(doneWorkOrder)).toBe(false);
    expect(blockedWorkOrder && canRecheckWorkOrder(blockedWorkOrder)).toBe(false);
    expect(openWorkOrder && canRecheckWorkOrder(openWorkOrder)).toBe(true);
  });

  it("defines the Phase 5 site route shell", () => {
    expect(siteRouteItems.map((item) => item.segment)).toEqual([
      "",
      "crawls",
      "urls",
      "issues",
      "schema",
      "workorders",
      "connectors",
      "content",
      "geo",
      "compliance"
    ]);
    expect(getSiteDashboardPath("site_1", "")).toBe("/sites/site_1");
    expect(getSiteDashboardPath("site_1", "workorders")).toBe("/sites/site_1/workorders");
    expect(getSiteDashboardPath("site_1", "connectors")).toBe("/sites/site_1/connectors");
    expect(getSiteDashboardPath("site_1", "schema")).toBe("/sites/site_1/schema");
  });

  it("keeps placeholder modules wired for non-workorder dashboard sections", () => {
    expect(Object.keys(dashboardPlaceholders).sort()).toEqual([
      "compliance",
      "crawls",
      "issues",
      "urls"
    ]);
  });

  it("summarizes dead-letter operations fixtures", () => {
    const operations = createDemoDeadLetterOperations();

    expect(operations.deadLetterJobs).toHaveLength(2);
    expect(summarizeDeadLetterOperations(demoDeadLetterJobs)).toEqual({
      active: 0,
      failed: 1,
      latestFailure: "2026-05-25T00:00:00.000Z",
      queueCount: 2,
      total: 2,
      waiting: 1
    });
    expect(getDeadLetterStatusTone("active")).toBe("running");
    expect(getDeadLetterStatusTone("completed")).toBe("done");
    expect(formatDeadLetterDate("2026-05-25T00:00:00.000Z")).toBe("2026-05-25 00:00");
  });

  it("loads dead-letter operations through the API response contract", async () => {
    const deadLetterJob = demoDeadLetterJobs[0];
    if (!deadLetterJob) {
      throw new Error("Dead-letter fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/dead-letter-jobs");

        return Response.json({
          deadLetterJobs: [deadLetterJob],
          summary: {
            total: 1,
            byQueue: {
              "searchops-crawl": 1
            },
            byStatus: {
              waiting: 1
            }
          }
        });
      }),
    );

    const operations = await loadDeadLetterOperations();

    expect(operations.source).toBe("api");
    expect(operations.errorMessage).toBeNull();
    expect(operations.summary.total).toBe(1);
  });

  it("formats dead-letter clear feedback", () => {
    expect(getDeadLetterClearFeedback("cleared", "job_1")).toEqual({
      message: "실패 작업 항목을 정리했습니다: job_1",
      tone: "success"
    });
    expect(getDeadLetterClearFeedback("failed", undefined)).toEqual({
      message: "실패 작업 정리 요청에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    });
  });

  it("loads dead-letter replay plans through the API response contract", async () => {
    const plan = createDemoDeadLetterReplayPlan(demoDeadLetterJobs[0]!.id);
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/ops/dead-letter-jobs/${encodeURIComponent(demoDeadLetterJobs[0]!.id)}/replay-plan`,
        );
        expect(init?.method).toBe("POST");

        return Response.json(plan);
      }),
    );

    const result = await loadDeadLetterReplayPlan(demoDeadLetterJobs[0]!.id);

    expect(result.source).toBe("api");
    expect(result.status).toBe("blocked");
    expect(result.plan?.deadLetterJobId).toBe(demoDeadLetterJobs[0]!.id);
  });

  it("formats dead-letter replay feedback", () => {
    expect(getDeadLetterReplayFeedback("blocked", "job_1", "plan_1")).toEqual({
      message: "재실행 계획을 확인했습니다. job_1는 source-of-truth payload 재구성이 필요합니다.",
      tone: "info"
    });
    expect(getDeadLetterReplayFeedback("failed", undefined, undefined)).toEqual({
      message: "재실행 계획 요청에 실패했습니다. API 서버와 dead-letter job ID를 확인하세요.",
      tone: "warning"
    });
  });

  it("summarizes observability dashboard fixtures", () => {
    const dashboard = createDemoObservabilityDashboard();

    expect(summarizeOperationalMetrics(demoOperationalMetricsExport)).toEqual({
      alertCount: 2,
      criticalAlertCount: 1,
      deadLetterTotal: 2,
      requestTotal: 128,
      serverErrorCount: 4,
      uptimeSeconds: 360
    });
    expect(dashboard.source).toBe("fixture");
    expect(getObservabilityAlertTone(demoOperationalMetricsExport.alerts[0]!)).toBe("critical");
    expect(formatOperationalDate("2026-05-26T00:00:00.000Z")).toBe("2026-05-26 00:00");
    expect(formatUptime(125)).toBe("2분 5초");
  });

  it("loads observability dashboard metrics through the API response contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/metrics-export");

        return Response.json(demoOperationalMetricsExport);
      }),
    );

    const dashboard = await loadObservabilityDashboard();

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.summary.alertCount).toBe(2);
  });

  it("summarizes operations hardening fixtures", () => {
    const dashboard = createDemoOperationsHardeningDashboard();

    expect(
      summarizeOperationsHardening(dashboard.backupRestorePlan, dashboard.migrationGatePlan),
    ).toEqual({
      migrationSteps: 4,
      requiredInputs: 5,
      restoreSteps: 4
    });
    expect(getBackupRestoreDrillRunFeedback("dry_run", "restore_1")).toEqual({
      message: "restore drill dry-run을 확인했습니다: restore_1",
      tone: "info"
    });
  });

  it("summarizes the operator console signal matrix", () => {
    const readiness = createDemoOperationalReadinessDashboard();
    const observability = createDemoObservabilityDashboard();
    const deadLetter = createDemoDeadLetterOperations();
    const hardening = createDemoOperationsHardeningDashboard();
    const productization = createDemoProductizationDashboard();

    const signals = createOperatorConsoleSignals({
      canLaunch: productization.productization.canLaunch,
      deadLetterSummary: deadLetter.summary,
      hardeningSummary: hardening.summary,
      observabilitySummary: observability.summary,
      productizationSummary: productization.productization.summary,
      readinessSummary: readiness.readiness.summary
    });

    expect(signals.map((signal) => signal.id)).toEqual([
      "readiness",
      "observability",
      "dead-letter",
      "hardening",
      "productization"
    ]);
    expect(summarizeOperatorConsoleSignals(signals)).toEqual({
      neutral: 0,
      ready: 0,
      risk: 4,
      total: 5,
      warning: 1
    });
    expect(signals.find((signal) => signal.id === "productization")).toMatchObject({
      href: "/ops/productization",
      tone: "risk",
      value: "2 blockers"
    });
  });

  it("loads operations hardening plans through the API response contract", async () => {
    const fixture = createDemoOperationsHardeningDashboard();
    const requestedUrls: string[] = [];
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrls.push(String(input));

        if (String(input).includes("migration-deployment-gate-plan")) {
          return Response.json(fixture.migrationGatePlan);
        }

        return Response.json(fixture.backupRestorePlan);
      }),
    );

    const dashboard = await loadOperationsHardeningDashboard("production");

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(requestedUrls).toEqual([
      "https://api.searchops.test/ops/backup-restore-drill-plan?environment=production",
      "https://api.searchops.test/ops/migration-deployment-gate-plan?environment=production"
    ]);
  });

  it("dispatches backup restore drill dry-runs through the API response contract", async () => {
    const fixture = createDemoOperationsHardeningDashboard();
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/backup-restore-drill-runs");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          dryRun: true,
          environment: "production"
        });

        return Response.json({
          dryRun: true,
          plan: fixture.backupRestorePlan,
          dispatch: {
            acceptedAt: "2026-05-26T00:01:00.000Z",
            externalRunId: null,
            message: "Dry-run accepted for restore drill.",
            provider: "memory",
            status: "dry_run"
          }
        });
      }),
    );

    const result = await runBackupRestoreDrill({
      dryRun: true,
      environment: "production"
    });

    expect(result).toMatchObject({
      dispatchStatus: "dry_run",
      planId: fixture.backupRestorePlan.id,
      source: "api",
      status: "dry_run"
    });
  });

  it("loads operational readiness through the API response contract", async () => {
    const fixture = createDemoOperationalReadinessDashboard().readiness;
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/readiness");

        return Response.json(fixture);
      }),
    );

    const dashboard = await loadOperationalReadiness();
    const grouped = groupReadinessByCategory(dashboard.readiness.items);

    expect(dashboard.source).toBe("api");
    expect(grouped.connectors.length).toBeGreaterThan(0);
    expect(formatReadinessStatus("needs_provisioning")).toBe("프로비저닝 필요");
  });

  it("summarizes productization readiness and onboarding fixtures", () => {
    const dashboard = createDemoProductizationDashboard();

    expect(dashboard.productization.canLaunch).toBe(false);
    expect(formatProductizationArea("auth_rbac")).toBe("Auth/RBAC");
    expect(getProductizationTone("needs_provisioning")).toBe("risk");
    expect(summarizeOnboardingSteps(onboardingSteps)).toEqual({
      available: 4,
      blocked: 1,
      optional: 1,
      total: 6
    });
  });

  it("loads productization readiness through the API response contract", async () => {
    const fixture = createDemoProductizationDashboard().productization;
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/productization");

        return Response.json(fixture);
      }),
    );

    const dashboard = await loadProductizationDashboard();

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.productization.summary.total).toBe(7);
  });

  it("summarizes deterministic GEO visibility dashboard fixtures", () => {
    const dashboard = createDemoGeoVisibilityDashboard(demoSite);

    expect(dashboard.reports).toHaveLength(2);
    expect(dashboard.reports.map((report) => report.siteId)).toEqual([demoSite.id, demoSite.id]);
    expect(summarizeGeoVisibilityDashboard(dashboard)).toEqual({
      averageCitationRate: "84%",
      averageMentionRate: "84%",
      latestStatus: "strong",
      strong: 1,
      total: 2,
      weakOrMissing: 0
    });
    expect(getGeoVisibilityStatusTone("not_visible")).toBe("risk");
    expect(formatGeoStatus("not_visible")).toBe("미노출");
    expect(formatGeoProvider("chatgpt")).toBe("ChatGPT");
    expect(formatGeoDate("2026-05-24T00:00:00.000Z")).toBe("2026-05-24 00:00");
    const preview = summarizeGeoWorkOrderBatchPreview(dashboard.reports);
    expect(preview).toMatchObject({
      candidateCount: 1,
      excludedStrongCount: 1,
      reportIds: ["geo_report_demo_visible"]
    });
    expect(preview.candidates[0]?.priority).toBe("p2");
    expect(formatGeoWorkOrderCandidatePriority(preview.candidates[0]?.priority ?? "p2"))
      .toBe("P2");
  });

  it("loads GEO visibility reports through the API response contract", async () => {
    const report = demoGeoVisibilityReports[0];
    if (!report) {
      throw new Error("GEO visibility API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/sites/${demoSite.id}/geo-visibility-reports`,
        );

        return Response.json({
          reports: [{ ...report, siteId: demoSite.id }]
        });
      }),
    );

    const dashboard = await loadGeoVisibilityDashboard(demoSite);

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.reports).toHaveLength(1);
    expect(dashboard.reports[0]).toMatchObject({
      generatedBy: "deterministic",
      score: 100,
      siteId: demoSite.id,
      status: "strong"
    });
  });

  it("creates GEO visibility reports through the API contract", async () => {
    const report = demoGeoVisibilityReports[0];
    if (!report) {
      throw new Error("GEO visibility create fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/sites/${demoSite.id}/geo-visibility-reports`,
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          target: {
            domain: demoSite.domain,
            siteId: demoSite.id
          }
        });

        return Response.json({
          report: { ...report, id: "geo_report_created", siteId: demoSite.id },
          visibilityReport: {
            checks: report.checks,
            citations: report.citations,
            competitorCitationRate: report.competitorCitationRate,
            evaluatedAt: report.evaluatedAt,
            generatedBy: "deterministic",
            mentionRate: report.mentionRate,
            observations: report.observations,
            citationRate: report.citationRate,
            providerCount: report.providerCount,
            queryCount: report.queryCount,
            score: report.score,
            status: report.status,
            target: {
              brandName: report.brandName,
              domain: report.domain,
              locale: report.locale,
              market: report.market,
              siteId: report.siteId
            }
          }
        });
      }),
    );

    await expect(createGeoVisibilityReportFromFixture(demoSite)).resolves.toMatchObject({
      reportId: "geo_report_created",
      source: "api",
      status: "created"
    });
    expect(getGeoVisibilityCreateFeedback("created", "geo_report_created")?.message).toContain(
      "geo_report_created",
    );
  });

  it("builds deterministic GEO answer monitor queue requests from form data", () => {
    const formData = new FormData();
    formData.append("providers", "chatgpt");
    formData.append("providers", "gemini");

    expect(
      createGeoAnswerMonitorRequestFromForm(demoSite, formData, {
        observedAt: "2026-05-24T00:00:00.000Z"
      }),
    ).toMatchObject({
      observedAt: "2026-05-24T00:00:00.000Z",
      providers: ["chatgpt", "gemini"],
      queries: [
        { locale: "ko-KR", query: "예시 클리닉 후기" },
        { locale: "ko-KR", query: "예시 클리닉 어떤가요" },
        { locale: "ko-KR", query: "강남 피부과 추천" },
        { locale: "ko-KR", query: "강남역 피부과 잘하는 곳" },
        { locale: "ko-KR", query: "강남 리프팅 잘하는 병원" },
        { locale: "ko-KR", query: "강남 보톡스 잘하는 곳" },
        { locale: "ko-KR", query: "강남 필러 추천 병원" }
      ],
      target: {
        domain: demoSite.domain,
        siteId: demoSite.id
      }
    });
  });

  it("uses operator-entered queries (one per line) over the defaults, deduped and capped", () => {
    const formData = new FormData();
    formData.append("providers", "chatgpt");
    formData.append(
      "queries",
      "  강남 리쥬엘 후기 \n강남 물광주사 잘하는 곳\n강남 리쥬엘 후기\n\n강남 울쎄라 후기",
    );

    const request = createGeoAnswerMonitorRequestFromForm(demoSite, formData, {
      observedAt: "2026-05-24T00:00:00.000Z"
    });

    expect(request.queries).toEqual([
      { locale: "ko-KR", query: "강남 리쥬엘 후기" },
      { locale: "ko-KR", query: "강남 물광주사 잘하는 곳" },
      { locale: "ko-KR", query: "강남 울쎄라 후기" }
    ]);
  });

  it("queues GEO answer monitor jobs through the API response contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/sites/${demoSite.id}/geo-answer-monitor-jobs`,
        );
        expect(init?.method).toBe("POST");
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          providers: ["chatgpt", "perplexity"],
          target: {
            domain: demoSite.domain,
            siteId: demoSite.id
          }
        });
        expect(body.queries).toHaveLength(7);

        return Response.json({
          job: {
            id: "job_geo_answer_monitor",
            name: "geo-answer-monitor",
            payload: {
              organizationId: "org_demo",
              siteId: demoSite.id,
              siteDomain: demoSite.domain,
              requestedByUserId: "user_demo",
              target: body.target,
              queries: body.queries,
              observedAt: body.observedAt,
              providers: body.providers
            }
          }
        });
      }),
    );

    await expect(queueGeoAnswerMonitorJob(demoSite)).resolves.toMatchObject({
      jobId: "job_geo_answer_monitor",
      providerCount: 2,
      providers: ["chatgpt", "perplexity"],
      queryCount: 7,
      source: "api",
      status: "queued"
    });
    expect(
      getGeoAnswerMonitorQueueFeedback(
        "queued",
        "job_geo_answer_monitor",
        "chatgpt,perplexity",
        "3",
      )?.message,
    ).toContain("job_geo_answer_monitor");
  });

  it("creates GEO work orders through the API response contract", async () => {
    const report = demoGeoVisibilityReports[1];
    const workOrder = demoWorkOrders[0];
    if (!report || !workOrder) {
      throw new Error("GEO work order fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/geo-visibility-reports/${report.id}/work-order`,
        );
        expect(init?.method).toBe("POST");

        return Response.json({
          report,
          workOrder: {
            ...workOrder,
            id: "wo_geo_visibility",
            geoVisibilityReportId: report.id,
            schemaRecommendationId: null,
            seoIssueId: null,
            title: "Example Clinic GEO visibility improvement"
          }
        });
      }),
    );

    await expect(convertGeoVisibilityReportToWorkOrder(report.id)).resolves.toMatchObject({
      reportId: report.id,
      source: "api",
      status: "converted",
      workOrderId: "wo_geo_visibility"
    });
    expect(getGeoVisibilityWorkOrderFeedback("converted", "wo_geo_visibility", report.id)?.message)
      .toContain("wo_geo_visibility");
  });

  it("keeps GEO visibility deterministic without an API base URL", async () => {
    await expect(loadGeoVisibilityDashboard(demoSite)).resolves.toMatchObject({
      reports: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "deterministic",
          siteId: demoSite.id
        })
      ]),
      source: "fixture"
    });
    await expect(createGeoVisibilityReportFromFixture(demoSite)).resolves.toMatchObject({
      reportId: null,
      source: "fixture",
      status: "fixture"
    });
    expect(getGeoVisibilityCreateFeedback("fixture", undefined)?.tone).toBe("info");
    await expect(queueGeoAnswerMonitorJob(demoSite)).resolves.toMatchObject({
      jobId: null,
      providers: defaultGeoAnswerMonitorProviders,
      source: "fixture",
      status: "fixture"
    });
    expect(getGeoAnswerMonitorQueueFeedback("fixture", undefined, undefined, undefined)?.tone)
      .toBe("info");
    await expect(convertGeoVisibilityReportToWorkOrder("geo_report_demo_visible"))
      .resolves.toMatchObject({
        reportId: "geo_report_demo_visible",
        source: "fixture",
        status: "fixture",
        workOrderId: null
      });
    expect(
      getGeoVisibilityWorkOrderFeedback("fixture", undefined, "geo_report_demo_visible")?.tone,
    ).toBe("info");
  });

  it("summarizes deterministic content brief history", () => {
    const history = createDemoContentBriefHistory("site_1");

    expect(history.briefs.map((brief) => ContentBriefSchema.parse(brief))).toHaveLength(2);
    expect(summarizeContentBriefHistory(history)).toEqual({
      archived: 0,
      draft: 2,
      latestCreatedAt: "2026-05-23T00:00:00.000Z",
      total: 2,
      totalFaqQuestions: 3
    });
    expect(getContentBriefStatusTone("draft")).toBe("draft");
    expect(formatContentBriefDate("2026-05-23T00:00:00.000Z")).toBe("2026-05-23 00:00");
  });

  it("loads content brief history through the API response contract", async () => {
    const contentBrief = demoContentBriefs[0];
    if (!contentBrief) {
      throw new Error("Content brief API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/content-briefs");

        return Response.json({
          contentBriefs: [{ ...contentBrief, siteId: "site_1" }]
        });
      }),
    );

    const history = await loadContentBriefHistory("site_1");

    expect(history.source).toBe("api");
    expect(history.briefs).toHaveLength(1);
    expect(history.briefs[0]?.siteId).toBe("site_1");
  });

  it("builds deterministic content brief create requests from form data", () => {
    const formData = new FormData();
    formData.set("phrase", "seo clinic price comparison");
    formData.set("intent", "commercial");
    formData.set("candidateUrl", "https://example-clinic.com/service/seo");
    formData.set("pageTitle", "SEO clinic service");
    formData.set("metaDescription", "SEO clinic service page");
    formData.set("h1", "SEO clinic");
    formData.set("wordCount", "320");
    formData.set("schemaTypes", "FAQPage, LocalBusiness");
    formData.set("questionHeadings", "What does SEO clinic include?\nHow much does it cost?");
    formData.set("h2", "What does SEO clinic include?");

    expect(
      createContentBriefRequestFromForm(formData, {
        evaluatedAt: "2026-05-23T00:00:00.000Z"
      }),
    ).toMatchObject({
      candidatePage: {
        h2: ["What does SEO clinic include?"],
        questionHeadings: ["What does SEO clinic include?", "How much does it cost?"],
        schemaTypes: ["FAQPage", "LocalBusiness"],
        wordCount: 320
      },
      evaluatedAt: "2026-05-23T00:00:00.000Z",
      keyword: {
        intent: "commercial",
        phrase: "seo clinic price comparison"
      }
    });
  });

  it("creates content brief requests through the API contract", async () => {
    const contentBrief = demoContentBriefs[0];
    if (!contentBrief) {
      throw new Error("Content brief create fixture is missing");
    }

    const formData = new FormData();
    formData.set("phrase", contentBrief.primaryKeyword);
    formData.set("intent", contentBrief.intent);

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/content-briefs");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          keyword: {
            intent: contentBrief.intent,
            phrase: contentBrief.primaryKeyword
          }
        });

        return Response.json({
          contentBrief: { ...contentBrief, id: "brief_created", siteId: "site_1" },
          draft: {
            acceptanceCriteria: contentBrief.acceptanceCriteria,
            faqQuestions: contentBrief.faqQuestions,
            generationMode: "deterministic",
            intent: contentBrief.intent,
            keywordId: null,
            locale: contentBrief.locale,
            outline: contentBrief.outline,
            primaryKeyword: contentBrief.primaryKeyword,
            publishPolicy: "draft_only",
            siteId: "site_1",
            status: "draft",
            summary: contentBrief.summary,
            title: contentBrief.title
          },
          faqGapSet: {
            evaluatedAt: "2026-05-23T00:00:00.000Z",
            gaps: [],
            generatedBy: "deterministic",
            keyword: {
              country: "KR",
              intent: contentBrief.intent,
              language: "ko",
              locale: contentBrief.locale,
              phrase: contentBrief.primaryKeyword,
              siteId: "site_1",
              source: "manual"
            },
            pageUrl: null
          },
          readinessReport: {
            checks: [
              {
                checkId: "KEYWORD_INTENT_DEFINED",
                evidence: {
                  expectedValue: "Non-null deterministic keyword intent",
                  observedValue: contentBrief.intent,
                  sourceField: "keyword.intent",
                  url: null
                },
                score: 100,
                status: "pass"
              }
            ],
            evaluatedAt: "2026-05-23T00:00:00.000Z",
            generatedBy: "deterministic",
            keyword: {
              country: "KR",
              intent: contentBrief.intent,
              language: "ko",
              locale: contentBrief.locale,
              phrase: contentBrief.primaryKeyword,
              siteId: "site_1",
              source: "manual"
            },
            pageUrl: null,
            score: 0,
            status: "not_ready"
          }
        });
      }),
    );

    await expect(createContentBriefFromForm("site_1", formData)).resolves.toMatchObject({
      contentBriefId: "brief_created",
      primaryKeyword: contentBrief.primaryKeyword,
      source: "api",
      status: "created"
    });
    expect(getContentBriefCreateFeedback("created", "brief_created", undefined)?.message).toContain(
      "brief_created",
    );
  });

  it("keeps content brief history deterministic without an API base URL", async () => {
    await expect(loadContentBriefHistory("site_1")).resolves.toMatchObject({
      briefs: expect.arrayContaining([
        expect.objectContaining({
          generationMode: "deterministic",
          publishPolicy: "draft_only",
          siteId: "site_1"
        })
      ]),
      source: "fixture"
    });
  });

  it("keeps content brief create deterministic without an API base URL", async () => {
    const formData = new FormData();
    formData.set("phrase", "medical seo checklist");
    formData.set("intent", "informational");

    await expect(createContentBriefFromForm("site_1", formData)).resolves.toMatchObject({
      contentBriefId: null,
      primaryKeyword: "medical seo checklist",
      source: "fixture",
      status: "fixture"
    });
    expect(getContentBriefCreateFeedback("fixture", undefined, "medical seo checklist")?.tone).toBe(
      "info",
    );
  });

  it("summarizes deterministic keyword AEO readiness", () => {
    const dashboard = createDemoKeywordAeoDashboard("site_1");

    expect(dashboard.reports.map((report) => report.keyword.siteId)).toEqual([
      "site_1",
      "site_1",
      "site_1"
    ]);
    expect(dashboard.keywordDiscoveries.map((candidate) => candidate.siteId)).toEqual([
      "site_1",
      "site_1"
    ]);
    expect(summarizeKeywordAeoDashboard(dashboard)).toEqual({
      averageScore: "61",
      needsWork: 1,
      notReady: 1,
      ready: 1,
      total: 3,
      weakChecks: 11
    });
    const readyReport = dashboard.reports[0];
    if (!readyReport) {
      throw new Error("Keyword AEO dashboard fixture is missing");
    }

    expect(getWeakAeoChecks(readyReport)).toHaveLength(1);
    expect(getAeoReadinessTone("not_ready")).toBe("risk");
    expect(formatAeoCheckId("FAQ_SCHEMA_PRESENT")).toBe("FAQ 스키마");
  });

  it("connects persisted GSC connector results to keyword discovery", async () => {
    const connectorHistory = createDemoConnectorSyncHistory("site_1");
    const latestGscRun = findLatestGscKeywordDiscoveryRun(connectorHistory);
    expect(latestGscRun?.id).toBe("sync_demo_003");

    const formData = new FormData();
    formData.set("connectorSyncRunId", latestGscRun?.id ?? "");
    formData.set("minImpressions", "3");
    formData.set("maxCandidates", "12");

    expect(createKeywordDiscoveryRequestFromForm(formData)).toMatchObject({
      connectorSyncRunId: "sync_demo_003",
      maxCandidates: 12,
      minImpressions: 3
    });
    await expect(createKeywordDiscoveryFromConnectorRun("site_1", formData)).resolves.toMatchObject({
      candidateCount: 1,
      connectorSyncRunId: "sync_demo_003",
      source: "fixture",
      status: "fixture",
      topKeyword: "답변엔진 최적화 클리닉"
    });
    expect(getKeywordDiscoveryCreateFeedback("fixture", "1", "답변엔진 최적화 클리닉")?.tone).toBe(
      "info",
    );
  });

  it("posts keyword discovery requests through the API contract", async () => {
    const formData = new FormData();
    formData.set("connectorSyncRunId", "sync_run_gsc");
    formData.set("minImpressions", "5");
    formData.set("maxCandidates", "10");

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/keyword-discoveries");
        expect(JSON.parse(String(init?.body))).toEqual({
          connectorSyncRunId: "sync_run_gsc",
          maxCandidates: 10,
          minImpressions: 5
        });

        return Response.json({
          discoverySet: {
            siteId: "site_1",
            generatedBy: "deterministic",
            discoveredAt: "2026-05-25T00:00:00.000Z",
            candidates: [
              {
                keyword: {
                  siteId: "site_1",
                  phrase: "seo clinic",
                  locale: "ko-KR",
                  language: "ko",
                  country: "KR",
                  intent: "commercial",
                  source: "gsc"
                },
                pageUrl: "https://example-clinic.com/service/seo",
                score: 120,
                evidence: {
                  provider: "gsc",
                  pageUrl: "https://example-clinic.com/service/seo",
                  sourceField: "query",
                  clicks: 12,
                  impressions: 120,
                  position: 3.2
                }
              }
            ]
          },
          candidates: [
            {
              id: "keyword_discovery_1",
              siteId: "site_1",
              keywordId: "keyword_1",
              phrase: "seo clinic",
              locale: "ko-KR",
              language: "ko",
              country: "KR",
              intent: "commercial",
              source: "gsc",
              pageUrl: "https://example-clinic.com/service/seo",
              score: 120,
              evidence: {
                provider: "gsc",
                pageUrl: "https://example-clinic.com/service/seo",
                sourceField: "query",
                clicks: 12,
                impressions: 120,
                position: 3.2
              },
              generatedBy: "deterministic",
              discoveredAt: "2026-05-25T00:00:00.000Z",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        });
      }),
    );

    await expect(createKeywordDiscoveryFromConnectorRun("site_1", formData)).resolves.toMatchObject({
      candidateCount: 1,
      source: "api",
      status: "created",
      topKeyword: "seo clinic"
    });
    expect(getKeywordDiscoveryCreateFeedback("created", "1", "seo clinic")?.message).toContain(
      "seo clinic",
    );
  });

  it("loads keyword AEO readiness through the API response contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/sites/site_1/aeo-readiness-reports")) {
          return Response.json({
            reports: [
              {
                checks: [
                  {
                    checkId: "KEYWORD_INTENT_DEFINED",
                    evidence: {
                      expectedValue: "Non-null deterministic keyword intent",
                      observedValue: "commercial",
                      sourceField: "keyword.intent",
                      url: null
                    },
                    score: 100,
                    status: "pass"
                  }
                ],
                createdAt: "2026-05-23T00:00:00.000Z",
                evaluatedAt: "2026-05-23T00:00:00.000Z",
                generatedBy: "deterministic",
                id: "aeo_report_1",
                intent: "commercial",
                keywordId: "keyword_1",
                locale: "ko-KR",
                pageUrl: "https://example-clinic.com/service/seo",
                phrase: "seo clinic",
                score: 72,
                siteId: "site_1",
                status: "needs_work"
              }
            ]
          });
        }

        expect(url).toBe("https://api.searchops.test/sites/site_1/keyword-discoveries");
        return Response.json({
          candidates: [
            {
              id: "keyword_discovery_1",
              siteId: "site_1",
              keywordId: "keyword_1",
              phrase: "seo clinic",
              locale: "ko-KR",
              language: "ko",
              country: "KR",
              intent: "commercial",
              source: "gsc",
              pageUrl: "https://example-clinic.com/service/seo",
              score: 120,
              evidence: {
                provider: "gsc",
                pageUrl: "https://example-clinic.com/service/seo",
                sourceField: "query",
                clicks: 12,
                impressions: 120,
                position: 3.2
              },
              generatedBy: "deterministic",
              discoveredAt: "2026-05-25T00:00:00.000Z",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z"
            }
          ]
        });
      }),
    );

    const dashboard = await loadKeywordAeoDashboard("site_1");

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.reports).toHaveLength(1);
    expect(dashboard.reports[0]).toMatchObject({
      keyword: {
        phrase: "seo clinic",
        siteId: "site_1"
      },
      score: 72,
      status: "needs_work"
    });
    expect(dashboard.keywordDiscoveries).toHaveLength(1);
    expect(dashboard.keywordDiscoveries[0]).toMatchObject({
      phrase: "seo clinic",
      source: "gsc"
    });
  });

  it("keeps keyword AEO readiness deterministic without an API base URL", async () => {
    await expect(loadKeywordAeoDashboard("site_1")).resolves.toMatchObject({
      reports: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "deterministic",
          keyword: expect.objectContaining({ siteId: "site_1" })
        })
      ]),
      keywordDiscoveries: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "deterministic",
          siteId: "site_1"
        })
      ]),
      source: "fixture"
    });
  });

  it("falls back to fixture keyword AEO readiness when the API request fails", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    const dashboard = await loadKeywordAeoDashboard("site_1");

    expect(dashboard.source).toBe("fixture");
    expect(dashboard.errorMessage).toContain("503");
    expect(dashboard.reports).toHaveLength(3);
    expect(dashboard.keywordDiscoveries).toHaveLength(2);
  });

  it("summarizes deterministic schema recommendation fixtures", () => {
    const dashboard = createDemoSchemaRecommendationDashboard("site_1");

    expect(dashboard.recommendations.map((recommendation) =>
      SchemaRecommendationRecordSchema.parse(recommendation),
    )).toHaveLength(3);
    expect(dashboard.recommendations.map((recommendation) => recommendation.siteId)).toEqual([
      "site_1",
      "site_1",
      "site_1"
    ]);
    expect(summarizeSchemaRecommendations(dashboard)).toEqual({
      converted: 1,
      dismissed: 0,
      highPriority: 2,
      open: 2,
      resolved: 0,
      total: 3,
      totalRequiredFields: 12
    });
    expect(getSchemaRecommendationStatusTone("open")).toBe("risk");
    expect(getSchemaRecommendationStatusTone("resolved")).toBe("good");
    expect(formatSchemaJsonLdType("MedicalClinic")).toBe("의료 클리닉(MedicalClinic)");
  });

  it("loads schema recommendations through the API response contract", async () => {
    const recommendation = demoSchemaRecommendations[0];
    if (!recommendation) {
      throw new Error("Schema recommendation API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/schema-recommendations");

        return Response.json({
          recommendations: [{ ...recommendation, siteId: "site_1" }]
        });
      }),
    );

    const dashboard = await loadSchemaRecommendationDashboard("site_1");

    expect(dashboard.source).toBe("api");
    expect(dashboard.errorMessage).toBeNull();
    expect(dashboard.recommendations).toHaveLength(1);
    expect(dashboard.recommendations[0]).toMatchObject({
      siteId: "site_1",
      type: recommendation.type
    });
  });

  it("creates schema work orders through the API response contract", async () => {
    const recommendation = demoSchemaRecommendations[0];
    const workOrder = demoWorkOrders[0];
    if (!recommendation || !workOrder) {
      throw new Error("Schema work order fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/schema-recommendations/${recommendation.id}/work-order`,
        );
        expect(init?.method).toBe("POST");

        return Response.json({
          recommendation: { ...recommendation, status: "converted" },
          workOrder: {
            ...workOrder,
            id: "wo_schema_service",
            schemaRecommendationId: recommendation.id,
            seoIssueId: null,
            title: "Add Service JSON-LD to /service/seo"
          }
        });
      }),
    );

    await expect(convertSchemaRecommendationToWorkOrder(recommendation.id)).resolves.toMatchObject({
      recommendationId: recommendation.id,
      source: "api",
      status: "converted",
      workOrderId: "wo_schema_service"
    });
    expect(getSchemaWorkOrderCreateFeedback("converted", "wo_schema_service", undefined)?.message)
      .toContain("wo_schema_service");
  });

  it("rechecks schema recommendations through the API response contract", async () => {
    const recommendation = demoSchemaRecommendations[0];
    const workOrder = demoWorkOrders[0];
    if (!recommendation || !workOrder) {
      throw new Error("Schema recheck API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/schema-recommendations/${recommendation.id}/recheck`,
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          snapshot: {
            url: recommendation.pageUrl
          }
        });

        return Response.json({
          expectedType: recommendation.type,
          observedTypes: [recommendation.type],
          recommendation: {
            ...recommendation,
            evidence: {
              ...recommendation.evidence,
              observedTypes: [recommendation.type]
            },
            status: "resolved"
          },
          resolved: true,
          workOrder: {
            ...workOrder,
            id: "wo_schema_service",
            schemaRecommendationId: recommendation.id,
            seoIssueId: null,
            status: "done"
          }
        });
      }),
    );

    await expect(recheckSchemaRecommendationWithDraft(recommendation)).resolves.toMatchObject({
      expectedType: recommendation.type,
      observedTypes: [recommendation.type],
      recommendationId: recommendation.id,
      source: "api",
      status: "resolved",
      workOrderId: "wo_schema_service"
    });
    expect(getSchemaRecheckFeedback("resolved", "wo_schema_service", undefined)?.message)
      .toContain("wo_schema_service");
  });

  it("queues schema rich result validation jobs through the API response contract", async () => {
    const recommendation = demoSchemaRecommendations[0];
    if (!recommendation) {
      throw new Error("Schema rich result validation fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/schema-recommendations/${recommendation.id}/rich-result-validation-jobs`,
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({});

        return Response.json({
          recommendation,
          job: {
            id: "job_schema_rich_result",
            name: "schema-rich-result-validation",
            payload: {
              recommendationId: recommendation.id,
              siteId: recommendation.siteId,
              siteDomain: "example-clinic.com",
              requestedByUserId: "user_demo",
              requestedAt: "2026-05-24T00:00:00.000Z",
              url: recommendation.pageUrl,
              type: recommendation.type,
              jsonLd: recommendation.jsonLd,
              requiredFields: recommendation.requiredFields,
              recommendedFields: recommendation.recommendedFields
            }
          }
        });
      }),
    );

    await expect(queueSchemaRichResultValidation(recommendation.id)).resolves.toMatchObject({
      jobId: "job_schema_rich_result",
      recommendationId: recommendation.id,
      source: "api",
      status: "queued"
    });
    expect(getSchemaRichResultValidationFeedback("queued", "job_schema_rich_result", undefined)?.message)
      .toContain("job_schema_rich_result");
  });

  it("keeps schema dashboard deterministic without an API base URL", async () => {
    const recommendation = demoSchemaRecommendations[0];
    if (!recommendation) {
      throw new Error("Schema recheck fixture is missing");
    }

    await expect(loadSchemaRecommendationDashboard("site_1")).resolves.toMatchObject({
      recommendations: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "deterministic",
          siteId: "site_1"
        })
      ]),
      source: "fixture"
    });
    await expect(convertSchemaRecommendationToWorkOrder("schema_rec_service")).resolves.toMatchObject({
      recommendationId: "schema_rec_service",
      source: "fixture",
      status: "fixture",
      workOrderId: null
    });
    expect(getSchemaWorkOrderCreateFeedback("fixture", undefined, "schema_rec_service")?.tone).toBe(
      "info",
    );
    expect(createResolvedSchemaSnapshot(recommendation)).toMatchObject({
      jsonLd: [
        {
          parsed: expect.objectContaining({
            "@type": recommendation.type
          })
        }
      ],
      url: recommendation.pageUrl
    });
    await expect(recheckSchemaRecommendationWithDraft(recommendation)).resolves.toMatchObject({
      expectedType: recommendation.type,
      observedTypes: [recommendation.type],
      recommendationId: recommendation.id,
      source: "fixture",
      status: "fixture"
    });
    expect(getSchemaRecheckFeedback("fixture", undefined, recommendation.id)?.tone).toBe("info");
    await expect(queueSchemaRichResultValidation(recommendation.id)).resolves.toMatchObject({
      jobId: null,
      recommendationId: recommendation.id,
      source: "fixture",
      status: "fixture"
    });
    expect(getSchemaRichResultValidationFeedback("fixture", undefined, recommendation.id)?.tone).toBe(
      "info",
    );
  });

  it("summarizes deterministic connector sync history", () => {
    const history = createDemoConnectorSyncHistory("site_1");

    expect(summarizeConnectorSyncHistory(history)).toEqual({
      completed: 1,
      failed: 1,
      latestStatus: "completed",
      okResults: 4,
      partial: 1,
      queued: 0,
      setupRequiredResults: 0,
      total: 3,
      totalRecords: 5
    });
    expect(getConnectorSyncRunTone("partial")).toBe("partial");
    expect(getConnectorSyncResultTone("setup_required")).toBe("setup");
    expect(formatSyncDuration("2026-05-22T09:00:00.000Z", "2026-05-22T09:01:18.000Z")).toBe(
      "1m 18s",
    );
    const firstRun = history.runs[0];
    if (!firstRun) {
      throw new Error("Connector sync history fixture is missing");
    }
    const runWithProviderErrors = {
      ...firstRun,
      summary: {
        failedProviders: 1,
        okProviders: 0,
        partialProviders: 0,
        providerErrors: {
          gsc: {
            message: "GSC OAuth credential is missing for this site."
          }
        },
        recordCountsByProvider: {
          bing: 0,
          cms: 0,
          ga4: 0,
          gsc: 0,
          pagespeed: 0
        },
        setupRequiredProviders: 0,
        totalProviders: 1,
        totalRecords: 0
      }
    };
    expect(getConnectorSyncRunProviderErrorMessages(runWithProviderErrors)).toEqual([
      "GSC: GSC OAuth credential is missing for this site."
    ]);
    expect(getConnectorSyncProviderErrorMessage(runWithProviderErrors, "gsc")).toBe(
      "GSC OAuth credential is missing for this site.",
    );
    const operations = summarizeConnectorOperations(history);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "pagespeed",
          status: "ok",
          retryLabel: "다시 실행"
        }),
        expect.objectContaining({
          provider: "cms",
          status: "partial"
        }),
        expect.objectContaining({
          provider: "bing",
          latestRunId: null,
          status: "not_run"
        })
      ]),
    );
    expect(summarizeConnectorCommandCenter(operations)).toEqual({
      actionRequiredProviders: 2,
      blockedProviders: 0,
      currentRecords: 4,
      latestRunId: "sync_demo_003",
      readyProviders: 3,
      totalProviders: 5
    });
    const runWithOperatorGuidance = {
      ...firstRun,
      summary: {
        failedProviders: 1,
        okProviders: 0,
        partialProviders: 0,
        providerErrors: {
          ga4: {
            code: "ga4_property_access_denied",
            message:
              "Google Analytics Data API request failed with status 403: User does not have sufficient permissions for this property.",
            nextAction: "GA4 속성 액세스 관리에서 OAuth 계정을 뷰어 이상으로 추가하세요.",
            operatorMessage:
              "OAuth Google 계정이 현재 SEARCHOPS_GA4_PROPERTY_ID 속성에 접근할 권한이 없습니다."
          }
        },
        recordCountsByProvider: {
          bing: 0,
          cms: 0,
          ga4: 0,
          gsc: 0,
          pagespeed: 0
        },
        setupRequiredProviders: 0,
        totalProviders: 1,
        totalRecords: 0
      }
    };
    expect(getConnectorSyncRunProviderErrorMessages(runWithOperatorGuidance)).toEqual([
      "GA4: OAuth Google 계정이 현재 SEARCHOPS_GA4_PROPERTY_ID 속성에 접근할 권한이 없습니다. 조치: GA4 속성 액세스 관리에서 OAuth 계정을 뷰어 이상으로 추가하세요."
    ]);
    expect(getConnectorSyncProviderErrorGuidance(runWithOperatorGuidance, "ga4")).toEqual({
      code: "ga4_property_access_denied",
      message: "OAuth Google 계정이 현재 SEARCHOPS_GA4_PROPERTY_ID 속성에 접근할 권한이 없습니다.",
      nextAction: "GA4 속성 액세스 관리에서 OAuth 계정을 뷰어 이상으로 추가하세요."
    });
    const setupRequiredRun = {
      ...firstRun,
      id: "sync_setup_required",
      providers: ["pagespeed" as const],
      status: "partial" as const,
      summary: {
        failedProviders: 0,
        okProviders: 0,
        partialProviders: 0,
        providerErrors: {
          pagespeed: {
            code: "pagespeed_api_key_missing",
            message: "PageSpeed API key is missing in the worker runtime.",
            nextAction:
              "Railway worker에 SEARCHOPS_PAGESPEED_API_KEY를 추가한 뒤 PageSpeed만 다시 실행하세요.",
            operatorMessage: "PageSpeed API Key가 worker 런타임에 설정되지 않았습니다."
          }
        },
        recordCountsByProvider: {
          bing: 0,
          cms: 0,
          ga4: 0,
          gsc: 0,
          pagespeed: 0
        },
        setupRequiredProviders: 1,
        totalProviders: 1,
        totalRecords: 0
      }
    };
    const setupOperations = summarizeConnectorOperations({
      ...history,
      resultsByRunId: {
        [setupRequiredRun.id]: [
          {
            id: "sync_result_setup_required",
            syncRunId: setupRequiredRun.id,
            provider: "pagespeed",
            status: "setup_required",
            fetchedAt: "2026-05-22T00:00:00.000Z",
            fixture: false,
            recordCount: 0,
            records: [],
            createdAt: "2026-05-22T00:00:00.000Z"
          }
        ]
      },
      runs: [setupRequiredRun]
    });
    expect(setupOperations.find((item) => item.provider === "pagespeed")).toMatchObject({
      message: "PageSpeed API Key가 worker 런타임에 설정되지 않았습니다.",
      nextAction: "Railway worker에 SEARCHOPS_PAGESPEED_API_KEY를 추가한 뒤 PageSpeed만 다시 실행하세요.",
      retryLabel: "단독 실행",
      status: "setup_required"
    });
  });

  it("summarizes Google connector OAuth credentials", () => {
    const data = createDemoConnectorOAuthData("site_1");
    const statuses = summarizeConnectorOAuthProviders(data.credentials);

    expect(statuses).toEqual([
      expect.objectContaining({
        provider: "gsc",
        status: "connected"
      }),
      expect.objectContaining({
        credential: null,
        provider: "ga4",
        status: "missing"
      })
    ]);
    expect(formatConnectorOAuthStatus("connected")).toBe("연결됨");
    expect(getConnectorOAuthTone("revoked")).toBe("risk");
  });

  it("loads Google connector OAuth credentials through the API contract", async () => {
    const data = createDemoConnectorOAuthData("site_1");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/connectors/oauth");
        return Response.json({
          credentials: data.credentials
        });
      }),
    );

    await expect(loadConnectorOAuthData("site_1")).resolves.toMatchObject({
      credentials: data.credentials,
      errorMessage: null,
      source: "api"
    });
  });

  it("falls back to fixture Google connector OAuth data without an API base URL", async () => {
    await expect(loadConnectorOAuthData("site_1")).resolves.toMatchObject({
      source: "fixture"
    });
  });

  it("summarizes PageSpeed live setup status from the safe setup report", () => {
    const data = createDemoConnectorLiveSetupData();
    const check = getPageSpeedLiveSetupCheck(data.report);

    expect(check).toMatchObject({
      area: "pagespeed",
      envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"],
      status: "needs_provisioning"
    });
    expect(formatConnectorLiveSetupStatus("ready")).toBe("준비됨");
    expect(getConnectorLiveSetupTone("blocked")).toBe("risk");
  });

  it("loads PageSpeed live setup status through the ops API contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/ops/connector-live-setup");
        return Response.json({
          generatedAt: "2026-05-27T00:00:00.000Z",
          environment: "deployment",
          liveExternalApis: "enabled",
          canRunFixtureMode: false,
          canRunLiveConnectorSync: true,
          checks: [
            {
              id: "pagespeed-live-credential",
              area: "pagespeed",
              title: "PageSpeed live credential",
              status: "ready",
              summary: "PageSpeed Insights API key가 설정되어 있습니다.",
              nextAction: "PageSpeed만 단독 동기화해 quota와 응답 상태를 확인하세요.",
              envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"]
            }
          ],
          summary: {
            ready: 1,
            configured: 0,
            needsProvisioning: 0,
            warnings: 0,
            blocked: 0,
            total: 1
          }
        });
      }),
    );

    const data = await loadConnectorLiveSetupData();

    expect(data.source).toBe("api");
    expect(getPageSpeedLiveSetupCheck(data.report).status).toBe("ready");
  });

  it("falls back to fixture PageSpeed live setup data without an API base URL", async () => {
    await expect(loadConnectorLiveSetupData()).resolves.toMatchObject({
      source: "fixture"
    });
  });

  it("loads connector sync history through the API response contracts", async () => {
    const fixture = createDemoConnectorSyncHistory("site_1");
    const connectorSyncRun = fixture.runs[0];
    const connectorSyncResult = connectorSyncRun
      ? fixture.resultsByRunId[connectorSyncRun.id]?.[0]
      : undefined;
    if (!connectorSyncRun || !connectorSyncResult) {
      throw new Error("Connector sync API fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/sites/site_1/connector-sync-runs")) {
          return Response.json({
            connectorSyncRuns: [connectorSyncRun]
          });
        }

        if (url.endsWith(`/connector-sync-runs/${connectorSyncRun.id}`)) {
          return Response.json({
            connectorSyncRun,
            results: [connectorSyncResult]
          });
        }

        return new Response(null, { status: 404 });
      }),
    );

    const history = await loadConnectorSyncHistory("site_1");

    expect(history.source).toBe("api");
    expect(history.runs).toHaveLength(1);
    expect(history.resultsByRunId[connectorSyncRun.id]).toHaveLength(1);
  });

  it("queues connector sync trigger requests through the API contract", async () => {
    const fixture = createDemoConnectorSyncHistory("site_1");
    const connectorSyncRun = fixture.runs[0];
    if (!connectorSyncRun) {
      throw new Error("Connector sync trigger fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/connector-sync-runs");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ providers: ["gsc", "pagespeed"] });

        return Response.json({
          connectorSyncRun: {
            ...connectorSyncRun,
            id: "sync_queued",
            providers: ["gsc", "pagespeed"],
            status: "queued",
            endedAt: null,
            summary: null
          },
          job: {
            id: "job_queued",
            name: "connector-sync",
            payload: {
              connectorSyncRunId: "sync_queued",
              organizationId: connectorSyncRun.organizationId,
              siteId: "site_1",
              siteDomain: "example-clinic.com",
              requestedByUserId: connectorSyncRun.requestedByUserId,
              fetchedAt: "2026-05-22T09:00:00.000Z",
              providers: ["gsc", "pagespeed"]
            }
          }
        });
      }),
    );

    await expect(triggerConnectorSync("site_1", ["gsc", "pagespeed"])).resolves.toMatchObject({
      connectorSyncRunId: "sync_queued",
      jobId: "job_queued",
      source: "api",
      status: "queued"
    });
    expect(getConnectorSyncTriggerFeedback("queued", "sync_queued")?.message).toContain(
      "sync_queued",
    );
  });

  it("keeps connector sync trigger deterministic without an API base URL", async () => {
    await expect(triggerConnectorSync("site_1", ["gsc"])).resolves.toMatchObject({
      connectorSyncRunId: null,
      providers: ["gsc"],
      source: "fixture",
      status: "fixture"
    });
    expect(getConnectorSyncTriggerFeedback("fixture", undefined)?.tone).toBe("info");
  });

  it("summarizes deterministic compliance dashboard fixtures", () => {
    const dashboard = createDemoComplianceDashboard(demoSite);

    expect(dashboard.flags).toHaveLength(demoComplianceFlags.length);
    expect(summarizeComplianceDashboard(dashboard)).toEqual({
      approved: 0,
      blocked: 2,
      open: 1,
      total: 2
    });
    expect(getComplianceRiskTone("high")).toBe("risk");
    expect(getComplianceRiskTone("medium")).toBe("neutral");
    expect(formatComplianceRisk("critical")).toBe("긴급");
    expect(summarizeComplianceHardeningWorkflow(dashboard)).toMatchObject({
      autoPublishAllowed: false,
      deterministicRuleCount: 7,
      legalReviewQueueCount: 2,
      nativeSignatureProviders: ["wordpress", "webflow"],
      rulePackId: "kr-medical"
    });
    expect(
      summarizeComplianceHardeningWorkflow(dashboard).stages.map((stage) => stage.status),
    ).toEqual(["needs_owner", "ready", "ready", "needs_owner"]);
  });

  it("loads compliance flags through the API response contract", async () => {
    const complianceFlag = demoComplianceFlags[0];
    if (!complianceFlag) {
      throw new Error("Compliance flag fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/compliance-flags");

        return Response.json({
          complianceFlags: [complianceFlag]
        });
      }),
    );

    const dashboard = await loadComplianceDashboard({
      ...demoSite,
      id: "site_1"
    });

    expect(dashboard.source).toBe("api");
    expect(dashboard.flags).toHaveLength(1);
  });

  it("creates compliance reviews through the API response contract", async () => {
    const complianceFlag = demoComplianceFlags[0];
    if (!complianceFlag) {
      throw new Error("Compliance flag fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/compliance-reviews");
        expect(init?.method).toBe("POST");

        return Response.json({
          complianceFlags: [complianceFlag],
          report: {
            evaluatedAt: "2026-05-24T00:00:00.000Z",
            flags: [
              {
                evidence: complianceFlag.evidence,
                generatedBy: "deterministic",
                message: complianceFlag.message,
                ownerType: "legal",
                publishPolicy: "draft_only",
                recommendation: complianceFlag.recommendation,
                replacementSuggestion: complianceFlag.replacementSuggestion,
                riskLevel: complianceFlag.riskLevel,
                ruleId: complianceFlag.ruleId,
                status: "open",
                title: complianceFlag.title
              }
            ],
            generatedBy: "deterministic",
            input: {
              industry: "medical",
              locale: "ko-KR",
              publishState: "draft",
              siteId: "site_1",
              source: "fixture",
              subjectId: "fixture-medical-page",
              subjectType: "page_copy",
              text: "Our medical clinic offers guaranteed treatment outcomes.",
              title: "Fixture medical service draft",
              url: "https://example-clinic.com/services/botox"
            },
            overallRiskLevel: "high",
            publishPolicy: "draft_only",
            rulePackId: "kr-medical",
            status: "blocked"
          }
        });
      }),
    );

    await expect(createComplianceReviewFromFixture({ ...demoSite, id: "site_1" })).resolves
      .toMatchObject({
        flagCount: 1,
        source: "api",
        status: "created"
      });
    expect(getComplianceReviewCreateFeedback("created", "1")?.message).toContain("1");
  });

  it("updates compliance flags and converts them to work orders through API contracts", async () => {
    const complianceFlag = demoComplianceFlags[0];
    if (!complianceFlag) {
      throw new Error("Compliance flag fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith(`/compliance-flags/${complianceFlag.id}`)) {
          expect(init?.method).toBe("PATCH");
          return Response.json({
            ...complianceFlag,
            status: "approved"
          });
        }

        if (url.endsWith(`/compliance-flags/${complianceFlag.id}/work-order`)) {
          expect(init?.method).toBe("POST");
          return Response.json({
            complianceFlag: {
              ...complianceFlag,
              status: "in_review",
              workOrderId: "wo_compliance"
            },
            workOrder: {
              id: "wo_compliance",
              organizationId: complianceFlag.organizationId,
              siteId: complianceFlag.siteId,
              seoIssueId: null,
              schemaRecommendationId: null,
              geoVisibilityReportId: null,
              status: "open",
              priority: "p1",
              title: "/services/botox Absolute safety claim",
              description: null,
              problem: complianceFlag.message,
              evidence: {
                url: "https://example-clinic.com/services/botox",
                observedValue: complianceFlag.evidence?.observedValue ?? "",
                expectedValue: complianceFlag.evidence?.expectedValue ?? "",
                sourceField: complianceFlag.evidence?.sourceField ?? "text"
              },
              impact: "Medical advertising risk requires legal review before publication.",
              instructions: ["Replace absolute safety language with balanced wording."],
              ownerType: "legal",
              acceptanceCriteria: ["Compliance flag is approved or resolved."],
              verificationMethod: "Run compliance review again.",
              estimatedEffort: "m",
              relatedIssues: [],
              assignedTo: null,
              dueDate: null,
              createdAt: "2026-05-24T00:00:00.000Z",
              updatedAt: "2026-05-24T00:00:00.000Z"
            }
          });
        }

        return new Response(null, { status: 404 });
      }),
    );

    await expect(updateComplianceFlagStatus(complianceFlag.id, "approved")).resolves.toMatchObject({
      flagId: complianceFlag.id,
      source: "api",
      status: "updated"
    });
    await expect(convertComplianceFlagToWorkOrder(complianceFlag.id)).resolves.toMatchObject({
      flagId: complianceFlag.id,
      source: "api",
      status: "converted",
      workOrderId: "wo_compliance"
    });
    expect(getComplianceStatusUpdateFeedback("updated", complianceFlag.id)?.tone).toBe("success");
    expect(getComplianceWorkOrderFeedback("converted", "wo_compliance", complianceFlag.id)?.tone)
      .toBe("success");
  });

  it("rechecks compliance flags through the API response contract", async () => {
    const complianceFlag = demoComplianceFlags[0];
    if (!complianceFlag) {
      throw new Error("Compliance flag fixture is missing");
    }

    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          `https://api.searchops.test/compliance-flags/${complianceFlag.id}/recheck`,
        );
        expect(init?.method).toBe("POST");

        return Response.json({
          complianceFlag: {
            ...complianceFlag,
            status: "resolved",
            workOrderId: "wo_compliance"
          },
          report: {
            evaluatedAt: "2026-05-24T01:00:00.000Z",
            flags: [],
            generatedBy: "deterministic",
            input: {
              industry: "medical",
              locale: "ko-KR",
              publishState: "draft",
              siteId: "site_1",
              source: "work_order",
              subjectId: complianceFlag.subjectId,
              subjectType: complianceFlag.subjectType,
              text: "This clinic explains individual variation without promising outcomes.",
              title: complianceFlag.title,
              url: complianceFlag.url
            },
            overallRiskLevel: null,
            publishPolicy: "draft_only",
            rulePackId: "kr-medical",
            status: "clear"
          },
          resolved: true,
          workOrder: {
            id: "wo_compliance",
            organizationId: complianceFlag.organizationId,
            siteId: complianceFlag.siteId,
            seoIssueId: null,
            schemaRecommendationId: null,
            geoVisibilityReportId: null,
            status: "done",
            priority: "p1",
            title: "/services/botox Absolute safety claim",
            description: null,
            problem: complianceFlag.message,
            evidence: {
              url: "https://example-clinic.com/services/botox",
              observedValue: complianceFlag.evidence?.observedValue ?? "",
              expectedValue: complianceFlag.evidence?.expectedValue ?? "",
              sourceField: complianceFlag.evidence?.sourceField ?? "text"
            },
            impact: "Medical advertising risk requires legal review before publication.",
            instructions: ["Replace absolute safety language with balanced wording."],
            ownerType: "legal",
            acceptanceCriteria: ["Compliance flag is approved or resolved."],
            verificationMethod: "Run compliance review again.",
            estimatedEffort: "m",
            relatedIssues: [],
            assignedTo: null,
            dueDate: null,
            createdAt: "2026-05-24T00:00:00.000Z",
            updatedAt: "2026-05-24T01:00:00.000Z"
          }
        });
      }),
    );

    await expect(recheckComplianceFlagWithFixtureRevision(complianceFlag.id)).resolves
      .toMatchObject({
        flagId: complianceFlag.id,
        resolved: true,
        source: "api",
        status: "resolved",
        workOrderStatus: "done"
      });
    expect(getComplianceRecheckFeedback("resolved", complianceFlag.id)?.tone).toBe("success");
  });

  it("calculates deterministic site overview KPIs", () => {
    expect(calculateSiteOverviewKpis(demoSiteOverviewInput)).toEqual({
      crawlSuccessRate: "80%",
      indexableUrlRatio: "75%",
      criticalIssueCount: "2",
      workOrderCompletionRate: "20%",
      resolvedIssueRate: "20%",
      nonBrandQueryCoverage: "0%",
      aiMentionRate: "0%",
      aiCitationRate: "0%"
    });
  });

  it("summarizes site overview decision counts", () => {
    expect(summarizeSiteOverview(demoSiteOverviewInput)).toEqual({
      activeWorkOrders: 4,
      rechecksInReview: 1,
      blockedWorkOrders: 1,
      totalUrls: 8,
      openIssues: 4
    });
  });

  it("summarizes deterministic crawl history rows", () => {
    expect(summarizeCrawlRuns(demoCrawlRunRows)).toEqual({
      total: 5,
      completed: 4,
      failed: 1,
      pagesCrawled: 31,
      latestStatus: "failed"
    });
    expect(formatDuration(252)).toBe("4m 12s");
  });

  it("summarizes deterministic URL inventory rows", () => {
    expect(summarizeUrlInventory(demoUrlInventoryRows)).toEqual({
      total: 8,
      indexable: 6,
      nonIndexable: 2,
      withIssues: 4,
      healthy: 2
    });
  });

  it("summarizes deterministic issue list rows", () => {
    expect(summarizeIssues(demoIssueListRows)).toEqual({
      total: 5,
      open: 4,
      resolved: 1,
      critical: 2,
      inReview: 1
    });
    expect(demoIssueListRows.map((issue) => issue.ruleId)).toEqual([
      "TITLE_MISSING",
      "H1_MISSING",
      "META_DESC_MISSING",
      "IMAGE_ALT_MISSING",
      "CANONICAL_MISSING"
    ]);
  });

  it("defines deterministic future module skeletons", () => {
    const modules = futureModuleKeys.map((key) => futureModuleSkeletons[key]);

    expect(futureModuleKeys).toEqual(["compliance"]);
    expect(summarizeFutureModules(modules)).toEqual({
      total: 1,
      planned: 1,
      placeholderMetrics: 3,
      emptyStates: 1
    });
    expect(futureModuleSkeletons.compliance.dependsOn).toContain("의료광고 규칙");
  });
});
