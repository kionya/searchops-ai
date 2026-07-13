import { describe, expect, it } from "vitest";

import {
  CredentialStorageModeSchema,
  ProviderAccountDetailResponseSchema,
  ProviderAccountListResponseSchema,
  ProviderCredentialSecretSchema,
  SiteConnectorConfigSchema,
  SiteConnectorDetailResponseSchema,
  SiteConnectorListResponseSchema,
  UpsertSiteConnectorRequestSchema,
} from "./provider-credentials.js";

const providerAccount = {
  id: "pa_1",
  organizationId: "org_1",
  provider: "google" as const,
  authType: "oauth2" as const,
  externalAccountId: "acct_1",
  accountEmail: "account@example.test",
  displayName: "Google account",
  status: "connected" as const,
  scopes: ["scope.read"],
  tokenExpiresAt: "2026-07-13T00:00:00.000Z",
  isDefault: true,
  legacyCredentialId: null,
  connectedByUserId: "user_1",
  connectedAt: "2026-07-13T00:00:00.000Z",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  credentialSource: "encrypted" as const,
};

const siteConnector = {
  id: "sc_1",
  organizationId: "org_1",
  siteId: "site_1",
  provider: "gsc" as const,
  providerAccountId: "pa_1",
  externalResourceId: "resource_1",
  config: {},
  status: "connected" as const,
  lastErrorCode: null,
  lastCheckedAt: "2026-07-13T00:00:00.000Z",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

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

  it("accepts the approved empty site connector config", () => {
    expect(SiteConnectorConfigSchema.parse({})).toEqual({});
  });

  it.each([
    ["Provider account list", ProviderAccountListResponseSchema, "providerAccounts"],
    ["Provider account detail", ProviderAccountDetailResponseSchema, "providerAccount"],
  ] as const)("rejects raw and encrypted credentials from %s responses", (_name, schema, key) => {
    const responseValue = (record: Record<string, unknown>) =>
      key.endsWith("s") ? [record] : record;
    expect(() => schema.parse({ [key]: responseValue({ ...providerAccount, apiKey: "fake-api-key" }) })).toThrow();
    expect(() => schema.parse({ [key]: responseValue(providerAccount) })).not.toThrow();
    expect(() => schema.parse({ [key]: responseValue({ ...providerAccount, credentialCiphertext: "fake-ciphertext" }) })).toThrow();
  });

  it.each([
    ["Site connector list", SiteConnectorListResponseSchema, "siteConnectors"],
    ["Site connector detail", SiteConnectorDetailResponseSchema, "siteConnector"],
  ] as const)("rejects raw and encrypted credentials from %s responses", (_name, schema, key) => {
    const responseValue = (record: Record<string, unknown>) =>
      key.endsWith("s") ? [record] : record;
    expect(() => schema.parse({ [key]: responseValue({ ...siteConnector, config: { accessToken: "fake-access-token" } }) })).toThrow();
    expect(() => schema.parse({ [key]: responseValue(siteConnector) })).not.toThrow();
    expect(() => schema.parse({ [key]: responseValue({ ...siteConnector, config: { credentialCiphertext: "fake-ciphertext" } }) })).toThrow();
  });
});
