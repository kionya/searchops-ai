import { describe, expect, it } from "vitest";

import { createPlaceholderSnapshot, crawlerCorePackage } from "./index.js";

describe("crawler-core foundation", () => {
  it("creates a typed placeholder snapshot", () => {
    expect(createPlaceholderSnapshot("https://example.com")).toEqual({
      url: "https://example.com",
      h1Count: 0
    });
  });

  it("identifies the package", () => {
    expect(crawlerCorePackage).toBe("crawler-core");
  });
});