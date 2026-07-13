import { describe, expect, it } from "vitest";

import {
  CompleteGoogleOAuthResponseSchema,
  CredentialStorageModeSchema,
  ProviderAccountDetailResponseSchema,
  ProviderAccountListResponseSchema,
  ProviderCredentialSecretSchema,
  ReplaceProviderCredentialRequestSchema,
  SiteConnectorConfigSchema,
  SiteConnectorDetailResponseSchema,
  SiteConnectorListResponseSchema,
  SiteConnectorSchema,
  UpdateProviderAccountMetadataRequestSchema,
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

const providerAccountSummary = {
  ...providerAccount,
  bindingCount: 2,
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

  it("accepts only non-empty provider account metadata updates", () => {
    expect(
      UpdateProviderAccountMetadataRequestSchema.parse({
        displayName: "  Renamed account  ",
      }),
    ).toEqual({ displayName: "Renamed account" });
    expect(UpdateProviderAccountMetadataRequestSchema.parse({ isDefault: false })).toEqual({
      isDefault: false,
    });
    expect(() => UpdateProviderAccountMetadataRequestSchema.parse({})).toThrow();
    expect(() =>
      UpdateProviderAccountMetadataRequestSchema.parse({ displayName: "   " }),
    ).toThrow();
  });

  it.each([
    { status: "revoked" },
    { provider: "bing" },
    { email: "other@example.test" },
    { accountEmail: "other@example.test" },
    { scopes: ["scope.write"] },
    { secret: "raw-secret" },
    { credentialCiphertext: "encrypted-secret" },
    { credentialIv: "encrypted-iv" },
    { credentialAuthTag: "encrypted-auth-tag" },
    { encryptionKeyId: "key-v2" },
  ])("rejects non-metadata provider account update fields", (payload) => {
    expect(() =>
      UpdateProviderAccountMetadataRequestSchema.parse({ displayName: "Allowed", ...payload }),
    ).toThrow();
  });

  it("accepts only a direct API key for credential replacement", () => {
    expect(ReplaceProviderCredentialRequestSchema.parse({ apiKey: "key-123" })).toEqual({
      apiKey: "key-123",
    });
    expect(() => ReplaceProviderCredentialRequestSchema.parse({ apiKey: "" })).toThrow();
    expect(() =>
      ReplaceProviderCredentialRequestSchema.parse({
        credential: { kind: "api_key", apiKey: "key-123" },
      }),
    ).toThrow();
    expect(() =>
      ReplaceProviderCredentialRequestSchema.parse({
        kind: "oauth2",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
      }),
    ).toThrow();
    expect(() =>
      ReplaceProviderCredentialRequestSchema.parse({ apiKey: "key-123", status: "connected" }),
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

  it("accepts the approved legacy GSC connector resolution metadata", () => {
    expect(SiteConnectorConfigSchema.parse({ resourceResolution: "legacy_auto" })).toEqual({
      resourceResolution: "legacy_auto",
    });
  });

  it("rejects undeclared site connector config values and keys", () => {
    expect(() =>
      SiteConnectorConfigSchema.parse({ resourceResolution: "automatic" }),
    ).toThrow();
    expect(() => SiteConnectorConfigSchema.parse({ apiKey: "fake-api-key" })).toThrow();
    expect(() => SiteConnectorConfigSchema.parse({ accessToken: "fake-access-token" })).toThrow();
    expect(() =>
      SiteConnectorConfigSchema.parse({ credentialCiphertext: "fake-ciphertext" }),
    ).toThrow();
    expect(() => SiteConnectorConfigSchema.parse({ undeclared: true })).toThrow();
  });

  it("accepts an unconfigured site connector without weakening upsert input", () => {
    expect(
      SiteConnectorSchema.parse({
        ...siteConnector,
        externalResourceId: null,
        status: "needs_configuration",
        config: {},
      }),
    ).toMatchObject({
      externalResourceId: null,
      status: "needs_configuration",
      config: {},
    });
    expect(() =>
      UpsertSiteConnectorRequestSchema.parse({
        providerAccountId: "pa_google_1",
        externalResourceId: null,
      }),
    ).toThrow();
  });

  it("requires a non-secret binding count on provider account list items", () => {
    expect(
      ProviderAccountListResponseSchema.parse({ providerAccounts: [providerAccountSummary] }),
    ).toEqual({ providerAccounts: [providerAccountSummary] });
    expect(() =>
      ProviderAccountListResponseSchema.parse({ providerAccounts: [providerAccount] }),
    ).toThrow();
  });

  it.each([
    ["Provider account list", ProviderAccountListResponseSchema, "providerAccounts", providerAccountSummary],
    ["Provider account detail", ProviderAccountDetailResponseSchema, "providerAccount", providerAccount],
  ] as const)("rejects raw and encrypted credentials from %s responses", (_name, schema, key, value) => {
    const responseValue = (record: Record<string, unknown>) =>
      key.endsWith("s") ? [record] : record;
    expect(() => schema.parse({ [key]: responseValue({ ...value, apiKey: "fake-api-key" }) })).toThrow();
    expect(() => schema.parse({ [key]: responseValue(value) })).not.toThrow();
    expect(() => schema.parse({ [key]: responseValue({ ...value, credentialCiphertext: "fake-ciphertext" }) })).toThrow();
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

  it("accepts only metadata in the Google OAuth completion response", () => {
    const completion = {
      account: providerAccount,
      siteConnectors: [
        {
          ...siteConnector,
          externalResourceId: null,
          status: "needs_configuration" as const,
        },
      ],
      status: "connected" as const,
    };

    expect(CompleteGoogleOAuthResponseSchema.parse(completion)).toEqual(completion);

    for (const leaked of [
      { account: { ...providerAccount, accessToken: "access-secret" } },
      { account: { ...providerAccount, refreshToken: "refresh-secret" } },
      { account: { ...providerAccount, credentialCiphertext: "ciphertext-secret" } },
      { account: { ...providerAccount, credentialIv: "iv-secret" } },
      { account: { ...providerAccount, credentialAuthTag: "tag-secret" } },
      { account: { ...providerAccount, encryptionKeyId: "key-secret" } },
      {
        siteConnectors: [
          { ...siteConnector, config: { nested: { apiKey: "api-key-secret" } } },
        ],
      },
    ]) {
      expect(() =>
        CompleteGoogleOAuthResponseSchema.parse({ ...completion, ...leaked }),
      ).toThrow();
    }
  });
});
