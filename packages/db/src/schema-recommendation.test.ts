import { describe, expect, it } from "vitest";

import {
  persistSchemaRecommendationRecheck,
  type SchemaRecommendationRecheckPersistenceClient
} from "./schema-recommendation.js";

describe("schema recommendation recheck persistence", () => {
  it("marks resolved recommendations and linked work orders as done", async () => {
    const recommendationUpdates: unknown[] = [];
    const workOrderUpdates: unknown[] = [];
    const client: SchemaRecommendationRecheckPersistenceClient = {
      schemaRecommendation: {
        async findUnique(args) {
          expect(args).toEqual({
            include: { workOrder: true },
            where: { id: "schema_rec_1" }
          });
          return {
            evidence: {
              expectedType: "Service",
              observedTypes: []
            },
            id: "schema_rec_1",
            status: "converted",
            type: "Service",
            workOrder: {
              id: "wo_1",
              status: "in_review"
            }
          };
        },
        async update(args) {
          recommendationUpdates.push(args);
          return {
            id: args.where.id,
            status: args.data.status
          };
        }
      },
      workOrder: {
        async update(args) {
          workOrderUpdates.push(args);
          return {
            id: args.where.id,
            status: args.data.status
          };
        }
      }
    };

    const output = await persistSchemaRecommendationRecheck(client, {
      observedTypes: ["Service"],
      recommendationId: "schema_rec_1"
    });

    expect(output).toEqual({
      expectedType: "Service",
      observedTypes: ["Service"],
      recommendationId: "schema_rec_1",
      recommendationStatus: "resolved",
      resolved: true,
      workOrderId: "wo_1",
      workOrderStatus: "done"
    });
    expect(recommendationUpdates[0]).toEqual({
      data: {
        evidence: {
          expectedType: "Service",
          observedTypes: ["Service"]
        },
        status: "resolved"
      },
      where: {
        id: "schema_rec_1"
      }
    });
    expect(workOrderUpdates[0]).toEqual({
      data: {
        status: "done"
      },
      where: {
        id: "wo_1"
      }
    });
  });

  it("reopens resolved recommendations and returns done work orders to review", async () => {
    const recommendationUpdates: unknown[] = [];
    const workOrderUpdates: unknown[] = [];
    const client: SchemaRecommendationRecheckPersistenceClient = {
      schemaRecommendation: {
        async findUnique() {
          return {
            evidence: {
              expectedType: "FAQPage",
              observedTypes: ["FAQPage"]
            },
            id: "schema_rec_2",
            status: "resolved",
            type: "FAQPage",
            workOrder: {
              id: "wo_2",
              status: "done"
            }
          };
        },
        async update(args) {
          recommendationUpdates.push(args);
          return {
            id: args.where.id,
            status: args.data.status
          };
        }
      },
      workOrder: {
        async update(args) {
          workOrderUpdates.push(args);
          return {
            id: args.where.id,
            status: args.data.status
          };
        }
      }
    };

    const output = await persistSchemaRecommendationRecheck(client, {
      observedTypes: ["WebPage"],
      recommendationId: "schema_rec_2"
    });

    expect(output).toMatchObject({
      expectedType: "FAQPage",
      observedTypes: ["WebPage"],
      recommendationStatus: "open",
      resolved: false,
      workOrderStatus: "in_review"
    });
    expect(recommendationUpdates[0]).toMatchObject({
      data: {
        status: "open"
      }
    });
    expect(workOrderUpdates[0]).toEqual({
      data: {
        status: "in_review"
      },
      where: {
        id: "wo_2"
      }
    });
  });

  it("returns null when the recommendation no longer exists", async () => {
    const client: SchemaRecommendationRecheckPersistenceClient = {
      schemaRecommendation: {
        async findUnique() {
          return null;
        },
        async update() {
          throw new Error("update should not be called");
        }
      },
      workOrder: {
        async update() {
          throw new Error("work order update should not be called");
        }
      }
    };

    await expect(
      persistSchemaRecommendationRecheck(client, {
        observedTypes: [],
        recommendationId: "schema_rec_missing"
      }),
    ).resolves.toBeNull();
  });
});
