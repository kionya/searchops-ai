import {
  ProviderAccountAuthTypeSchema,
  ProviderAccountProviderSchema,
  ProviderAccountStatusSchema,
  SiteConnectorSchema,
  ConnectorSyncJobPayloadSchema,
  ConnectorSyncJobResultSchema,
  type ConnectorProvider,
  type ConnectorRunResult,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type ConnectorSyncRunStatus,
  type ConnectorOAuthProvider,
  type ProviderAccountStatus,
  type ProviderCredentialFailureCode,
  type SiteConnector,
  type SiteConnectorProvider,
  type SiteConnectorStatus
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { EncryptedProviderCredential } from "./credential-crypto.js";
import type { Prisma } from "./generated/prisma/index.js";

const connectorSyncProviderAccountSelect = {
  authType: true,
  credentialAuthTag: true,
  credentialCiphertext: true,
  credentialIv: true,
  encryptionKeyId: true,
  encryptionVersion: true,
  id: true,
  organizationId: true,
  provider: true,
  scopes: true,
  status: true,
  tokenExpiresAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProviderAccountSelect;

const geoProviderAccountSelect = {
  ...connectorSyncProviderAccountSelect,
  isDefault: true,
} as const satisfies Prisma.ProviderAccountSelect;

const connectorSyncSiteConnectorSelect = {
  config: true,
  createdAt: true,
  externalResourceId: true,
  id: true,
  lastCheckedAt: true,
  lastErrorCode: true,
  organizationId: true,
  provider: true,
  providerAccountId: true,
  siteId: true,
  status: true,
  updatedAt: true,
} as const satisfies Prisma.SiteConnectorSelect;

type ConnectorSyncProviderAccountRow = Prisma.ProviderAccountGetPayload<{
  select: typeof connectorSyncProviderAccountSelect;
}>;
type GeoProviderAccountRow = Prisma.ProviderAccountGetPayload<{
  select: typeof geoProviderAccountSelect;
}>;
type ConnectorSyncSiteConnectorRow = Prisma.SiteConnectorGetPayload<{
  select: typeof connectorSyncSiteConnectorSelect;
}>;

export interface ConnectorSyncRunCreateArgs {
  data: {
    id: string;
    organizationId: string;
    siteId: string;
    status: "queued";
    providers: Prisma.InputJsonValue;
    requestedByUserId: string;
    fixture: boolean;
  };
}

export interface ConnectorSyncRunUpdateArgs {
  where: {
    id: string;
  };
  data: {
    status: ConnectorSyncRunStatus;
    endedAt: Date;
    summary: Prisma.InputJsonValue;
  };
}

export interface ConnectorSyncResultUpsertArgs {
  where: {
    syncRunId_provider: {
      syncRunId: string;
      provider: ConnectorProvider;
    };
  };
  create: {
    syncRunId: string;
    provider: ConnectorProvider;
    status: ConnectorRunResult["status"];
    fetchedAt: Date;
    fixture: boolean;
    recordCount: number;
    records: Prisma.InputJsonValue;
  };
  update: {
    status: ConnectorRunResult["status"];
    fetchedAt: Date;
    fixture: boolean;
    recordCount: number;
    records: Prisma.InputJsonValue;
  };
}

export interface ConnectorOAuthCredentialForSync {
  readonly accessToken: string;
  readonly externalAccountEmail: string | null;
  readonly provider: ConnectorOAuthProvider;
  readonly refreshToken: string | null;
  readonly status: "connected" | "expired" | "revoked";
  readonly tokenExpiresAt: Date | null;
  readonly tokenType: string | null;
}

export interface ConnectorOAuthCredentialFindManyArgs {
  where: {
    organizationId: string;
    provider?: {
      in: readonly ConnectorOAuthProvider[];
    };
    siteId: string;
    status?: "connected";
  };
}

export interface ConnectorOAuthCredentialUpdateArgs {
  data: {
    accessToken: string;
    tokenExpiresAt: Date | null;
    tokenType?: string | null;
  };
  where: {
    siteId_provider: {
      provider: ConnectorOAuthProvider;
      siteId: string;
    };
  };
}

export interface ConnectorSyncPersistenceClient {
  connectorOAuthCredential?: {
    findMany(args: ConnectorOAuthCredentialFindManyArgs): Promise<ConnectorOAuthCredentialForSync[]>;
    update(args: ConnectorOAuthCredentialUpdateArgs): Promise<ConnectorOAuthCredentialForSync>;
  };
  connectorSyncRun: {
    create(args: ConnectorSyncRunCreateArgs): Promise<unknown>;
    update(args: ConnectorSyncRunUpdateArgs): Promise<unknown>;
  };
  connectorSyncResult: {
    upsert(args: ConnectorSyncResultUpsertArgs): Promise<unknown>;
  };
  connectorSyncOwnership: ConnectorSyncOwnershipPort;
  providerCredentials?: ConnectorSyncProviderCredentialPort;
}

export interface ConnectorSyncRunOwnershipInput {
  readonly connectorSyncRunId: string;
  readonly organizationId: string;
  readonly siteId: string;
}

export interface ConnectorSyncOwnershipPort {
  verify(input: ConnectorSyncRunOwnershipInput): Promise<boolean>;
  persist(input: {
    readonly endedAt: Date;
    readonly result: ConnectorSyncJobResult;
    readonly status: ConnectorSyncRunStatus;
  }): Promise<boolean>;
  markFailed(input: ConnectorSyncRunOwnershipInput & {
    readonly endedAt: Date;
    readonly summary: Prisma.InputJsonValue;
  }): Promise<boolean>;
}

export interface ProviderAccountForConnectorSync extends EncryptedProviderCredential {
  readonly authType: "oauth2" | "api_key";
  readonly id: string;
  readonly organizationId: string;
  readonly provider: "google" | "bing" | "geo_chatgpt" | "geo_claude" | "geo_gemini" | "geo_perplexity";
  readonly scopes: readonly string[];
  readonly status: ProviderAccountStatus;
  readonly tokenExpiresAt: string | null;
  readonly updatedAt: string;
}

export type GeoProviderAccountProvider =
  | "geo_chatgpt"
  | "geo_claude"
  | "geo_gemini"
  | "geo_perplexity";

export interface ProviderAccountForGeoSync extends ProviderAccountForConnectorSync {
  readonly authType: "api_key";
  readonly isDefault: boolean;
  readonly provider: GeoProviderAccountProvider;
}

export interface ConnectorSyncProviderCredentialPort {
  applyProviderFeedback(input: ConnectorSyncProviderFeedbackInput): Promise<boolean>;
  getSite(input: ConnectorSyncSiteLookupInput): Promise<ConnectorSyncSiteRecord | null>;
  getSiteConnector(input: ConnectorSyncSiteConnectorLookupInput): Promise<SiteConnector | null>;
  getProviderAccount(input: ConnectorSyncProviderAccountLookupInput): Promise<ProviderAccountForConnectorSync | null>;
  getDefaultGeoProviderAccount?(
    input: GeoProviderAccountLookupInput,
  ): Promise<ProviderAccountForGeoSync | null>;
  updateProviderAccountCredential(
    input: ConnectorSyncProviderAccountCredentialUpdateInput,
  ): Promise<{ readonly updatedAt: string } | null>;
}

export interface ConnectorSyncSiteLookupInput {
  readonly organizationId: string;
  readonly siteId: string;
}

export interface ConnectorSyncSiteRecord {
  readonly id: string;
  readonly organizationId: string;
}

export interface ConnectorSyncSiteConnectorLookupInput extends ConnectorSyncSiteLookupInput {
  readonly provider: SiteConnectorProvider;
}

export interface ConnectorSyncProviderAccountLookupInput {
  readonly organizationId: string;
  readonly providerAccountId: string;
}

export interface GeoProviderAccountLookupInput {
  readonly authType: "api_key";
  readonly organizationId: string;
  readonly provider: GeoProviderAccountProvider;
}

export interface ConnectorSyncProviderAccountCredentialUpdateInput
  extends ConnectorSyncProviderAccountLookupInput {
  readonly encryptedCredential: EncryptedProviderCredential;
  readonly expectedUpdatedAt: string;
  readonly status: "connected";
  readonly tokenExpiresAt: Date;
}

export interface ConnectorSyncProviderFeedbackInput
  extends ConnectorSyncSiteConnectorLookupInput {
  readonly accountStatus: ProviderAccountStatus | null;
  readonly expectedAccountStatus: ProviderAccountStatus;
  readonly expectedAccountUpdatedAt: string;
  readonly expectedConnectorUpdatedAt: string;
  readonly lastCheckedAt: Date;
  readonly lastErrorCode: ProviderCredentialFailureCode | null;
  readonly providerAccountId: string;
  readonly status: SiteConnectorStatus;
}

export interface PersistConnectorSyncJobResultOutput {
  connectorSyncRunId: string;
  resultsUpserted: number;
  siteId: string;
  status: ConnectorSyncRunStatus;
}

export interface MarkConnectorSyncRunFailedOutput {
  connectorSyncRunId: string;
  status: "failed";
}

export function createPrismaConnectorSyncPersistenceClient(
  prisma: Pick<
    SearchOpsPrismaClient,
    | "$transaction"
    | "connectorOAuthCredential"
    | "connectorSyncResult"
    | "connectorSyncRun"
    | "providerAccount"
    | "site"
    | "siteConnector"
  >,
): ConnectorSyncPersistenceClient {
  return {
    connectorSyncOwnership: {
      async verify(input) {
        const run = await prisma.connectorSyncRun.findFirst({
          select: { id: true },
          where: connectorSyncOwnershipWhere(input)
        });
        return run !== null;
      },
      async persist(input) {
        return prisma.$transaction(async (transaction) => {
          const ownership = connectorSyncOwnershipFromResult(input.result);
          const run = await transaction.connectorSyncRun.findFirst({
            select: { id: true },
            where: connectorSyncOwnershipWhere(ownership)
          });
          if (run === null) {
            return false;
          }
          for (const providerResult of input.result.results) {
            await transaction.connectorSyncResult.upsert(
              buildConnectorSyncResultUpsertArgs({
                providerResult,
                syncRunId: input.result.connectorSyncRunId
              }),
            );
          }
          const updated = await transaction.connectorSyncRun.updateMany({
            data: {
              endedAt: input.endedAt,
              status: input.status,
              summary: toJson(input.result.summary)
            },
            where: connectorSyncOwnershipWhere(ownership)
          });
          if (updated.count !== 1) {
            throw new Error("connector_sync_run_ownership_changed");
          }
          return true;
        });
      },
      async markFailed(input) {
        return prisma.$transaction(async (transaction) => {
          const run = await transaction.connectorSyncRun.findFirst({
            select: { id: true },
            where: connectorSyncOwnershipWhere(input)
          });
          if (run === null) {
            return false;
          }
          const updated = await transaction.connectorSyncRun.updateMany({
            data: {
              endedAt: input.endedAt,
              status: "failed",
              summary: input.summary
            },
            where: connectorSyncOwnershipWhere(input)
          });
          if (updated.count !== 1) {
            throw new Error("connector_sync_run_ownership_changed");
          }
          return true;
        });
      }
    },
    connectorOAuthCredential: {
      async findMany(args) {
        const rows = await prisma.connectorOAuthCredential.findMany({
          where: {
            organizationId: args.where.organizationId,
            ...(args.where.provider
              ? {
                  provider: {
                    in: [...args.where.provider.in]
                  }
                }
              : {}),
            siteId: args.where.siteId,
            ...(args.where.status ? { status: args.where.status } : {})
          },
          select: {
            accessToken: true,
            externalAccountEmail: true,
            provider: true,
            refreshToken: true,
            status: true,
            tokenExpiresAt: true,
            tokenType: true
          }
        });

        return rows.map((row) => ({
          accessToken: row.accessToken,
          externalAccountEmail: row.externalAccountEmail,
          provider: row.provider as ConnectorOAuthProvider,
          refreshToken: row.refreshToken,
          status: row.status as ConnectorOAuthCredentialForSync["status"],
          tokenExpiresAt: row.tokenExpiresAt,
          tokenType: row.tokenType
        }));
      },
      async update(args) {
        const row = await prisma.connectorOAuthCredential.update({
          data: {
            accessToken: args.data.accessToken,
            tokenExpiresAt: args.data.tokenExpiresAt,
            ...(args.data.tokenType === undefined ? {} : { tokenType: args.data.tokenType })
          },
          select: {
            accessToken: true,
            externalAccountEmail: true,
            provider: true,
            refreshToken: true,
            status: true,
            tokenExpiresAt: true,
            tokenType: true
          },
          where: args.where
        });

        return {
          accessToken: row.accessToken,
          externalAccountEmail: row.externalAccountEmail,
          provider: row.provider as ConnectorOAuthProvider,
          refreshToken: row.refreshToken,
          status: row.status as ConnectorOAuthCredentialForSync["status"],
          tokenExpiresAt: row.tokenExpiresAt,
          tokenType: row.tokenType
        };
      }
    },
    connectorSyncRun: {
      async create(args) {
        return prisma.connectorSyncRun.create(args);
      },
      async update(args) {
        return prisma.connectorSyncRun.update(args);
      }
    },
    connectorSyncResult: {
      async upsert(args) {
        return prisma.connectorSyncResult.upsert(args);
      }
    },
    providerCredentials: {
      async applyProviderFeedback(input) {
        try {
          return await prisma.$transaction(
            async (transaction) => {
              const account = await transaction.providerAccount.updateMany({
                data:
                  input.accountStatus === null
                    ? { updatedAt: new Date(input.expectedAccountUpdatedAt) }
                    : { status: input.accountStatus },
                where: {
                  id: input.providerAccountId,
                  organizationId: input.organizationId,
                  status: input.expectedAccountStatus,
                  updatedAt: new Date(input.expectedAccountUpdatedAt)
                }
              });
              if (account.count !== 1) {
                throw new ConnectorSyncFeedbackPreconditionError();
              }
              const connector = await transaction.siteConnector.updateMany({
                data: {
                  lastCheckedAt: input.lastCheckedAt,
                  lastErrorCode: input.lastErrorCode,
                  status: input.status
                },
                where: {
                  organizationId: input.organizationId,
                  provider: input.provider,
                  providerAccountId: input.providerAccountId,
                  siteId: input.siteId,
                  updatedAt: new Date(input.expectedConnectorUpdatedAt)
                }
              });
              if (connector.count !== 1) {
                throw new ConnectorSyncFeedbackPreconditionError();
              }
              return true;
            },
            { isolationLevel: "Serializable" },
          );
        } catch (error) {
          if (error instanceof ConnectorSyncFeedbackPreconditionError) {
            return false;
          }
          throw error;
        }
      },
      async getSite(input) {
        return prisma.site.findFirst({
          select: { id: true, organizationId: true },
          where: { id: input.siteId, organizationId: input.organizationId }
        });
      },
      async getSiteConnector(input) {
        const row = await prisma.siteConnector.findFirst({
          select: connectorSyncSiteConnectorSelect,
          where: {
            organizationId: input.organizationId,
            provider: input.provider,
            siteId: input.siteId
          }
        });
        return row === null ? null : toSiteConnectorForSync(row);
      },
      async getProviderAccount(input) {
        const row = await prisma.providerAccount.findFirst({
          select: connectorSyncProviderAccountSelect,
          where: {
            id: input.providerAccountId,
            organizationId: input.organizationId
          }
        });
        return row === null ? null : toProviderAccountForSync(row);
      },
      async getDefaultGeoProviderAccount(input) {
        const row = await prisma.providerAccount.findFirst({
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: geoProviderAccountSelect,
          where: {
            authType: input.authType,
            isDefault: true,
            organizationId: input.organizationId,
            provider: input.provider,
            status: "connected"
          }
        });
        return row === null ? null : toProviderAccountForGeoSync(row);
      },
      async updateProviderAccountCredential(input) {
        return prisma.$transaction(async (transaction) => {
          const updated = await transaction.providerAccount.updateMany({
            data: {
              ...input.encryptedCredential,
              status: input.status,
              tokenExpiresAt: input.tokenExpiresAt
            },
            where: {
              id: input.providerAccountId,
              organizationId: input.organizationId,
              updatedAt: new Date(input.expectedUpdatedAt)
            }
          });
          if (updated.count !== 1) {
            return null;
          }
          const account = await transaction.providerAccount.findFirst({
            select: { updatedAt: true },
            where: {
              id: input.providerAccountId,
              organizationId: input.organizationId
            }
          });
          return account === null ? null : { updatedAt: account.updatedAt.toISOString() };
        });
      },
    }
  };
}

export async function createConnectorSyncRun(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncJobPayload,
): Promise<{ connectorSyncRunId: string; status: "queued" }> {
  const payload = ConnectorSyncJobPayloadSchema.parse(input);

  await client.connectorSyncRun.create({
    data: {
      id: payload.connectorSyncRunId,
      organizationId: payload.organizationId,
      siteId: payload.siteId,
      status: "queued",
      providers: toJson(payload.providers),
      requestedByUserId: payload.requestedByUserId,
      fixture: true
    }
  });

  return {
    connectorSyncRunId: payload.connectorSyncRunId,
    status: "queued"
  };
}

export async function listConnectorOAuthCredentialsForSync(
  client: ConnectorSyncPersistenceClient,
  input: {
    readonly organizationId: string;
    readonly providers: readonly ConnectorOAuthProvider[];
    readonly siteId: string;
  },
): Promise<ConnectorOAuthCredentialForSync[]> {
  if (client.connectorOAuthCredential === undefined) {
    return [];
  }

  return client.connectorOAuthCredential.findMany({
    where: {
      organizationId: input.organizationId,
      provider: {
        in: input.providers
      },
      siteId: input.siteId,
      status: "connected"
    }
  });
}

export async function getSiteForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncSiteLookupInput,
) {
  return client.providerCredentials?.getSite(input) ?? null;
}

export async function getSiteConnectorForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncSiteConnectorLookupInput,
) {
  return client.providerCredentials?.getSiteConnector(input) ?? null;
}

export async function getProviderAccountForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncProviderAccountLookupInput,
) {
  return client.providerCredentials?.getProviderAccount(input) ?? null;
}

export async function getDefaultGeoProviderAccountForSync(
  client: ConnectorSyncPersistenceClient,
  input: GeoProviderAccountLookupInput,
) {
  return client.providerCredentials?.getDefaultGeoProviderAccount?.(input) ?? null;
}

export async function updateProviderAccountCredentialForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncProviderAccountCredentialUpdateInput,
) {
  return client.providerCredentials?.updateProviderAccountCredential(input) ?? null;
}

export async function applyProviderFeedbackForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncProviderFeedbackInput,
) {
  return client.providerCredentials?.applyProviderFeedback(input) ?? false;
}

export async function updateConnectorOAuthCredentialForSync(
  client: ConnectorSyncPersistenceClient,
  input: {
    accessToken: string;
    provider: ConnectorOAuthProvider;
    siteId: string;
    tokenExpiresAt: Date | null;
    tokenType?: string | null;
  },
): Promise<ConnectorOAuthCredentialForSync | null> {
  if (client.connectorOAuthCredential === undefined) {
    return null;
  }

  return client.connectorOAuthCredential.update({
    data: {
      accessToken: input.accessToken,
      tokenExpiresAt: input.tokenExpiresAt,
      ...(input.tokenType === undefined ? {} : { tokenType: input.tokenType })
    },
    where: {
      siteId_provider: {
        provider: input.provider,
        siteId: input.siteId
      }
    }
  });
}

export async function persistConnectorSyncJobResult(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncJobResult,
): Promise<PersistConnectorSyncJobResultOutput> {
  const result = ConnectorSyncJobResultSchema.parse(input);
  const status = classifyConnectorSyncRunStatus(result);
  const persisted = await client.connectorSyncOwnership.persist({
    endedAt: new Date(),
    result,
    status
  });
  if (!persisted) {
    throw new Error("connector_sync_run_ownership_mismatch");
  }

  return {
    connectorSyncRunId: result.connectorSyncRunId,
    resultsUpserted: result.results.length,
    siteId: result.siteId,
    status
  };
}

export async function markConnectorSyncRunFailed(
  client: ConnectorSyncPersistenceClient,
  input: {
    connectorSyncRunId: string;
    error: unknown;
    organizationId: string;
    siteId: string;
  },
): Promise<MarkConnectorSyncRunFailedOutput> {
  const updated = await client.connectorSyncOwnership.markFailed({
    connectorSyncRunId: input.connectorSyncRunId,
    endedAt: new Date(),
    organizationId: input.organizationId,
    siteId: input.siteId,
    summary: toJson(safeConnectorSyncFailureSummary)
  });
  if (!updated) {
    throw new Error("connector_sync_run_ownership_mismatch");
  }

  return {
    connectorSyncRunId: input.connectorSyncRunId,
    status: "failed"
  };
}

export async function verifyConnectorSyncRunOwnership(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncRunOwnershipInput,
) {
  return client.connectorSyncOwnership.verify(input);
}

export function buildConnectorSyncResultUpsertArgs(input: {
  providerResult: ConnectorRunResult;
  syncRunId: string;
}): ConnectorSyncResultUpsertArgs {
  const record = {
    status: input.providerResult.status,
    fetchedAt: new Date(input.providerResult.fetchedAt),
    fixture: input.providerResult.fixture,
    recordCount: input.providerResult.records.length,
    records: toJson(input.providerResult.records)
  };

  return {
    where: {
      syncRunId_provider: {
        syncRunId: input.syncRunId,
        provider: input.providerResult.provider
      }
    },
    create: {
      syncRunId: input.syncRunId,
      provider: input.providerResult.provider,
      ...record
    },
    update: record
  };
}

export function classifyConnectorSyncRunStatus(
  result: ConnectorSyncJobResult,
): Extract<ConnectorSyncRunStatus, "completed" | "failed" | "partial"> {
  if (
    result.summary.totalProviders > 0 &&
    result.summary.failedProviders === result.summary.totalProviders
  ) {
    return "failed";
  }

  if (
    result.summary.failedProviders > 0 ||
    result.summary.partialProviders > 0 ||
    result.summary.setupRequiredProviders > 0
  ) {
    return "partial";
  }

  return "completed";
}

const safeConnectorSyncFailureSummary = {
  error: {
    code: "worker_job_failed",
    message: "Worker job failed."
  },
  version: 1
} as const;

class ConnectorSyncFeedbackPreconditionError extends Error {
  constructor() {
    super("connector_sync_feedback_precondition_failed");
    this.name = "ConnectorSyncFeedbackPreconditionError";
  }
}

function connectorSyncOwnershipFromResult(
  result: ConnectorSyncJobResult,
): ConnectorSyncRunOwnershipInput {
  return {
    connectorSyncRunId: result.connectorSyncRunId,
    organizationId: result.organizationId,
    siteId: result.siteId
  };
}

function connectorSyncOwnershipWhere(input: ConnectorSyncRunOwnershipInput) {
  return {
    id: input.connectorSyncRunId,
    organizationId: input.organizationId,
    siteId: input.siteId
  };
}

function toProviderAccountForSync(
  row: ConnectorSyncProviderAccountRow,
): ProviderAccountForConnectorSync {
  if (row.encryptionVersion !== 1) {
    throw new Error("unsupported_credential_encryption_version");
  }
  if (!Array.isArray(row.scopes) || row.scopes.some((scope) => typeof scope !== "string")) {
    throw new Error("invalid_provider_account_scopes");
  }

  return {
    authType: ProviderAccountAuthTypeSchema.parse(row.authType),
    credentialAuthTag: row.credentialAuthTag,
    credentialCiphertext: row.credentialCiphertext,
    credentialIv: row.credentialIv,
    encryptionKeyId: row.encryptionKeyId,
    encryptionVersion: 1,
    id: row.id,
    organizationId: row.organizationId,
    provider: ProviderAccountProviderSchema.parse(row.provider),
    scopes: row.scopes as string[],
    status: ProviderAccountStatusSchema.parse(row.status),
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

function toProviderAccountForGeoSync(row: GeoProviderAccountRow): ProviderAccountForGeoSync {
  const account = toProviderAccountForSync(row);
  if (account.authType !== "api_key" || !isGeoProviderAccountProvider(account.provider)) {
    throw new Error("invalid_geo_provider_account");
  }
  return {
    ...account,
    authType: "api_key",
    isDefault: row.isDefault,
    provider: account.provider
  };
}

function isGeoProviderAccountProvider(
  provider: ProviderAccountForConnectorSync["provider"],
): provider is GeoProviderAccountProvider {
  return (
    provider === "geo_chatgpt" ||
    provider === "geo_claude" ||
    provider === "geo_gemini" ||
    provider === "geo_perplexity"
  );
}

function toSiteConnectorForSync(row: ConnectorSyncSiteConnectorRow): SiteConnector {
  return SiteConnectorSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
