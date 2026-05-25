import {
  SchemaJsonLdTypeSchema,
  type SchemaJsonLdType
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

export interface SchemaRecommendationRecheckWorkOrderRecord {
  readonly id: string;
  readonly status: string;
}

export interface SchemaRecommendationRecheckRecord {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly evidence: Prisma.JsonValue;
  readonly workOrder: SchemaRecommendationRecheckWorkOrderRecord | null;
}

export interface SchemaRecommendationRecheckUpdateRecord {
  readonly id: string;
  readonly status: string;
}

export interface SchemaRecommendationRecheckFindUniqueArgs {
  readonly include: {
    readonly workOrder: true;
  };
  readonly where: {
    readonly id: string;
  };
}

export interface SchemaRecommendationRecheckUpdateArgs {
  readonly data: {
    readonly evidence: Prisma.InputJsonValue;
    readonly status: string;
  };
  readonly where: {
    readonly id: string;
  };
}

export interface SchemaRecommendationWorkOrderUpdateArgs {
  readonly data: {
    readonly status: string;
  };
  readonly where: {
    readonly id: string;
  };
}

export interface SchemaRecommendationRecheckPersistenceClient {
  readonly schemaRecommendation: {
    findUnique(
      args: SchemaRecommendationRecheckFindUniqueArgs,
    ): Promise<SchemaRecommendationRecheckRecord | null>;
    update(
      args: SchemaRecommendationRecheckUpdateArgs,
    ): Promise<SchemaRecommendationRecheckUpdateRecord>;
  };
  readonly workOrder: {
    update(
      args: SchemaRecommendationWorkOrderUpdateArgs,
    ): Promise<SchemaRecommendationRecheckWorkOrderRecord>;
  };
}

export interface PersistSchemaRecommendationRecheckInput {
  readonly recommendationId: string;
  readonly observedTypes: readonly SchemaJsonLdType[];
}

export interface PersistSchemaRecommendationRecheckOutput {
  readonly expectedType: SchemaJsonLdType;
  readonly observedTypes: readonly SchemaJsonLdType[];
  readonly recommendationId: string;
  readonly recommendationStatus: string;
  readonly resolved: boolean;
  readonly workOrderId: string | null;
  readonly workOrderStatus: string | null;
}

export function createPrismaSchemaRecommendationRecheckPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "schemaRecommendation" | "workOrder">,
): SchemaRecommendationRecheckPersistenceClient {
  return {
    schemaRecommendation: {
      async findUnique(args) {
        const record = await prisma.schemaRecommendation.findUnique({
          include: args.include,
          where: args.where
        });

        return record === null
          ? null
          : {
              evidence: record.evidence,
              id: record.id,
              status: record.status,
              type: record.type,
              workOrder:
                record.workOrder === null
                  ? null
                  : {
                      id: record.workOrder.id,
                      status: record.workOrder.status
                    }
            };
      },
      async update(args) {
        const record = await prisma.schemaRecommendation.update({
          data: args.data,
          where: args.where
        });

        return {
          id: record.id,
          status: record.status
        };
      }
    },
    workOrder: {
      async update(args) {
        const record = await prisma.workOrder.update({
          data: args.data,
          where: args.where
        });

        return {
          id: record.id,
          status: record.status
        };
      }
    }
  };
}

export async function persistSchemaRecommendationRecheck(
  client: SchemaRecommendationRecheckPersistenceClient,
  input: PersistSchemaRecommendationRecheckInput,
): Promise<PersistSchemaRecommendationRecheckOutput | null> {
  const recommendation = await client.schemaRecommendation.findUnique({
    include: {
      workOrder: true
    },
    where: {
      id: input.recommendationId
    }
  });
  if (recommendation === null) {
    return null;
  }

  const expectedType = SchemaJsonLdTypeSchema.parse(recommendation.type);
  const observedTypes = [...input.observedTypes];
  const resolved = observedTypes.includes(expectedType);
  const status = resolved
    ? "resolved"
    : recommendation.status === "resolved"
      ? "open"
      : recommendation.status;
  const updatedRecommendation = await client.schemaRecommendation.update({
    data: {
      evidence: mergeObservedTypesIntoEvidence(recommendation.evidence, observedTypes),
      status
    },
    where: {
      id: recommendation.id
    }
  });

  const workOrder =
    recommendation.workOrder === null
      ? null
      : resolved || recommendation.workOrder.status === "done"
        ? await client.workOrder.update({
            data: {
              status: resolved ? "done" : "in_review"
            },
            where: {
              id: recommendation.workOrder.id
            }
          })
        : recommendation.workOrder;

  return {
    expectedType,
    observedTypes,
    recommendationId: recommendation.id,
    recommendationStatus: updatedRecommendation.status,
    resolved,
    workOrderId: workOrder?.id ?? null,
    workOrderStatus: workOrder?.status ?? null
  };
}

function mergeObservedTypesIntoEvidence(
  evidence: Prisma.JsonValue,
  observedTypes: readonly SchemaJsonLdType[],
): Prisma.InputJsonValue {
  const base = isJsonObject(evidence) ? evidence : {};

  return {
    ...base,
    observedTypes: [...observedTypes]
  } as Prisma.InputJsonValue;
}

function isJsonObject(value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
