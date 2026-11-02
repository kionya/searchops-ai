import { createDecipheriv } from "node:crypto";

export interface FetchUrlInput {
  readonly url: string;
  readonly fetchImpl?: typeof fetch;
  readonly isRedirectAllowed?: (url: string) => boolean;
  readonly maxBodyBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
}

export interface FetchUrlResult {
  readonly url: string;
  readonly finalUrl: string;
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly body: string;
  readonly truncated: boolean;
}

const defaultMaxBodyBytes = 1_000_000;
const defaultMaxRedirects = 5;
const defaultTimeoutMs = 10_000;
const defaultUserAgent = "SearchOpsAI-Crawler/0.1";

// ponytail: 프로세스 전역 캐시(호스트에서 www 를 뗀 키). 배치 1회 = 프로세스 1개라 충분하다.
const challengeCookies = new Map<string, string>();

/**
 * 호스팅 앞단의 nginx testcookie 모듈(암호화 모드)은 해외 IP 에 쿠키 확인 페이지를 준다.
 * 키·IV·암호문이 페이지에 그대로 있으므로 AES-128-CBC 로 풀어 쿠키를 붙이고 한 번만 다시 요청한다.
 */
export async function fetchUrl(input: FetchUrlInput): Promise<FetchUrlResult> {
  const first = await fetchOnce(input);
  const cookie = solveTestCookieChallenge(first.body);
  if (cookie === null) {
    return first;
  }
  challengeCookies.set(cookieKey(first.finalUrl), cookie);
  return fetchOnce(input);
}

export function solveTestCookieChallenge(body: string): string | null {
  if (body.length > 4096 || !body.includes("slowAES.decrypt")) {
    return null;
  }
  const name = body.match(/document\.cookie="([A-Za-z0-9_]+)="/)?.[1];
  const parts = [...body.matchAll(/toNumbers\("([0-9a-f]{32})"\)/g)].map((match) => Buffer.from(match[1] ?? "", "hex"));
  const [key, iv, data] = parts;
  if (name === undefined || parts.length !== 3 || key === undefined || iv === undefined || data === undefined) {
    return null;
  }
  const decipher = createDecipheriv("aes-128-cbc", key, iv).setAutoPadding(false);
  return `${name}=${Buffer.concat([decipher.update(data), decipher.final()]).toString("hex")}`;
}

function cookieKey(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function fetchOnce(input: FetchUrlInput): Promise<FetchUrlResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new Error("No fetch implementation is available in this runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? defaultTimeoutMs);

  try {
    let currentUrl = input.url;
    let response: Response | null = null;
    const maxRedirects = input.maxRedirects ?? defaultMaxRedirects;

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const cookie = challengeCookies.get(cookieKey(currentUrl));
      response = await fetchImpl(currentUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
          "user-agent": input.userAgent ?? defaultUserAgent,
          ...(cookie === undefined ? {} : { cookie })
        },
        redirect: "manual",
        signal: controller.signal
      });

      const location = response.headers.get("location");
      if (!isRedirectResponse(response.status) || location === null) {
        break;
      }

      const redirectUrl = new URL(location, currentUrl).toString();
      if (input.isRedirectAllowed !== undefined && !input.isRedirectAllowed(redirectUrl)) {
        throw new Error(`Redirect target is outside the allowed crawl scope: ${redirectUrl}`);
      }

      currentUrl = redirectUrl;
    }

    if (response === null || isRedirectResponse(response.status)) {
      throw new Error(`Too many redirects while fetching ${input.url}`);
    }

    const maxBodyBytes = input.maxBodyBytes ?? defaultMaxBodyBytes;
    const { body, truncated } = await readResponseBody(response, maxBodyBytes);

    return {
      url: input.url,
      finalUrl: response.url || currentUrl,
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      body: truncated ? body.slice(0, maxBodyBytes) : body,
      truncated
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRedirectResponse(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}

async function readResponseBody(response: Response, maxBodyBytes: number) {
  if (response.body === null) {
    const body = await response.text();
    return {
      body: body.slice(0, maxBodyBytes),
      truncated: body.length > maxBodyBytes
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }

    const remainingBytes = maxBodyBytes - bytesRead;
    if (remainingBytes <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }

    const chunk = next.value;
    if (chunk.byteLength > remainingBytes) {
      body += decoder.decode(chunk.slice(0, remainingBytes), { stream: true });
      truncated = true;
      await reader.cancel();
      break;
    }

    bytesRead += chunk.byteLength;
    body += decoder.decode(chunk, { stream: true });
  }

  body += decoder.decode();
  return { body, truncated };
}

export function isHtmlFetchResult(result: FetchUrlResult): boolean {
  const contentType = result.contentType?.split(";")[0]?.trim().toLowerCase();
  return (
    contentType === null ||
    contentType === undefined ||
    contentType === "" ||
    contentType === "text/html" ||
    contentType === "application/xhtml+xml"
  );
}
