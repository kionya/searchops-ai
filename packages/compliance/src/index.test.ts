import { describe, expect, it } from "vitest";

import { compliancePackage, medicalContentPublishPolicy } from "./index.js";

describe("compliance foundation", () => {
  it("keeps medical content in draft-only mode", () => {
    expect(medicalContentPublishPolicy).toBe("draft-with-compliance-flags-only");
  });

  it("identifies the package", () => {
    expect(compliancePackage).toBe("compliance");
  });
});