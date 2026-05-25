import { describe, expect, it } from "vitest";

import {
  ApiMetricsResponseSchema,
  AeoFaqGapSetSchema,
  AeoPageSignalSchema,
  AeoReadinessReportListResponseSchema,
  AeoReadinessReportRecordSchema,
  AeoReadinessReportSchema,
  CmsContentStatusSchema,
  CmsContentUpdatedEventRequestSchema,
  CmsContentUpdatedEventResponseSchema,
  CmsWebhookSignatureHeadersSchema,
  ClosedLoopAuditEventListResponseSchema,
  ClosedLoopAuditEventSchema,
  ClosedLoopAuditEventStatusSchema,
  ClosedLoopAuditEventTypeSchema,
  ConnectorProviderListSchema,
  ConnectorSyncJobResultSchema,
  ContentBriefDraftSchema,
  ContentBriefDetailResponseSchema,
  ContentBriefListResponseSchema,
  ContentBriefSchema,
  CreateAeoReadinessReportRequestSchema,
  CreateAeoReadinessReportResponseSchema,
  CreateContentBriefDraftRequestSchema,
  CreateContentBriefDraftResponseSchema,
  CreateCrawlRunRequestSchema,
  CreateConnectorSyncRunRequestSchema,
  CreateConnectorSyncRunResponseSchema,
  CreateGeoVisibilityReportWorkOrderResponseSchema,
  CreateGeoVisibilityReportRequestSchema,
  CreateGeoVisibilityReportResponseSchema,
  ConnectorSyncRunDetailResponseSchema,
  ConnectorSyncRunListResponseSchema,
  CreateSiteRequestSchema,
  ConnectorSyncRunSchema,
  ConnectorSyncResultSchema,
  ConnectorProviderSchema,
  ConnectorRecordSchema,
  ConnectorRunResultSchema,
  ConnectorSyncJobPayloadSchema,
  ComplianceFlagListResponseSchema,
  ComplianceFlagDraftSchema,
  ComplianceFlagSchema,
  ComplianceReviewInputSchema,
  ComplianceReviewReportSchema,
  ComplianceRuleIdSchema,
  ComplianceRulePackIdSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  CrawlerPageSnapshotSchema,
  CreateComplianceFlagWorkOrderResponseSchema,
  CreateComplianceReviewRequestSchema,
  CreateComplianceReviewResponseSchema,
  CreateSchemaRecommendationsRequestSchema,
  CreateSchemaRecommendationsResponseSchema,
  CreateSchemaRecommendationWorkOrderResponseSchema,
  DeadLetterJobPayloadSchema,
  HealthResponseSchema,
  GeoVisibilityReportListResponseSchema,
  GeoVisibilityReportRecordSchema,
  GeoVisibilityReportSchema,
  JsonLdRecommendationSchema,
  JsonLdRecommendationSetSchema,
  KeywordAeoInputSchema,
  KeywordIntentSchema,
  KeywordSchema,
  KeywordTargetSchema,
  LinkSignalSchema,
  MockUserContextSchema,
  NormalizedUrlSchema,
  OrganizationSchema,
  ParsedSitemapSchema,
  RecheckSchemaRecommendationRequestSchema,
  RecheckSchemaRecommendationResponseSchema,
  RecheckComplianceFlagRequestSchema,
  RecheckComplianceFlagResponseSchema,
  RecheckWorkOrderRequestSchema,
  RecheckWorkOrderResponseSchema,
  ResolveWorkOrderIssueResponseSchema,
  RobotsTxtSchema,
  SchemaRecommendationDetailResponseSchema,
  SchemaRecommendationListResponseSchema,
  SchemaRecommendationRecordSchema,
  SchemaJsonLdTypeSchema,
  SearchOpsEnvSchema,
  SeoIssueSchema,
  SeoIssueDraftSchema,
  WorkOrderDraftSchema,
  WorkOrderListResponseSchema,
  WorkOrderOwnerTypeSchema,
  WorkOrderSchema,
  UpdateComplianceFlagRequestSchema,
  UpdateWorkOrderRequestSchema,
  parseSearchOpsEnv,
  productName,
} from "./index.js";

describe("types foundation", () => {
  it("exports the product name", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("validates health responses", () => {
    expect(HealthResponseSchema.parse({ ok: true, service: "api" })).toEqual({
      ok: true,
      service: "api",
    });
  });

  it("validates API metrics responses", () => {
    expect(
      ApiMetricsResponseSchema.parse({
        service: "api",
        uptimeSeconds: 12.5,
        requests: {
          total: 3,
          byStatus: {
            "200": 2,
            "429": 1,
          },
        },
      }),
    ).toMatchObject({
      requests: {
        total: 3,
      },
    });
  });

  it("validates dead-letter queue job payloads", () => {
    expect(
      DeadLetterJobPayloadSchema.parse({
        originalQueue: "searchops-crawl",
        originalJobName: "crawl",
        originalJobId: "42",
        failedReason: "Fetch timed out",
        attemptsMade: 3,
        failedAt: "2026-05-25T00:00:00.000Z",
      }),
    ).toMatchObject({
      originalJobName: "crawl",
      attemptsMade: 3,
    });
  });

  it("validates Phase 1 organization DTOs", () => {
    expect(
      OrganizationSchema.parse({
        id: "org_1",
        name: "Demo Clinic",
        createdAt: "2026-05-19T00:00:00.000Z",
      }),
    ).toMatchObject({ name: "Demo Clinic" });
  });

  it("normalizes site domains", () => {
    expect(CreateSiteRequestSchema.parse({ domain: "Example.COM" }).domain).toBe("example.com");
  });

  it("validates mock user context", () => {
    expect(
      MockUserContextSchema.parse({ userId: "usr_1", organizationId: "org_1", source: "mock" }),
    ).toEqual({
      userId: "usr_1",
      organizationId: "org_1",
      source: "mock",
    });
  });

  it("fails env validation with clear field names", () => {
    expect(() => parseSearchOpsEnv({ REDIS_URL: "redis://localhost:6379" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("parses valid env", () => {
    expect(
      SearchOpsEnvSchema.parse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/searchops",
        SEARCHOPS_CMS_WEBHOOK_SECRETS: '{"wordpress":"secret_1"}',
        SEARCHOPS_RATE_LIMIT_ENABLED: "true",
        SEARCHOPS_RATE_LIMIT_MAX: "60",
        SEARCHOPS_RATE_LIMIT_WINDOW_MS: "30000",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toMatchObject({
      NODE_ENV: "development",
      SEARCHOPS_CMS_WEBHOOK_SECRETS: '{"wordpress":"secret_1"}',
      SEARCHOPS_RATE_LIMIT_ENABLED: true,
      SEARCHOPS_RATE_LIMIT_MAX: 60,
      SEARCHOPS_RATE_LIMIT_WINDOW_MS: 30000,
    });
    expect(() =>
      SearchOpsEnvSchema.parse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/searchops",
        SEARCHOPS_CMS_WEBHOOK_SECRETS: "[]",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/JSON object/);
    expect(() =>
      SearchOpsEnvSchema.parse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/searchops",
        SEARCHOPS_RATE_LIMIT_MAX: "0",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow(/positive integer/);
  });

  it("validates normalized crawler URLs", () => {
    expect(NormalizedUrlSchema.parse("https://example.com/path?a=1")).toBe(
      "https://example.com/path?a=1",
    );
    expect(() => NormalizedUrlSchema.parse("mailto:hello@example.com")).toThrow();
  });

  it("validates crawler link signals", () => {
    expect(
      LinkSignalSchema.parse({
        href: "/about",
        url: "https://example.com/about",
        text: "About",
        rel: null,
        target: null,
        classification: "internal",
      }),
    ).toMatchObject({ classification: "internal" });
  });

  it("validates crawler page snapshots", () => {
    const parsed = CrawlerPageSnapshotSchema.parse({
      url: "https://example.com/services",
      finalUrl: null,
      title: "Services",
      metaDescription: "Service page",
      robotsMeta: "index,follow",
      canonicalUrl: "https://example.com/services",
      h1Count: 1,
      h2Count: 0,
      headings: { h1: ["Services"], h2: [] },
      links: { internal: [], external: [] },
      images: [],
      jsonLd: [],
      indexability: {
        noindex: false,
        nofollow: false,
        canonicalMismatch: false,
        robotsBlocked: null,
      },
      content: {
        textLength: 13,
        wordCount: 2,
        duplicateHash: "a".repeat(64),
      },
    });

    expect(parsed.h1Count).toBe(1);
  });

  it("validates deterministic JSON-LD recommendation contracts", () => {
    expect(SchemaJsonLdTypeSchema.options).toEqual([
      "WebSite",
      "WebPage",
      "Article",
      "FAQPage",
      "BreadcrumbList",
      "LocalBusiness",
      "MedicalClinic",
      "Service",
    ]);

    const recommendation = JsonLdRecommendationSchema.parse({
      type: "WebPage",
      url: "https://example.com/services",
      priority: "p2",
      reason: "The page has no WebPage JSON-LD block.",
      evidence: {
        url: "https://example.com/services",
        observedTypes: [],
        expectedType: "WebPage",
        sourceField: "jsonLd",
      },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: "https://example.com/services",
        name: "Services",
      },
      instructions: ["Add the recommended WebPage JSON-LD to the page head."],
      requiredFields: ["@context", "@type", "url", "name"],
      generatedBy: "deterministic",
    });

    expect(recommendation).toMatchObject({
      type: "WebPage",
      generatedBy: "deterministic",
    });
    expect(
      JsonLdRecommendationSetSchema.parse({
        siteId: "site_1",
        pageUrl: "https://example.com/services",
        recommendations: [recommendation],
        generatedBy: "deterministic",
      }).recommendations,
    ).toHaveLength(1);
    expect(() =>
      JsonLdRecommendationSchema.parse({
        ...recommendation,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("validates persisted schema recommendation API contracts", () => {
    const recommendation = JsonLdRecommendationSchema.parse({
      type: "Service",
      url: "https://example.com/services/seo",
      priority: "p1",
      reason: "The service page has no Service JSON-LD block.",
      evidence: {
        url: "https://example.com/services/seo",
        observedTypes: ["WebPage"],
        expectedType: "Service",
        sourceField: "jsonLd",
      },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "SEO service",
        provider: {
          "@type": "Organization",
          name: "Example",
        },
        url: "https://example.com/services/seo",
      },
      instructions: ["Add Service JSON-LD to the service detail page."],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      recommendedFields: ["description", "serviceType"],
      generatedBy: "deterministic",
    });
    const record = SchemaRecommendationRecordSchema.parse({
      id: "schema_rec_1",
      siteId: "site_1",
      pageUrl: recommendation.url,
      type: recommendation.type,
      priority: recommendation.priority,
      status: "open",
      reason: recommendation.reason,
      evidence: recommendation.evidence,
      jsonLd: recommendation.jsonLd,
      instructions: recommendation.instructions,
      requiredFields: recommendation.requiredFields,
      recommendedFields: recommendation.recommendedFields,
      generatedBy: "deterministic",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(
      CreateSchemaRecommendationsRequestSchema.parse({
        organizationName: "Example Group",
        snapshots: [
          {
            url: "https://example.com/services/seo",
            finalUrl: null,
            title: "SEO service",
            metaDescription: "SEO service page",
            robotsMeta: "index,follow",
            canonicalUrl: "https://example.com/services/seo",
            h1Count: 1,
            h2Count: 0,
            headings: { h1: ["SEO service"], h2: [] },
            links: { internal: [], external: [] },
            images: [],
            jsonLd: [],
            indexability: {
              noindex: false,
              nofollow: false,
              canonicalMismatch: false,
              robotsBlocked: null,
            },
            content: {
              textLength: 120,
              wordCount: 20,
              duplicateHash: "a".repeat(64),
            },
          },
        ],
      }).snapshots,
    ).toHaveLength(1);
    expect(
      CreateSchemaRecommendationsResponseSchema.parse({
        recommendationSets: [
          {
            siteId: "site_1",
            pageUrl: "https://example.com/services/seo",
            recommendations: [recommendation],
            generatedBy: "deterministic",
          },
        ],
        recommendations: [record],
      }).recommendations,
    ).toHaveLength(1);
    expect(
      SchemaRecommendationListResponseSchema.parse({ recommendations: [record] }),
    ).toMatchObject({
      recommendations: [{ type: "Service", status: "open" }],
    });
    expect(
      SchemaRecommendationDetailResponseSchema.parse({ recommendation: record }),
    ).toMatchObject({
      recommendation: { generatedBy: "deterministic" },
    });
    expect(
      CreateSchemaRecommendationWorkOrderResponseSchema.parse({
        recommendation: {
          ...record,
          status: "converted",
        },
        workOrder: {
          id: "wo_1",
          organizationId: "org_1",
          siteId: "site_1",
          seoIssueId: null,
          schemaRecommendationId: "schema_rec_1",
          status: "open",
          priority: "p1",
          title: "/services/seo Service JSON-LD implementation",
          description: null,
          problem: "The service page has no Service JSON-LD block.",
          evidence: {
            url: "https://example.com/services/seo",
            observedValue: ["WebPage"],
            expectedValue: "Service",
            sourceField: "jsonLd",
          },
          impact:
            "Structured service data helps search and answer engines understand the offering.",
          instructions: ["Add the reviewed JSON-LD block to the page."],
          ownerType: "developer",
          acceptanceCriteria: ["A schema recommendation recheck no longer returns Service."],
          verificationMethod: "Run schema recommendation recheck for the URL.",
          estimatedEffort: "m",
          relatedIssues: ["SCHEMA_MISSING"],
          assignedTo: null,
          dueDate: null,
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      }).workOrder,
    ).toMatchObject({ schemaRecommendationId: "schema_rec_1" });
    const recheckSnapshot = CrawlerPageSnapshotSchema.parse({
      url: "https://example.com/services/seo",
      finalUrl: null,
      title: "SEO service",
      metaDescription: "SEO service page",
      robotsMeta: "index,follow",
      canonicalUrl: "https://example.com/services/seo",
      h1Count: 1,
      h2Count: 0,
      headings: { h1: ["SEO service"], h2: [] },
      links: { internal: [], external: [] },
      images: [],
      jsonLd: [
        {
          raw: '{"@context":"https://schema.org","@type":"Service"}',
          parsed: {
            "@context": "https://schema.org",
            "@type": "Service",
          },
        },
      ],
      indexability: {
        noindex: false,
        nofollow: false,
        canonicalMismatch: false,
        robotsBlocked: null,
      },
      content: {
        textLength: 120,
        wordCount: 20,
        duplicateHash: "a".repeat(64),
      },
    });
    expect(
      RecheckSchemaRecommendationRequestSchema.parse({ snapshot: recheckSnapshot }),
    ).toMatchObject({
      snapshot: {
        url: "https://example.com/services/seo",
      },
    });
    expect(
      RecheckSchemaRecommendationResponseSchema.parse({
        expectedType: "Service",
        observedTypes: ["Service"],
        recommendation: {
          ...record,
          evidence: {
            ...record.evidence,
            observedTypes: ["Service"],
          },
          status: "resolved",
        },
        resolved: true,
        workOrder: {
          id: "wo_1",
          organizationId: "org_1",
          siteId: "site_1",
          seoIssueId: null,
          schemaRecommendationId: "schema_rec_1",
          status: "done",
          priority: "p1",
          title: "/services/seo Service JSON-LD implementation",
          description: null,
          problem: "The service page has no Service JSON-LD block.",
          evidence: {
            url: "https://example.com/services/seo",
            observedValue: ["WebPage"],
            expectedValue: "Service",
            sourceField: "jsonLd",
          },
          impact:
            "Structured service data helps search and answer engines understand the offering.",
          instructions: ["Add the reviewed JSON-LD block to the page."],
          ownerType: "developer",
          acceptanceCriteria: ["A schema recommendation recheck no longer returns Service."],
          verificationMethod: "Run schema recommendation recheck for the URL.",
          estimatedEffort: "m",
          relatedIssues: ["SCHEMA_MISSING"],
          assignedTo: null,
          dueDate: null,
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      recommendation: { status: "resolved" },
      resolved: true,
      workOrder: { status: "done" },
    });
    expect(() =>
      SchemaRecommendationRecordSchema.parse({
        ...record,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("defaults crawl run request options", () => {
    expect(CreateCrawlRunRequestSchema.parse({})).toEqual({ maxPages: 25 });
  });

  it("validates queued crawl job payloads", () => {
    const parsed = CrawlJobPayloadSchema.parse({
      crawlRunId: "crawl_1",
      siteId: "site_1",
      siteDomain: "example.com",
      requestedByUserId: "user_1",
      startUrl: "https://example.com/",
      maxPages: 10,
    });

    expect(parsed.pages).toEqual([]);
  });

  it("validates crawl job results", () => {
    expect(
      CrawlJobResultSchema.parse({
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
          noindexPages: 0,
        },
      }),
    ).toMatchObject({ status: "empty" });
  });

  it("validates robots parser output", () => {
    expect(
      RobotsTxtSchema.parse({
        rules: [
          {
            userAgents: ["*"],
            allow: ["/public"],
            disallow: ["/private"],
            crawlDelay: 2,
          },
        ],
        sitemaps: ["https://example.com/sitemap.xml"],
      }),
    ).toMatchObject({ sitemaps: ["https://example.com/sitemap.xml"] });
  });

  it("validates sitemap parser output", () => {
    expect(
      ParsedSitemapSchema.parse({
        type: "urlset",
        urls: [
          {
            loc: "https://example.com/",
            lastmod: "2026-05-19",
            changefreq: "daily",
            priority: 0.8,
          },
        ],
        sitemaps: [],
      }),
    ).toMatchObject({ type: "urlset" });
  });

  it("validates deterministic Keyword/AEO keyword contracts", () => {
    expect(KeywordIntentSchema.options).toEqual([
      "informational",
      "commercial",
      "transactional",
      "navigational",
      "local",
      "mixed",
    ]);

    expect(
      KeywordTargetSchema.parse({
        siteId: "site_1",
        phrase: "  seo clinic  ",
      }),
    ).toEqual({
      siteId: "site_1",
      phrase: "seo clinic",
      locale: "ko-KR",
      language: "ko",
      country: "KR",
      intent: null,
      source: "manual",
    });

    expect(
      KeywordSchema.parse({
        id: "keyword_1",
        siteId: "site_1",
        phrase: "seo clinic",
        locale: "ko-KR",
        intent: "commercial",
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
    ).toMatchObject({ intent: "commercial" });
    expect(() =>
      KeywordSchema.parse({
        id: "keyword_1",
        siteId: "site_1",
        phrase: "seo clinic",
        locale: "ko-KR",
        intent: "ai_generated",
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("validates Keyword/AEO page signal inputs without LLM fields", () => {
    const page = AeoPageSignalSchema.parse({
      url: "https://example.com/service/seo",
      title: "SEO clinic service",
      metaDescription: "SEO clinic page",
      h1: "SEO clinic",
      h2: ["What is included?"],
      wordCount: 420,
    });

    expect(page).toMatchObject({
      schemaTypes: [],
      questionHeadings: [],
      answerBlocks: [],
    });
    expect(
      KeywordAeoInputSchema.parse({
        keyword: {
          siteId: "site_1",
          phrase: "seo clinic",
        },
        candidatePage: page,
      }).candidatePage,
    ).toMatchObject({ wordCount: 420 });
  });

  it("validates deterministic AEO readiness reports", () => {
    const report = AeoReadinessReportSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: "seo clinic",
        intent: "commercial",
      },
      pageUrl: "https://example.com/service/seo",
      status: "needs_work",
      score: 68,
      checks: [
        {
          checkId: "ANSWER_SUMMARY_PRESENT",
          status: "warning",
          score: 60,
          evidence: {
            url: "https://example.com/service/seo",
            observedValue: false,
            expectedValue: true,
            sourceField: "answerBlocks",
          },
        },
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(report).toMatchObject({ generatedBy: "deterministic", score: 68 });
    expect(() =>
      AeoReadinessReportSchema.parse({
        ...report,
        score: 101,
      }),
    ).toThrow();
    expect(() =>
      AeoReadinessReportSchema.parse({
        ...report,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("validates persisted AEO readiness report API contracts", () => {
    const request = CreateAeoReadinessReportRequestSchema.parse({
      keyword: {
        phrase: "seo clinic",
        intent: "commercial",
      },
      candidatePage: null,
      evaluatedAt: "2026-05-23T00:00:00.000Z",
    });
    const readinessReport = AeoReadinessReportSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: request.keyword.phrase,
        intent: request.keyword.intent,
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
            observedValue: "commercial",
            expectedValue: "Non-null deterministic keyword intent",
            sourceField: "keyword.intent",
          },
        },
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z",
    });
    const report = AeoReadinessReportRecordSchema.parse({
      id: "aeo_report_1",
      siteId: "site_1",
      keywordId: "keyword_1",
      phrase: "seo clinic",
      locale: "ko-KR",
      intent: "commercial",
      pageUrl: null,
      status: "not_ready",
      score: 14,
      checks: readinessReport.checks,
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z",
      createdAt: "2026-05-23T00:00:00.000Z",
    });

    expect(CreateAeoReadinessReportResponseSchema.parse({ report, readinessReport })).toMatchObject(
      {
        report: {
          generatedBy: "deterministic",
          phrase: "seo clinic",
        },
        readinessReport: {
          generatedBy: "deterministic",
        },
      },
    );
    expect(AeoReadinessReportListResponseSchema.parse({ reports: [report] }).reports).toHaveLength(
      1,
    );
    expect(() =>
      AeoReadinessReportRecordSchema.parse({
        ...report,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("validates FAQ gaps and draft-only content brief contracts", () => {
    const gapSet = AeoFaqGapSetSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: "seo clinic",
      },
      pageUrl: "https://example.com/service/seo",
      gaps: [
        {
          question: "What does SEO clinic include?",
          intent: "definition",
          priority: "p2",
          suggestedAnswerAngle: "Define the service scope in a short answer block.",
          evidence: {
            url: "https://example.com/service/seo",
            observedValue: [],
            expectedValue: ["What does SEO clinic include?"],
            sourceField: "questionHeadings",
          },
        },
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z",
    });

    const draft = ContentBriefDraftSchema.parse({
      siteId: "site_1",
      primaryKeyword: "seo clinic",
      intent: "commercial",
      title: "SEO clinic service content brief",
      status: "draft",
      summary: "Create a service page brief for the target keyword.",
      outline: [
        {
          heading: "Service overview",
          purpose: "Answer the primary query directly.",
          targetQuestions: gapSet.gaps.map((gap) => gap.question),
          acceptanceCriteria: ["Includes one concise answer block."],
        },
      ],
      acceptanceCriteria: ["Brief remains draft-only until reviewed."],
      generationMode: "deterministic",
      publishPolicy: "draft_only",
    });

    expect(draft).toMatchObject({
      keywordId: null,
      status: "draft",
      generationMode: "deterministic",
      publishPolicy: "draft_only",
    });
    expect(
      ContentBriefSchema.parse({
        id: "brief_1",
        siteId: "site_1",
        keywordId: null,
        primaryKeyword: draft.primaryKeyword,
        locale: draft.locale,
        intent: draft.intent,
        title: draft.title,
        status: "draft",
        summary: draft.summary,
        outline: draft.outline,
        faqQuestions: draft.faqQuestions,
        acceptanceCriteria: draft.acceptanceCriteria,
        generationMode: "deterministic",
        publishPolicy: "draft_only",
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "draft" });
    expect(() =>
      ContentBriefDraftSchema.parse({
        ...draft,
        status: "published",
      }),
    ).toThrow();
  });

  it("validates ContentBrief draft API contracts", () => {
    const request = CreateContentBriefDraftRequestSchema.parse({
      keyword: {
        phrase: "seo clinic",
        intent: "commercial",
      },
      candidatePage: null,
      evaluatedAt: "2026-05-23T00:00:00.000Z",
    });
    const draft = ContentBriefDraftSchema.parse({
      siteId: "site_1",
      keywordId: "keyword_1",
      primaryKeyword: request.keyword.phrase,
      locale: "ko-KR",
      intent: "commercial",
      title: "SEO clinic content brief",
      status: "draft",
      summary: "Draft summary",
      outline: [
        {
          heading: "Overview",
          purpose: "Answer the target query.",
          targetQuestions: ["What is seo clinic?"],
          acceptanceCriteria: ["Includes direct answer."],
        },
      ],
      faqQuestions: ["What is seo clinic?"],
      acceptanceCriteria: ["Do not auto-publish."],
      generationMode: "deterministic",
      publishPolicy: "draft_only",
    });
    const contentBrief = ContentBriefSchema.parse({
      id: "brief_1",
      siteId: "site_1",
      keywordId: "keyword_1",
      primaryKeyword: draft.primaryKeyword,
      locale: draft.locale,
      intent: draft.intent,
      title: draft.title,
      status: "draft",
      summary: draft.summary,
      outline: draft.outline,
      faqQuestions: draft.faqQuestions,
      acceptanceCriteria: draft.acceptanceCriteria,
      generationMode: "deterministic",
      publishPolicy: "draft_only",
      createdAt: "2026-05-23T00:00:00.000Z",
    });

    expect(
      CreateContentBriefDraftResponseSchema.parse({
        contentBrief,
        draft,
        readinessReport: {
          keyword: {
            siteId: "site_1",
            phrase: "seo clinic",
            intent: "commercial",
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
                observedValue: "commercial",
                expectedValue: "Non-null deterministic keyword intent",
                sourceField: "keyword.intent",
              },
            },
          ],
          generatedBy: "deterministic",
          evaluatedAt: "2026-05-23T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      contentBrief: {
        publishPolicy: "draft_only",
        status: "draft",
      },
      draft: {
        generationMode: "deterministic",
      },
    });
    expect(
      ContentBriefListResponseSchema.parse({ contentBriefs: [contentBrief] }).contentBriefs,
    ).toHaveLength(1);
    expect(
      ContentBriefDetailResponseSchema.parse({ contentBrief: contentBrief }).contentBrief,
    ).toMatchObject({
      id: "brief_1",
    });
  });

  it("validates GEO visibility monitor contracts", () => {
    const request = CreateGeoVisibilityReportRequestSchema.parse({
      target: {
        siteId: "site_1",
        brandName: "Example Clinic",
        domain: "example.com",
      },
      observations: [
        {
          provider: "chatgpt",
          query: "best seo clinic",
          answerText: "Example Clinic is mentioned as an SEO clinic option.",
          citedUrls: ["https://example.com/service/seo"],
          observedAt: "2026-05-24T00:00:00.000Z",
          source: "fixture",
        },
      ],
      evaluatedAt: "2026-05-24T00:00:00.000Z",
    });
    const visibilityReport = GeoVisibilityReportSchema.parse({
      target: request.target,
      status: "visible",
      score: 72,
      mentionRate: 100,
      citationRate: 100,
      competitorCitationRate: 0,
      queryCount: 1,
      providerCount: 1,
      observations: request.observations,
      citations: [
        {
          url: "https://example.com/service/seo",
          domain: "example.com",
          owned: true,
        },
      ],
      checks: [
        {
          checkId: "BRAND_MENTIONED",
          status: "pass",
          score: 100,
          evidence: {
            observedValue: 100,
            expectedValue: ">= 70",
            sourceField: "observations.answerText",
          },
        },
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-24T00:00:00.000Z",
    });
    const record = GeoVisibilityReportRecordSchema.parse({
      id: "geo_report_1",
      siteId: "site_1",
      brandName: request.target.brandName,
      domain: request.target.domain,
      locale: request.target.locale,
      market: request.target.market,
      status: visibilityReport.status,
      score: visibilityReport.score,
      mentionRate: visibilityReport.mentionRate,
      citationRate: visibilityReport.citationRate,
      competitorCitationRate: visibilityReport.competitorCitationRate,
      queryCount: visibilityReport.queryCount,
      providerCount: visibilityReport.providerCount,
      observations: visibilityReport.observations,
      citations: visibilityReport.citations,
      checks: visibilityReport.checks,
      generatedBy: "deterministic",
      evaluatedAt: visibilityReport.evaluatedAt,
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(
      CreateGeoVisibilityReportResponseSchema.parse({
        report: record,
        visibilityReport,
      }),
    ).toMatchObject({
      report: {
        status: "visible",
        mentionRate: 100,
      },
      visibilityReport: {
        generatedBy: "deterministic",
      },
    });
    expect(GeoVisibilityReportListResponseSchema.parse({ reports: [record] }).reports).toHaveLength(
      1,
    );
    expect(
      CreateGeoVisibilityReportWorkOrderResponseSchema.parse({
        report: record,
        workOrder: {
          id: "wo_geo_1",
          organizationId: "org_1",
          siteId: "site_1",
          seoIssueId: null,
          schemaRecommendationId: null,
          geoVisibilityReportId: "geo_report_1",
          status: "open",
          priority: "p2",
          title: "Example Clinic GEO visibility improvement",
          description: null,
          problem: "GEO visibility is visible with a 72/100 score.",
          evidence: {
            url: "https://example.com/",
            observedValue: "visible score 72; mention 100%; citation 100%",
            expectedValue: "strong score >= 75",
            sourceField: "geoVisibilityReport",
          },
          impact: "AI answer engines may cite competitors instead of owned pages.",
          instructions: ["Improve weak GEO checks."],
          ownerType: "marketer",
          acceptanceCriteria: ["Next GEO visibility report is strong."],
          verificationMethod: "Create a new GEO visibility report and compare rates.",
          estimatedEffort: "m",
          relatedIssues: [],
          assignedTo: null,
          dueDate: null,
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      workOrder: {
        geoVisibilityReportId: "geo_report_1",
        ownerType: "marketer",
      },
    });
    expect(() =>
      GeoVisibilityReportSchema.parse({
        ...visibilityReport,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("validates connector providers and normalized records", () => {
    expect(ConnectorProviderSchema.options).toEqual(["gsc", "ga4", "pagespeed", "bing", "cms"]);

    const record = ConnectorRecordSchema.parse({
      provider: "pagespeed",
      url: "https://example.com/",
      strategy: "mobile",
      performanceScore: 91,
      accessibilityScore: 88,
      seoScore: 95,
      largestContentfulPaintMs: 2120,
      cumulativeLayoutShift: 0.03,
      interactionToNextPaintMs: 180,
      fetchedAt: "2026-05-22T00:00:00.000Z",
    });

    expect(record).toMatchObject({ provider: "pagespeed", seoScore: 95 });
  });

  it("validates connector run results", () => {
    const parsed = ConnectorRunResultSchema.parse({
      provider: "gsc",
      status: "ok",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      fixture: true,
      records: [
        {
          provider: "gsc",
          siteUrl: "https://example.com/",
          query: "seo clinic",
          page: "https://example.com/service/seo",
          country: "KR",
          device: "mobile",
          clicks: 12,
          impressions: 120,
          ctr: 0.1,
          position: 3.2,
          startDate: "2026-05-01",
          endDate: "2026-05-20",
        },
      ],
    });

    expect(parsed.records).toHaveLength(1);
  });

  it("validates connector provider lists", () => {
    expect(ConnectorProviderListSchema.parse(["ga4", "gsc"])).toEqual(["ga4", "gsc"]);
    expect(() => ConnectorProviderListSchema.parse(["gsc", "gsc"])).toThrow(/unique/);
  });

  it("defaults connector sync job providers", () => {
    const parsed = ConnectorSyncJobPayloadSchema.parse({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      siteDomain: "Example.com",
      requestedByUserId: "user_1",
      fetchedAt: "2026-05-22T00:00:00.000Z",
    });

    expect(parsed).toMatchObject({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteDomain: "example.com",
      providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
    });
  });

  it("validates connector sync run API contracts", () => {
    expect(CreateConnectorSyncRunRequestSchema.parse({}).providers).toEqual([
      "gsc",
      "ga4",
      "pagespeed",
      "bing",
      "cms",
    ]);

    const request = CreateConnectorSyncRunRequestSchema.parse({
      providers: ["pagespeed", "cms"],
    });

    expect(request.providers).toEqual(["pagespeed", "cms"]);
    expect(
      CreateConnectorSyncRunResponseSchema.parse({
        job: {
          id: "job_1",
          name: "connector-sync",
          payload: {
            connectorSyncRunId: "sync_1",
            organizationId: "org_1",
            siteId: "site_1",
            siteDomain: "example.com",
            requestedByUserId: "user_1",
            fetchedAt: "2026-05-22T00:00:00.000Z",
            providers: ["pagespeed", "cms"],
          },
        },
        connectorSyncRun: {
          id: "sync_1",
          organizationId: "org_1",
          siteId: "site_1",
          status: "queued",
          providers: ["pagespeed", "cms"],
          requestedByUserId: "user_1",
          fixture: true,
          startedAt: "2026-05-22T00:00:00.000Z",
          endedAt: null,
          summary: null,
        },
      }),
    ).toMatchObject({
      connectorSyncRun: {
        id: "sync_1",
        status: "queued",
      },
      job: {
        name: "connector-sync",
        payload: {
          providers: ["pagespeed", "cms"],
        },
      },
    });
  });

  it("validates connector sync run history records", () => {
    const connectorSyncRun = ConnectorSyncRunSchema.parse({
      id: "sync_1",
      organizationId: "org_1",
      siteId: "site_1",
      status: "completed",
      providers: ["gsc"],
      requestedByUserId: "user_1",
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
          gsc: 1,
          pagespeed: 0,
        },
        totalProviders: 1,
        totalRecords: 1,
      },
    });

    expect(connectorSyncRun).toMatchObject({ status: "completed" });
    expect(
      ConnectorSyncRunListResponseSchema.parse({
        connectorSyncRuns: [connectorSyncRun],
      }).connectorSyncRuns,
    ).toHaveLength(1);
  });

  it("validates persisted connector sync results and job output", () => {
    const runResult = {
      provider: "pagespeed",
      status: "ok",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      fixture: true,
      records: [
        {
          provider: "pagespeed",
          url: "https://example.com/",
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
    };
    const summary = {
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
    };

    const syncResult = ConnectorSyncResultSchema.parse({
      id: "result_1",
      syncRunId: "sync_1",
      provider: "pagespeed",
      status: "ok",
      fetchedAt: "2026-05-22T00:00:00.000Z",
      fixture: true,
      recordCount: 1,
      records: runResult.records,
      createdAt: "2026-05-22T00:00:00.000Z",
    });

    expect(syncResult).toMatchObject({ provider: "pagespeed", recordCount: 1 });
    expect(
      ConnectorSyncRunDetailResponseSchema.parse({
        connectorSyncRun: {
          id: "sync_1",
          organizationId: "org_1",
          siteId: "site_1",
          status: "completed",
          providers: ["pagespeed"],
          requestedByUserId: "user_1",
          fixture: true,
          startedAt: "2026-05-22T00:00:00.000Z",
          endedAt: "2026-05-22T00:01:00.000Z",
          summary,
        },
        results: [syncResult],
      }),
    ).toMatchObject({ results: [{ provider: "pagespeed" }] });
    expect(
      ConnectorSyncJobResultSchema.parse({
        connectorSyncRunId: "sync_1",
        organizationId: "org_1",
        siteId: "site_1",
        siteDomain: "example.com",
        requestedByUserId: "user_1",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        results: [runResult],
        summary,
      }),
    ).toMatchObject({ summary: { totalRecords: 1 } });
  });

  it("rejects connector run results with mismatched record providers", () => {
    expect(() =>
      ConnectorRunResultSchema.parse({
        provider: "ga4",
        status: "ok",
        fetchedAt: "2026-05-22T00:00:00.000Z",
        fixture: true,
        records: [
          {
            provider: "gsc",
            siteUrl: "https://example.com/",
            query: "seo clinic",
            page: "https://example.com/service/seo",
            country: "KR",
            device: "mobile",
            clicks: 12,
            impressions: 120,
            ctr: 0.1,
            position: 3.2,
            startDate: "2026-05-01",
            endDate: "2026-05-20",
          },
        ],
      }),
    ).toThrow(/provider/);
  });

  it("validates deterministic compliance review contracts", () => {
    expect(ComplianceRuleIdSchema.options).toEqual([
      "GUARANTEED_RESULT_CLAIM",
      "ABSOLUTE_SAFETY_CLAIM",
      "SUPERLATIVE_CLAIM",
      "BEFORE_AFTER_REFERENCE",
      "PATIENT_TESTIMONIAL_REFERENCE",
      "PRICE_DISCOUNT_PROMOTION",
      "UNREVIEWED_MEDICAL_PUBLISH",
    ]);
    expect(ComplianceRulePackIdSchema.options).toEqual(["global", "kr-medical"]);

    const input = ComplianceReviewInputSchema.parse({
      siteId: "site_1",
      subjectType: "page_copy",
      url: "https://example-clinic.com/services/botox",
      industry: "medical",
      title: "Botox clinic page",
      text: "This medical clinic offers guaranteed treatment results.",
      source: "fixture",
    });
    const flag = ComplianceFlagDraftSchema.parse({
      ruleId: "GUARANTEED_RESULT_CLAIM",
      riskLevel: "critical",
      title: "Guaranteed medical result claim",
      message: "The content appears to promise a guaranteed medical outcome.",
      evidence: {
        url: input.url,
        excerpt: input.text,
        observedValue: "guaranteed",
        expectedValue: "Medical content must not guarantee results.",
        sourceField: "text",
        match: "guaranteed",
      },
      recommendation: "Rewrite the claim and route the draft to legal review.",
      replacementSuggestion: "Describe services without promising outcomes.",
      publishPolicy: "draft_only",
      generatedBy: "deterministic",
    });

    expect(input).toMatchObject({
      publishState: "draft",
      source: "fixture",
      subjectId: null,
    });
    expect(flag).toMatchObject({
      ownerType: "legal",
      status: "open",
    });
    expect(() =>
      ComplianceFlagDraftSchema.parse({
        ...flag,
        generatedBy: "llm",
      }),
    ).toThrow();
  });

  it("validates compliance review responses and persisted flags", () => {
    const input = ComplianceReviewInputSchema.parse({
      siteId: "site_1",
      subjectType: "content_brief",
      subjectId: "brief_1",
      url: "https://example-clinic.com/blog/laser",
      industry: "medical",
      title: "Laser content draft",
      text: "This clinic treatment is completely safe.",
      publishState: "scheduled",
      source: "content_brief",
    });
    const flag = ComplianceFlagDraftSchema.parse({
      ruleId: "ABSOLUTE_SAFETY_CLAIM",
      riskLevel: "high",
      title: "Absolute safety claim",
      message: "The content uses absolute safety language.",
      evidence: {
        url: input.url,
        excerpt: input.text,
        observedValue: "completely safe",
        expectedValue: "Medical content should avoid absolute safety claims.",
        sourceField: "text",
        match: "completely safe",
      },
      recommendation: "Replace absolute safety language with balanced wording.",
      replacementSuggestion: "Explain that risks vary by individual.",
      publishPolicy: "draft_only",
      generatedBy: "deterministic",
    });
    const report = ComplianceReviewReportSchema.parse({
      input,
      flags: [flag],
      rulePackId: "kr-medical",
      status: "blocked",
      overallRiskLevel: "high",
      publishPolicy: "draft_only",
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(CreateComplianceReviewRequestSchema.parse(input)).toMatchObject({
      publishState: "scheduled",
    });
    const complianceFlag = ComplianceFlagSchema.parse({
      id: "flag_1",
      organizationId: "org_1",
      siteId: "site_1",
      workOrderId: null,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      ruleId: flag.ruleId,
      url: input.url,
      riskLevel: flag.riskLevel,
      status: "open",
      message: flag.message,
      evidence: flag.evidence,
      recommendation: flag.recommendation,
      replacementSuggestion: flag.replacementSuggestion,
      generatedBy: "deterministic",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
    });

    expect(
      CreateComplianceReviewResponseSchema.parse({
        complianceFlags: [complianceFlag],
        report,
      }).complianceFlags,
    ).toHaveLength(1);
    expect(
      ComplianceFlagListResponseSchema.parse({
        complianceFlags: [complianceFlag],
      }).complianceFlags,
    ).toHaveLength(1);
    expect(UpdateComplianceFlagRequestSchema.parse({ status: "approved" })).toEqual({
      status: "approved",
    });
    expect(
      CreateComplianceFlagWorkOrderResponseSchema.parse({
        complianceFlag,
        workOrder: {
          id: "wo_1",
          organizationId: "org_1",
          siteId: "site_1",
          seoIssueId: null,
          schemaRecommendationId: null,
          geoVisibilityReportId: null,
          status: "open",
          priority: "p1",
          title: "Compliance review",
          description: null,
          problem: flag.message,
          evidence: {
            url: "https://example-clinic.com/blog/laser",
            observedValue: flag.evidence.observedValue,
            expectedValue: flag.evidence.expectedValue,
            sourceField: flag.evidence.sourceField,
          },
          impact: "Medical advertising risk requires legal review before publication.",
          instructions: [flag.recommendation],
          ownerType: "legal",
          acceptanceCriteria: ["Compliance flag is approved or resolved."],
          verificationMethod: "Run compliance review again and confirm the flag is resolved.",
          estimatedEffort: "s",
          relatedIssues: [],
          assignedTo: null,
          dueDate: null,
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      }).complianceFlag,
    ).toMatchObject({ id: "flag_1" });
    expect(
      RecheckComplianceFlagRequestSchema.parse({
        text: "This clinic explains consultation steps and individual variation.",
        url: "https://example-clinic.com/blog/laser",
        publishState: "draft",
      }),
    ).toMatchObject({ publishState: "draft" });
    expect(
      RecheckComplianceFlagResponseSchema.parse({
        complianceFlag: {
          ...complianceFlag,
          status: "resolved",
        },
        report: {
          ...report,
          flags: [],
          status: "clear",
          overallRiskLevel: null,
        },
        resolved: true,
        workOrder: null,
      }),
    ).toMatchObject({
      complianceFlag: {
        status: "resolved",
      },
      resolved: true,
    });
    expect(CmsContentStatusSchema.options).toEqual(["draft", "published", "archived"]);
    expect(ClosedLoopAuditEventTypeSchema.options).toEqual([
      "cms_content_updated",
      "compliance_recheck",
      "compliance_flag_resolved",
      "work_order_done",
    ]);
    expect(ClosedLoopAuditEventStatusSchema.options).toEqual([
      "received",
      "skipped",
      "open",
      "resolved",
      "done",
      "failed",
    ]);

    const cmsEvent = CmsContentUpdatedEventRequestSchema.parse({
      siteId: "site_1",
      cmsType: "wordpress",
      externalId: "page_1",
      url: "https://example-clinic.com/blog/laser",
      text: "This clinic explains consultation steps and individual variation.",
      updatedAt: "2026-05-24T02:00:00.000Z",
    });
    expect(cmsEvent).toMatchObject({
      provider: "cms",
      source: "cms",
      status: "draft",
      title: null,
    });
    expect(
      CmsWebhookSignatureHeadersSchema.parse({
        "x-searchops-cms-type": "wordpress",
        "x-searchops-timestamp": "2026-05-24T02:00:00.000Z",
        "x-searchops-signature":
          "sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toMatchObject({
      "x-searchops-cms-type": "wordpress",
    });
    expect(
      CmsContentUpdatedEventResponseSchema.parse({
        event: cmsEvent,
        matchedFlagCount: 1,
        skippedFlagCount: 0,
        rechecks: [
          {
            complianceFlag: {
              ...complianceFlag,
              status: "resolved",
            },
            report: {
              ...report,
              input: {
                ...report.input,
                source: "cms",
              },
              flags: [],
              status: "clear",
              overallRiskLevel: null,
            },
            resolved: true,
            workOrder: null,
          },
        ],
      }),
    ).toMatchObject({
      matchedFlagCount: 1,
      rechecks: [
        {
          resolved: true,
        },
      ],
    });
    const auditEvent = ClosedLoopAuditEventSchema.parse({
      id: "audit_1",
      organizationId: "org_1",
      siteId: "site_1",
      eventType: "compliance_flag_resolved",
      status: "resolved",
      source: "cms_webhook",
      subjectType: "page_copy",
      subjectId: "page_1",
      cmsType: "wordpress",
      externalId: "page_1",
      complianceFlagId: "flag_1",
      workOrderId: "wo_1",
      message: "Compliance flag flag_1 resolved after CMS update.",
      metadata: {
        ruleId: "ABSOLUTE_SAFETY_CLAIM",
      },
      createdAt: "2026-05-24T02:00:00.000Z",
    });
    expect(
      ClosedLoopAuditEventListResponseSchema.parse({ auditEvents: [auditEvent] }).auditEvents,
    ).toHaveLength(1);
  });

  it("validates deterministic SEO issue drafts", () => {
    expect(
      SeoIssueDraftSchema.parse({
        ruleId: "TITLE_MISSING",
        severity: "high",
        category: "metadata",
        priority: "p1",
        title: "Missing title",
        evidence: {
          url: "https://example.com/",
          observedValue: null,
          expectedValue: "Non-empty title",
          sourceField: "title",
        },
        impactScore: 80,
        effortScore: 20,
        priorityScore: 86,
      }),
    ).toMatchObject({
      ruleId: "TITLE_MISSING",
      severity: "high",
      priority: "p1",
    });
  });

  it("validates work order owner types", () => {
    expect(WorkOrderOwnerTypeSchema.parse("developer")).toBe("developer");
    expect(() => WorkOrderOwnerTypeSchema.parse("designer")).toThrow();
  });

  it("validates deterministic work order drafts", () => {
    expect(
      WorkOrderDraftSchema.parse({
        title: "/services missing H1 fix",
        problem: "The page has no H1 heading.",
        evidence: {
          url: "https://example.com/services",
          observedValue: 0,
          expectedValue: 1,
          sourceField: "h1Count",
        },
        impact: "Search and answer engines may not identify the primary page topic.",
        instructions: ["Add one descriptive H1 near the top of the page."],
        ownerType: "content",
        priority: "p1",
        acceptanceCriteria: ["Re-crawl reports h1Count = 1."],
        verificationMethod: "Run a crawler recheck for the URL.",
        estimatedEffort: "s",
        relatedIssues: ["MULTIPLE_H1"],
      }),
    ).toMatchObject({
      ownerType: "content",
      priority: "p1",
      estimatedEffort: "s",
    });
  });

  it("validates persisted work orders", () => {
    expect(
      WorkOrderSchema.parse({
        id: "wo_1",
        organizationId: "org_1",
        siteId: "site_1",
        seoIssueId: "issue_1",
        geoVisibilityReportId: null,
        status: "open",
        priority: "p1",
        title: "/services missing H1 fix",
        description: null,
        problem: "The page has no H1 heading.",
        evidence: {
          url: "https://example.com/services",
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
        relatedIssues: ["MULTIPLE_H1"],
        assignedTo: null,
        dueDate: null,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "open", priority: "p1" });
  });

  it("validates work order list responses", () => {
    const workOrder = WorkOrderSchema.parse({
      id: "wo_1",
      organizationId: "org_1",
      siteId: "site_1",
      seoIssueId: null,
      geoVisibilityReportId: null,
      status: "open",
      priority: "p2",
      title: "/services meta description fix",
      description: null,
      problem: "The page is missing a meta description.",
      evidence: null,
      impact: "Search snippets may have weaker context.",
      instructions: ["Add one meta description."],
      ownerType: "content",
      acceptanceCriteria: ["Re-crawl reports a non-empty metaDescription value."],
      verificationMethod: "Run a crawler recheck.",
      estimatedEffort: "s",
      relatedIssues: ["TITLE_MISSING"],
      assignedTo: null,
      dueDate: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
    });

    expect(WorkOrderListResponseSchema.parse({ workOrders: [workOrder] }).workOrders).toHaveLength(
      1,
    );
  });

  it("validates work order board update requests", () => {
    expect(
      UpdateWorkOrderRequestSchema.parse({
        status: "in_progress",
        assignedTo: "user_1",
        dueDate: "2026-05-21T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "in_progress", assignedTo: "user_1" });
    expect(() => UpdateWorkOrderRequestSchema.parse({ status: "shipped" })).toThrow();
  });

  it("validates work order recheck request defaults", () => {
    expect(RecheckWorkOrderRequestSchema.parse({})).toEqual({ maxPages: 1 });
    expect(() => RecheckWorkOrderRequestSchema.parse({ maxPages: 11 })).toThrow();
  });

  it("validates work order recheck and resolve responses", () => {
    const workOrder = WorkOrderSchema.parse({
      id: "wo_1",
      organizationId: "org_1",
      siteId: "site_1",
      seoIssueId: "issue_1",
      status: "in_review",
      priority: "p1",
      title: "/services missing H1 fix",
      description: null,
      problem: "The page has no H1 heading.",
      evidence: {
        url: "https://example.com/services",
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
      relatedIssues: ["MULTIPLE_H1"],
      assignedTo: null,
      dueDate: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
    });
    const seoIssue = SeoIssueSchema.parse({
      id: "issue_1",
      crawlRunId: "crawl_1",
      urlRecordId: null,
      ruleId: "H1_MISSING",
      severity: "high",
      status: "resolved",
      title: "Missing H1",
      evidence: { sourceField: "h1Count" },
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    expect(
      RecheckWorkOrderResponseSchema.parse({
        workOrder,
        crawlRun: {
          id: "crawl_2",
          siteId: "site_1",
          status: "queued",
          startedAt: "2026-05-20T00:00:00.000Z",
          endedAt: null,
          summary: { startUrl: "https://example.com/services", maxPages: 1 },
        },
        job: {
          id: "job_1",
          name: "crawl",
          payload: {
            crawlRunId: "crawl_2",
            siteId: "site_1",
            siteDomain: "example.com",
            requestedByUserId: "user_1",
            startUrl: "https://example.com/services",
            maxPages: 1,
            pages: [],
          },
        },
      }),
    ).toMatchObject({ workOrder: { status: "in_review" } });
    expect(
      ResolveWorkOrderIssueResponseSchema.parse({ workOrder, seoIssue }).seoIssue,
    ).toMatchObject({
      status: "resolved",
    });
  });
});
