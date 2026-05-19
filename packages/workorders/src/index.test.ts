import { describe, expect, it } from "vitest";

import { workOrderInputSources, workordersPackage } from "./index.js";

describe("workorders foundation", () => {
  it("declares SEO and compliance as future input sources", () => {
    expect(workOrderInputSources).toEqual(["seo-core", "compliance"]);
  });

  it("identifies the package", () => {
    expect(workordersPackage).toBe("workorders");
  });
});