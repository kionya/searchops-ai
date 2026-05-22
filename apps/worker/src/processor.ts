import {
  syncFixtureConnectors,
  type ConnectorBatchSyncRequest,
  type ConnectorBatchSyncResult
} from "@searchops/connectors";
import { crawlSite, extractSeoSignals, type CrawlSiteInput } from "@searchops/crawler-core";
import { markCrawlRunFailed, persistCrawlJobResult, type CrawlPersistenceClient } from "@searchops/db";
import {
  ConnectorSyncJobPayloadSchema,
  CrawlJobPayloadSchema,
  CrawlJobResultSchema,
  type ConnectorSyncJobPayload,
  type CrawlJobPageInput,
  type CrawlJobPayload,
  type CrawlJobResult
} from "@searchops/types";

export interface ProcessAndPersistCrawlJobOptions {
  readonly crawlSite?: (input: CrawlSiteInput) => Promise<CrawlJobPageInput[]>;
}

export interface ProcessConnectorSyncJobOptions {
  readonly syncConnectors?: (input: ConnectorBatchSyncRequest) => Promise<ConnectorBatchSyncResult>;
}

export interface ConnectorSyncJobResult extends ConnectorBatchSyncResult {
  readonly fetchedAt: string;
  readonly organizationId: string;
  readonly requestedByUserId: string;
  readonly siteDomain: string;
  readonly siteId: string;
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

export async function processConnectorSyncJob(
  input: ConnectorSyncJobPayload,
  options: ProcessConnectorSyncJobOptions = {},
): Promise<ConnectorSyncJobResult> {
  const payload = ConnectorSyncJobPayloadSchema.parse(input);
  const result = await (options.syncConnectors ?? syncFixtureConnectors)({
    fetchedAt: payload.fetchedAt,
    providers: payload.providers
  });

  return {
    fetchedAt: payload.fetchedAt,
    organizationId: payload.organizationId,
    requestedByUserId: payload.requestedByUserId,
    siteDomain: payload.siteDomain,
    siteId: payload.siteId,
    results: result.results,
    summary: result.summary
  };
}

export async function processAndPersistCrawlJob(
  input: CrawlJobPayload,
  persistenceClient: CrawlPersistenceClient,
  options: ProcessAndPersistCrawlJobOptions = {},
): Promise<CrawlJobResult> {
  let payload = CrawlJobPayloadSchema.parse(input);
  try {
    if (payload.pages.length === 0) {
      const pages = await (options.crawlSite ?? crawlSite)({
        maxPages: payload.maxPages,
        siteDomain: payload.siteDomain,
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
  } catch (error) {
    await markCrawlRunFailed(persistenceClient, {
      crawlRunId: payload.crawlRunId,
      error
    });
    throw error;
  }
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
