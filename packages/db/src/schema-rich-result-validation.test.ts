import { describe, expect, it } from "vitest";

import type { SchemaRichResultValidationJobResult } from "@searchops/types";

import {
  mergeValidationIntoEvidence,
  persistSchemaRichResultValidationJobResult,
  type SchemaRichResultValidationPersistenceClient
} from "./schema-rich-result-validation.js";

const jobResult: SchemaRichResultValidationJobResult = {
  recommendationId: "schema_rec_1",
  siteId: "site_1",
  siteDomain: "example.com",
  requestedByUserId: "user_schema",
  requestedAt: "2026-05-26T00:00:00.000Z",
  validationResult: {
    type: "Service",
    url: "https://example.com/services/seo",
    status: "eligible",
    eligible: true,
    requiredFields: ["@context", "@type", "name", "provider", "url"],
    missingRequiredFields: [],
    recommendedFields: ["description"],
    missingRecommendedFields: [],
    issues: [],
    generatedBy: "connector",
    liveExternalApis: "enabled"
  }
};

describe("schema rich-result validation persistence", () => {
  it("merges validation evidence without dropping existing fields", () => {
    expect(
      mergeValidationIntoEvidence(
        {
          expectedType: "Service",
          observedTypes: []
        },
        jobResult,
      ),
    ).toMatchObject({
      expectedType: "Service",
      observedTypes: [],
      richResultValidation: {
        requestedAt: "2026-05-26T00:00:00.000Z",
        result: {
          status: "eligible",
          generatedBy: "connector"
        }
      }
    });
  });

  it("persists validation results through the schema recommendation boundary", async () => {
    const updates: unknown[] = [];
    const client: SchemaRichResultValidationPersistenceClient = {
      schemaRecommendation: {
        async findUnique(args) {
          expect(args.where.id).toBe("schema_rec_1");
          return {
            evidence: {
              expectedType: "Service",
              observedTypes: []
            },
            id: "schema_rec_1"
          };
        },
        async update(args) {
          updates.push(args);
          return {
            evidence: {
              persisted: true
            },
            id: args.where.id
          };
        }
      }
    };

    await expect(
      persistSchemaRichResultValidationJobResult(client, jobResult),
    ).resolves.toEqual({
      recommendationId: "schema_rec_1",
      validationPersisted: true
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      data: {
        evidence: {
          richResultValidation: {
            requestedByUserId: "user_schema",
            result: {
              liveExternalApis: "enabled",
              status: "eligible"
            }
          }
        }
      },
      where: {
        id: "schema_rec_1"
      }
    });
  });
});
