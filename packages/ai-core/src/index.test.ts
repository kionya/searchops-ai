import { describe, expect, it } from "vitest";

import { aiCorePackage, aiUsageBoundary } from "./index.js";

describe("ai-core foundation", () => {
  it("keeps AI usage outside deterministic rule truth", () => {
    expect(aiUsageBoundary).toBe("optional-drafting-only");
  });

  it("identifies the package", () => {
    expect(aiCorePackage).toBe("ai-core");
  });
});