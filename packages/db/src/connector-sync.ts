import {
  ConnectorSyncJobPayloadSchema,
  ConnectorSyncJobResultSchema,
  type ConnectorProvider,
  type ConnectorRunResult,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type ConnectorSyncRunStatus,
  type ConnectorOAuthProvider
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

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
  readonly provider: ConnectorOAuthProvider;
  readonly refreshToken: string | null;
  readonly status: "connected" | "expired" | "revoked";
  readonly tokenExpiresAt: Date | null;
  readonly tokenType: string | null;
}

export interface ConnectorOAuthCredentialFindManyArgs {
  where: {
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
    "connectorOAuthCredential" | "connectorSyncResult" | "connectorSyncRun"
  >,
): ConnectorSyncPersistenceClient {
  return {
    connectorOAuthCredential: {
      async findMany(args) {
        const rows = await prisma.connectorOAuthCredential.findMany({
          where: {
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
            provider: true,
            refreshToken: true,
            status: true,
            tokenExpiresAt: true,
            tokenType: true
          }
        });

        return rows.map((row) => ({
          accessToken: row.accessToken,
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
  siteId: string,
): Promise<ConnectorOAuthCredentialForSync[]> {
  if (client.connectorOAuthCredential === undefined) {
    return [];
  }

  return client.connectorOAuthCredential.findMany({
    where: {
      provider: {
        in: ["gsc", "ga4"]
      },
      siteId,
      status: "connected"
    }
  });
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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
