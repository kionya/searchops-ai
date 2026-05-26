import {
  SchemaRichResultValidationJobResultSchema,
  type SchemaRichResultValidationJobResult
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

export interface SchemaRichResultValidationRecommendationRecord {
  readonly evidence: Prisma.JsonValue;
  readonly id: string;
}

export interface SchemaRichResultValidationFindUniqueArgs {
  readonly where: {
    readonly id: string;
  };
}

export interface SchemaRichResultValidationUpdateArgs {
  readonly data: {
    readonly evidence: Prisma.InputJsonValue;
  };
  readonly where: {
    readonly id: string;
  };
}

export interface SchemaRichResultValidationPersistenceClient {
  readonly schemaRecommendation: {
    findUnique(
      args: SchemaRichResultValidationFindUniqueArgs,
    ): Promise<SchemaRichResultValidationRecommendationRecord | null>;
    update(
      args: SchemaRichResultValidationUpdateArgs,
    ): Promise<SchemaRichResultValidationRecommendationRecord>;
  };
}

export interface PersistSchemaRichResultValidationOutput {
  readonly recommendationId: string;
  readonly validationPersisted: boolean;
}

export function createPrismaSchemaRichResultValidationPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "schemaRecommendation">,
): SchemaRichResultValidationPersistenceClient {
  return {
    schemaRecommendation: {
      async findUnique(args) {
        const record = await prisma.schemaRecommendation.findUnique({
          select: {
            evidence: true,
            id: true
          },
          where: args.where
        });

        return record;
      },
      async update(args) {
        const record = await prisma.schemaRecommendation.update({
          data: args.data,
          select: {
            evidence: true,
            id: true
          },
          where: args.where
        });

        return record;
      }
    }
  };
}

export async function persistSchemaRichResultValidationJobResult(
  client: SchemaRichResultValidationPersistenceClient,
  input: SchemaRichResultValidationJobResult,
): Promise<PersistSchemaRichResultValidationOutput | null> {
  const result = SchemaRichResultValidationJobResultSchema.parse(input);
  const recommendation = await client.schemaRecommendation.findUnique({
    where: {
      id: result.recommendationId
    }
  });
  if (recommendation === null) {
    return null;
  }

  await client.schemaRecommendation.update({
    data: {
      evidence: mergeValidationIntoEvidence(recommendation.evidence, result)
    },
    where: {
      id: result.recommendationId
    }
  });

  return {
    recommendationId: result.recommendationId,
    validationPersisted: true
  };
}

export function mergeValidationIntoEvidence(
  evidence: Prisma.JsonValue,
  result: SchemaRichResultValidationJobResult,
): Prisma.InputJsonValue {
  const parsed = SchemaRichResultValidationJobResultSchema.parse(result);
  const base = isJsonObject(evidence) ? evidence : {};

  return {
    ...base,
    richResultValidation: {
      requestedAt: parsed.requestedAt,
      requestedByUserId: parsed.requestedByUserId,
      result: parsed.validationResult
    }
  } as Prisma.InputJsonValue;
}

function isJsonObject(value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
