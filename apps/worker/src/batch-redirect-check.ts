// 리뉴얼 옛 주소 점검 배치(설계 단계 0). batch-crawl.yml 에서 크롤 뒤에 돈다.
// 판정은 redirect-check.ts, 여기는 실제 DB·네트워크 연결과 사이트 루프만 둔다.

import { fetchUrl } from "@searchops/crawler-core";
import {
  closeIssuesForGoneUrls,
  createPrismaIssueReconcileClient,
  createPrismaLegacyUrlClient,
  createPrismaSourceWorkOrderClient,
  createSearchOpsPrismaClient,
  loadLegacyUrlCandidates,
  upsertSourceWorkOrder
} from "@searchops/db";

import { runRedirectCheckForSite } from "./redirect-check.js";

const lookbackMs = 90 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[batch-redirect-check] DATABASE_URL 이 없어 건너뛴다.");
    return;
  }
  const prisma = createSearchOpsPrismaClient();
  let failures = 0;
  try {
    const legacyClient = createPrismaLegacyUrlClient(prisma);
    const workOrderClient = createPrismaSourceWorkOrderClient(prisma);
    const reconcileClient = createPrismaIssueReconcileClient(prisma);
    const since = new Date(Date.now() - lookbackMs);
    const sites = await prisma.site.findMany({
      select: { domain: true, id: true, organizationId: true },
      where: { archivedAt: null }
    });
    for (const site of sites) {
      try {
        const result = await runRedirectCheckForSite(
          {
            closeGone: (urls) => closeIssuesForGoneUrls(reconcileClient, { siteId: site.id, urls }),
            fetch: (url) => fetchUrl({ timeoutMs: 15_000, url }),
            loadCandidates: (siteId) => loadLegacyUrlCandidates(legacyClient, { since, siteId }),
            upsert: (input) => upsertSourceWorkOrder(workOrderClient, input)
          },
          site,
        );
        if (result.aborted && result.checked === 0) {
          // 크롤 차단은 batch-crawl 이 이미 실패로 알린다. 여기서 또 실패로 세지 않는다.
          console.warn(`[batch-redirect-check] ${site.domain} 최신 크롤이 없거나 차단 의심이라 이번엔 건너뛴다.`);
        } else if (result.aborted) {
          failures += 1;
          console.error(
            `[batch-redirect-check] ${site.domain} 응답 없는 주소가 절반을 넘어 할 일을 바꾸지 않았다 ` +
              `(unknown=${result.unknown}/${result.checked}, 응답 없음이 쌓여 중단). 사이트 장애·차단을 먼저 확인해라.`,
          );
        } else {
          console.log(
            `[batch-redirect-check] ${site.domain} checked=${result.checked} ok=${result.ok} ` +
              `home_only=${result.homeOnly} broken=${result.broken} unknown=${result.unknown}`,
          );
        }
      } catch (error) {
        failures += 1;
        console.error(`[batch-redirect-check] ${site.domain} 실패`, error);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
