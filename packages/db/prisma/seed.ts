import { PrismaClient } from "@prisma/client";

export const seedFixture = {
  organization: {
    id: "org_demo",
    name: "Demo Clinic Group"
  },
  user: {
    id: "user_demo_owner",
    organizationId: "org_demo",
    email: "owner@example.com",
    name: "Demo Owner",
    role: "owner"
  },
  site: {
    id: "site_demo_rejuel",
    organizationId: "org_demo",
    domain: "example-clinic.com",
    name: "Example Clinic",
    industry: "medical",
    language: "ko",
    country: "KR"
  },
  crawlRun: {
    id: "crawl_demo_initial",
    siteId: "site_demo_rejuel",
    status: "queued",
    summary: { pagesDiscovered: 0, pagesAnalyzed: 0 }
  },
  connectorSyncRun: {
    id: "sync_demo_initial",
    organizationId: "org_demo",
    siteId: "site_demo_rejuel",
    status: "queued",
    providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
    requestedByUserId: "user_demo_owner",
    fixture: true
  },
  keyword: {
    id: "keyword_demo_aeo",
    siteId: "site_demo_rejuel",
    phrase: "answer engine optimization clinic",
    locale: "ko-KR",
    intent: "commercial"
  },
  keywordDiscoveryCandidate: {
    id: "keyword_discovery_demo_aeo",
    siteId: "site_demo_rejuel",
    keywordId: "keyword_demo_aeo",
    phrase: "answer engine optimization clinic",
    locale: "ko-KR",
    language: "ko",
    country: "KR",
    intent: "commercial",
    source: "gsc",
    pageUrl: "https://example-clinic.com/services/aeo",
    score: 132,
    evidence: {
      provider: "gsc",
      pageUrl: "https://example-clinic.com/services/aeo",
      sourceField: "query",
      clicks: 14,
      impressions: 132,
      position: 4.2
    },
    generatedBy: "deterministic",
    discoveredAt: new Date("2026-05-25T00:00:00.000Z")
  },
  contentBrief: {
    id: "brief_demo_aeo",
    siteId: "site_demo_rejuel",
    keywordId: "keyword_demo_aeo",
    primaryKeyword: "answer engine optimization clinic",
    locale: "ko-KR",
    intent: "commercial",
    title: "Answer Engine Optimization Clinic content brief",
    status: "draft",
    summary:
      "Demo deterministic draft-only content brief for the Phase 7 Keyword/AEO workflow.",
    outline: [
      {
        heading: "Direct answer",
        purpose: "Answer the primary AEO query clearly.",
        targetQuestions: ["What does answer engine optimization clinic include?"],
        acceptanceCriteria: ["Includes one concise answer block."]
      }
    ],
    faqQuestions: ["What does answer engine optimization clinic include?"],
    acceptanceCriteria: [
      "Keep the content brief in draft status until human review is complete.",
      "Do not auto-publish the brief to any CMS or external channel."
    ],
    generationMode: "deterministic",
    publishPolicy: "draft_only"
  },
  aeoReadinessReport: {
    id: "aeo_report_demo_initial",
    siteId: "site_demo_rejuel",
    keywordId: "keyword_demo_aeo",
    phrase: "answer engine optimization clinic",
    locale: "ko-KR",
    intent: "commercial",
    pageUrl: "https://example-clinic.com/services/aeo",
    status: "needs_work",
    score: 58,
    checks: [
      {
        checkId: "ANSWER_SUMMARY_PRESENT",
        status: "warning",
        score: 60,
        evidence: {
          url: "https://example-clinic.com/services/aeo",
          observedValue: false,
          expectedValue: true,
          sourceField: "answerBlocks"
        }
      }
    ],
    generatedBy: "deterministic",
    evaluatedAt: new Date("2026-05-23T00:00:00.000Z")
  },
  schemaRecommendation: {
    id: "schema_rec_demo_service",
    siteId: "site_demo_rejuel",
    pageUrl: "https://example-clinic.com/services/aeo",
    type: "Service",
    priority: "p1",
    status: "open",
    reason: "The service page has no Service JSON-LD block.",
    evidence: {
      url: "https://example-clinic.com/services/aeo",
      observedTypes: ["WebPage"],
      expectedType: "Service",
      sourceField: "jsonLd"
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Answer Engine Optimization Clinic",
      provider: {
        "@type": "MedicalClinic",
        name: "Example Clinic"
      },
      url: "https://example-clinic.com/services/aeo"
    },
    instructions: [
      "Add Service JSON-LD to the service detail page.",
      "Keep service names factual and avoid unsupported claims."
    ],
    requiredFields: ["@context", "@type", "name", "provider", "url"],
    recommendedFields: ["description", "serviceType"],
    generatedBy: "deterministic"
  },
  geoVisibilityReport: {
    id: "geo_report_demo_initial",
    siteId: "site_demo_rejuel",
    brandName: "Example Clinic",
    domain: "example-clinic.com",
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
        query: "answer engine optimization clinic",
        locale: "ko-KR",
        answerText: "Example Clinic is mentioned as an answer-engine optimization clinic.",
        citedUrls: ["https://example-clinic.com/services/aeo"],
        observedAt: "2026-05-24T00:00:00.000Z",
        source: "fixture"
      },
      {
        provider: "perplexity",
        query: "medical seo checklist",
        locale: "ko-KR",
        answerText: "Example Clinic appears with a medical SEO checklist reference.",
        citedUrls: ["https://example-clinic.com/blog/medical-seo-checklist"],
        observedAt: "2026-05-24T00:00:00.000Z",
        source: "fixture"
      },
      {
        provider: "perplexity",
        query: "seo clinic near gangnam",
        locale: "ko-KR",
        answerText: "A competitor is cited for this local query.",
        citedUrls: ["https://competitor.example/seo"],
        observedAt: "2026-05-24T00:00:00.000Z",
        source: "fixture"
      }
    ],
    citations: [
      {
        url: "https://competitor.example/seo",
        domain: "competitor.example",
        owned: false
      },
      {
        url: "https://example-clinic.com/blog/medical-seo-checklist",
        domain: "example-clinic.com",
        owned: true
      },
      {
        url: "https://example-clinic.com/services/aeo",
        domain: "example-clinic.com",
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
    evaluatedAt: new Date("2026-05-24T00:00:00.000Z")
  }
} as const;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("SearchOps AI seed fixture ready. Set DATABASE_URL to insert it into PostgreSQL.");
    console.log(JSON.stringify(seedFixture, null, 2));
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.organization.upsert({
      where: { id: seedFixture.organization.id },
      update: { name: seedFixture.organization.name },
      create: seedFixture.organization
    });

    await prisma.user.upsert({
      where: { email: seedFixture.user.email },
      update: {
        organizationId: seedFixture.user.organizationId,
        name: seedFixture.user.name,
        role: seedFixture.user.role
      },
      create: seedFixture.user
    });

    await prisma.site.upsert({
      where: {
        organizationId_domain: {
          organizationId: seedFixture.site.organizationId,
          domain: seedFixture.site.domain
        }
      },
      update: {
        name: seedFixture.site.name,
        industry: seedFixture.site.industry,
        language: seedFixture.site.language,
        country: seedFixture.site.country
      },
      create: seedFixture.site
    });

    await prisma.crawlRun.upsert({
      where: { id: seedFixture.crawlRun.id },
      update: {
        status: seedFixture.crawlRun.status,
        summary: seedFixture.crawlRun.summary
      },
      create: seedFixture.crawlRun
    });

    await prisma.connectorSyncRun.upsert({
      where: { id: seedFixture.connectorSyncRun.id },
      update: {
        fixture: seedFixture.connectorSyncRun.fixture,
        providers: seedFixture.connectorSyncRun.providers,
        requestedByUserId: seedFixture.connectorSyncRun.requestedByUserId,
        status: seedFixture.connectorSyncRun.status
      },
      create: seedFixture.connectorSyncRun
    });

    await prisma.keyword.upsert({
      where: { id: seedFixture.keyword.id },
      update: {
        intent: seedFixture.keyword.intent,
        locale: seedFixture.keyword.locale,
        phrase: seedFixture.keyword.phrase
      },
      create: seedFixture.keyword
    });

    await prisma.keywordDiscoveryCandidate.upsert({
      where: { id: seedFixture.keywordDiscoveryCandidate.id },
      update: {
        country: seedFixture.keywordDiscoveryCandidate.country,
        discoveredAt: seedFixture.keywordDiscoveryCandidate.discoveredAt,
        evidence: seedFixture.keywordDiscoveryCandidate.evidence,
        generatedBy: seedFixture.keywordDiscoveryCandidate.generatedBy,
        intent: seedFixture.keywordDiscoveryCandidate.intent,
        keywordId: seedFixture.keywordDiscoveryCandidate.keywordId,
        language: seedFixture.keywordDiscoveryCandidate.language,
        locale: seedFixture.keywordDiscoveryCandidate.locale,
        pageUrl: seedFixture.keywordDiscoveryCandidate.pageUrl,
        phrase: seedFixture.keywordDiscoveryCandidate.phrase,
        score: seedFixture.keywordDiscoveryCandidate.score,
        source: seedFixture.keywordDiscoveryCandidate.source
      },
      create: seedFixture.keywordDiscoveryCandidate
    });

    await prisma.contentBrief.upsert({
      where: { id: seedFixture.contentBrief.id },
      update: {
        acceptanceCriteria: seedFixture.contentBrief.acceptanceCriteria,
        faqQuestions: seedFixture.contentBrief.faqQuestions,
        generationMode: seedFixture.contentBrief.generationMode,
        intent: seedFixture.contentBrief.intent,
        locale: seedFixture.contentBrief.locale,
        outline: seedFixture.contentBrief.outline,
        primaryKeyword: seedFixture.contentBrief.primaryKeyword,
        publishPolicy: seedFixture.contentBrief.publishPolicy,
        status: seedFixture.contentBrief.status,
        summary: seedFixture.contentBrief.summary,
        title: seedFixture.contentBrief.title
      },
      create: seedFixture.contentBrief
    });

    await prisma.aeoReadinessReport.upsert({
      where: { id: seedFixture.aeoReadinessReport.id },
      update: {
        checks: seedFixture.aeoReadinessReport.checks,
        evaluatedAt: seedFixture.aeoReadinessReport.evaluatedAt,
        generatedBy: seedFixture.aeoReadinessReport.generatedBy,
        intent: seedFixture.aeoReadinessReport.intent,
        keywordId: seedFixture.aeoReadinessReport.keywordId,
        locale: seedFixture.aeoReadinessReport.locale,
        pageUrl: seedFixture.aeoReadinessReport.pageUrl,
        phrase: seedFixture.aeoReadinessReport.phrase,
        score: seedFixture.aeoReadinessReport.score,
        status: seedFixture.aeoReadinessReport.status
      },
      create: seedFixture.aeoReadinessReport
    });

    await prisma.schemaRecommendation.upsert({
      where: { id: seedFixture.schemaRecommendation.id },
      update: {
        evidence: seedFixture.schemaRecommendation.evidence,
        generatedBy: seedFixture.schemaRecommendation.generatedBy,
        instructions: seedFixture.schemaRecommendation.instructions,
        jsonLd: seedFixture.schemaRecommendation.jsonLd,
        pageUrl: seedFixture.schemaRecommendation.pageUrl,
        priority: seedFixture.schemaRecommendation.priority,
        reason: seedFixture.schemaRecommendation.reason,
        recommendedFields: seedFixture.schemaRecommendation.recommendedFields,
        requiredFields: seedFixture.schemaRecommendation.requiredFields,
        status: seedFixture.schemaRecommendation.status,
        type: seedFixture.schemaRecommendation.type
      },
      create: seedFixture.schemaRecommendation
    });

    await prisma.geoVisibilityReport.upsert({
      where: { id: seedFixture.geoVisibilityReport.id },
      update: {
        brandName: seedFixture.geoVisibilityReport.brandName,
        checks: seedFixture.geoVisibilityReport.checks,
        citationRate: seedFixture.geoVisibilityReport.citationRate,
        citations: seedFixture.geoVisibilityReport.citations,
        competitorCitationRate: seedFixture.geoVisibilityReport.competitorCitationRate,
        domain: seedFixture.geoVisibilityReport.domain,
        evaluatedAt: seedFixture.geoVisibilityReport.evaluatedAt,
        generatedBy: seedFixture.geoVisibilityReport.generatedBy,
        locale: seedFixture.geoVisibilityReport.locale,
        market: seedFixture.geoVisibilityReport.market,
        mentionRate: seedFixture.geoVisibilityReport.mentionRate,
        observations: seedFixture.geoVisibilityReport.observations,
        providerCount: seedFixture.geoVisibilityReport.providerCount,
        queryCount: seedFixture.geoVisibilityReport.queryCount,
        score: seedFixture.geoVisibilityReport.score,
        status: seedFixture.geoVisibilityReport.status
      },
      create: seedFixture.geoVisibilityReport
    });

    console.log("SearchOps AI seed fixture inserted.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
