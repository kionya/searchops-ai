import assert from "node:assert/strict";

import { createBullMqCrawlRunQueue } from "../../apps/api/src/bullmq-queue.js";
import { createPrismaRepository } from "../../apps/api/src/prisma-repository.js";
import { buildApiServer } from "../../apps/api/src/server.js";
import { createCrawlWorker } from "../../apps/worker/src/runtime.js";
import { createSearchOpsPrismaClient } from "../../packages/db/src/client.js";
import { CreateCrawlRunResponseSchema, crawlQueueName } from "../../packages/types/src/index.js";

const smokeHtml = `<!doctype html>
<html>
  <head>
    <title>Runtime Smoke Fixture</title>
    <meta name="description" content="Runtime smoke test page">
  </head>
  <body>
    <h1>Runtime Smoke Fixture</h1>
    <a href="/about">About</a>
  </body>
</html>`;

function requireEnv(name: "DATABASE_URL" | "REDIS_URL") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for runtime smoke tests.`);
  }
  return value;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCompletedCrawlRun(input: {
  readonly crawlRunId: string;
  readonly prisma: ReturnType<typeof createSearchOpsPrismaClient>;
}) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const crawlRun = await input.prisma.crawlRun.findUnique({
      where: {
        id: input.crawlRunId
      }
    });

    if (crawlRun?.status === "completed") {
      return crawlRun;
    }

    if (crawlRun?.status === "failed") {
      throw new Error(`Crawl run failed during smoke test: ${JSON.stringify(crawlRun.summary)}`);
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for crawl run ${input.crawlRunId} to complete.`);
}

async function main() {
  if (process.env.RUN_RUNTIME_SMOKE !== "1") {
    throw new Error("Set RUN_RUNTIME_SMOKE=1 to run runtime smoke tests.");
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const redisUrl = requireEnv("REDIS_URL");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const organizationId = `org_smoke_${suffix}`;
  const siteId = `site_smoke_${suffix}`;
  const userId = `user_smoke_${suffix}`;
  const domain = `smoke-${Date.now()}.example.com`;
  const startUrl = `https://${domain}/`;
  const queueName = `${crawlQueueName}-runtime-smoke-${suffix}`;

  const prisma = createSearchOpsPrismaClient();
  const crawlRunQueue = createBullMqCrawlRunQueue({
    queueName,
    redisUrl
  });
  const api = buildApiServer({
    crawlRunQueue,
    repository: createPrismaRepository(prisma)
  });
  const workerRuntime = createCrawlWorker({
    concurrency: 1,
    processorOptions: {
      async crawlSite(input) {
        assert.equal(input.siteDomain, domain);
        assert.equal(input.startUrl, startUrl);
        return [
          {
            url: startUrl,
            finalUrl: startUrl,
            html: smokeHtml,
            statusCode: 200
          }
        ];
      }
    },
    prisma,
    queueName,
    redisUrl
  });

  try {
    console.log(`Runtime smoke DATABASE_URL=${databaseUrl.replace(/:\/\/.*@/, "://***@")}`);
    await api.ready();
    await workerRuntime.worker.waitUntilReady();

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Runtime Smoke Organization",
        users: {
          create: {
            id: userId,
            email: `${userId}@example.com`,
            name: "Runtime Smoke User",
            role: "owner"
          }
        },
        sites: {
          create: {
            id: siteId,
            country: "KR",
            domain,
            industry: "medical",
            language: "ko",
            name: "Runtime Smoke Site"
          }
        }
      }
    });

    const response = await api.inject({
      headers: {
        "x-mock-organization-id": organizationId,
        "x-mock-user-id": userId
      },
      method: "POST",
      payload: {
        maxPages: 1,
        startUrl
      },
      url: `/sites/${siteId}/crawl-runs`
    });

    assert.equal(response.statusCode, 202, response.body);
    const payload = CreateCrawlRunResponseSchema.parse(JSON.parse(response.body));
    assert.equal(payload.job.payload.siteDomain, domain);

    const crawlRun = await waitForCompletedCrawlRun({
      crawlRunId: payload.crawlRun.id,
      prisma
    });
    const urlRecord = await prisma.urlRecord.findUnique({
      where: {
        siteId_url: {
          siteId,
          url: startUrl
        }
      }
    });
    const seoIssue = await prisma.seoIssue.findFirst({
      where: {
        crawlRunId: payload.crawlRun.id,
        ruleId: "CANONICAL_MISSING"
      }
    });
    const workOrder =
      seoIssue === null
        ? null
        : await prisma.workOrder.findUnique({
            where: {
              seoIssueId: seoIssue.id
            }
          });
    const schemaRecommendation = await prisma.schemaRecommendation.findFirst({
      where: {
        pageUrl: startUrl,
        siteId
      }
    });

    assert.equal(crawlRun.siteId, siteId);
    assert.equal(crawlRun.status, "completed");
    assert.equal((crawlRun.summary as { pagesProcessed?: unknown } | null)?.pagesProcessed, 1);
    assert.equal(urlRecord?.statusCode, 200);
    assert.equal(urlRecord?.title, "Runtime Smoke Fixture");
    assert.equal(seoIssue?.urlRecordId, urlRecord?.id);
    assert.equal(workOrder?.siteId, siteId);
    assert.equal(schemaRecommendation?.generatedBy, "deterministic");

    console.log(
      `Runtime smoke passed: ${payload.crawlRun.id} completed and persisted ${urlRecord?.url}, ${seoIssue?.id}, ${schemaRecommendation?.id}`,
    );
  } finally {
    await workerRuntime.close();
    await crawlRunQueue.close();
    await api.close();
    await prisma.organization.deleteMany({
      where: {
        id: organizationId
      }
    });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
