import { describe, expect, it } from "vitest";

import { dbPackage, phaseOneSeedIds, prismaSchemaPath } from "./index.js";

describe("db foundation", () => {
  it("declares the Prisma schema location", () => {
    expect(prismaSchemaPath).toBe("packages/db/prisma/schema.prisma");
  });

  it("declares stable Phase 1 seed ids", () => {
    expect(phaseOneSeedIds).toMatchObject({ organizationId: "org_demo" });
  });

  it("identifies the package", () => {
    expect(dbPackage).toBe("db");
  });
});