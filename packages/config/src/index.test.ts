import { describe, expect, it } from "vitest";

import { configPackage, repoTaskNames } from "./index.js";

describe("config foundation", () => {
  it("declares the baseline repo tasks", () => {
    expect(repoTaskNames).toContain("typecheck");
  });

  it("identifies the package", () => {
    expect(configPackage).toBe("config");
  });
});