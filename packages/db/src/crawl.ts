import {
  CrawlJobResultSchema,
  type CrawlJobPageInput,
  type CrawlJobResult,
  type CrawlerPageSnapshot
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";

export interface CrawlRunUpdateArgs {
  where: {
    id: string;
  };
  data: {
    status: string;
    endedAt: Date;
    summary: Record<string, unknown>;
  };
}

export interface UrlRecordUpsertArgs {
  where: {
    siteId_url: {
      siteId: string;
      url: string;
    };
  };
  create: {
    siteId: string;
    crawlRunId: string;
    url: string;
    statusCode: number | null;
    title: string | null;
    metaDescription: string | null;
  };
  update: {
    crawlRunId: string;
    statusCode: number | null;
    title: string | null;
    metaDescription: string | null;
  };
}

export interface CrawlPersistenceClient {
  crawlRun: {
    update(args: CrawlRunUpdateArgs): Promise<unknown>;
  };
  urlRecord: {
    upsert(args: UrlRecordUpsertArgs): Promise<unknown>;
  };
}

export interface PersistCrawlJobResultOutput {
  crawlRunId: string;
  siteId: string;
  status: string;
  urlRecordsUpserted: number;
}

export interface MarkCrawlRunFailedOutput {
  crawlRunId: string;
  status: "failed";
}

export function createPrismaCrawlPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "crawlRun" | "urlRecord">,
): CrawlPersistenceClient {
  return {
    crawlRun: {
      async update(args) {
        return prisma.crawlRun.update(args);
      }
    },
    urlRecord: {
      async upsert(args) {
        return prisma.urlRecord.upsert(args);
      }
    }
  };
}

export async function persistCrawlJobResult(
  client: CrawlPersistenceClient,
  input: CrawlJobResult,
  sourcePages: readonly CrawlJobPageInput[] = [],
): Promise<PersistCrawlJobResultOutput> {
  const result = CrawlJobResultSchema.parse(input);
  const statusCodes = createStatusCodeLookup(sourcePages);

  for (const snapshot of result.snapshots) {
    await client.urlRecord.upsert(
      buildUrlRecordUpsertArgs({
        crawlRunId: result.crawlRunId,
        siteId: result.siteId,
        snapshot,
        statusCode: statusCodes.get(snapshot.url) ?? null
      }),
    );
  }

  await client.crawlRun.update({
    where: {
      id: result.crawlRunId
    },
    data: {
      status: result.status,
      endedAt: new Date(),
      summary: {
        ...result.summary
      }
    }
  });

  return {
    crawlRunId: result.crawlRunId,
    siteId: result.siteId,
    status: result.status,
    urlRecordsUpserted: result.snapshots.length
  };
}

export async function markCrawlRunFailed(
  client: CrawlPersistenceClient,
  input: {
    crawlRunId: string;
    error: unknown;
  },
): Promise<MarkCrawlRunFailedOutput> {
  await client.crawlRun.update({
    where: {
      id: input.crawlRunId
    },
    data: {
      status: "failed",
      endedAt: new Date(),
      summary: {
        error: serializeError(input.error)
      }
    }
  });

  return {
    crawlRunId: input.crawlRunId,
    status: "failed"
  };
}

export function buildUrlRecordUpsertArgs(input: {
  crawlRunId: string;
  siteId: string;
  snapshot: CrawlerPageSnapshot;
  statusCode: number | null;
}): UrlRecordUpsertArgs {
  const record = {
    crawlRunId: input.crawlRunId,
    statusCode: input.statusCode,
    title: input.snapshot.title,
    metaDescription: input.snapshot.metaDescription
  };

  return {
    where: {
      siteId_url: {
        siteId: input.siteId,
        url: input.snapshot.url
      }
    },
    create: {
      siteId: input.siteId,
      url: input.snapshot.url,
      ...record
    },
    update: record
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    };
  }

  return {
    message: String(error),
    name: "Error"
  };
}

function createStatusCodeLookup(sourcePages: readonly CrawlJobPageInput[]) {
  const statusCodes = new Map<string, number | null>();
  for (const page of sourcePages) {
    statusCodes.set(page.url, page.statusCode);
    if (page.finalUrl !== undefined) {
      statusCodes.set(page.finalUrl, page.statusCode);
    }
  }

  return statusCodes;
}
