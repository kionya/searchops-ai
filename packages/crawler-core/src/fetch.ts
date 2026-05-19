export interface FetchUrlInput {
  readonly url: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxBodyBytes?: number;
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
const defaultTimeoutMs = 10_000;
const defaultUserAgent = "SearchOpsAI-Crawler/0.1";

export async function fetchUrl(input: FetchUrlInput): Promise<FetchUrlResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new Error("No fetch implementation is available in this runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? defaultTimeoutMs);

  try {
    const response = await fetchImpl(input.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": input.userAgent ?? defaultUserAgent
      },
      redirect: "follow",
      signal: controller.signal
    });
    const maxBodyBytes = input.maxBodyBytes ?? defaultMaxBodyBytes;
    const { body, truncated } = await readResponseBody(response, maxBodyBytes);

    return {
      url: input.url,
      finalUrl: response.url || input.url,
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      body: truncated ? body.slice(0, maxBodyBytes) : body,
      truncated
    };
  } finally {
    clearTimeout(timeout);
  }
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
