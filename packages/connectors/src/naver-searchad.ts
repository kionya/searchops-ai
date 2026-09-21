// T5 네이버 검색광고 API(키워드 도구) 클라이언트. 월간 검색량(PC·모바일)만 가져온다.
// 키(CUSTOMER_ID / ACCESS_LICENSE / SECRET_KEY)는 사용자가 발급해 env 로 주입한다 — 코드에 없다.
// 라이브 호출은 호출자가 게이트한다(키 없으면 fixture 클라이언트를 쓰거나 건너뛴다).

import { createHmac } from "node:crypto";

export interface NaverSearchAdCredentials {
  readonly customerId: string;
  readonly accessLicense: string;
  readonly secretKey: string;
}

export interface KeywordVolume {
  readonly keyword: string;
  readonly monthlyPc: number;
  readonly monthlyMobile: number;
}

export interface NaverSearchAdClient {
  readonly mode: "live" | "fixture";
  fetchKeywordVolumes(hintKeywords: readonly string[]): Promise<KeywordVolume[]>;
}

export const NAVER_SEARCHAD_BASE_URL = "https://api.searchad.naver.com";
export const NAVER_SEARCHAD_HINT_LIMIT = 5;
/** 진단서 근거 키워드 하한(월간 PC+모바일). 미만은 exploratory. */
export const KEYWORD_EVIDENCE_MIN_MONTHLY_VOLUME = 100;

/** 서명 = base64(HMAC-SHA256(secret, `${timestamp}.${method}.${uri}`)). uri 는 쿼리 제외. */
export function createNaverSearchAdSignature(input: {
  readonly secretKey: string;
  readonly timestamp: string;
  readonly method: string;
  readonly uri: string;
}) {
  return createHmac("sha256", input.secretKey)
    .update(`${input.timestamp}.${input.method}.${input.uri}`)
    .digest("base64");
}

export function createNaverSearchAdHeaders(
  credentials: NaverSearchAdCredentials,
  input: { readonly method: string; readonly uri: string; readonly timestamp?: string }
) {
  const timestamp = input.timestamp ?? String(Date.now());
  return {
    "X-API-KEY": credentials.accessLicense,
    "X-Customer": credentials.customerId,
    "X-Signature": createNaverSearchAdSignature({
      method: input.method,
      secretKey: credentials.secretKey,
      timestamp,
      uri: input.uri
    }),
    "X-Timestamp": timestamp
  };
}

/** 네이버는 10 미만을 "< 10" 문자열로 준다. 상한값 9 로 읽는다(근거 하한 100 에는 영향 없음). */
export function parseNaverQcCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^<\s*10$/u.test(trimmed)) {
      return 9;
    }
    const parsed = Number(trimmed.replace(/,/gu, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return 0;
}

export function parseNaverKeywordToolResponse(body: unknown): KeywordVolume[] {
  const list = (body as { keywordList?: unknown })?.keywordList;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((row) => {
    const record = row as { relKeyword?: unknown; monthlyPcQcCnt?: unknown; monthlyMobileQcCnt?: unknown };
    if (typeof record.relKeyword !== "string" || record.relKeyword.length === 0) {
      return [];
    }
    return [
      {
        keyword: record.relKeyword,
        monthlyMobile: parseNaverQcCount(record.monthlyMobileQcCnt),
        monthlyPc: parseNaverQcCount(record.monthlyPcQcCnt)
      }
    ];
  });
}

export function classifyKeywordVolumeTier(volume: Pick<KeywordVolume, "monthlyPc" | "monthlyMobile">) {
  return volume.monthlyPc + volume.monthlyMobile >= KEYWORD_EVIDENCE_MIN_MONTHLY_VOLUME ? "evidence" : "exploratory";
}

export function createNaverSearchAdClient(options: {
  readonly credentials: NaverSearchAdCredentials;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly now?: () => number;
}): NaverSearchAdClient {
  const fetchFn = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  return {
    mode: "live",
    async fetchKeywordVolumes(hintKeywords) {
      const results: KeywordVolume[] = [];
      for (let index = 0; index < hintKeywords.length; index += NAVER_SEARCHAD_HINT_LIMIT) {
        const chunk = hintKeywords.slice(index, index + NAVER_SEARCHAD_HINT_LIMIT);
        const uri = "/keywordstool";
        const url = new URL(uri, NAVER_SEARCHAD_BASE_URL);
        url.searchParams.set("hintKeywords", chunk.map((keyword) => keyword.replace(/\s+/gu, "")).join(","));
        url.searchParams.set("showDetail", "1");
        const response = await fetchFn(url, {
          headers: createNaverSearchAdHeaders(options.credentials, { method: "GET", timestamp: String(now()), uri }),
          method: "GET"
        });
        if (!response.ok) {
          throw new Error(`Naver SearchAd keywordstool failed with HTTP ${response.status}`);
        }
        results.push(...parseNaverKeywordToolResponse(await response.json()));
      }
      return results;
    }
  };
}

/** 결정적 fixture: 글자 수 기반 가짜 검색량. 테스트·데모 전용, DB 에 쓰지 않는다. */
export function createFixtureNaverSearchAdClient(): NaverSearchAdClient {
  return {
    mode: "fixture",
    async fetchKeywordVolumes(hintKeywords) {
      return hintKeywords.map((keyword) => {
        const seed = [...keyword].reduce((total, char) => total + char.charCodeAt(0), 0);
        return { keyword, monthlyMobile: (seed * 7) % 900, monthlyPc: (seed * 3) % 300 };
      });
    }
  };
}

export function createNaverSearchAdClientFromEnv(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): NaverSearchAdClient | null {
  const customerId = env.SEARCHOPS_NAVER_SEARCHAD_CUSTOMER_ID;
  const accessLicense = env.SEARCHOPS_NAVER_SEARCHAD_ACCESS_LICENSE;
  const secretKey = env.SEARCHOPS_NAVER_SEARCHAD_SECRET_KEY;
  if (!customerId || !accessLicense || !secretKey) {
    return null;
  }
  return createNaverSearchAdClient({ credentials: { accessLicense, customerId, secretKey }, fetchImpl });
}
