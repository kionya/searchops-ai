import type { CrawlJobPageInput } from "@searchops/types";

import { fetchUrl, isHtmlFetchResult, type FetchUrlInput, type FetchUrlResult } from "./fetch.js";
import { extractSeoSignals } from "./signals.js";
import { isPathAllowedByRobots, parseRobotsTxt } from "./robots.js";
import { isUrlAllowedForCrawl } from "./scope.js";
import { parseSitemapXml } from "./sitemap.js";
import { normalizeUrl } from "./url.js";

export interface CrawlSiteInput {
  readonly startUrl: string;
  readonly siteDomain: string;
  readonly maxPages: number;
  readonly fetchImpl?: typeof fetch;
  readonly fetchUrlImpl?: (input: FetchUrlInput) => Promise<FetchUrlResult>;
  readonly maxSitemaps?: number;
  readonly timeoutMs?: number;
}

const defaultMaxSitemaps = 2;

export async function crawlSite(input: CrawlSiteInput): Promise<CrawlJobPageInput[]> {
  const startUrl = normalizeUrl(input.startUrl);
  if (!isUrlAllowedForCrawl(startUrl, input.siteDomain)) {
    throw new Error(`Start URL is outside the allowed crawl scope: ${startUrl}`);
  }

  const maxPages = Math.max(0, input.maxPages);
  if (maxPages === 0) {
    return [];
  }

  const fetchUrlImpl = input.fetchUrlImpl ?? fetchUrl;
  const robots = await fetchRobotsTxt({ ...input, startUrl, fetchUrlImpl });
  const queue = await discoverInitialQueue({ ...input, startUrl, fetchUrlImpl, robots });
  const seen = new Set<string>();
  const pages: CrawlJobPageInput[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const nextUrl = queue.shift();
    if (nextUrl === undefined) {
      break;
    }

    const normalized = normalizeUrl(nextUrl, startUrl);
    if (seen.has(normalized) || !isUrlAllowedForCrawl(normalized, input.siteDomain)) {
      continue;
    }
    seen.add(normalized);

    const pathname = new URL(normalized).pathname;
    if (robots !== null && !isPathAllowedByRobots(robots, pathname)) {
      continue;
    }

    const fetched = await fetchUrlImpl({
      ...createFetchOptions(input),
      url: normalized
    });
    const finalUrl = normalizeUrl(fetched.finalUrl, normalized);
    if (!isUrlAllowedForCrawl(finalUrl, input.siteDomain)) {
      continue;
    }
    if (!isHtmlFetchResult(fetched) || fetched.body.trim().length === 0) {
      continue;
    }

    const page: CrawlJobPageInput = {
      url: normalized,
      html: fetched.body,
      statusCode: fetched.statusCode,
      ...(finalUrl === normalized ? {} : { finalUrl })
    };
    pages.push(page);

    const signals = extractSeoSignals({
      url: page.url,
      html: page.html,
      robotsBlocked: false,
      ...(page.finalUrl === undefined ? {} : { finalUrl: page.finalUrl })
    });
    for (const link of [...signals.links.internal, ...signals.links.external]) {
      if (
        !seen.has(link.url) &&
        isUrlAllowedForCrawl(link.url, input.siteDomain) &&
        queue.length + pages.length < maxPages * 5
      ) {
        queue.push(link.url);
      }
    }
  }

  return pages;
}

async function fetchRobotsTxt(input: CrawlSiteInput & {
  readonly fetchUrlImpl: (input: FetchUrlInput) => Promise<FetchUrlResult>;
  readonly startUrl: string;
}) {
  const robotsUrl = new URL("/robots.txt", input.startUrl).toString();
  try {
    const fetched = await input.fetchUrlImpl({
      ...createFetchOptions(input),
      url: robotsUrl
    });
    return fetched.statusCode >= 200 && fetched.statusCode < 300 ? parseRobotsTxt(fetched.body) : null;
  } catch {
    return null;
  }
}

async function discoverInitialQueue(input: CrawlSiteInput & {
  readonly fetchUrlImpl: (input: FetchUrlInput) => Promise<FetchUrlResult>;
  readonly robots: ReturnType<typeof parseRobotsTxt> | null;
  readonly startUrl: string;
}) {
  const queue = [input.startUrl];
  if (input.robots === null) {
    return queue;
  }

  const sitemapUrls = input.robots.sitemaps.slice(0, input.maxSitemaps ?? defaultMaxSitemaps);
  for (const sitemapUrl of sitemapUrls) {
    if (!isUrlAllowedForCrawl(sitemapUrl, input.siteDomain)) {
      continue;
    }

    try {
      const fetched = await input.fetchUrlImpl({
        ...createFetchOptions(input),
        url: sitemapUrl
      });
      if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
        continue;
      }

      const parsed = parseSitemapXml(fetched.body);
      for (const entry of parsed.urls) {
        if (isUrlAllowedForCrawl(entry.loc, input.siteDomain)) {
          queue.push(entry.loc);
        }
      }
    } catch {
      continue;
    }
  }

  return [...new Set(queue)];
}

function createFetchOptions(input: Pick<CrawlSiteInput, "fetchImpl" | "siteDomain" | "timeoutMs">) {
  return {
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    isRedirectAllowed: (url: string) => isUrlAllowedForCrawl(url, input.siteDomain),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs })
  };
}
