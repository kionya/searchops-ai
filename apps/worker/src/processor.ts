import { crawlSite, extractSeoSignals, type CrawlSiteInput } from "@searchops/crawler-core";
import { persistCrawlJobResult, type CrawlPersistenceClient } from "@searchops/db";
import {
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  type CrawlJobPageInput,
  type CrawlJobPayload,
  type CrawlJobResult
} from "@searchops/types";

export interface ProcessAndPersistCrawlJobOptions {
  readonly crawlSite?: (input: CrawlSiteInput) => Promise<CrawlJobPageInput[]>;
}

export function processCrawlJob(input: CrawlJobPayload): CrawlJobResult {
  const payload = CrawlJobPayloadSchema.parse(input);
  const pagesToProcess = payload.pages.slice(0, payload.maxPages);
  const snapshots = pagesToProcess.map((page) => extractPageSignals(page));
  const summary = {
    pagesRequested: payload.pages.length,
    pagesProcessed: snapshots.length,
    internalLinks: snapshots.reduce((sum, snapshot) => sum + snapshot.links.internal.length, 0),
    externalLinks: snapshots.reduce((sum, snapshot) => sum + snapshot.links.external.length, 0),
    images: snapshots.reduce((sum, snapshot) => sum + snapshot.images.length, 0),
    jsonLdBlocks: snapshots.reduce((sum, snapshot) => sum + snapshot.jsonLd.length, 0),
    noindexPages: snapshots.filter((snapshot) => snapshot.indexability.noindex).length
  };

  return CrawlJobResultSchema.parse({
    crawlRunId: payload.crawlRunId,
    siteId: payload.siteId,
    status: snapshots.length > 0 ? "completed" : "empty",
    snapshots,
    summary
  });
}

export async function processAndPersistCrawlJob(
  input: CrawlJobPayload,
  persistenceClient: CrawlPersistenceClient,
  options: ProcessAndPersistCrawlJobOptions = {},
): Promise<CrawlJobResult> {
  let payload = CrawlJobPayloadSchema.parse(input);
  if (payload.pages.length === 0) {
    const pages = await (options.crawlSite ?? crawlSite)({
      maxPages: payload.maxPages,
      startUrl: payload.startUrl
    });
    payload = {
      ...payload,
      pages
    };
  }

  const result = processCrawlJob(payload);
  await persistCrawlJobResult(persistenceClient, result, payload.pages);
  return result;
}

function extractPageSignals(page: CrawlJobPageInput) {
  if (page.finalUrl === undefined) {
    return extractSeoSignals({
      url: page.url,
      html: page.html
    });
  }

  return extractSeoSignals({
    url: page.url,
    finalUrl: page.finalUrl,
    html: page.html
  });
}
