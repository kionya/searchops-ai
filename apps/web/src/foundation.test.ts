import { describe, expect, it } from "vitest";

import { productName, SiteSchema } from "@searchops/types";

describe("web foundation", () => {
  it("can import shared workspace types", () => {
    expect(productName).toBe("SearchOps AI");
  });

  it("can validate the dashboard site fixture shape", () => {
    expect(
      SiteSchema.parse({
        id: "site_demo_rejuel",
        organizationId: "org_demo",
        domain: "example-clinic.com",
        name: "Example Clinic",
        industry: "medical",
        language: "ko",
        country: "KR",
        createdAt: "2026-05-19T00:00:00.000Z"
      }),
    ).toMatchObject({ domain: "example-clinic.com" });
  });
});