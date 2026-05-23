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

    console.log("SearchOps AI seed fixture inserted.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
