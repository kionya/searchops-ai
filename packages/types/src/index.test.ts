import { describe, expect, it } from "vitest";

import {
  AeoFaqGapSetSchema,
  AeoPageSignalSchema,
  AeoReadinessReportListResponseSchema,
  AeoReadinessReportRecordSchema,
  AeoReadinessReportSchema,
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
  ConnectorSyncRunDetailResponseSchema,
  ConnectorSyncRunListResponseSchema,
  CreateSiteRequestSchema,
  ConnectorSyncRunSchema,
  ConnectorSyncResultSchema,
  ConnectorProviderSchema,
  ConnectorRecordSchema,
  ConnectorRunResultSchema,
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  CrawlerPageSnapshotSchema,
  CreateSchemaRecommendationsRequestSchema,
  CreateSchemaRecommendationsResponseSchema,
  HealthResponseSchema,
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
  UpdateWorkOrderRequestSchema,
  parseSearchOpsEnv,
  productName
} from "./index.js";

describe("types foundation", () => {
  it("exports the product name", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("validates health responses", () => {
    expect(HealthResponseSchema.parse({ ok: true, service: "api" })).toEqual({
      ok: true,
      service: "api"
    });
  });

  it("validates Phase 1 organization DTOs", () => {
    expect(
      OrganizationSchema.parse({
        id: "org_1",
        name: "Demo Clinic",
        createdAt: "2026-05-19T00:00:00.000Z"
      }),
    ).toMatchObject({ name: "Demo Clinic" });
  });

  it("normalizes site domains", () => {
    expect(CreateSiteRequestSchema.parse({ domain: "Example.COM" }).domain).toBe("example.com");
  });

  it("validates mock user context", () => {
    expect(
      MockUserContextSchema.parse({ userId: "usr_1", organizationId: "org_1", source: "mock" }),
    ).toEqual({ userId: "usr_1", organizationId: "org_1", source: "mock" });
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
        REDIS_URL: "redis://localhost:6379"
      }),
    ).toMatchObject({ NODE_ENV: "development" });
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
        classification: "internal"
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
        robotsBlocked: null
      },
      content: {
        textLength: 13,
        wordCount: 2,
        duplicateHash: "a".repeat(64)
      }
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
      "Service"
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
        sourceField: "jsonLd"
      },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: "https://example.com/services",
        name: "Services"
      },
      instructions: ["Add the recommended WebPage JSON-LD to the page head."],
      requiredFields: ["@context", "@type", "url", "name"],
      generatedBy: "deterministic"
    });

    expect(recommendation).toMatchObject({
      type: "WebPage",
      generatedBy: "deterministic"
    });
    expect(
      JsonLdRecommendationSetSchema.parse({
        siteId: "site_1",
        pageUrl: "https://example.com/services",
        recommendations: [recommendation],
        generatedBy: "deterministic"
      }).recommendations,
    ).toHaveLength(1);
    expect(() =>
      JsonLdRecommendationSchema.parse({
        ...recommendation,
        generatedBy: "llm"
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
        sourceField: "jsonLd"
      },
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
      instructions: ["Add Service JSON-LD to the service detail page."],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      recommendedFields: ["description", "serviceType"],
      generatedBy: "deterministic"
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
      updatedAt: "2026-05-24T00:00:00.000Z"
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
              robotsBlocked: null
            },
            content: {
              textLength: 120,
              wordCount: 20,
              duplicateHash: "a".repeat(64)
            }
          }
        ]
      }).snapshots,
    ).toHaveLength(1);
    expect(
      CreateSchemaRecommendationsResponseSchema.parse({
        recommendationSets: [
          {
            siteId: "site_1",
            pageUrl: "https://example.com/services/seo",
            recommendations: [recommendation],
            generatedBy: "deterministic"
          }
        ],
        recommendations: [record]
      }).recommendations,
    ).toHaveLength(1);
    expect(SchemaRecommendationListResponseSchema.parse({ recommendations: [record] }))
      .toMatchObject({
        recommendations: [{ type: "Service", status: "open" }]
      });
    expect(SchemaRecommendationDetailResponseSchema.parse({ recommendation: record }))
      .toMatchObject({
        recommendation: { generatedBy: "deterministic" }
      });
    expect(() =>
      SchemaRecommendationRecordSchema.parse({
        ...record,
        generatedBy: "llm"
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
      maxPages: 10
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
          noindexPages: 0
        }
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
            crawlDelay: 2
          }
        ],
        sitemaps: ["https://example.com/sitemap.xml"]
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
            priority: 0.8
          }
        ],
        sitemaps: []
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
      "mixed"
    ]);

    expect(
      KeywordTargetSchema.parse({
        siteId: "site_1",
        phrase: "  seo clinic  "
      }),
    ).toEqual({
      siteId: "site_1",
      phrase: "seo clinic",
      locale: "ko-KR",
      language: "ko",
      country: "KR",
      intent: null,
      source: "manual"
    });

    expect(
      KeywordSchema.parse({
        id: "keyword_1",
        siteId: "site_1",
        phrase: "seo clinic",
        locale: "ko-KR",
        intent: "commercial",
        createdAt: "2026-05-23T00:00:00.000Z"
      }),
    ).toMatchObject({ intent: "commercial" });
    expect(() =>
      KeywordSchema.parse({
        id: "keyword_1",
        siteId: "site_1",
        phrase: "seo clinic",
        locale: "ko-KR",
        intent: "ai_generated",
        createdAt: "2026-05-23T00:00:00.000Z"
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
      wordCount: 420
    });

    expect(page).toMatchObject({
      schemaTypes: [],
      questionHeadings: [],
      answerBlocks: []
    });
    expect(
      KeywordAeoInputSchema.parse({
        keyword: {
          siteId: "site_1",
          phrase: "seo clinic"
        },
        candidatePage: page
      }).candidatePage,
    ).toMatchObject({ wordCount: 420 });
  });

  it("validates deterministic AEO readiness reports", () => {
    const report = AeoReadinessReportSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: "seo clinic",
        intent: "commercial"
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
            sourceField: "answerBlocks"
          }
        }
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z"
    });

    expect(report).toMatchObject({ generatedBy: "deterministic", score: 68 });
    expect(() =>
      AeoReadinessReportSchema.parse({
        ...report,
        score: 101
      }),
    ).toThrow();
    expect(() =>
      AeoReadinessReportSchema.parse({
        ...report,
        generatedBy: "llm"
      }),
    ).toThrow();
  });

  it("validates persisted AEO readiness report API contracts", () => {
    const request = CreateAeoReadinessReportRequestSchema.parse({
      keyword: {
        phrase: "seo clinic",
        intent: "commercial"
      },
      candidatePage: null,
      evaluatedAt: "2026-05-23T00:00:00.000Z"
    });
    const readinessReport = AeoReadinessReportSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: request.keyword.phrase,
        intent: request.keyword.intent
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
            sourceField: "keyword.intent"
          }
        }
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z"
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
      createdAt: "2026-05-23T00:00:00.000Z"
    });

    expect(
      CreateAeoReadinessReportResponseSchema.parse({ report, readinessReport }),
    ).toMatchObject({
      report: {
        generatedBy: "deterministic",
        phrase: "seo clinic"
      },
      readinessReport: {
        generatedBy: "deterministic"
      }
    });
    expect(AeoReadinessReportListResponseSchema.parse({ reports: [report] }).reports)
      .toHaveLength(1);
    expect(() =>
      AeoReadinessReportRecordSchema.parse({
        ...report,
        generatedBy: "llm"
      }),
    ).toThrow();
  });

  it("validates FAQ gaps and draft-only content brief contracts", () => {
    const gapSet = AeoFaqGapSetSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: "seo clinic"
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
            sourceField: "questionHeadings"
          }
        }
      ],
      generatedBy: "deterministic",
      evaluatedAt: "2026-05-23T00:00:00.000Z"
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
          acceptanceCriteria: ["Includes one concise answer block."]
        }
      ],
      acceptanceCriteria: ["Brief remains draft-only until reviewed."],
      generationMode: "deterministic",
      publishPolicy: "draft_only"
    });

    expect(draft).toMatchObject({
      keywordId: null,
      status: "draft",
      generationMode: "deterministic",
      publishPolicy: "draft_only"
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
        createdAt: "2026-05-23T00:00:00.000Z"
      }),
    ).toMatchObject({ status: "draft" });
    expect(() =>
      ContentBriefDraftSchema.parse({
        ...draft,
        status: "published"
      }),
    ).toThrow();
  });

  it("validates ContentBrief draft API contracts", () => {
    const request = CreateContentBriefDraftRequestSchema.parse({
      keyword: {
        phrase: "seo clinic",
        intent: "commercial"
      },
      candidatePage: null,
      evaluatedAt: "2026-05-23T00:00:00.000Z"
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
          acceptanceCriteria: ["Includes direct answer."]
        }
      ],
      faqQuestions: ["What is seo clinic?"],
      acceptanceCriteria: ["Do not auto-publish."],
      generationMode: "deterministic",
      publishPolicy: "draft_only"
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
      createdAt: "2026-05-23T00:00:00.000Z"
    });

    expect(CreateContentBriefDraftResponseSchema.parse({
      contentBrief,
      draft,
      readinessReport: {
        keyword: {
          siteId: "site_1",
          phrase: "seo clinic",
          intent: "commercial"
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
              sourceField: "keyword.intent"
            }
          }
        ],
        generatedBy: "deterministic",
        evaluatedAt: "2026-05-23T00:00:00.000Z"
      }
    })).toMatchObject({
      contentBrief: {
        publishPolicy: "draft_only",
        status: "draft"
      },
      draft: {
        generationMode: "deterministic"
      }
    });
    expect(ContentBriefListResponseSchema.parse({ contentBriefs: [contentBrief] }).contentBriefs)
      .toHaveLength(1);
    expect(ContentBriefDetailResponseSchema.parse({ contentBrief: contentBrief }).contentBrief)
      .toMatchObject({ id: "brief_1" });
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
      fetchedAt: "2026-05-22T00:00:00.000Z"
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
          endDate: "2026-05-20"
        }
      ]
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
      fetchedAt: "2026-05-22T00:00:00.000Z"
    });

    expect(parsed).toMatchObject({
      connectorSyncRunId: "sync_1",
      organizationId: "org_1",
      siteDomain: "example.com",
      providers: ["gsc", "ga4", "pagespeed", "bing", "cms"]
    });
  });

  it("validates connector sync run API contracts", () => {
    expect(CreateConnectorSyncRunRequestSchema.parse({}).providers).toEqual([
      "gsc",
      "ga4",
      "pagespeed",
      "bing",
      "cms"
    ]);

    const request = CreateConnectorSyncRunRequestSchema.parse({
      providers: ["pagespeed", "cms"]
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
            providers: ["pagespeed", "cms"]
          }
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
          summary: null
        }
      }),
    ).toMatchObject({
      connectorSyncRun: {
        id: "sync_1",
        status: "queued"
      },
      job: {
        name: "connector-sync",
        payload: {
          providers: ["pagespeed", "cms"]
        }
      }
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
          pagespeed: 0
        },
        totalProviders: 1,
        totalRecords: 1
      }
    });

    expect(connectorSyncRun).toMatchObject({ status: "completed" });
    expect(
      ConnectorSyncRunListResponseSchema.parse({
        connectorSyncRuns: [connectorSyncRun]
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
          fetchedAt: "2026-05-22T00:00:00.000Z"
        }
      ]
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
        pagespeed: 1
      },
      totalProviders: 1,
      totalRecords: 1
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
      createdAt: "2026-05-22T00:00:00.000Z"
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
          summary
        },
        results: [syncResult]
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
        summary
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
            endDate: "2026-05-20"
          }
        ]
      }),
    ).toThrow(/provider/);
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
          sourceField: "title"
        },
        impactScore: 80,
        effortScore: 20,
        priorityScore: 86
      }),
    ).toMatchObject({
      ruleId: "TITLE_MISSING",
      severity: "high",
      priority: "p1"
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
          sourceField: "h1Count"
        },
        impact: "Search and answer engines may not identify the primary page topic.",
        instructions: ["Add one descriptive H1 near the top of the page."],
        ownerType: "content",
        priority: "p1",
        acceptanceCriteria: ["Re-crawl reports h1Count = 1."],
        verificationMethod: "Run a crawler recheck for the URL.",
        estimatedEffort: "s",
        relatedIssues: ["MULTIPLE_H1"]
      }),
    ).toMatchObject({
      ownerType: "content",
      priority: "p1",
      estimatedEffort: "s"
    });
  });

  it("validates persisted work orders", () => {
    expect(
      WorkOrderSchema.parse({
        id: "wo_1",
        organizationId: "org_1",
        siteId: "site_1",
        seoIssueId: "issue_1",
        status: "open",
        priority: "p1",
        title: "/services missing H1 fix",
        description: null,
        problem: "The page has no H1 heading.",
        evidence: {
          url: "https://example.com/services",
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
        relatedIssues: ["MULTIPLE_H1"],
        assignedTo: null,
        dueDate: null,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z"
      }),
    ).toMatchObject({ status: "open", priority: "p1" });
  });

  it("validates work order list responses", () => {
    const workOrder = WorkOrderSchema.parse({
      id: "wo_1",
      organizationId: "org_1",
      siteId: "site_1",
      seoIssueId: null,
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
      updatedAt: "2026-05-20T00:00:00.000Z"
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
        dueDate: "2026-05-21T00:00:00.000Z"
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
        sourceField: "h1Count"
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
      updatedAt: "2026-05-20T00:00:00.000Z"
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
      createdAt: "2026-05-20T00:00:00.000Z"
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
          summary: { startUrl: "https://example.com/services", maxPages: 1 }
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
            pages: []
          }
        }
      }),
    ).toMatchObject({ workOrder: { status: "in_review" } });
    expect(ResolveWorkOrderIssueResponseSchema.parse({ workOrder, seoIssue }).seoIssue).toMatchObject(
      {
        status: "resolved"
      },
    );
  });
});
