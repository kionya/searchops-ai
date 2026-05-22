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

    console.log("SearchOps AI seed fixture inserted.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
