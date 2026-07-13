export const dbPackage = "db" as const;

export const prismaSchemaPath = "packages/db/prisma/schema.prisma" as const;

export {
  createSearchOpsPrismaClient,
  type SearchOpsPrismaClient
} from "./client.js";
export type { Prisma } from "./generated/prisma/index.js";

export {
  CredentialDecryptionError,
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type CredentialContext,
  type CredentialKeyring,
  type CredentialKeyringEnvironment,
  type EncryptedProviderCredential
} from "./credential-crypto.js";

export {
  createPrismaProviderCredentialStore,
  deriveCanonicalProviderAccountId,
  ProviderCredentialStoreError,
  type AccountLookupStoreInput,
  type ConnectorCredentialReadinessSnapshot,
  type CreateApiKeyAccountStoreInput,
  type DeleteAccountStoreInput,
  type DeleteSiteConnectorStoreInput,
  type ProviderAccountSecretRecord,
  type ProviderCredentialStore,
  type ProviderCredentialStoreErrorCode,
  type ProviderCredentialStorePrismaPort,
  type ProviderCredentialStorePrismaTransactionPort,
  type ReplaceCredentialStoreInput,
  type SiteConnectorLookupStoreInput,
  type UpsertGoogleAccountStoreInput,
  type UpsertSiteConnectorStoreInput,
  type UpdateProviderAccountMetadataStoreInput
} from "./provider-credential-store.js";

export {
  createPrismaProviderCredentialMaintenanceStore,
  migrateLegacyProviderCredentials,
  rotateProviderCredentialEncryption,
  type CredentialMaintenanceCliOptions,
  type CredentialMaintenanceOptions,
  type CredentialMaintenanceSummary,
  type LegacyCredentialInspection,
  type LegacyProviderCredentialMigrationOptions,
  type ProviderCredentialMaintenancePrismaPort,
  type ProviderCredentialMaintenancePrismaTransactionPort,
  type ProviderCredentialMaintenanceStore,
  type ProviderCredentialMaintenanceTransaction
} from "./provider-credential-migration.js";

export {
  buildUrlRecordUpsertArgs,
  createPrismaCrawlAnalysisPersistenceClient,
  createPrismaCrawlPersistenceClient,
  markCrawlRunFailed,
  persistCrawlAnalysisResult,
  persistCrawlJobResult,
  type CrawlAnalysisPersistenceClient,
  type CrawlPersistenceClient,
  type CrawlRunUpdateArgs,
  type MarkCrawlRunFailedOutput,
  type PersistCrawlAnalysisInput,
  type PersistCrawlAnalysisOutput,
  type PersistCrawlJobResultOutput,
  type SchemaRecommendationUpsertArgs,
  type SeoIssueUpsertArgs,
  type SiteFindUniqueArgs,
  type UrlRecordFindUniqueArgs,
  type WorkOrderUpsertArgs,
  type UrlRecordUpsertArgs
} from "./crawl.js";

export {
  applyProviderFeedbackForConnectorSync,
  buildConnectorSyncResultUpsertArgs,
  classifyConnectorSyncRunStatus,
  createConnectorSyncRun,
  createPrismaConnectorSyncPersistenceClient,
  getDefaultGeoProviderAccountForSync,
  getProviderAccountForConnectorSync,
  getSiteConnectorForConnectorSync,
  getSiteForConnectorSync,
  listConnectorOAuthCredentialsForSync,
  markConnectorSyncRunFailed,
  persistConnectorSyncJobResult,
  updateConnectorOAuthCredentialForSync,
  updateProviderAccountCredentialForConnectorSync,
  verifyConnectorSyncRunOwnership,
  type ConnectorOAuthCredentialUpdateArgs,
  type ConnectorOAuthCredentialFindManyArgs,
  type ConnectorOAuthCredentialForSync,
  type ConnectorSyncPersistenceClient,
  type ConnectorSyncOwnershipPort,
  type ConnectorSyncProviderAccountCredentialUpdateInput,
  type ConnectorSyncProviderAccountLookupInput,
  type ConnectorSyncProviderCredentialPort,
  type ConnectorSyncProviderFeedbackInput,
  type ConnectorSyncResultUpsertArgs,
  type ConnectorSyncRunCreateArgs,
  type ConnectorSyncRunOwnershipInput,
  type ConnectorSyncRunUpdateArgs,
  type ConnectorSyncSiteConnectorLookupInput,
  type ConnectorSyncSiteLookupInput,
  type ConnectorSyncSiteRecord,
  type GeoProviderAccountLookupInput,
  type GeoProviderAccountProvider,
  type MarkConnectorSyncRunFailedOutput,
  type PersistConnectorSyncJobResultOutput,
  type ProviderAccountForConnectorSync,
  type ProviderAccountForGeoSync
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
  verifyGeoVisibilitySiteOwnership,
  type GeoVisibilityOwnershipInput,
  type GeoVisibilityOwnershipPort,
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
