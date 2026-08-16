// 상시 워커 없이 크롤을 한 번 돌리고 끝내는 배치 진입점. GitHub Actions cron 이 실행한다.
//
// 큐를 우회하고 processAndPersistCrawlJob 을 직접 호출한다. 큐가 전달 외에 하던 일
// (재시도·동시성 제한·dead-letter)은 워크플로 재실행·순차 루프·실패 알림이 대신한다.
//
// Redis 를 쓰지 않는다. 그래서 두 가지를 지켜야 한다:
//   - ./runtime.js 를 임포트하지 않는다 (최상단에서 bullmq 를 끌고 온다)
//   - parseSearchOpsEnv 를 쓰지 않는다 (REDIS_URL 을 필수로 요구해 즉시 죽는다)
//
// 크롤 대상은 SEARCHOPS_RICHDOC_SITE_IDS 를 그대로 쓴다. 적재 대상과 크롤 대상을 한 값으로
// 묶어 드리프트를 없앤다 — 목록 밖 사이트는 크롤해봐야 richdoc 적재가 조용히 드롭된다.

import {
  createPrismaCrawlAnalysisPersistenceClient,
  createPrismaCrawlPersistenceClient,
  createPrismaSchemaRecommendationRecheckPersistenceClient,
  createRichdocContractBridge,
  createSearchOpsPrismaClient,
  parseRichdocContractConfigFromEnv
} from "@searchops/db";

import { processAndPersistCrawlJob } from "./processor.js";

// 계약 상한(100)을 넘기면 CrawlJobPayloadSchema 가 던지는데, 그 parse 는 프로세서의
// try 밖이라 CrawlRun 이 queued 로 남고 실패로도 기록되지 않는다. 여기서 미리 자른다.
const maxPages = Math.min(100, Math.max(1, Number(process.env.SEARCHOPS_BATCH_MAX_PAGES) || 25));

async function main(): Promise<void> {
  const contract = parseRichdocContractConfigFromEnv(process.env);
  if (contract === undefined) {
    console.error(
      "[batch-crawl] SEARCHOPS_RICHDOC_SUPABASE_URL / _SERVICE_ROLE_KEY / _SITE_IDS 가 모두 필요하다."
    );
    process.exitCode = 2;
    return;
  }

  const prisma = createSearchOpsPrismaClient();
  try {
    const sites = await prisma.site.findMany({
      orderBy: { domain: "asc" },
      select: { domain: true, id: true },
      where: { id: { in: [...contract.siteIds] } }
    });

    const missing = contract.siteIds.filter((id) => !sites.some((site) => site.id === id));
    let failures = 0;
    if (missing.length > 0) {
      // 오타나 삭제된 사이트가 매일 조용히 누락되면 아무도 모른다.
      failures += missing.length;
      console.error(`[batch-crawl] DB에 없는 Site.id: ${missing.join(", ")}`);
    }
    if (sites.length === 0) {
      console.error("[batch-crawl] 크롤할 사이트가 없다.");
      process.exitCode = 2;
      return;
    }

    const persistenceClient = createPrismaCrawlPersistenceClient(prisma);
    const crawlAnalysisClient = createPrismaCrawlAnalysisPersistenceClient(prisma);
    const schemaRecommendationRecheckClient =
      createPrismaSchemaRecommendationRecheckPersistenceClient(prisma);
    const richdocBridge = createRichdocContractBridge({ prisma, ...contract });

    for (const site of sites) {
      const startUrl = `https://${site.domain}/`;
      try {
        // CrawlRun 행이 먼저 있어야 한다. 없으면 결과 저장(update)이 실패하고,
        // 실패 경로의 markCrawlRunFailed 도 같이 터져 원래 원인이 가려진다.
        const crawlRun = await prisma.crawlRun.create({
          data: {
            siteId: site.id,
            status: "queued",
            summary: { maxPages, startUrl }
          }
        });

        const result = await processAndPersistCrawlJob(
          {
            crawlRunId: crawlRun.id,
            maxPages,
            pages: [], // 비워두면 프로세서가 직접 크롤한다
            requestedByUserId: "batch",
            siteDomain: site.domain,
            siteId: site.id,
            startUrl
          },
          persistenceClient,
          {
            crawlAnalysisClient,
            richdocBridge,
            schemaRecommendationRecheckClient
          }
        );
        console.log(
          `[batch-crawl] ${site.domain} ${result.status} pages=${result.summary.pagesProcessed}`
        );
      } catch (error) {
        // 한 사이트의 실패가 나머지를 막지 않게 한다. CrawlRun 은 failed 로 기록돼 있다.
        failures += 1;
        console.error(`[batch-crawl] ${site.domain} 실패`, error);
      }
    }

    // 브리지는 적재 실패를 삼킨다(크롤 결과를 깨지 않기 위해). 배치는 미러링이 산출물의
    // 전부이므로 여기서 따로 확인한다 — 없으면 키 회전이나 계약 미적용으로 적재가 전부
    // 실패해도 워크플로가 매일 초록불로 끝난다.
    if (richdocBridge.failureCount > 0) {
      console.error(`[batch-crawl] richdoc 적재 실패 ${richdocBridge.failureCount}건`);
    }
    if (failures > 0 || richdocBridge.failureCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    // 안 하면 Prisma 엔진이 프로세스를 붙잡아 Actions 스텝이 타임아웃까지 매달린다.
    await prisma.$disconnect();
  }
}

await main();
