import { describe, expect, it } from "vitest";

import { createBadgeLabel, uiPackage } from "./index.js";

describe("ui foundation", () => {
  it("provides a placeholder UI helper", () => {
    expect(createBadgeLabel({ label: "  SEO  " })).toBe("SEO");
  });

  it("identifies the package", () => {
    expect(uiPackage).toBe("ui");
  });
});