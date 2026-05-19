import { PageSnapshotSchema } from "@searchops/types";

export { crawlSite } from "./crawl.js";
export { fetchUrl, isHtmlFetchResult } from "./fetch.js";
export { parseHtml } from "./html.js";
export { isPathAllowedByRobots, parseRobotsTxt } from "./robots.js";
export { isBlockedHostname, isHostnameWithinDomain, isUrlAllowedForCrawl } from "./scope.js";
export { extractSeoSignals } from "./signals.js";
export { parseSitemapXml } from "./sitemap.js";
export { classifyInternalLink, normalizeUrl } from "./url.js";
export type { CrawlSiteInput } from "./crawl.js";
export type { FetchUrlInput, FetchUrlResult } from "./fetch.js";
export type { ExtractSeoSignalsInput } from "./signals.js";

export const crawlerCorePackage = "crawler-core" as const;

export function createPlaceholderSnapshot(url: string) {
  return PageSnapshotSchema.parse({
    url,
    h1Count: 0
  });
}
