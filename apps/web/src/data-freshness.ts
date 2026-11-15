export { summarizeDataFreshness, type FreshnessItem, type FreshnessTone } from "@searchops/db";

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
