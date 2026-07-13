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
  providerCredentials?: ConnectorSyncProviderCredentialPort;
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

export interface ConnectorSyncProviderCredentialPort {
  getSite(input: ConnectorSyncSiteLookupInput): Promise<ConnectorSyncSiteRecord | null>;
  getSiteConnector(input: ConnectorSyncSiteConnectorLookupInput): Promise<SiteConnector | null>;
  getProviderAccount(input: ConnectorSyncProviderAccountLookupInput): Promise<ProviderAccountForConnectorSync | null>;
  updateProviderAccountCredential(input: ConnectorSyncProviderAccountCredentialUpdateInput): Promise<boolean>;
  updateProviderAccountStatus(input: ConnectorSyncProviderAccountStatusUpdateInput): Promise<void>;
  updateSiteConnectorStatus(input: ConnectorSyncSiteConnectorStatusUpdateInput): Promise<void>;
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

export interface ConnectorSyncProviderAccountCredentialUpdateInput
  extends ConnectorSyncProviderAccountLookupInput {
  readonly encryptedCredential: EncryptedProviderCredential;
  readonly expectedUpdatedAt: string;
  readonly status: "connected";
  readonly tokenExpiresAt: Date;
}

export interface ConnectorSyncProviderAccountStatusUpdateInput
  extends ConnectorSyncProviderAccountLookupInput {
  readonly status: ProviderAccountStatus;
}

export interface ConnectorSyncSiteConnectorStatusUpdateInput
  extends ConnectorSyncSiteConnectorLookupInput {
  readonly lastCheckedAt: Date;
  readonly lastErrorCode: ProviderCredentialFailureCode | null;
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
    | "connectorOAuthCredential"
    | "connectorSyncResult"
    | "connectorSyncRun"
    | "providerAccount"
    | "site"
    | "siteConnector"
  >,
): ConnectorSyncPersistenceClient {
  return {
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
      async updateProviderAccountCredential(input) {
        const updated = await prisma.providerAccount.updateMany({
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
        return updated.count === 1;
      },
      async updateProviderAccountStatus(input) {
        await prisma.providerAccount.updateMany({
          data: { status: input.status },
          where: { id: input.providerAccountId, organizationId: input.organizationId }
        });
      },
      async updateSiteConnectorStatus(input) {
        await prisma.siteConnector.updateMany({
          data: {
            lastCheckedAt: input.lastCheckedAt,
            lastErrorCode: input.lastErrorCode,
            status: input.status
          },
          where: {
            organizationId: input.organizationId,
            provider: input.provider,
            siteId: input.siteId
          }
        });
      }
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

export async function updateProviderAccountCredentialForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncProviderAccountCredentialUpdateInput,
) {
  return client.providerCredentials?.updateProviderAccountCredential(input) ?? false;
}

export async function updateProviderAccountStatusForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncProviderAccountStatusUpdateInput,
) {
  await client.providerCredentials?.updateProviderAccountStatus(input);
}

export async function updateSiteConnectorStatusForConnectorSync(
  client: ConnectorSyncPersistenceClient,
  input: ConnectorSyncSiteConnectorStatusUpdateInput,
) {
  await client.providerCredentials?.updateSiteConnectorStatus(input);
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

  for (const providerResult of result.results) {
    await client.connectorSyncResult.upsert(
      buildConnectorSyncResultUpsertArgs({
        providerResult,
        syncRunId: result.connectorSyncRunId
      }),
    );
  }

  await client.connectorSyncRun.update({
    where: {
      id: result.connectorSyncRunId
    },
    data: {
      status,
      endedAt: new Date(),
      summary: toJson(result.summary)
    }
  });

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
  },
): Promise<MarkConnectorSyncRunFailedOutput> {
  await client.connectorSyncRun.update({
    where: {
      id: input.connectorSyncRunId
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
    connectorSyncRunId: input.connectorSyncRunId,
    status: "failed"
  };
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
