import { describe, expect, it } from "vitest";

import { connectorsPackage, liveExternalApisDefault } from "./index.js";

describe("connectors foundation", () => {
  it("keeps live external APIs disabled by default", () => {
    expect(liveExternalApisDefault).toBe("disabled");
  });

  it("identifies the package", () => {
    expect(connectorsPackage).toBe("connectors");
  });
});