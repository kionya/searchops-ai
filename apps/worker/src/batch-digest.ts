// 텔레그램 아침 요약 배치(설계 1d). batch-crawl.yml 마지막 단계 — 배치가 실패해도 돈다.
// 알림 실패는 배치를 실패로 뒤집지 않는다(batch-crawl.yml "Report batch status" 와 같은 원칙).

import { createTelegramNotifier } from "@searchops/connectors";
import {
  createPrismaTodayBoardClient,
  createSearchOpsPrismaClient,
  loadSiteDataFreshness,
  loadTodayBoard,
  summarizeDataFreshness
} from "@searchops/db";
import { rankTodayWorkOrders } from "@searchops/workorders";

import { collectDigestWarnings, composeDailyDigest } from "./daily-digest.js";

const defaultWebBaseUrl = "https://searchops.totopapa.com";

async function main(): Promise<void> {
  const notifier = createTelegramNotifier({
    botToken: process.env.SEARCHOPS_TELEGRAM_BOT_TOKEN,
    chatId: process.env.SEARCHOPS_TELEGRAM_OWNER_CHAT_ID
  });
  if (notifier === null || !process.env.DATABASE_URL) {
    console.log("[batch-digest] SEARCHOPS_TELEGRAM_BOT_TOKEN · SEARCHOPS_TELEGRAM_OWNER_CHAT_ID · DATABASE_URL 중 빠진 게 있어 건너뛴다.");
    return;
  }
  const webBaseUrl = (process.env.SEARCHOPS_WEB_BASE_URL || defaultWebBaseUrl).replace(/\/$/, "");
  const now = new Date();
  const prisma = createSearchOpsPrismaClient();
  try {
    const sites = await prisma.site.findMany({
      select: { id: true, name: true, organizationId: true },
      where: { archivedAt: null }
    });
    for (const site of sites) {
      try {
        const scope = { organizationId: site.organizationId, siteId: site.id };
        const board = await loadTodayBoard(createPrismaTodayBoardClient(prisma), scope);
        if (board === null) {
          continue;
        }
        const ranked = rankTodayWorkOrders(board.candidates, new Map(Object.entries(board.trafficByUrl)));
        const freshness = await loadSiteDataFreshness(prisma, scope);
        const lastDigest = await prisma.closedLoopAuditEvent.findFirst({
          orderBy: { createdAt: "desc" },
          select: { metadata: true },
          where: { eventType: "daily_digest", siteId: site.id }
        });
        const warnings = collectDigestWarnings({
          freshnessItems: freshness === null ? [] : summarizeDataFreshness(freshness, now),
          lastCrawlPages: freshness?.lastCrawl?.pagesProcessed ?? null,
          legacyBrokenTitle: board.candidates.find((candidate) => candidate.sourceKey?.endsWith(":broken") ?? false)?.title ?? null
        });
        const digest = composeDailyDigest({
          batchStatus: process.env.BATCH_STATUS ?? "success",
          changes: board.changes,
          now,
          previousWarningKeys: warningKeysOf(lastDigest?.metadata),
          remaining: ranked.length,
          search: board.search,
          siteName: board.site.name,
          todayUrl: `${webBaseUrl}/sites/${site.id}/today`,
          topTitle: ranked[0]?.title ?? null,
          warnings
        });
        await notifier.sendMessage(digest.text, { silent: digest.silent });
        await prisma.closedLoopAuditEvent.create({
          data: {
            eventType: "daily_digest",
            message: `daily digest sent (${digest.text.split("\n").length} lines)`,
            metadata: { warningKeys: [...digest.warningKeys] },
            organizationId: site.organizationId,
            siteId: site.id,
            source: "worker:digest",
            status: "sent"
          }
        });
        console.log(`[batch-digest] ${board.site.domain} 발송 (silent=${digest.silent}, warnings=${digest.warningKeys.length})`);
      } catch (error) {
        console.error(`[batch-digest] ${site.id} 요약 발송 실패`, error);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function warningKeysOf(metadata: unknown): readonly string[] {
  if (typeof metadata === "object" && metadata !== null && "warningKeys" in metadata) {
    const keys = (metadata as { warningKeys: unknown }).warningKeys;
    return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
  }
  return [];
}

await main();
