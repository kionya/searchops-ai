import {
  ConnectorSyncJobPayloadSchema,
  ConnectorSyncJobResultSchema,
  type ConnectorProvider,
  type ConnectorRunResult,
  type ConnectorSyncJobPayload,
  type ConnectorSyncJobResult,
  type ConnectorSyncRunStatus
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

export interface ConnectorSyncPersistenceClient {
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
  prisma: Pick<SearchOpsPrismaClient, "connectorSyncResult" | "connectorSyncRun">,
): ConnectorSyncPersistenceClient {
  return {
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

  if (result.summary.failedProviders > 0 || result.summary.partialProviders > 0) {
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
