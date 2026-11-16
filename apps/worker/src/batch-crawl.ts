// 상시 워커 없이 크롤을 한 번 돌리고 끝내는 배치 진입점. GitHub Actions cron 이 실행한다.
//
// 큐를 우회하고 processAndPersistCrawlJob 을 직접 호출한다. 큐가 전달 외에 하던 일
// (재시도·동시성 제한·dead-letter)은 워크플로 재실행·순차 루프·실패 알림이 대신한다.
//
// Redis 를 쓰지 않는다. 그래서 두 가지를 지켜야 한다:
//   - ./runtime.js 를 임포트하지 않는다 (최상단에서 bullmq 를 끌고 온다)
//   - parseSearchOpsEnv 를 쓰지 않는다 (REDIS_URL 을 필수로 요구해 즉시 죽는다)
//
// 크롤 대상은 DB 에 등록된 모든 Site 다.

import {
  createPrismaAeoReadinessPersistenceClient,
  createPrismaComplianceFlagPersistenceClient,
  createPrismaCrawlAnalysisPersistenceClient,
  createPrismaCrawlPersistenceClient,
  createPrismaIssueReconcileClient,
  createPrismaSchemaRecommendationRecheckPersistenceClient,
  createSearchOpsPrismaClient,
  reconcileSiteIssues
} from "@searchops/db";

import { processAndPersistCrawlJob } from "./processor.js";

// 계약 상한(100)을 넘기면 CrawlJobPayloadSchema 가 던지는데, 그 parse 는 프로세서의
// try 밖이라 CrawlRun 이 queued 로 남고 실패로도 기록되지 않는다. 여기서 미리 자른다.
const maxPages = Math.min(100, Math.max(1, Number(process.env.SEARCHOPS_BATCH_MAX_PAGES) || 25));

async function main(): Promise<void> {
  const prisma = createSearchOpsPrismaClient();
  try {
    // 등록된 사이트를 전부 크롤한다.
    // ponytail: 사이트 수만큼 순차로 돈다. 워크플로 타임아웃이 30분이라 사이트가 10개를
    // 넘어가면 잘릴 수 있다. 그때는 사이트를 나눠 도는 matrix 로 쪼개라.
    const sites = await prisma.site.findMany({
      orderBy: { domain: "asc" },
      select: { archivedAt: true, domain: true, id: true }
    });

    let failures = 0;
    if (sites.length === 0) {
      console.error("[batch-crawl] 크롤할 사이트가 없다.");
      process.exitCode = 2;
      return;
    }

    // 등록은 해두되 매일 긁지는 않을 사이트를 빼는 장치는 둘이다 — 환경변수(임시 제외)와
    // Site.archivedAt(보관: 사이트 목록·다른 배치에서도 빠진다).
    const skipSiteIds = new Set(
      (process.env.SEARCHOPS_CRAWL_SKIP_SITE_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
    const crawlTargets = sites.filter((site) => !skipSiteIds.has(site.id) && site.archivedAt === null);
    // 조용히 빠지면 "왜 이 사이트만 데이터가 안 늘지" 를 아무도 못 찾는다.
    for (const site of sites) {
      if (skipSiteIds.has(site.id)) {
        console.log(`[batch-crawl] 건너뜀(SEARCHOPS_CRAWL_SKIP_SITE_IDS): ${site.domain}`);
      } else if (site.archivedAt !== null) {
        console.log(`[batch-crawl] 건너뜀(보관된 사이트): ${site.domain}`);
      }
    }
    for (const id of skipSiteIds) {
      if (!sites.some((site) => site.id === id)) {
        console.warn(`[batch-crawl] 스킵 목록의 Site.id 가 DB 에 없다: ${id}`);
      }
    }
    if (crawlTargets.length === 0) {
      console.error("[batch-crawl] 스킵을 적용하고 나니 크롤할 사이트가 없다.");
      process.exitCode = 2;
      return;
    }

    const persistenceClient = createPrismaCrawlPersistenceClient(prisma);
    const crawlAnalysisClient = createPrismaCrawlAnalysisPersistenceClient(prisma);
    const aeoReadinessClient = createPrismaAeoReadinessPersistenceClient(prisma);
    const complianceFlagClient = createPrismaComplianceFlagPersistenceClient(prisma);
    const schemaRecommendationRecheckClient =
      createPrismaSchemaRecommendationRecheckPersistenceClient(prisma);
    const issueReconcileClient = createPrismaIssueReconcileClient(prisma);

    for (const site of crawlTargets) {
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
            aeoReadinessClient,
            complianceFlagClient,
            crawlAnalysisClient,
            // AEO·컴플라이언스는 크롤 결과를 지키려고 예외를 삼킨다. 그 실패를 여기서
            // 세지 않으면 매일 밤 전패해도 워크플로가 초록불이라 0건 상태를 아무도 모른다.
            // 크롤 잡 자체는 성공으로 끝내고, 배치 실행만 실패로 표시한다.
            onPostprocessFailure: (label, error) => {
              failures += 1;
              console.error(`[batch-crawl] ${site.domain} 후처리 실패(${label})`, error);
            },
            schemaRecommendationRecheckClient
          }
        );
        console.log(
          `[batch-crawl] ${site.domain} ${result.status} pages=${result.summary.pagesProcessed}`
        );
        // 고쳐졌거나 다시 나온 문제를 지시서 상태에 반영한다. 크롤 결과는 이미 저장됐으므로
        // 여기서 실패해도 크롤은 성공이고, 배치만 실패로 표시한다.
        try {
          const reconciled = await reconcileSiteIssues(issueReconcileClient, { crawlRunId: crawlRun.id, siteId: site.id });
          console.log(
            `[batch-crawl] ${site.domain} 정리 ` +
              (reconciled.skipped
                ? "건너뜀(크롤 미완료·차단 의심)"
                : `resolved=${reconciled.resolved} reopened=${reconciled.reopened} ignored=${reconciled.ignored}`)
          );
        } catch (error) {
          failures += 1;
          console.error(`[batch-crawl] ${site.domain} 후처리 실패(reconcile)`, error);
        }
        // 크롤은 "성공" 인데 1페이지 이하면 거의 항상 차단이다 — 호스팅의 봇 방어(쿠키 확인 페이지,
        // 해외 IP 차단)가 200 으로 빈 페이지를 주면 링크가 0개라 시작 페이지에서 끝난다.
        // 2026-10 고운몸이 이 상태로 3주간 조용히 "completed pages=1" 이었다.
        // ponytail: 실제로 1페이지짜리 사이트면 매일 오탐이다 — 그런 사이트가 생기면 사이트별 예외를 둔다.
        if (maxPages > 1 && result.summary.pagesProcessed <= 1) {
          failures += 1;
          console.error(
            `[batch-crawl] ${site.domain} 크롤 차단 의심 — pages=${result.summary.pagesProcessed}/${maxPages}. ` +
              "호스팅 봇 차단(해외 IP·쿠키 확인 페이지)을 먼저 확인해라."
          );
        }
      } catch (error) {
        // 한 사이트의 실패가 나머지를 막지 않게 한다. CrawlRun 은 failed 로 기록돼 있다.
        failures += 1;
        console.error(`[batch-crawl] ${site.domain} 실패`, error);
      }
    }

    if (failures > 0) {
      process.exitCode = 1;
    }
  } finally {
    // 안 하면 Prisma 엔진이 프로세스를 붙잡아 Actions 스텝이 타임아웃까지 매달린다.
    await prisma.$disconnect();
  }
}

await main();
