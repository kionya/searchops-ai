// AI 답변에서 뽑은 인용 URL 의 도메인이 실재하는지 DNS 로 확인한다.
//
// 왜 필요한가: 2026-09-21 운영 실측에서 ChatGPT 가 "강남X클리닉 https://exampleclinic-kangnam.com"
// 같은 **없는 병원과 없는 도메인**을 지어냈다. 그대로 두면 진단서의 "AI 인용 출처" 표에
// 허위 데이터가 실린다. 답변 원문(answerText)은 사실 그대로 두고, 집계에 쓰는 citedUrls 만 거른다.
//
// 라이브 DNS 조회다. 호출자가 liveExternalApis 게이트 안에서만 쓰고, 테스트는 lookup 을 주입한다.

import { promises as dnsPromises } from "node:dns";

export interface CitationDomainResolver {
  /** 도메인이 실재하면 true. 조회 실패·NXDOMAIN 은 false. */
  resolves(domain: string): Promise<boolean>;
}

export interface CreateDnsCitationDomainResolverOptions {
  /** 테스트용 주입. 기본은 node:dns 의 resolve. */
  readonly lookup?: (domain: string) => Promise<unknown>;
}

export function createDnsCitationDomainResolver(
  options: CreateDnsCitationDomainResolverOptions = {},
): CitationDomainResolver {
  const lookup = options.lookup ?? ((domain: string) => dnsPromises.resolve(domain));
  // 같은 도메인을 질문마다 다시 조회하지 않는다. 한 배치 안에서만 사는 캐시다.
  const cache = new Map<string, Promise<boolean>>();

  return {
    resolves(domain) {
      const cached = cache.get(domain);
      if (cached !== undefined) {
        return cached;
      }
      const pending = lookup(domain).then(
        () => true,
        () => false,
      );
      cache.set(domain, pending);
      return pending;
    }
  };
}

export interface CitationResolutionInput {
  readonly citedUrls: readonly string[];
}

export interface CitationResolutionResult<T> {
  readonly observations: T[];
  /** 제거된 고유 URL 수. 0 이면 걸러낸 것이 없다. */
  readonly unresolved: number;
}

/**
 * 관측의 citedUrls 에서 DNS 로 확인되지 않는 도메인을 제거한다.
 * answerText 는 건드리지 않는다 — "AI 가 이렇게 답했다" 는 사실이므로 원문은 남는다.
 */
export async function filterUnresolvedCitations<T extends CitationResolutionInput>(
  observations: readonly T[],
  resolver: CitationDomainResolver,
): Promise<CitationResolutionResult<T>> {
  const urls = [...new Set(observations.flatMap((observation) => [...observation.citedUrls]))];
  const verdicts = await Promise.all(
    urls.map(async (url) => {
      const domain = citationHostname(url);
      // 호스트명을 못 뽑으면 DNS 로 판단할 수 없다. 여기서 버리지 않고 뒤쪽 도메인 계약 검사에 맡긴다.
      return [url, domain === null ? true : await resolver.resolves(domain)] as const;
    }),
  );
  const resolvable = new Map(verdicts);
  const dropped = new Set<string>();

  const filtered = observations.map((observation) => {
    const kept = observation.citedUrls.filter((url) => {
      const ok = resolvable.get(url) ?? true;
      if (!ok) {
        dropped.add(url);
      }
      return ok;
    });
    return kept.length === observation.citedUrls.length
      ? observation
      : { ...observation, citedUrls: kept };
  });

  return { observations: filtered, unresolved: dropped.size };
}

function citationHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
