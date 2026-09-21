// 상시 워커 없이 GEO 답변 관측을 주 1회 돌리고 끝내는 배치 진입점. GitHub Actions cron 이 실행한다.
// batch-crawl.ts 와 같은 구조 — 큐(Redis)를 우회하고 processAndPersistGeoAnswerMonitorJob 을 직접 부른다.
//   - ./runtime.js 를 임포트하지 않는다 (bullmq 를 끌고 온다)
//   - parseSearchOpsEnv 를 쓰지 않는다 (REDIS_URL 을 필수로 요구한다)
//
// 대상: Site.geoMonitorEnabled = true 인 사이트. 상한: 사이트당 질문 SEARCHOPS_GEO_BATCH_MAX_QUERIES(기본 10),
// 엔진은 키가 있는 것만(최대 4). 같은 ISO 주에 이미 배치 run 이 있으면 건너뛴다(멱등).
// 키가 하나도 없으면 fixture 만 쌓이므로 기본은 중단한다. dry-run 은 SEARCHOPS_GEO_BATCH_ALLOW_FIXTURE=1.

import { createTelegramNotifier } from "@searchops/connectors";
import {
  createPrismaGeoVisibilityPersistenceClient,
  createSearchOpsPrismaClient
} from "@searchops/db";
import { summarizeGeoObservationSources } from "@searchops/geo-core";
import type { GeoAnswerMonitorProvider, GeoAnswerObservation } from "@searchops/types";

import { formatGeoWeeklySummary } from "./geo-weekly-summary.js";
import { processAndPersistGeoAnswerMonitorJob } from "./processor.js";
import { createPlatformGeoProviderResolver } from "./provider-credential-resolver.js";

const maxQueries = Math.min(10, Math.max(1, Number(process.env.SEARCHOPS_GEO_BATCH_MAX_QUERIES) || 10));

const geoPlatformApiKeys = {
  geo_chatgpt: process.env.SEARCHOPS_GEO_CHATGPT_API_KEY,
  geo_claude: process.env.SEARCHOPS_GEO_CLAUDE_API_KEY,
  geo_gemini: process.env.SEARCHOPS_GEO_GEMINI_API_KEY,
  geo_perplexity: process.env.SEARCHOPS_GEO_PERPLEXITY_API_KEY
};
const providerByKey: Record<keyof typeof geoPlatformApiKeys, GeoAnswerMonitorProvider> = {
  geo_chatgpt: "chatgpt",
  geo_claude: "claude",
  geo_gemini: "gemini",
  geo_perplexity: "perplexity"
};
const liveProviders = (Object.keys(geoPlatformApiKeys) as (keyof typeof geoPlatformApiKeys)[])
  .filter((key) => geoPlatformApiKeys[key])
  .map((key) => providerByKey[key]);

/** ISO 주 시작(월요일 00:00 UTC). 같은 주에 두 번 돌면 두 번째는 건너뛴다. */
export function startOfIsoWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

async function main(): Promise<void> {
  const allowFixture = process.env.SEARCHOPS_GEO_BATCH_ALLOW_FIXTURE === "1";
  if (liveProviders.length === 0 && !allowFixture) {
    console.error(
      "[batch-geo] SEARCHOPS_GEO_*_API_KEY 가 하나도 없다. fixture 만 쌓이므로 중단한다(dry-run: SEARCHOPS_GEO_BATCH_ALLOW_FIXTURE=1)."
    );
    process.exitCode = 2;
    return;
  }
  const providers: GeoAnswerMonitorProvider[] =
    liveProviders.length > 0 ? liveProviders : ["chatgpt", "perplexity"];
  const liveExternalApis = liveProviders.length > 0 ? "enabled" : "disabled";

  const prisma = createSearchOpsPrismaClient();
  try {
    const sites = await prisma.site.findMany({
      orderBy: { domain: "asc" },
      select: { competitors: true, country: true, domain: true, id: true, language: true, name: true, organizationId: true },
      where: { geoMonitorEnabled: true }
    });
    if (sites.length === 0) {
      console.log("[batch-geo] geoMonitorEnabled 사이트가 없다. 할 일 없음.");
      return;
    }

    const persistenceClient = createPrismaGeoVisibilityPersistenceClient(prisma);
    const resolver = createPlatformGeoProviderResolver({ geoPlatformApiKeys });
    const observedAt = new Date();
    const weekStart = startOfIsoWeek(observedAt);
    // T7: 제품 알림 채널. 토큰/chat_id 없으면 null → 요약은 로그에만 남는다.
    const notifier = createTelegramNotifier({
      botToken: process.env.SEARCHOPS_TELEGRAM_BOT_TOKEN,
      chatId: process.env.SEARCHOPS_TELEGRAM_PRODUCT_CHAT_ID
    });
    let failures = 0;

    for (const site of sites) {
      try {
        const previous = await prisma.geoVisibilityReport.findFirst({
          orderBy: { runSeq: "desc" },
          select: { evaluatedAt: true, id: true, mentionRate: true, runSeq: true, sov: true },
          where: { runSeq: { not: null }, siteId: site.id }
        });
        if (previous && previous.evaluatedAt >= weekStart) {
          console.log(`[batch-geo] ${site.domain} 이번 주 run 이 이미 있다(runSeq=${previous.runSeq}). 건너뜀.`);
          continue;
        }

        const keywords = await prisma.keyword.findMany({
          orderBy: { createdAt: "asc" },
          select: { phrase: true },
          take: maxQueries,
          where: { siteId: site.id }
        });
        const brandName = site.name ?? site.domain;
        const queries = (
          keywords.length > 0 ? keywords.map((keyword) => keyword.phrase) : [`${brandName} 추천`, `${brandName} 후기`]
        ).map((query) => ({ query }));

        await processAndPersistGeoAnswerMonitorJob(
          {
            observedAt: observedAt.toISOString(),
            organizationId: site.organizationId,
            providers,
            queries,
            requestedByUserId: "batch",
            siteDomain: site.domain,
            siteId: site.id,
            target: {
              brandName,
              competitors: site.competitors,
              domain: site.domain,
              locale: `${site.language}-${site.country}`,
              market: site.country,
              siteId: site.id
            }
          },
          persistenceClient,
          {
            liveExternalApis,
            resolveGeoProviderAdapters: resolver.resolveGeoProviderAdapters.bind(resolver)
          }
        );

        // persist 는 id 를 돌려주지 않는다. 방금 만든 최신 행에 run 번호를 붙인다.
        const created = await prisma.geoVisibilityReport.findFirst({
          orderBy: { createdAt: "desc" },
          select: { id: true, mentionRate: true, observations: true, sov: true },
          where: { siteId: site.id }
        });
        if (created === null) {
          throw new Error("리포트가 저장되지 않았다");
        }
        const runSeq = (previous?.runSeq ?? 0) + 1;
        await prisma.geoVisibilityReport.update({
          data: { previousReportId: previous?.id ?? null, runSeq },
          where: { id: created.id }
        });
        const summary = formatGeoWeeklySummary({
          domain: site.domain,
          liveShare: summarizeGeoObservationSources(
            (Array.isArray(created.observations) ? created.observations : []) as Pick<GeoAnswerObservation, "source">[]
          ).liveShare,
          mentionRate: created.mentionRate,
          previous: previous === null ? null : { mentionRate: previous.mentionRate, sov: previous.sov },
          providers,
          runSeq,
          sov: created.sov
        });
        console.log(`[batch-geo] ${summary.replace(/\n/gu, " | ")}`);
        if (notifier !== null) {
          // 알림 실패는 측정 실패가 아니다. 경고만 남기고 배치 결과는 그대로 둔다.
          await notifier.sendMessage(summary).catch((error: unknown) => {
            console.warn(`[batch-geo] ${site.domain} 텔레그램 전송 실패`, error);
          });
        }
      } catch (error) {
        failures += 1;
        console.error(`[batch-geo] ${site.domain} 실패`, error);
      }
    }
    if (failures > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
