import { describe, expect, it } from "vitest";

import {
  CredentialStorageModeSchema,
  ProviderCredentialSecretSchema,
  UpsertSiteConnectorRequestSchema,
} from "./provider-credentials.js";

describe("provider credential contracts", () => {
  it("accepts supported storage modes", () => {
    expect(CredentialStorageModeSchema.parse("dual")).toBe("dual");
    expect(CredentialStorageModeSchema.parse("encrypted")).toBe("encrypted");
    expect(() => CredentialStorageModeSchema.parse("legacy")).toThrow();
  });

  it("keeps secret payloads discriminated", () => {
    expect(
      ProviderCredentialSecretSchema.parse({ kind: "api_key", apiKey: "key-123" }),
    ).toEqual({
      kind: "api_key",
      apiKey: "key-123",
    });
    expect(() =>
      ProviderCredentialSecretSchema.parse({ kind: "api_key", accessToken: "x" }),
    ).toThrow();
  });

  it("normalizes a numeric GA4 property", () => {
    expect(
      UpsertSiteConnectorRequestSchema.parse({
        providerAccountId: "pa_google_1",
        externalResourceId: "123456789",
      }),
    ).toEqual({
      providerAccountId: "pa_google_1",
      externalResourceId: "123456789",
    });
  });
});
