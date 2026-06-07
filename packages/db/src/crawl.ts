import {
  CrawlJobResultSchema,
  JsonLdRecommendationSetSchema,
  SeoIssueDraftSchema,
  WorkOrderDraftSchema,
  type CrawlJobPageInput,
  type CrawlJobResult,
  type CrawlerPageSnapshot,
  type JsonLdRecommendationSet,
  type SeoIssueDraft,
  type WorkOrderDraft
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

export interface CrawlRunUpdateArgs {
  where: {
    id: string;
  };
  data: {
    status: string;
    endedAt: Date;
    summary: Prisma.InputJsonValue;
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

export interface SiteFindUniqueArgs {
  where: {
    id: string;
  };
}

export interface UrlRecordFindUniqueArgs {
  where: {
    siteId_url: {
      siteId: string;
      url: string;
    };
  };
}

export interface SeoIssueUpsertArgs {
  where: {
    crawlRunId_urlRecordId_ruleId: {
      crawlRunId: string;
      urlRecordId: string;
      ruleId: string;
    };
  };
  create: {
    crawlRunId: string;
    urlRecordId: string | null;
    ruleId: string;
    severity: string;
    status: string;
    title: string;
    evidence: Prisma.InputJsonValue;
  };
  update: {
    severity: string;
    title: string;
    evidence: Prisma.InputJsonValue;
  };
}

export interface WorkOrderUpsertArgs {
  where: {
    seoIssueId: string;
  };
  create: {
    organizationId: string;
    siteId: string;
    seoIssueId: string;
    status: string;
    priority: string;
    title: string;
    description: string | null;
    problem: string;
    evidence: Prisma.InputJsonValue;
    impact: string;
    instructions: Prisma.InputJsonValue;
    ownerType: string;
    acceptanceCriteria: Prisma.InputJsonValue;
    verificationMethod: string;
    estimatedEffort: string;
    relatedIssues: Prisma.InputJsonValue;
    assignedTo: string | null;
    dueDate: Date | null;
  };
  update: {
    priority: string;
    title: string;
    description: string | null;
    problem: string;
    evidence: Prisma.InputJsonValue;
    impact: string;
    instructions: Prisma.InputJsonValue;
    ownerType: string;
    acceptanceCriteria: Prisma.InputJsonValue;
    verificationMethod: string;
    estimatedEffort: string;
    relatedIssues: Prisma.InputJsonValue;
  };
}

export interface SchemaRecommendationUpsertArgs {
  where: {
    siteId_pageUrl_type: {
      siteId: string;
      pageUrl: string;
      type: string;
    };
  };
  create: {
    siteId: string;
    pageUrl: string;
    type: string;
    priority: string;
    status: string;
    reason: string;
    evidence: Prisma.InputJsonValue;
    jsonLd: Prisma.InputJsonValue;
    instructions: Prisma.InputJsonValue;
    requiredFields: Prisma.InputJsonValue;
    recommendedFields: Prisma.InputJsonValue;
    generatedBy: "deterministic";
  };
  update: {
    priority: string;
    reason: string;
    evidence: Prisma.InputJsonValue;
    jsonLd: Prisma.InputJsonValue;
    instructions: Prisma.InputJsonValue;
    requiredFields: Prisma.InputJsonValue;
    recommendedFields: Prisma.InputJsonValue;
    generatedBy: "deterministic";
  };
}

export interface CrawlAnalysisPersistenceClient {
  site: {
    findUnique(args: SiteFindUniqueArgs): Promise<{ id: string; organizationId: string } | null>;
  };
  urlRecord: {
    findUnique(args: UrlRecordFindUniqueArgs): Promise<{ id: string } | null>;
  };
  seoIssue: {
    upsert(args: SeoIssueUpsertArgs): Promise<{ id: string }>;
  };
  workOrder: {
    upsert(args: WorkOrderUpsertArgs): Promise<unknown>;
  };
  schemaRecommendation: {
    upsert(args: SchemaRecommendationUpsertArgs): Promise<unknown>;
  };
}

export interface PersistCrawlAnalysisInput {
  crawlRunId: string;
  siteId: string;
  seoIssueWorkOrders: readonly {
    issue: SeoIssueDraft;
    workOrder?: WorkOrderDraft | null;
  }[];
  schemaRecommendationSets: readonly JsonLdRecommendationSet[];
}

export interface PersistCrawlAnalysisOutput {
  seoIssuesUpserted: number;
  workOrdersUpserted: number;
  schemaRecommendationsUpserted: number;
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

export function createPrismaCrawlAnalysisPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "schemaRecommendation" | "seoIssue" | "site" | "urlRecord" | "workOrder">,
): CrawlAnalysisPersistenceClient {
  return {
    schemaRecommendation: {
      async upsert(args) {
        return prisma.schemaRecommendation.upsert(args);
      }
    },
    seoIssue: {
      async upsert(args) {
        return prisma.seoIssue.upsert(args);
      }
    },
    site: {
      async findUnique(args) {
        return prisma.site.findUnique({
          select: {
            id: true,
            organizationId: true
          },
          where: args.where
        });
      }
    },
    urlRecord: {
      async findUnique(args) {
        return prisma.urlRecord.findUnique({
          select: {
            id: true
          },
          where: args.where
        });
      }
    },
    workOrder: {
      async upsert(args) {
        return prisma.workOrder.upsert(args);
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

export async function persistCrawlAnalysisResult(
  client: CrawlAnalysisPersistenceClient,
  input: PersistCrawlAnalysisInput,
): Promise<PersistCrawlAnalysisOutput> {
  const site = await client.site.findUnique({
    where: {
      id: input.siteId
    }
  });
  if (site === null) {
    throw new Error(`Site not found for crawl analysis: ${input.siteId}`);
  }

  let seoIssuesUpserted = 0;
  let workOrdersUpserted = 0;
  for (const pair of input.seoIssueWorkOrders) {
    const issue = SeoIssueDraftSchema.parse(pair.issue);
    const urlRecord = await client.urlRecord.findUnique({
      where: {
        siteId_url: {
          siteId: input.siteId,
          url: issue.evidence.url
        }
      }
    });
    if (urlRecord === null) {
      continue;
    }

    const savedIssue = await client.seoIssue.upsert(
      buildSeoIssueUpsertArgs({
        crawlRunId: input.crawlRunId,
        issue,
        urlRecordId: urlRecord.id
      }),
    );
    seoIssuesUpserted += 1;

    if (pair.workOrder === undefined || pair.workOrder === null) {
      continue;
    }

    const workOrder = WorkOrderDraftSchema.parse(pair.workOrder);
    await client.workOrder.upsert(
      buildSeoIssueWorkOrderUpsertArgs({
        organizationId: site.organizationId,
        seoIssueId: savedIssue.id,
        siteId: input.siteId,
        workOrder
      }),
    );
    workOrdersUpserted += 1;
  }

  let schemaRecommendationsUpserted = 0;
  for (const set of input.schemaRecommendationSets.map((item) =>
    JsonLdRecommendationSetSchema.parse(item),
  )) {
    if (set.siteId !== input.siteId) {
      throw new Error(`Schema recommendation set site mismatch: ${set.siteId}`);
    }

    for (const recommendation of set.recommendations) {
      await client.schemaRecommendation.upsert(
        buildSchemaRecommendationUpsertArgs({
          recommendation,
          set,
          siteId: input.siteId
        }),
      );
      schemaRecommendationsUpserted += 1;
    }
  }

  return {
    schemaRecommendationsUpserted,
    seoIssuesUpserted,
    workOrdersUpserted
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

function buildSeoIssueUpsertArgs(input: {
  crawlRunId: string;
  issue: SeoIssueDraft;
  urlRecordId: string;
}): SeoIssueUpsertArgs {
  return {
    where: {
      crawlRunId_urlRecordId_ruleId: {
        crawlRunId: input.crawlRunId,
        ruleId: input.issue.ruleId,
        urlRecordId: input.urlRecordId
      }
    },
    create: {
      crawlRunId: input.crawlRunId,
      evidence: toPrismaJson(input.issue.evidence),
      ruleId: input.issue.ruleId,
      severity: input.issue.severity,
      status: "open",
      title: input.issue.title,
      urlRecordId: input.urlRecordId
    },
    update: {
      evidence: toPrismaJson(input.issue.evidence),
      severity: input.issue.severity,
      title: input.issue.title
    }
  };
}

function buildSeoIssueWorkOrderUpsertArgs(input: {
  organizationId: string;
  siteId: string;
  seoIssueId: string;
  workOrder: WorkOrderDraft;
}): WorkOrderUpsertArgs {
  const record = {
    acceptanceCriteria: toPrismaJson(input.workOrder.acceptanceCriteria),
    description: null,
    estimatedEffort: input.workOrder.estimatedEffort,
    evidence: toPrismaJson(input.workOrder.evidence),
    impact: input.workOrder.impact,
    instructions: toPrismaJson(input.workOrder.instructions),
    ownerType: input.workOrder.ownerType,
    priority: input.workOrder.priority,
    problem: input.workOrder.problem,
    relatedIssues: toPrismaJson(input.workOrder.relatedIssues),
    title: input.workOrder.title,
    verificationMethod: input.workOrder.verificationMethod
  };

  return {
    where: {
      seoIssueId: input.seoIssueId
    },
    create: {
      ...record,
      assignedTo: null,
      dueDate: null,
      organizationId: input.organizationId,
      seoIssueId: input.seoIssueId,
      siteId: input.siteId,
      status: "open"
    },
    update: record
  };
}

function buildSchemaRecommendationUpsertArgs(input: {
  siteId: string;
  set: JsonLdRecommendationSet;
  recommendation: JsonLdRecommendationSet["recommendations"][number];
}): SchemaRecommendationUpsertArgs {
  const record = {
    evidence: toPrismaJson(input.recommendation.evidence),
    generatedBy: "deterministic" as const,
    instructions: toPrismaJson(input.recommendation.instructions),
    jsonLd: toPrismaJson(input.recommendation.jsonLd),
    priority: input.recommendation.priority,
    reason: input.recommendation.reason,
    recommendedFields: toPrismaJson(input.recommendation.recommendedFields),
    requiredFields: toPrismaJson(input.recommendation.requiredFields)
  };

  return {
    where: {
      siteId_pageUrl_type: {
        pageUrl: input.set.pageUrl,
        siteId: input.siteId,
        type: input.recommendation.type
      }
    },
    create: {
      ...record,
      pageUrl: input.set.pageUrl,
      siteId: input.siteId,
      status: "open",
      type: input.recommendation.type
    },
    update: record
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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
