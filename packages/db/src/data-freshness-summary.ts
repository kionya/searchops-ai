import type { SiteDataFreshness } from "./site-dashboard.js";

// 웹 패널(apps/web data-freshness-panel)과 텔레그램 아침 요약(worker)이 같은 판정을 쓴다.
// "데이터 반영 현황" 판정. 배치는 크롤·연동·AEO 매일(03:00 KST), GEO 매주(월 04:00 KST).
// GitHub 예약 실행은 몇 시간씩 밀리므로 하루짜리는 36시간, 주간은 8일을 넘겨야 지연으로 본다.
const dailyLimitMs = 36 * 60 * 60 * 1000;
const weeklyLimitMs = 8 * 24 * 60 * 60 * 1000;

export type FreshnessTone = "ok" | "stale" | "failed" | "missing";

export interface FreshnessItem {
  readonly key: "crawl" | "connectors" | "aeo" | "geo";
  readonly label: string;
  readonly at: string | null;
  readonly tone: FreshnessTone;
  readonly detail: string;
  readonly cadence: string;
}

export function summarizeDataFreshness(freshness: SiteDataFreshness, now = new Date()): FreshnessItem[] {
  const crawl = freshness.lastCrawl;
  const sync = freshness.lastConnectorSync;
  return [
    {
      at: crawl?.startedAt ?? null,
      cadence: "매일 03시",
      detail: crawl === null ? "크롤 기록 없음" : crawl.pagesProcessed === null ? crawl.status : `${crawl.pagesProcessed}페이지 수집`,
      key: "crawl",
      label: "사이트 크롤",
      tone: toneFor(crawl?.startedAt ?? null, dailyLimitMs, now, crawl !== null && crawl.status === "failed")
    },
    {
      at: sync?.startedAt ?? null,
      cadence: "매일 03시 자동",
      detail:
        sync === null
          ? "동기화 기록 없음"
          : sync.okProviders !== null && sync.totalProviders !== null
            ? `연동 ${sync.okProviders}/${sync.totalProviders} 정상`
            : sync.status,
      key: "connectors",
      label: "연동 동기화 (GA4·GSC·PageSpeed·Bing)",
      tone: toneFor(
        sync?.startedAt ?? null,
        dailyLimitMs,
        now,
        sync !== null &&
          (sync.status === "failed" || (sync.okProviders !== null && sync.totalProviders !== null && sync.okProviders < sync.totalProviders)),
      )
    },
    {
      at: freshness.lastAeoEvaluatedAt,
      cadence: "크롤 직후 매일",
      detail: freshness.lastAeoEvaluatedAt === null ? "평가 기록 없음" : "키워드 답변 준비도 평가",
      key: "aeo",
      label: "AEO 평가",
      tone: toneFor(freshness.lastAeoEvaluatedAt, dailyLimitMs, now, false)
    },
    {
      at: freshness.lastGeoEvaluatedAt,
      cadence: "매주 월 04시",
      detail: freshness.lastGeoEvaluatedAt === null ? "리포트 없음" : "AI 답변 노출 리포트",
      key: "geo",
      label: "GEO 리포트",
      tone: toneFor(freshness.lastGeoEvaluatedAt, weeklyLimitMs, now, false)
    }
  ];
}

function toneFor(at: string | null, limitMs: number, now: Date, failed: boolean): FreshnessTone {
  if (at === null) {
    return "missing";
  }
  if (failed) {
    return "failed";
  }
  return now.getTime() - new Date(at).getTime() > limitMs ? "stale" : "ok";
}
