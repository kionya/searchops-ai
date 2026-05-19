import { describe, expect, it } from "vitest";

import { createEmptySeoIssueSet, seoCorePackage } from "./index.js";

describe("seo-core foundation", () => {
  it("exposes a deterministic placeholder issue set", () => {
    expect(createEmptySeoIssueSet({ pages: [] })).toEqual({ pageCount: 0, issues: [] });
  });

  it("identifies the package", () => {
    expect(seoCorePackage).toBe("seo-core");
  });
});