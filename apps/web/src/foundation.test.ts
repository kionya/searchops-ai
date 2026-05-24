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
  siteRouteItems
} from "./dashboard-shell";
import {
  createDemoConnectorSyncHistory,
  formatSyncDuration,
  getConnectorSyncRunTone,
  getConnectorSyncTriggerFeedback,
  loadConnectorSyncHistory,
  summarizeConnectorSyncHistory,
  triggerConnectorSync
} from "./connector-sync-history";
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
  futureModuleKeys,
  futureModuleSkeletons,
  summarizeFutureModules
} from "./future-module-skeletons";
import {
  createDemoGeoVisibilityDashboard,
  createGeoVisibilityReportFromFixture,
  demoGeoVisibilityReports,
  formatGeoDate,
  formatGeoProvider,
  formatGeoStatus,
  getGeoVisibilityCreateFeedback,
  getGeoVisibilityStatusTone,
  loadGeoVisibilityDashboard,
  summarizeGeoVisibilityDashboard
} from "./geo-visibility-dashboard";
import {
  createDemoKeywordAeoDashboard,
  formatAeoCheckId,
  getAeoReadinessTone,
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
  getSchemaWorkOrderCreateFeedback,
  loadSchemaRecommendationDashboard,
  recheckSchemaRecommendationWithDraft,
  summarizeSchemaRecommendations
} from "./schema-recommendations";
import {
  calculateSiteOverviewKpis,
  demoSiteOverviewInput,
  summarizeSiteOverview
} from "./site-overview-kpis";
import {
  demoCrawlRunRows,
  demoIssueListRows,
  demoUrlInventoryRows,
  formatDuration,
  summarizeCrawlRuns,
  summarizeIssues,
  summarizeUrlInventory
} from "./site-detail-views";
import {
  canRecheckWorkOrder,
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
    expect(formatGeoStatus("not_visible")).toBe("not visible");
    expect(formatGeoProvider("chatgpt")).toBe("ChatGPT");
    expect(formatGeoDate("2026-05-24T00:00:00.000Z")).toBe("2026-05-24 00:00");
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
    expect(formatAeoCheckId("FAQ_SCHEMA_PRESENT")).toBe("Faq schema present");
  });

  it("loads keyword AEO readiness through the API response contract", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.searchops.test/sites/site_1/aeo-readiness-reports");

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
  });

  it("keeps keyword AEO readiness deterministic without an API base URL", async () => {
    await expect(loadKeywordAeoDashboard("site_1")).resolves.toMatchObject({
      reports: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "deterministic",
          keyword: expect.objectContaining({ siteId: "site_1" })
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
    expect(formatSchemaJsonLdType("MedicalClinic")).toBe("Medical Clinic");
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
      total: 3,
      totalRecords: 5
    });
    expect(getConnectorSyncRunTone("partial")).toBe("partial");
    expect(formatSyncDuration("2026-05-22T09:00:00.000Z", "2026-05-22T09:01:18.000Z")).toBe(
      "1m 18s",
    );
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
    expect(futureModuleSkeletons.compliance.dependsOn).toContain("Medical ad rules");
  });
});
