export const dbPackage = "db" as const;

export const prismaSchemaPath = "packages/db/prisma/schema.prisma" as const;

export {
  createSearchOpsPrismaClient,
  type SearchOpsPrismaClient
} from "./client.js";
export type { Prisma } from "./generated/prisma/index.js";

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
  listConnectorOAuthCredentialsForSync,
  markConnectorSyncRunFailed,
  persistConnectorSyncJobResult,
  updateConnectorOAuthCredentialForSync,
  type ConnectorOAuthCredentialUpdateArgs,
  type ConnectorOAuthCredentialFindManyArgs,
  type ConnectorOAuthCredentialForSync,
  type ConnectorSyncPersistenceClient,
  type ConnectorSyncResultUpsertArgs,
  type ConnectorSyncRunCreateArgs,
  type ConnectorSyncRunUpdateArgs,
  type MarkConnectorSyncRunFailedOutput,
  type PersistConnectorSyncJobResultOutput
} from "./connector-sync.js";

export {
  createPrismaSchemaRecommendationRecheckPersistenceClient,
  persistSchemaRecommendationRecheck,
  type PersistSchemaRecommendationRecheckInput,
  type PersistSchemaRecommendationRecheckOutput,
  type SchemaRecommendationRecheckFindUniqueArgs,
  type SchemaRecommendationRecheckPersistenceClient,
  type SchemaRecommendationRecheckRecord,
  type SchemaRecommendationRecheckUpdateArgs,
  type SchemaRecommendationRecheckUpdateRecord,
  type SchemaRecommendationRecheckWorkOrderRecord,
  type SchemaRecommendationWorkOrderUpdateArgs
} from "./schema-recommendation.js";

export {
  createPrismaSchemaRichResultValidationPersistenceClient,
  mergeValidationIntoEvidence,
  persistSchemaRichResultValidationJobResult,
  type PersistSchemaRichResultValidationOutput,
  type SchemaRichResultValidationPersistenceClient
} from "./schema-rich-result-validation.js";

export {
  buildGeoVisibilityReportCreateArgs,
  createPrismaGeoVisibilityPersistenceClient,
  persistGeoAnswerMonitorJobResult,
  type GeoVisibilityPersistenceClient,
  type GeoVisibilityReportCreateArgs,
  type PersistGeoAnswerMonitorJobResultOutput
} from "./geo-visibility.js";

export const phaseOneSeedIds = {
  organizationId: "org_demo",
  userId: "user_demo_owner",
  siteId: "site_demo_rejuel",
  crawlRunId: "crawl_demo_initial"
} as const;
