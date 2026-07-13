import { describe, expect, it } from "vitest";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type ProviderAccountSecretRecord,
} from "@searchops/db";
import type { ConnectorSyncJobPayload, SiteConnector } from "@searchops/types";

import {
  createProviderCredentialResolver,
  createRedisProviderAccountRefreshLock,
  type ProviderCredentialResolverStore,
} from "./provider-credential-resolver.js";

const now = new Date("2026-07-14T00:00:00.000Z");
const keyring = parseCredentialKeyring({
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
});

describe("provider credential resolver", () => {
  it("uses an atomic Redis lock and releases only its own token", async () => {
    const calls: unknown[] = [];
    const lock = createRedisProviderAccountRefreshLock(
      async () => ({
        async eval(script, keyCount, key, token) {
          calls.push(["eval", script, keyCount, key, token]);
          return 1;
        },
        async set(key, token, px, ttl, nx) {
          calls.push(["set", key, token, px, ttl, nx]);
          return "OK";
        },
      }),
      { createToken: () => "lock-token", ttlMs: 30_000 },
    );

    await expect(
      lock.withLock("provider-account-refresh:pa_google", async () => "done"),
    ).resolves.toBe("done");
    expect(calls[0]).toEqual([
      "set",
      "provider-account-refresh:pa_google",
      "lock-token",
      "PX",
      30_000,
      "NX",
    ]);
    expect(calls[1]).toEqual([
      "eval",
      expect.stringContaining("redis.call('get', KEYS[1])"),
      1,
      "provider-account-refresh:pa_google",
      "lock-token",
    ]);
  });

  it("returns different GA4 resources for two sites sharing one Google account", async () => {
    const account = encryptedAccount();
    const store = createStore({
      accounts: [account],
      connectors: [
        siteConnector({ siteId: "site_a", externalResourceId: "properties/111" }),
        siteConnector({ siteId: "site_b", externalResourceId: "222" }),
      ],
      sites: [
        { id: "site_a", organizationId: "org_a" },
        { id: "site_b", organizationId: "org_a" },
      ],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store,
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"])),
    ).resolves.toMatchObject({
      configs: { ga4: { propertyId: "properties/111" } },
      credentialSources: { ga4: "encrypted" },
    });
    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_b", ["ga4"])),
    ).resolves.toMatchObject({
      configs: { ga4: { propertyId: "properties/222" } },
      credentialSources: { ga4: "encrypted" },
    });
  });

  it("rejects a cross-organization account before attempting decryption", async () => {
    const mismatched = encryptedAccount({ organizationId: "org_b" });
    const store = createStore({
      accounts: [mismatched],
      connectors: [siteConnector()],
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store,
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"])),
    ).resolves.toEqual({
      configs: {},
      credentialSources: {},
      failures: { ga4: "account_missing" },
    });
  });

  it("does not read legacy Google credentials when an encrypted connector exists", async () => {
    let legacyReadCount = 0;
    const store = createStore({
      accounts: [encryptedAccount()],
      connectors: [siteConnector()],
      onListLegacyCredentials() {
        legacyReadCount += 1;
      },
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "dual",
      store,
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"])),
    ).resolves.toMatchObject({ credentialSources: { ga4: "encrypted" } });
    expect(legacyReadCount).toBe(0);
  });

  it("uses legacy Google and global Bing only in dual mode", async () => {
    const store = createStore({
      legacyCredentials: [
        {
          accessToken: "legacy-ga4",
          externalAccountEmail: null,
          provider: "ga4",
          refreshToken: null,
          status: "connected",
          tokenExpiresAt: null,
          tokenType: "Bearer",
        },
      ],
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const dualResolver = createProviderCredentialResolver({
      globalBingApiKey: "global-bing",
      keyring,
      legacyGa4PropertyId: "333",
      now: () => now,
      storageMode: "dual",
      store,
    });
    const encryptedResolver = createProviderCredentialResolver({
      globalBingApiKey: "global-bing",
      keyring,
      legacyGa4PropertyId: "333",
      now: () => now,
      storageMode: "encrypted",
      store,
    });

    await expect(
      dualResolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4", "bing"])),
    ).resolves.toMatchObject({
      configs: {
        ga4: { propertyId: "properties/333" },
        bing: { apiKey: "global-bing", siteUrl: "example.com" },
      },
      credentialSources: { bing: "legacy", ga4: "legacy" },
      failures: {},
    });
    await expect(
      encryptedResolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["ga4", "bing"]),
      ),
    ).resolves.toEqual({
      configs: {},
      credentialSources: {},
      failures: { bing: "connector_missing", ga4: "connector_missing" },
    });
  });

  it("resolves GSC legacy auto and the PageSpeed platform key without fixture data", async () => {
    const store = createStore({
      legacyCredentials: [
        {
          accessToken: "legacy-gsc",
          externalAccountEmail: null,
          provider: "gsc",
          refreshToken: null,
          status: "connected",
          tokenExpiresAt: null,
          tokenType: "Bearer",
        },
      ],
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      pagespeedApiKey: "platform-pagespeed",
      storageMode: "dual",
      store,
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["gsc", "pagespeed"]),
      ),
    ).resolves.toMatchObject({
      configs: {
        gsc: { propertyId: "https://example.com/" },
        pagespeed: { apiKey: "platform-pagespeed", siteUrl: "example.com" },
      },
      credentialSources: { gsc: "legacy", pagespeed: "platform" },
      failures: {},
    });
  });

  it("refreshes an expiring Google account under an account-scoped lock and optimistic write", async () => {
    const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const updatedAccounts: unknown[] = [];
    const lockKeys: string[] = [];
    const store = createStore({
      accounts: [account],
      connectors: [siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" })],
      onUpdateAccount(input) {
        updatedAccounts.push(input);
      },
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      fetch: (async (url, init) => {
        expect(String(url)).toBe("https://oauth2.googleapis.com/token");
        expect(String(init?.body)).toContain("refresh_token=refresh-token");
        return new Response(
          JSON.stringify({ access_token: "fresh-access", expires_in: 3600, token_type: "Bearer" }),
          { status: 200 },
        );
      }) as typeof fetch,
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: {
        async withLock(key, operation) {
          lockKeys.push(key);
          return operation();
        },
      },
      storageMode: "encrypted",
      store,
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["gsc"]),
    );

    expect(lockKeys).toEqual(["provider-account-refresh:pa_google"]);
    expect(updatedAccounts[0]).toMatchObject({
      expectedUpdatedAt: account.updatedAt,
      organizationId: "org_a",
      providerAccountId: "pa_google",
      status: "connected",
      tokenExpiresAt: new Date("2026-07-14T01:00:00.000Z"),
    });
    const update = updatedAccounts[0] as {
      encryptedCredential: Parameters<typeof decryptProviderCredential>[2];
    };
    expect(
      decryptProviderCredential(
        keyring,
        { organizationId: "org_a", provider: "google", providerAccountId: "pa_google" },
        update.encryptedCredential,
      ),
    ).toEqual({
      accessToken: "fresh-access",
      kind: "oauth2",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
    });
    expect(result.configs.gsc?.credential.accessToken).toBe("fresh-access");
  });

  it("normalizes Redis refresh-lock failures without exposing infrastructure errors", async () => {
    const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      refreshLock: createRedisProviderAccountRefreshLock(async () => ({
        async eval() {
          return 0;
        },
        async set() {
          throw new Error("redis connection includes internal host details");
        },
      })),
      storageMode: "encrypted",
      store: createStore({
        accounts: [account],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["gsc"]),
    );

    expect(result).toEqual({
      configs: {},
      credentialSources: {},
      failures: { gsc: "provider_rate_limited" },
    });
    expect(JSON.stringify(result)).not.toContain("internal host details");
  });

  it("returns only a normalized failure when credential decryption fails", async () => {
    const account = encryptedAccount();
    const store = createStore({
      accounts: [{ ...account, credentialAuthTag: Buffer.alloc(16, 9).toString("base64") }],
      connectors: [siteConnector()],
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store,
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["ga4"]),
    );

    expect(result).toEqual({
      configs: {},
      credentialSources: {},
      failures: { ga4: "credential_decryption_failed" },
    });
    expect(JSON.stringify(result)).not.toContain(account.credentialCiphertext);
  });
});

function connectorJob(
  siteId: string,
  providers: ConnectorSyncJobPayload["providers"],
): ConnectorSyncJobPayload {
  return {
    connectorSyncRunId: `sync_${siteId}`,
    fetchedAt: now.toISOString(),
    organizationId: "org_a",
    providers,
    requestedByUserId: "user_a",
    siteDomain: "example.com",
    siteId,
  };
}

function encryptedAccount(
  overrides: Partial<ProviderAccountSecretRecord> = {},
): ProviderAccountSecretRecord {
  const organizationId = overrides.organizationId ?? "org_a";
  const id = overrides.id ?? "pa_google";
  const provider = overrides.provider ?? "google";
  const envelope = encryptProviderCredential(
    keyring,
    { organizationId, provider, providerAccountId: id },
    {
      accessToken: "access-token",
      kind: "oauth2",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
    },
  );

  return {
    ...envelope,
    authType: "oauth2",
    id,
    organizationId,
    provider,
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    status: "connected",
    tokenExpiresAt: null,
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

function siteConnector(overrides: Partial<SiteConnector> = {}): SiteConnector {
  return {
    config: {},
    createdAt: "2026-07-14T00:00:00.000Z",
    externalResourceId: "properties/111",
    id: "sc_ga4",
    lastCheckedAt: null,
    lastErrorCode: null,
    organizationId: "org_a",
    provider: "ga4",
    providerAccountId: "pa_google",
    siteId: "site_a",
    status: "connected",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

function createStore(input: {
  readonly accounts?: readonly ProviderAccountSecretRecord[];
  readonly connectors?: readonly SiteConnector[];
  readonly legacyCredentials?: Awaited<
    ReturnType<ProviderCredentialResolverStore["listLegacyGoogleCredentials"]>
  >;
  readonly onUpdateAccount?: Parameters<
    ProviderCredentialResolverStore["updateProviderAccountCredential"]
  >[0] extends infer T
    ? (input: T) => void
    : never;
  readonly onListLegacyCredentials?: () => void;
  readonly sites?: readonly { readonly id: string; readonly organizationId: string }[];
}): ProviderCredentialResolverStore {
  return {
    async getProviderAccount(inputArgs) {
      return (
        input.accounts?.find(
          (account) =>
            account.id === inputArgs.providerAccountId &&
            account.organizationId === inputArgs.organizationId,
        ) ??
        input.accounts?.find((account) => account.id === inputArgs.providerAccountId) ??
        null
      );
    },
    async getSite(inputArgs) {
      return (
        input.sites?.find(
          (site) =>
            site.id === inputArgs.siteId && site.organizationId === inputArgs.organizationId,
        ) ?? null
      );
    },
    async getSiteConnector(inputArgs) {
      return (
        input.connectors?.find(
          (connector) =>
            connector.organizationId === inputArgs.organizationId &&
            connector.provider === inputArgs.provider &&
            connector.siteId === inputArgs.siteId,
        ) ?? null
      );
    },
    async listLegacyGoogleCredentials(inputArgs) {
      input.onListLegacyCredentials?.();
      return (input.legacyCredentials ?? []).filter(
        (credential) => inputArgs.providers.includes(credential.provider),
      );
    },
    async updateProviderAccountCredential(inputArgs) {
      input.onUpdateAccount?.(inputArgs);
      return true;
    },
    async updateProviderAccountStatus() {},
    async updateSiteConnectorStatus() {},
  };
}
