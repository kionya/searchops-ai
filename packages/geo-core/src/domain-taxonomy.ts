import type { GeoCitationKind } from "@searchops/types";

/**
 * 인용 출처 분류 사전 (T1). 정적 목록 — 병원 마케팅에서 반복 등장하는 플랫폼·커뮤니티.
 * 경쟁사 목록은 사이트별(T2) 이라 호출자가 넘긴다.
 */
export const geoPlatformDomains: readonly string[] = [
  "gangnamunni.com",
  "yeoshin.co.kr",
  "babitalk.com",
  "modoodoc.com",
  "goodoc.co.kr"
];

export const geoCommunityDomains: readonly string[] = [
  "cafe.naver.com",
  "blog.naver.com",
  "tistory.com",
  "dcinside.com"
];

export function isDomainInScope(hostname: string, targetDomain: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./u, "");
  const normalizedTarget = targetDomain.toLowerCase().replace(/^www\./u, "");

  return normalizedHostname === normalizedTarget || normalizedHostname.endsWith(`.${normalizedTarget}`);
}

export function classifyGeoCitationDomain(
  domain: string,
  options: { readonly targetDomain: string; readonly competitorDomains?: readonly string[] }
): GeoCitationKind {
  const inAny = (list: readonly string[]) => list.some((entry) => isDomainInScope(domain, entry));
  if (isDomainInScope(domain, options.targetDomain)) {
    return "owned";
  }
  if (inAny(options.competitorDomains ?? [])) {
    return "competitor";
  }
  if (inAny(geoPlatformDomains)) {
    return "platform";
  }
  if (inAny(geoCommunityDomains)) {
    return "community";
  }
  return "other";
}
