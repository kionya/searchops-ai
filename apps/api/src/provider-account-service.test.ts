import { describe, expect, it } from "vitest";

import {
  decryptProviderCredential,
  deriveCanonicalProviderAccountId,
  encryptProviderCredential,
  parseCredentialKeyring,
  ProviderCredentialStoreError,
  type CredentialKeyring,
  type ProviderAccountSecretRecord,
  type ProviderCredentialStore,
} from "@searchops/db";
import type {
  ProviderAccountMetadata,
  SiteConnector,
  SiteConnectorProvider,
} from "@searchops/types";

import {
  ProviderAccountServiceError,
  createProviderAccountService,
} from "./provider-account-service.js";

const now = "2026-07-14T00:00:00.000Z";

function keyring(): CredentialKeyring {
  return parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
  });
}

function account(
  overrides: Partial<ProviderAccountMetadata> = {},
): ProviderAccountMetadata {
  return {
    id: "pa_test",
    organizationId: "org_a",
    provider: "geo_chatgpt",
    authType: "api_key",
    externalAccountId: null,
    accountEmail: null,
    displayName: "Primary",
    status: "connected",
    scopes: [],
    tokenExpiresAt: null,
    isDefault: false,
    legacyCredentialId: null,
    connectedByUserId: "user_a",
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    credentialSource: "encrypted",
    ...overrides,
  };
}

function connector(
  provider: SiteConnectorProvider,
  overrides: Partial<SiteConnector> = {},
): SiteConnector {
  return {
    id: `connector_${provider}`,
    organizationId: "org_a",
    siteId: "site_a",
    provider,
    providerAccountId: "pa_test",
    externalResourceId: provider === "ga4" ? "properties/123" : "https://example.com/",
    config: {},
    status: "connected",
    lastErrorCode: null,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createStore(
  overrides: Partial<ProviderCredentialStore> = {},
): ProviderCredentialStore {
  return {
    async listAccounts() {
      return [];
    },
    async getAccountMetadata() {
      return null;
    },
    async getAccountSecretRecord() {
      return null;
    },
    async createApiKeyAccount(input) {
      return account({
        id: input.providerAccountId,
        organizationId: input.organizationId,
        provider: input.provider,
        displayName: input.displayName,
        isDefault: input.isDefault,
      });
    },
    async updateAccountMetadata() {
      return account();
    },
    async replaceCredential() {
      return account();
    },
    async upsertGoogleAccount(input) {
      return account({
        id: input.providerAccountId,
        organizationId: input.organizationId,
        provider: "google",
        authType: "oauth2",
        externalAccountId: input.externalAccountId,
        accountEmail: input.accountEmail,
        displayName: input.displayName,
        scopes: [...input.scopes],
      });
    },
    async deleteAccount() {
      return true;
    },
    async listSiteConnectors() {
      return [];
    },
    async upsertSiteConnector(input) {
      return connector(input.provider, {
        organizationId: input.organizationId,
        siteId: input.siteId,
        providerAccountId: input.providerAccountId,
        externalResourceId: input.externalResourceId,
      });
    },
    async deleteSiteConnector() {
      return true;
    },
    async countAccountBindings() {
      return 0;
    },
    async getCredentialReadinessSnapshot() {
      return {
        configuredByProvider: { bing: 0, ga4: 0, gsc: 0 },
        encryptedAccounts: 0,
        legacyFallbacks: 0,
      };
    },
    ...overrides,
  };
}

describe("ProviderAccountService", () => {
  it("allocates the API-key account ID before encryption and never passes the raw key to the store", async () => {
    const calls: unknown[] = [];
    const store = createStore({
      async createApiKeyAccount(input) {
        calls.push(input);
        return account({ id: input.providerAccountId, provider: input.provider });
      },
    });
    const service = createProviderAccountService({
      generateProviderAccountId: () => "pa_deterministic",
      keyring: keyring(),
      store,
    });

    await service.createApiKeyAccount({
      actorUserId: "user_a",
      apiKey: "raw-secret",
      displayName: "Primary",
      organizationId: "org_a",
      provider: "geo_chatgpt",
    });

    expect(JSON.stringify(calls)).not.toContain("raw-secret");
    expect(calls).toMatchObject([
      {
        providerAccountId: "pa_deterministic",
        encryptedCredential: { encryptionKeyId: "v1" },
      },
    ]);
    const encryptedCredential = (
      calls[0] as Parameters<ProviderCredentialStore["createApiKeyAccount"]>[0]
    ).encryptedCredential;
    expect(
      decryptProviderCredential(
        keyring(),
        {
          organizationId: "org_a",
          providerAccountId: "pa_deterministic",
          provider: "geo_chatgpt",
        },
        encryptedCredential,
      ),
    ).toEqual({ kind: "api_key", apiKey: "raw-secret" });
  });

  it.each(["bing", "geo_chatgpt", "geo_claude", "geo_gemini", "geo_perplexity"] as const)(
    "permits API-key account creation for %s",
    async (provider) => {
      const service = createProviderAccountService({ keyring: keyring(), store: createStore() });

      await expect(
        service.createApiKeyAccount({
          actorUserId: "user_a",
          apiKey: "secret",
          displayName: "Account",
          organizationId: "org_a",
          provider,
        }),
      ).resolves.toMatchObject({ provider });
    },
  );

  it("rejects Google API-key accounts", async () => {
    const service = createProviderAccountService({ keyring: keyring(), store: createStore() });

    await expect(
      service.createApiKeyAccount({
        actorUserId: "user_a",
        apiKey: "secret",
        displayName: "Google",
        organizationId: "org_a",
        provider: "google",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
  });

  it("uses the strict metadata update store method and maps a missing account", async () => {
    const calls: unknown[] = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async updateAccountMetadata(input) {
          calls.push(input);
          return null;
        },
      }),
    });

    await expect(
      service.updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_missing",
        update: { displayName: "Renamed" },
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("account_not_found"));
    expect(calls).toEqual([
      {
        organizationId: "org_a",
        providerAccountId: "pa_missing",
        displayName: "Renamed",
      },
    ]);
  });

  it("requires api_key auth type before replacement and does not write", async () => {
    let replaceCalls = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata() {
          return account({ provider: "google", authType: "oauth2" });
        },
        async replaceCredential() {
          replaceCalls += 1;
          return account();
        },
      }),
    });

    await expect(
      service.replaceApiKeyCredential({
        apiKey: "new-secret",
        organizationId: "org_a",
        providerAccountId: "pa_test",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(replaceCalls).toBe(0);
  });

  it("encrypts replacement credentials against persisted account identity", async () => {
    let replacement:
      | Parameters<ProviderCredentialStore["replaceCredential"]>[0]
      | undefined;
    const persisted = account({ id: "pa_exact", provider: "bing" });
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata() {
          return persisted;
        },
        async replaceCredential(input) {
          replacement = input;
          return persisted;
        },
      }),
    });

    await service.replaceApiKeyCredential({
      apiKey: "new-secret",
      organizationId: "org_a",
      providerAccountId: "pa_exact",
    });

    expect(JSON.stringify(replacement)).not.toContain("new-secret");
    expect(
      decryptProviderCredential(
        keyring(),
        {
          organizationId: "org_a",
          providerAccountId: "pa_exact",
          provider: "bing",
        },
        replacement!.encryptedCredential,
      ),
    ).toEqual({ kind: "api_key", apiKey: "new-secret" });
  });

  it("preserves the existing Google refresh token when a new grant omits it", async () => {
    const providerAccountId = deriveCanonicalProviderAccountId({
      organizationId: "org_a",
      provider: "google",
      externalAccountId: "google-sub-1",
    });
    const existingEnvelope = encryptProviderCredential(
      keyring(),
      { organizationId: "org_a", providerAccountId, provider: "google" },
      {
        kind: "oauth2",
        accessToken: "old-access",
        refreshToken: "preserved-refresh",
        tokenType: "Bearer",
      },
    );
    let upsertCall:
      | Parameters<ProviderCredentialStore["upsertGoogleAccount"]>[0]
      | undefined;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountSecretRecord(): Promise<ProviderAccountSecretRecord> {
          return {
            id: providerAccountId,
            organizationId: "org_a",
            provider: "google",
            authType: "oauth2",
            status: "connected",
            scopes: ["openid"],
            tokenExpiresAt: null,
            updatedAt: now,
            ...existingEnvelope,
          };
        },
        async upsertGoogleAccount(input) {
          upsertCall = input;
          return account({ id: providerAccountId, provider: "google", authType: "oauth2" });
        },
      }),
    });

    await service.upsertGoogleAccount({
      accessToken: "new-access",
      actorUserId: "user_a",
      displayName: "Google owner",
      organizationId: "org_a",
      refreshToken: null,
      scopes: ["openid"],
      tokenExpiresAt: null,
      tokenType: "Bearer",
      verifiedAccountEmail: "owner@example.com",
      verifiedExternalAccountId: "google-sub-1",
    });

    expect(upsertCall?.providerAccountId).toBe(providerAccountId);
    expect(JSON.stringify(upsertCall)).not.toContain("new-access");
    expect(JSON.stringify(upsertCall)).not.toContain("preserved-refresh");
    expect(
      decryptProviderCredential(
        keyring(),
        { organizationId: "org_a", providerAccountId, provider: "google" },
        upsertCall!.encryptedCredential,
      ),
    ).toEqual({
      kind: "oauth2",
      accessToken: "new-access",
      refreshToken: "preserved-refresh",
      tokenType: "Bearer",
    });
  });

  it("rejects malformed verified Google identity before store access", async () => {
    let storeCalls = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountSecretRecord() {
          storeCalls += 1;
          return null;
        },
      }),
    });

    await expect(
      service.upsertGoogleAccount({
        accessToken: "access",
        actorUserId: "user_a",
        displayName: "Google",
        organizationId: "org_a",
        refreshToken: "refresh",
        scopes: [],
        tokenExpiresAt: null,
        tokenType: null,
        verifiedAccountEmail: "not-an-email",
        verifiedExternalAccountId: "google-sub-1",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(storeCalls).toBe(0);
  });

  it("requires scopes for attached and selected Google connectors without weakening the existing grant", async () => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata() {
          return account({
            provider: "google",
            authType: "oauth2",
            scopes: ["openid", "existing-scope"],
          });
        },
      }),
    });

    await expect(
      service.prepareGoogleConnectors({
        alreadyAttachedProviders: ["gsc"],
        grantedScopes: [
          "openid",
          "existing-scope",
          "https://www.googleapis.com/auth/webmasters.readonly",
        ],
        organizationId: "org_a",
        providerAccountId: "pa_test",
        selectedProviders: ["ga4"],
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("scope_missing"));

    await expect(
      service.prepareGoogleConnectors({
        alreadyAttachedProviders: ["gsc"],
        grantedScopes: [
          "openid",
          "existing-scope",
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
        organizationId: "org_a",
        providerAccountId: "pa_test",
        selectedProviders: ["ga4"],
      }),
    ).resolves.toEqual({
      requiredScopes: [
        "existing-scope",
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/webmasters.readonly",
        "openid",
      ],
    });
  });

  it("maps store errors to stable redacted service errors", async () => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async deleteAccount() {
          throw new ProviderCredentialStoreError("account_in_use");
        },
      }),
    });

    await expect(
      service.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_test" }),
    ).rejects.toEqual(new ProviderAccountServiceError("account_in_use"));
  });

  it("maps a false account deletion to account_not_found", async () => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({ async deleteAccount() { return false; } }),
    });

    await expect(
      service.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_missing" }),
    ).rejects.toEqual(new ProviderAccountServiceError("account_not_found"));
  });

  it.each([
    ["ga4", "123456789", "properties/123456789"],
    ["ga4", "properties/123456789", "properties/123456789"],
    ["gsc", "sc-domain:example.com", "sc-domain:example.com"],
    ["gsc", "https://example.com/prefix/", "https://example.com/prefix/"],
    ["bing", "http://example.com/site", "http://example.com/site"],
  ] as const)(
    "normalizes %s resource %s before persistence",
    async (provider, externalResourceId, expected) => {
      let call: Parameters<ProviderCredentialStore["upsertSiteConnector"]>[0] | undefined;
      const service = createProviderAccountService({
        keyring: keyring(),
        store: createStore({
          async upsertSiteConnector(input) {
            call = input;
            return connector(input.provider, { externalResourceId: input.externalResourceId });
          },
        }),
      });

      await service.upsertSiteConnector({
        externalResourceId,
        organizationId: "org_a",
        provider,
        providerAccountId: "pa_test",
        siteId: "site_a",
      });

      expect(call?.externalResourceId).toBe(expected);
    },
  );

  it.each([
    ["ga4", "properties/not-digits"],
    ["ga4", "accounts/123"],
    ["gsc", "sc-domain:https://example.com"],
    ["gsc", "sc-domain:example.com/path"],
    ["gsc", "ftp://example.com/"],
    ["bing", "example.com"],
    ["bing", "ftp://example.com/"],
  ] as const)("rejects malformed %s resource %s", async (provider, externalResourceId) => {
    let writes = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async upsertSiteConnector(input) {
          writes += 1;
          return connector(input.provider);
        },
      }),
    });

    await expect(
      service.upsertSiteConnector({
        externalResourceId,
        organizationId: "org_a",
        provider,
        providerAccountId: "pa_test",
        siteId: "site_a",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(writes).toBe(0);
  });
});
