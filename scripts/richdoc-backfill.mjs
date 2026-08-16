// 크롤 없이 기존 데이터를 richdoc(리쥬엘) Supabase 로 밀어넣는다.
//
// 쓰는 때:
//   - 배치 도입 전에 쌓여 있던 크롤런/이슈/지시서를 콘솔에 처음 올릴 때
//   - 리쥬엘 쪽 테이블을 비웠거나 계약을 다시 적용해 재동기화가 필요할 때
//
// 크롤을 하지 않으므로 대상 사이트에 부하가 없고 SearchOps DB 도 변하지 않는다.
// 지시서는 사이트 전체를, 크롤런과 이슈는 사이트별 최근 N개(기본 5) 런을 올린다.
//
// 실행:
//   set -a; . <자격증명 파일>; set +a
//   node scripts/richdoc-backfill.mjs [--runs 5]

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(here, "../packages/db/dist/index.js");
if (!existsSync(dbPath)) {
  console.error(`빌드 산출물이 없다: ${dbPath}\n먼저 실행하라: corepack pnpm --filter "@searchops/db..." build`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const runsPerSite = Number(argv.includes("--runs") ? argv[argv.indexOf("--runs") + 1] : 5) || 5;

const db = await import(dbPath);
const contract = db.parseRichdocContractConfigFromEnv(process.env);
if (contract === undefined) {
  console.error("SEARCHOPS_RICHDOC_SUPABASE_URL / _SERVICE_ROLE_KEY / _SITE_IDS 가 모두 필요하다.");
  process.exit(2);
}

const prisma = db.createSearchOpsPrismaClient();
try {
  const bridge = db.createRichdocContractBridge({ prisma, ...contract });

  for (const siteId of contract.siteIds) {
    const site = await prisma.site.findUnique({ select: { domain: true }, where: { id: siteId } });
    if (site === null) {
      console.error(`[backfill] DB에 없는 Site.id: ${siteId}`);
      continue;
    }

    // 크롤런은 최근 것부터, 오래된 순으로 올려 last_seen 이 시간순으로 전진하게 한다.
    const runs = await prisma.crawlRun.findMany({
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true },
      take: runsPerSite,
      where: { siteId }
    });
    for (const run of [...runs].reverse()) {
      await bridge.syncCrawlRun({ crawlRunId: run.id, siteId });
      console.log(`[backfill] ${site.domain} run ${run.startedAt.toISOString()} 적재`);
    }

    // syncCrawlRun 이 사이트 전체 지시서도 밀지만, 크롤런이 하나도 없는 사이트를 위해 한 번 더 호출한다.
    await bridge.syncSiteWorkOrders({ siteId });
    const workOrders = await prisma.workOrder.count({ where: { siteId } });
    console.log(`[backfill] ${site.domain} 지시서 ${workOrders}건 적재 (크롤런 ${runs.length}개)`);
  }
} finally {
  await prisma.$disconnect();
}
