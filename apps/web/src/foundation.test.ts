import { describe, expect, it } from "vitest";

import { productName, SiteSchema, WorkOrderSchema } from "@searchops/types";

import {
  demoSite,
  demoWorkOrders,
  groupWorkOrdersByStatus,
  summarizeWorkOrders
} from "./work-order-board";

describe("web foundation", () => {
  it("can import shared workspace types", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("can validate the dashboard site fixture shape", () => {
    expect(SiteSchema.parse(demoSite)).toMatchObject({ domain: "example-clinic.com" });
  });

  it("can validate the work board fixtures", () => {
    expect(demoWorkOrders.map((workOrder) => WorkOrderSchema.parse(workOrder))).toHaveLength(5);
  });

  it("summarizes the work board fixture", () => {
    expect(summarizeWorkOrders(demoWorkOrders)).toEqual({
      total: 5,
      active: 4,
      inProgress: 1,
      inReview: 1,
      blocked: 1,
      urgent: 2
    });
  });

  it("groups work orders by deterministic board columns", () => {
    const grouped = groupWorkOrdersByStatus(demoWorkOrders);

    expect(grouped.open).toHaveLength(1);
    expect(grouped.in_progress[0]?.id).toBe("wo_h1_service");
    expect(grouped.done[0]?.id).toBe("wo_canonical_blog");
  });
});
