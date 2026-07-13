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
  type ProviderAccountService,
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
    async listAccountConnectorProviders() {
      return [];
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
  it("lists pre-aggregated tenant binding counts with one store query", async () => {
    const aggregateLookups: string[] = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async listAccounts(organizationId) {
          aggregateLookups.push(organizationId);
          return [
            { ...account({ id: "pa_one" }), bindingCount: 2 },
            { ...account({ id: "pa_two" }), bindingCount: 0 },
          ];
        },
        async countAccountBindings() {
          throw new Error("N+1 binding count query must not run");
        },
      }),
    });

    await expect(service.listAccounts({ organizationId: "org_a" })).resolves.toEqual([
      { ...account({ id: "pa_one" }), bindingCount: 2 },
      { ...account({ id: "pa_two" }), bindingCount: 0 },
    ]);
    expect(aggregateLookups).toEqual(["org_a"]);
  });

  it.each([
    ["gsc", ["https://www.googleapis.com/auth/webmasters.readonly"], true],
    ["gsc", ["https://www.googleapis.com/auth/webmasters"], true],
    ["gsc", ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/webmasters"], true],
    ["gsc", [], false],
    ["ga4", ["https://www.googleapis.com/auth/analytics.readonly"], true],
    ["ga4", ["https://www.googleapis.com/auth/analytics"], true],
    ["ga4", ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/analytics"], true],
    ["ga4", [], false],
  ] as const)("uses the shared Google scope rule for %s scopes %j", async (provider, scopes, allowed) => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
      }),
    });
    const result = service.prepareGoogleConnectors({
      grantedScopes: [...scopes],
      organizationId: "org_a",
      providerAccountId: "pa_google",
      selectedProviders: [provider],
    });

    if (allowed) {
      await expect(result).resolves.toBeDefined();
    } else {
      await expect(result).rejects.toEqual(new ProviderAccountServiceError("scope_missing"));
    }
  });

  it.each([
    ["gsc", "https://www.googleapis.com/auth/webmasters"],
    ["ga4", "https://www.googleapis.com/auth/analytics"],
  ] as const)("derives OAuth allowed provider %s from a full scope", async (provider, fullScope) => {
    let allowedProviders: readonly ("gsc" | "ga4")[] | undefined;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async upsertGoogleAccount(input) {
          allowedProviders = input.allowedConnectorProviders;
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
            scopes: [...input.scopes],
          });
        },
      }),
    });

    await service.upsertGoogleAccount({
      accessToken: "access",
      actorUserId: "user_a",
      displayName: "Google",
      organizationId: "org_a",
      refreshToken: "refresh",
      scopes: [fullScope],
      selectedProviders: [],
      tokenExpiresAt: null,
      tokenType: "Bearer",
      verifiedAccountEmail: "owner@example.com",
      verifiedExternalAccountId: `google-${provider}`,
    });

    expect(allowedProviders).toContain(provider);
  });

  it("allocates the API-key account ID before encryption and never passes the raw key to the store", async () => {
    const calls: Parameters<ProviderCredentialStore["createApiKeyAccount"]>[0][] = [];
    const store = createStore({
      async createApiKeyAccount(input) {
        if (
          input.organizationId !== "org_a" ||
          input.providerAccountId !== "pa_deterministic" ||
          input.provider !== "geo_chatgpt" ||
          input.connectedByUserId !== "user_a"
        ) {
          throw new ProviderCredentialStoreError("provider_account_identity_mismatch");
        }
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
    expect(calls).toEqual([
      {
        providerAccountId: "pa_deterministic",
        organizationId: "org_a",
        provider: "geo_chatgpt",
        authType: "api_key",
        externalAccountId: null,
        accountEmail: null,
        displayName: "Primary",
        isDefault: false,
        connectedByUserId: "user_a",
        encryptedCredential: expect.objectContaining({ encryptionKeyId: "v1" }),
      },
    ]);
    const encryptedCredential = calls[0]!.encryptedCredential;
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
    for (const wrongContext of [
      { organizationId: "org_wrong", providerAccountId: "pa_deterministic", provider: "geo_chatgpt" as const },
      { organizationId: "org_a", providerAccountId: "pa_wrong", provider: "geo_chatgpt" as const },
      { organizationId: "org_a", providerAccountId: "pa_deterministic", provider: "bing" as const },
    ]) {
      expect(() =>
        decryptProviderCredential(keyring(), wrongContext, encryptedCredential),
      ).toThrow();
    }
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

  it("rejects a default Bing account before ID generation, encryption, or store writes", async () => {
    let generatedIds = 0;
    let writes = 0;
    const service = createProviderAccountService({
      generateProviderAccountId() {
        generatedIds += 1;
        return "pa_should_not_exist";
      },
      keyring: keyring(),
      store: createStore({
        async createApiKeyAccount(input) {
          writes += 1;
          return account({ id: input.providerAccountId });
        },
      }),
    });

    await expect(
      service.createApiKeyAccount({
        actorUserId: "user_a",
        apiKey: "bing-secret",
        displayName: "Bing",
        isDefault: true,
        organizationId: "org_a",
        provider: "bing",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(generatedIds).toBe(0);
    expect(writes).toBe(0);
  });

  it.each(["geo_chatgpt", "geo_claude", "geo_gemini", "geo_perplexity"] as const)(
    "allows %s to be created as the default",
    async (provider) => {
      let createCall:
        | Parameters<ProviderCredentialStore["createApiKeyAccount"]>[0]
        | undefined;
      const service = createProviderAccountService({
        keyring: keyring(),
        store: createStore({
          async createApiKeyAccount(input) {
            createCall = input;
            return account({ provider: input.provider, isDefault: input.isDefault });
          },
        }),
      });

      await service.createApiKeyAccount({
        actorUserId: "user_a",
        apiKey: "geo-secret",
        displayName: "Default",
        isDefault: true,
        organizationId: "org_a",
        provider,
      });

      expect(createCall?.isDefault).toBe(true);
    },
  );

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

  it.each(["google", "bing"] as const)(
    "rejects setting a %s account as default after an exact tenant lookup",
    async (provider) => {
      const lookups: unknown[] = [];
      let updates = 0;
      const service = createProviderAccountService({
        keyring: keyring(),
        store: createStore({
          async getAccountMetadata(input) {
            lookups.push(input);
            return account({ id: "pa_target", organizationId: "org_target", provider });
          },
          async updateAccountMetadata() {
            updates += 1;
            return account();
          },
        }),
      });

      await expect(
        service.updateAccountMetadata({
          organizationId: "org_target",
          providerAccountId: "pa_target",
          update: { isDefault: true },
        }),
      ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
      expect(lookups).toEqual([
        { organizationId: "org_target", providerAccountId: "pa_target" },
      ]);
      expect(updates).toBe(0);
    },
  );

  it("returns account_not_found before setting a default when the tenant lookup misses", async () => {
    let updates = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          expect(input).toEqual({
            organizationId: "org_a",
            providerAccountId: "pa_foreign",
          });
          return null;
        },
        async updateAccountMetadata() {
          updates += 1;
          return account();
        },
      }),
    });

    await expect(
      service.updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_foreign",
        update: { isDefault: true },
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("account_not_found"));
    expect(updates).toBe(0);
  });

  it("allows a GEO account default update and permits clearing a legacy non-GEO default", async () => {
    const updates: unknown[] = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "geo_gemini",
          });
        },
        async updateAccountMetadata(input) {
          updates.push(input);
          return account({ isDefault: input.isDefault ?? false });
        },
      }),
    });

    await service.updateAccountMetadata({
      organizationId: "org_a",
      providerAccountId: "pa_geo",
      update: { isDefault: true },
    });
    await service.updateAccountMetadata({
      organizationId: "org_a",
      providerAccountId: "pa_bing_legacy",
      update: { isDefault: false },
    });

    expect(updates).toEqual([
      { organizationId: "org_a", providerAccountId: "pa_geo", isDefault: true },
      {
        organizationId: "org_a",
        providerAccountId: "pa_bing_legacy",
        isDefault: false,
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
    let metadataSelector:
      | Parameters<ProviderCredentialStore["getAccountMetadata"]>[0]
      | undefined;
    let replacement:
      | Parameters<ProviderCredentialStore["replaceCredential"]>[0]
      | undefined;
    const persisted = account({ id: "pa_exact", provider: "bing" });
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          metadataSelector = input;
          return persisted;
        },
        async replaceCredential(input) {
          if (input.organizationId !== "org_a" || input.providerAccountId !== "pa_exact") {
            throw new ProviderCredentialStoreError("provider_account_not_in_organization");
          }
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
    expect(metadataSelector).toEqual({
      organizationId: "org_a",
      providerAccountId: "pa_exact",
    });
    expect(replacement).toEqual({
      organizationId: "org_a",
      providerAccountId: "pa_exact",
      encryptedCredential: expect.objectContaining({ encryptionKeyId: "v1" }),
    });
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
    for (const wrongContext of [
      { organizationId: "org_wrong", providerAccountId: "pa_exact", provider: "bing" as const },
      { organizationId: "org_a", providerAccountId: "pa_wrong", provider: "bing" as const },
      { organizationId: "org_a", providerAccountId: "pa_exact", provider: "geo_chatgpt" as const },
    ]) {
      expect(() =>
        decryptProviderCredential(
          keyring(),
          wrongContext,
          replacement!.encryptedCredential,
        ),
      ).toThrow();
    }
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
    const lookups: Array<{ method: string; input: unknown }> = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          lookups.push({ method: "getAccountMetadata", input });
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
        async getAccountSecretRecord(input): Promise<ProviderAccountSecretRecord> {
          lookups.push({ method: "getAccountSecretRecord", input });
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
          if (
            input.organizationId !== "org_a" ||
            input.providerAccountId !== providerAccountId ||
            input.externalAccountId !== "google-sub-1"
          ) {
            throw new ProviderCredentialStoreError("provider_account_identity_mismatch");
          }
          upsertCall = input;
          return account({ id: providerAccountId, provider: "google", authType: "oauth2" });
        },
        async listAccountConnectorProviders(input) {
          lookups.push({ method: "listAccountConnectorProviders", input });
          return [];
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
      selectedProviders: [],
      tokenExpiresAt: null,
      tokenType: "Bearer",
      verifiedAccountEmail: "owner@example.com",
      verifiedExternalAccountId: "google-sub-1",
    });

    expect(upsertCall).toEqual({
      providerAccountId,
      organizationId: "org_a",
      externalAccountId: "google-sub-1",
      accountEmail: "owner@example.com",
      displayName: "Google owner",
      status: "connected",
      scopes: ["openid"],
      allowedConnectorProviders: [],
      expectedUpdatedAt: now,
      tokenExpiresAt: null,
      connectedByUserId: "user_a",
      encryptedCredential: expect.objectContaining({ encryptionKeyId: "v1" }),
    });
    expect(lookups).toEqual([
      {
        method: "getAccountMetadata",
        input: { organizationId: "org_a", providerAccountId },
      },
      {
        method: "listAccountConnectorProviders",
        input: { organizationId: "org_a", providerAccountId },
      },
      {
        method: "getAccountSecretRecord",
        input: { organizationId: "org_a", providerAccountId },
      },
    ]);
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
    for (const wrongContext of [
      { organizationId: "org_wrong", providerAccountId, provider: "google" as const },
      { organizationId: "org_a", providerAccountId: "pa_wrong", provider: "google" as const },
      { organizationId: "org_a", providerAccountId, provider: "bing" as const },
    ]) {
      expect(() =>
        decryptProviderCredential(
          keyring(),
          wrongContext,
          upsertCall!.encryptedCredential,
        ),
      ).toThrow();
    }
  });

  it("passes a null Google version precondition only for a new canonical account", async () => {
    const providerAccountId = deriveCanonicalProviderAccountId({
      organizationId: "org_new",
      provider: "google",
      externalAccountId: "google-sub-new",
    });
    let upsertCall:
      | Parameters<ProviderCredentialStore["upsertGoogleAccount"]>[0]
      | undefined;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async upsertGoogleAccount(input) {
          upsertCall = input;
          return account({
            id: providerAccountId,
            organizationId: "org_new",
            provider: "google",
            authType: "oauth2",
          });
        },
      }),
    });

    await service.upsertGoogleAccount({
      accessToken: "new-access",
      actorUserId: "user_new",
      displayName: "New Google",
      organizationId: "org_new",
      refreshToken: "new-refresh",
      scopes: [],
      selectedProviders: [],
      tokenExpiresAt: null,
      tokenType: "Bearer",
      verifiedAccountEmail: "new@example.com",
      verifiedExternalAccountId: "google-sub-new",
    });

    expect(upsertCall).toMatchObject({
      providerAccountId,
      organizationId: "org_new",
      externalAccountId: "google-sub-new",
      expectedUpdatedAt: null,
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
        selectedProviders: [],
        tokenExpiresAt: null,
        tokenType: null,
        verifiedAccountEmail: "not-an-email",
        verifiedExternalAccountId: "google-sub-1",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(storeCalls).toBe(0);
  });

  it("derives required Google scopes from persisted bindings and current selections only", async () => {
    const providerQueries: unknown[] = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
            scopes: ["openid", "existing-scope"],
          });
        },
        async listAccountConnectorProviders(input) {
          providerQueries.push(input);
          return ["gsc"];
        },
      }),
    });

    await expect(
      service.prepareGoogleConnectors({
        grantedScopes: [
          "https://www.googleapis.com/auth/webmasters.readonly",
        ],
        organizationId: "org_a",
        providerAccountId: "pa_test",
        selectedProviders: ["ga4"],
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("scope_missing"));

    await expect(
      service.prepareGoogleConnectors({
        grantedScopes: [
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
        organizationId: "org_a",
        providerAccountId: "pa_test",
        selectedProviders: ["ga4"],
      }),
    ).resolves.toEqual({
      requiredScopes: [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
    });
    expect(providerQueries).toEqual([
      { organizationId: "org_a", providerAccountId: "pa_test" },
      { organizationId: "org_a", providerAccountId: "pa_test" },
    ]);
  });

  it("rechecks persisted bindings inside Google upsert and leaves the credential unchanged on scope_missing", async () => {
    const providerAccountId = deriveCanonicalProviderAccountId({
      organizationId: "org_a",
      provider: "google",
      externalAccountId: "google-sub-scope",
    });
    const originalEnvelope = encryptProviderCredential(
      keyring(),
      { organizationId: "org_a", providerAccountId, provider: "google" },
      {
        kind: "oauth2",
        accessToken: "old-access-sentinel",
        refreshToken: "old-refresh-sentinel",
        tokenType: "Bearer",
      },
    );
    let storedEnvelope = { ...originalEnvelope };
    const originalEnvelopeSnapshot = structuredClone(storedEnvelope);
    let attachedProviders: SiteConnectorProvider[] = [];
    let secretReads = 0;
    let upserts = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
        async getAccountSecretRecord() {
          secretReads += 1;
          return null;
        },
        async listAccountConnectorProviders() {
          return [...attachedProviders];
        },
        async upsertGoogleAccount() {
          upserts += 1;
          storedEnvelope = {
            credentialCiphertext: "changed",
            credentialIv: "changed",
            credentialAuthTag: "changed",
            encryptionKeyId: "changed",
            encryptionVersion: 1,
          };
          return account();
        },
      }),
    });

    await expect(
      service.prepareGoogleConnectors({
        grantedScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        organizationId: "org_a",
        providerAccountId,
        selectedProviders: ["ga4"],
      }),
    ).resolves.toEqual({
      requiredScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
    attachedProviders = ["gsc"];

    await expect(
      service.upsertGoogleAccount({
        accessToken: "new-access-sentinel",
        actorUserId: "user_a",
        displayName: "Google",
        organizationId: "org_a",
        refreshToken: null,
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        selectedProviders: ["ga4"],
        tokenExpiresAt: null,
        tokenType: "Bearer",
        verifiedAccountEmail: "owner@example.com",
        verifiedExternalAccountId: "google-sub-scope",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("scope_missing"));
    expect(secretReads).toBe(0);
    expect(upserts).toBe(0);
    expect(storedEnvelope).toEqual(originalEnvelopeSnapshot);
  });

  it("fails safely when a non-Google connector provider is persisted for a Google account", async () => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
        async listAccountConnectorProviders() {
          return ["bing"];
        },
      }),
    });

    await expect(
      service.prepareGoogleConnectors({
        grantedScopes: [],
        organizationId: "org_a",
        providerAccountId: "pa_google",
        selectedProviders: [],
      }),
    ).rejects.toEqual(
      new ProviderAccountServiceError("provider_account_provider_mismatch"),
    );
  });

  it.each(["gsc", "ga4"] as const)(
    "creates a %s placeholder with a null resource for Google OAuth",
    async (provider) => {
      const calls: Parameters<ProviderCredentialStore["upsertSiteConnector"]>[0][] = [];
      const service = createProviderAccountService({
        keyring: keyring(),
        store: createStore({
          async upsertSiteConnector(input) {
            calls.push(input);
            return connector(provider, {
              externalResourceId: null,
              organizationId: input.organizationId,
              providerAccountId: input.providerAccountId,
              siteId: input.siteId,
              status: "needs_configuration",
            });
          },
        }),
      });

      await expect(
        service.upsertSiteConnector({
          externalResourceId: null,
          organizationId: "org_a",
          provider,
          providerAccountId: "pa_google",
          siteId: "site_a",
        }),
      ).resolves.toMatchObject({
        externalResourceId: null,
        provider,
        status: "needs_configuration",
      });
      expect(calls).toEqual([
        {
          externalResourceId: null,
          organizationId: "org_a",
          provider,
          providerAccountId: "pa_google",
          siteId: "site_a",
        },
      ]);
    },
  );

  it("preserves validated Google connector metadata through the store boundary", async () => {
    let call: Parameters<ProviderCredentialStore["upsertSiteConnector"]>[0] | undefined;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async upsertSiteConnector(input) {
          call = input;
          return connector(input.provider, {
            config: input.config ?? {},
            externalResourceId: input.externalResourceId,
            lastCheckedAt: input.lastCheckedAt?.toISOString() ?? null,
            lastErrorCode: input.lastErrorCode ?? null,
            organizationId: input.organizationId,
            providerAccountId: input.providerAccountId,
            siteId: input.siteId,
            status:
              input.status ??
              (input.externalResourceId === null ? "needs_configuration" : "connected"),
          });
        },
      }),
    });

    const result = await service.upsertSiteConnector({
      config: { resourceResolution: "legacy_auto" },
      externalResourceId: "sc-domain:example.com",
      lastCheckedAt: "2026-07-14T00:05:00.000Z",
      lastErrorCode: "google_permission_denied",
      organizationId: "org_a",
      provider: "gsc",
      providerAccountId: "pa_google",
      siteId: "site_a",
      status: "error",
    });

    expect(call).toEqual({
      config: { resourceResolution: "legacy_auto" },
      externalResourceId: "sc-domain:example.com",
      lastCheckedAt: new Date("2026-07-14T00:05:00.000Z"),
      lastErrorCode: "google_permission_denied",
      organizationId: "org_a",
      provider: "gsc",
      providerAccountId: "pa_google",
      siteId: "site_a",
      status: "error",
    });
    expect(result).toMatchObject({
      config: { resourceResolution: "legacy_auto" },
      externalResourceId: "sc-domain:example.com",
      lastCheckedAt: "2026-07-14T00:05:00.000Z",
      lastErrorCode: "google_permission_denied",
      providerAccountId: "pa_google",
      status: "error",
    });
  });

  it("rejects invalid internal connector metadata before store persistence", async () => {
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
        config: {},
        externalResourceId: "sc-domain:example.com",
        lastCheckedAt: "not-an-iso-date",
        lastErrorCode: null,
        organizationId: "org_a",
        provider: "gsc",
        providerAccountId: "pa_google",
        siteId: "site_a",
        status: "connected",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(writes).toBe(0);
  });

  it("rejects a null Bing resource before persistence", async () => {
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
    const invalidInput = {
      externalResourceId: null,
      organizationId: "org_a",
      provider: "bing",
      providerAccountId: "pa_bing",
      siteId: "site_a",
    } as unknown as Parameters<ProviderAccountService["upsertSiteConnector"]>[0];

    await expect(
      service.upsertSiteConnector(invalidInput),
    ).rejects.toEqual(new ProviderAccountServiceError("validation_error"));
    expect(writes).toBe(0);
  });

  it("maps an atomic store scope guard when bindings change after service validation", async () => {
    let upsertCalls = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
        async getAccountSecretRecord() {
          return null;
        },
        async listAccountConnectorProviders() {
          return [];
        },
        async upsertGoogleAccount(input) {
          upsertCalls += 1;
          expect(input.allowedConnectorProviders).toEqual(["ga4"]);
          throw new ProviderCredentialStoreError("scope_missing");
        },
      }),
    });

    await expect(
      service.upsertGoogleAccount({
        accessToken: "new-access-race",
        actorUserId: "user_a",
        displayName: "Google",
        organizationId: "org_race",
        refreshToken: "new-refresh-race",
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        selectedProviders: ["ga4"],
        tokenExpiresAt: null,
        tokenType: "Bearer",
        verifiedAccountEmail: "owner@example.com",
        verifiedExternalAccountId: "google-sub-race",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("scope_missing"));
    expect(upsertCalls).toBe(1);
  });

  it("normalizes only credential decryption failures and never upserts the Google credential", async () => {
    const providerAccountId = deriveCanonicalProviderAccountId({
      organizationId: "org_decrypt",
      provider: "google",
      externalAccountId: "google-sub-decrypt",
    });
    const envelope = encryptProviderCredential(
      keyring(),
      { organizationId: "org_decrypt", providerAccountId, provider: "google" },
      {
        kind: "oauth2",
        accessToken: "old-access-decrypt",
        refreshToken: "old-refresh-decrypt",
        tokenType: "Bearer",
      },
    );
    let upserts = 0;
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async getAccountMetadata(input) {
          return account({
            id: input.providerAccountId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
          });
        },
        async getAccountSecretRecord(): Promise<ProviderAccountSecretRecord> {
          return {
            id: providerAccountId,
            organizationId: "org_decrypt",
            provider: "google",
            authType: "oauth2",
            status: "connected",
            scopes: [],
            tokenExpiresAt: null,
            updatedAt: now,
            ...envelope,
            credentialAuthTag: Buffer.alloc(16, 9).toString("base64"),
          };
        },
        async upsertGoogleAccount() {
          upserts += 1;
          return account();
        },
      }),
    });

    await expect(
      service.upsertGoogleAccount({
        accessToken: "new-access-decrypt",
        actorUserId: "user_a",
        displayName: "Google",
        organizationId: "org_decrypt",
        refreshToken: null,
        scopes: [],
        selectedProviders: [],
        tokenExpiresAt: null,
        tokenType: "Bearer",
        verifiedAccountEmail: "owner@example.com",
        verifiedExternalAccountId: "google-sub-decrypt",
      }),
    ).rejects.toEqual(
      new ProviderAccountServiceError("credential_decryption_failed"),
    );
    expect(upserts).toBe(0);
  });

  it("forwards exact tenant and resource identifiers to account and connector store methods", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async listAccounts(organizationId) {
          calls.push({ method: "listAccounts", input: organizationId });
          return [];
        },
        async getAccountMetadata(input) {
          calls.push({ method: "getAccountMetadata", input });
          return null;
        },
        async listSiteConnectors(input) {
          calls.push({ method: "listSiteConnectors", input });
          return [];
        },
        async deleteSiteConnector(input) {
          calls.push({ method: "deleteSiteConnector", input });
          return true;
        },
        async deleteAccount(input) {
          calls.push({ method: "deleteAccount", input });
          return true;
        },
        async upsertSiteConnector(input) {
          calls.push({ method: "upsertSiteConnector", input });
          return connector(input.provider, {
            organizationId: input.organizationId,
            providerAccountId: input.providerAccountId,
            siteId: input.siteId,
          });
        },
      }),
    });

    await service.listAccounts({ organizationId: "org_exact" });
    await expect(
      service.replaceApiKeyCredential({
        apiKey: "replacement-secret",
        organizationId: "org_exact",
        providerAccountId: "pa_foreign",
      }),
    ).rejects.toEqual(new ProviderAccountServiceError("account_not_found"));
    await service.listSiteConnectors({ organizationId: "org_exact", siteId: "site_exact" });
    await service.upsertSiteConnector({
      externalResourceId: "sc-domain:example.com",
      organizationId: "org_exact",
      provider: "gsc",
      providerAccountId: "pa_exact",
      siteId: "site_exact",
    });
    await service.deleteSiteConnector({
      organizationId: "org_exact",
      provider: "gsc",
      siteId: "site_exact",
    });
    await service.deleteAccount({
      organizationId: "org_exact",
      providerAccountId: "pa_exact",
    });

    expect(calls).toEqual([
      { method: "listAccounts", input: "org_exact" },
      {
        method: "getAccountMetadata",
        input: { organizationId: "org_exact", providerAccountId: "pa_foreign" },
      },
      {
        method: "listSiteConnectors",
        input: { organizationId: "org_exact", siteId: "site_exact" },
      },
      {
        method: "upsertSiteConnector",
        input: {
          externalResourceId: "sc-domain:example.com",
          organizationId: "org_exact",
          provider: "gsc",
          providerAccountId: "pa_exact",
          siteId: "site_exact",
        },
      },
      {
        method: "deleteSiteConnector",
        input: { organizationId: "org_exact", provider: "gsc", siteId: "site_exact" },
      },
      {
        method: "deleteAccount",
        input: { organizationId: "org_exact", providerAccountId: "pa_exact" },
      },
    ]);
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

  it("maps an optimistic Google version conflict to the stable service error", async () => {
    const service = createProviderAccountService({
      keyring: keyring(),
      store: createStore({
        async upsertGoogleAccount() {
          throw new ProviderCredentialStoreError("provider_account_concurrent_update");
        },
      }),
    });

    await expect(
      service.upsertGoogleAccount({
        accessToken: "access-concurrent",
        actorUserId: "user_a",
        displayName: "Google",
        organizationId: "org_a",
        refreshToken: "refresh-concurrent",
        scopes: [],
        selectedProviders: [],
        tokenExpiresAt: null,
        tokenType: "Bearer",
        verifiedAccountEmail: "owner@example.com",
        verifiedExternalAccountId: "google-sub-concurrent",
      }),
    ).rejects.toEqual(
      new ProviderAccountServiceError("provider_account_concurrent_update"),
    );
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
    ["bing", "https://example.com/site", "https://example.com/site"],
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
    ["ga4", "0"],
    ["ga4", "00"],
    ["ga4", "00123"],
    ["ga4", "properties/0"],
    ["ga4", "properties/00123"],
    ["gsc", "sc-domain:https://example.com"],
    ["gsc", "sc-domain:example.com/path"],
    ["gsc", "ftp://example.com/"],
    ["bing", "example.com"],
    ["bing", "http://example.com/"],
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
