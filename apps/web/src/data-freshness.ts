import type { SiteDataFreshness } from "@searchops/db";

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

/** 화면 표기는 전부 KST. DB·API 의 ISO 문자열은 UTC 라 그대로 자르면 9시간 어긋난다. */
export function formatKstDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatRelative(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}
