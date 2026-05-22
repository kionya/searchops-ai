export const dbPackage = "db" as const;

export const prismaSchemaPath = "packages/db/prisma/schema.prisma" as const;

export {
  createSearchOpsPrismaClient,
  type SearchOpsPrismaClient
} from "./client.js";

export {
  buildUrlRecordUpsertArgs,
  createPrismaCrawlPersistenceClient,
  markCrawlRunFailed,
  persistCrawlJobResult,
  type CrawlPersistenceClient,
  type CrawlRunUpdateArgs,
  type MarkCrawlRunFailedOutput,
  type PersistCrawlJobResultOutput,
  type UrlRecordUpsertArgs
} from "./crawl.js";

export {
  buildConnectorSyncResultUpsertArgs,
  classifyConnectorSyncRunStatus,
  createConnectorSyncRun,
  createPrismaConnectorSyncPersistenceClient,
  markConnectorSyncRunFailed,
  persistConnectorSyncJobResult,
  type ConnectorSyncPersistenceClient,
  type ConnectorSyncResultUpsertArgs,
  type ConnectorSyncRunCreateArgs,
  type ConnectorSyncRunUpdateArgs,
  type MarkConnectorSyncRunFailedOutput,
  type PersistConnectorSyncJobResultOutput
} from "./connector-sync.js";

export const phaseOneSeedIds = {
  organizationId: "org_demo",
  userId: "user_demo_owner",
  siteId: "site_demo_rejuel",
  crawlRunId: "crawl_demo_initial"
} as const;
