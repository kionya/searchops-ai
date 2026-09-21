// T5: 사이트 Keyword 의 월간 검색량(네이버 검색광고)을 채우는 배치. batch-crawl 워크플로의 한 스텝으로 돈다.
// Redis 없음(./runtime.js·parseSearchOpsEnv 를 임포트하지 않는다). 키가 없으면 아무것도 쓰지 않고 0 으로 끝난다 —
// fixture 검색량을 DB 에 넣으면 진단서 근거가 오염된다.

import { createNaverSearchAdClientFromEnv } from "@searchops/connectors";
import { createSearchOpsPrismaClient } from "@searchops/db";

export function normalizeKeywordPhrase(value: string) {
  return value.replace(/\s+/gu, "").toLowerCase();
}

async function main(): Promise<void> {
  const client = createNaverSearchAdClientFromEnv(process.env);
  if (client === null) {
    console.log("[batch-keyword-volume] SEARCHOPS_NAVER_SEARCHAD_* 키가 없어 건너뛴다(fixture 는 DB 에 쓰지 않는다).");
    return;
  }

  const prisma = createSearchOpsPrismaClient();
  try {
    const keywords = await prisma.keyword.findMany({
      orderBy: [{ siteId: "asc" }, { phrase: "asc" }],
      select: { id: true, phrase: true, siteId: true }
    });
    if (keywords.length === 0) {
      console.log("[batch-keyword-volume] 키워드가 없다. 할 일 없음.");
      return;
    }
    const phrases = [...new Set(keywords.map((keyword) => keyword.phrase))];
    const volumes = await client.fetchKeywordVolumes(phrases);
    const byPhrase = new Map(volumes.map((volume) => [normalizeKeywordPhrase(volume.keyword), volume]));
    const fetchedAt = new Date();
    let updated = 0;
    for (const keyword of keywords) {
      const volume = byPhrase.get(normalizeKeywordPhrase(keyword.phrase));
      if (volume === undefined) {
        continue;
      }
      await prisma.keyword.update({
        data: { monthlyVolumeMobile: volume.monthlyMobile, monthlyVolumePc: volume.monthlyPc, volumeFetchedAt: fetchedAt },
        where: { id: keyword.id }
      });
      updated += 1;
    }
    console.log(`[batch-keyword-volume] 키워드 ${keywords.length}개 중 ${updated}개 검색량 갱신 (mode=${client.mode})`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
