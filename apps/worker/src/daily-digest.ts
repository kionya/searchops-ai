import type { FreshnessTone, TodayBoard } from "@searchops/db";

// 텔레그램 아침 요약의 문장 조립(순수). 휴대폰 한 화면에 들어가야 하고, 같은 경고를 매일
// 반복하지 않는다(설계 1d). 발송·DB 는 batch-digest.ts.

export interface DigestWarning {
  readonly key: string;
  readonly text: string;
}

export interface DigestInput {
  readonly siteName: string;
  readonly todayUrl: string;
  readonly now: Date;
  readonly batchStatus: string;
  readonly warnings: readonly DigestWarning[];
  readonly previousWarningKeys: readonly string[];
  readonly changes: readonly string[];
  readonly search: TodayBoard["search"];
  readonly remaining: number;
  readonly topTitle: string | null;
}

const kstParts = (now: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { day: "numeric", hour: "numeric", hourCycle: "h23", month: "numeric", timeZone: "Asia/Seoul" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

/** 러너는 UTC 라 시각 판정은 반드시 Asia/Seoul 로 한다. 07시 전 발송은 무음. */
export function isQuietHourKst(now: Date): boolean {
  return Number(kstParts(now).hour) < 7;
}

export function composeDailyDigest(input: DigestInput): { readonly text: string; readonly silent: boolean; readonly warningKeys: readonly string[] } {
  const parts = kstParts(input.now);
  const previous = new Set(input.previousWarningKeys);
  const fresh = input.warnings.filter((warning) => !previous.has(warning.key));
  const continuing = input.warnings.length - fresh.length;
  const lines = [`[${input.siteName}] ${parts.month}월 ${parts.day}일 아침 요약`];
  lines.push(...fresh.map((warning) => `🚨 ${warning.text}`));
  if (continuing > 0) {
    lines.push(`계속되는 경고 ${continuing}건`);
  }
  if (input.batchStatus === "failure") {
    lines.push("⚠️ 어젯밤 배치가 실패했습니다 — 일부 숫자가 어제 것일 수 있어요");
  }
  lines.push(...input.changes);
  if (input.search !== null) {
    lines.push(`구글 4주: 노출 ${input.search.impressions.toLocaleString("ko-KR")} · 클릭 ${input.search.clicks.toLocaleString("ko-KR")}`);
  }
  lines.push(
    input.remaining === 0 || input.topTitle === null
      ? "오늘 할 일이 없습니다"
      : `할 일 ${input.remaining}개 · 1순위: ${input.topTitle}`,
  );
  lines.push(input.todayUrl);
  return { silent: isQuietHourKst(input.now), text: lines.join("\n"), warningKeys: input.warnings.map((warning) => warning.key) };
}

const toneText: Partial<Record<FreshnessTone, string>> = { failed: "실패", stale: "지연" };

export function collectDigestWarnings(input: {
  readonly legacyBrokenTitle: string | null;
  readonly lastCrawlPages: number | null;
  readonly freshnessItems: readonly { readonly key: string; readonly label: string; readonly tone: FreshnessTone }[];
}): readonly DigestWarning[] {
  const warnings: DigestWarning[] = [];
  if (input.legacyBrokenTitle !== null) {
    warnings.push({ key: "legacy-broken", text: input.legacyBrokenTitle });
  }
  if (input.lastCrawlPages !== null && input.lastCrawlPages <= 1) {
    warnings.push({ key: "crawl-blocked", text: "어젯밤 크롤이 1페이지만 읽었어요 — 호스팅 차단 의심" });
  }
  for (const item of input.freshnessItems) {
    const text = toneText[item.tone];
    if (text !== undefined) {
      warnings.push({ key: `stale-${item.key}`, text: `${item.label}: ${text}` });
    }
  }
  return warnings;
}
