import { describe, expect, it } from "vitest";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type CredentialKeyring,
  type ProviderAccountSecretRecord,
} from "@searchops/db";
import type {
  ConnectorRunResult,
  ConnectorSyncJobPayload,
  SiteConnector,
} from "@searchops/types";

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

  it("preserves an operation failure when Redis unlock also fails", async () => {
    const lock = createRedisProviderAccountRefreshLock(async () => ({
      async eval() {
        throw new Error("redis://secret-host");
      },
      async set() {
        return "OK";
      },
    }));

    await expect(
      lock.withLock("provider-account-refresh:pa_google", async () => {
        throw new Error("credential_revoked");
      }),
    ).rejects.toThrow("credential_revoked");
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

  it("rereads under the lock and skips refresh when another worker already refreshed", async () => {
    const expiring = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const fresh = encryptedAccount({
      tokenExpiresAt: "2026-07-14T01:00:00.000Z",
      updatedAt: "2026-07-14T00:00:01.000Z",
    });
    let fetchCount = 0;
    let updateCount = 0;
    const resolver = createProviderCredentialResolver({
      fetch: (async () => {
        fetchCount += 1;
        throw new Error("refresh must be skipped");
      }) as typeof fetch,
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accountReads: [expiring, fresh],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        onUpdateAccount() { updateCount += 1; },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["gsc"]),
    );

    expect(result.credentialSources).toEqual({ gsc: "encrypted" });
    expect(fetchCount).toBe(0);
    expect(updateCount).toBe(0);
  });

  it.each([
    ["revoked", { status: "revoked" as const }, "credential_revoked" as const],
    ["scope-lost", { scopes: [] }, "scope_missing" as const],
  ])("revalidates a %s account reread before decrypting or refreshing", async (_name, change, code) => {
    const expiring = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const reread = { ...expiring, ...change, updatedAt: "2026-07-14T00:00:01.000Z" };
    let fetchCount = 0;
    let credentialUpdateCount = 0;
    const resolver = createProviderCredentialResolver({
      fetch: (async () => {
        fetchCount += 1;
        throw new Error("provider must not be called");
      }) as typeof fetch,
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accountReads: [expiring, reread],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        onUpdateAccount() { credentialUpdateCount += 1; },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["gsc"])),
    ).resolves.toMatchObject({ configs: {}, failures: { gsc: code } });
    expect(fetchCount).toBe(0);
    expect(credentialUpdateCount).toBe(0);
  });

  it("does not reactivate an optimistic-refresh loser whose account was revoked", async () => {
    const expiring = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const revokedWinner = encryptedAccount({
      status: "revoked",
      tokenExpiresAt: "2026-07-14T01:00:00.000Z",
      updatedAt: "2026-07-14T00:00:02.000Z",
    });
    const resolver = createProviderCredentialResolver({
      fetch: successfulRefreshFetch("loser-access"),
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accountReads: [expiring, expiring, revokedWinner],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        sites: [{ id: "site_a", organizationId: "org_a" }],
        updateAccountResult: false,
      }),
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["gsc"])),
    ).resolves.toMatchObject({ configs: {}, failures: { gsc: "credential_revoked" } });
  });

  it("uses the optimistic refresh winner after revalidating its rotated credential", async () => {
    const expiring = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const winnerEnvelope = encryptProviderCredential(
      keyring,
      { organizationId: "org_a", provider: "google", providerAccountId: "pa_google" },
      {
        accessToken: "winner-access",
        kind: "oauth2",
        refreshToken: "winner-refresh",
        tokenType: "Bearer",
      },
    );
    const winner = {
      ...expiring,
      ...winnerEnvelope,
      tokenExpiresAt: "2026-07-14T01:00:00.000Z",
      updatedAt: "2026-07-14T00:00:02.000Z",
    };
    const resolver = createProviderCredentialResolver({
      fetch: successfulRefreshFetch("loser-access"),
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accountReads: [expiring, expiring, winner],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        sites: [{ id: "site_a", organizationId: "org_a" }],
        updateAccountResult: false,
      }),
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["gsc"]),
    );

    expect(result.configs.gsc?.credential.accessToken).toBe("winner-access");
  });

  it("re-encrypts a refreshed previous-key credential with the active key", async () => {
    const oldKey = Buffer.alloc(32, 7).toString("base64");
    const activeKey = Buffer.alloc(32, 8).toString("base64");
    const oldKeyring = parseCredentialKeyring({
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: oldKey,
      SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
    });
    const rotatedKeyring = parseCredentialKeyring({
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v2",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: activeKey,
      SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JSON.stringify({ v1: oldKey }),
    });
    const account = encryptedAccountWithKeyring(oldKeyring, {
      tokenExpiresAt: "2026-07-14T00:01:00.000Z",
    });
    const updates: Parameters<ProviderCredentialResolverStore["updateProviderAccountCredential"]>[0][] = [];
    const resolver = createProviderCredentialResolver({
      fetch: successfulRefreshFetch("active-key-access"),
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring: rotatedKeyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accounts: [account],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        onUpdateAccount(input) { updates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    await resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["gsc"]));

    expect(updates[0]?.encryptedCredential.encryptionKeyId).toBe("v2");
  });

  it.each([
    ["network", () => Promise.reject(new Error("https://provider.test?api_key=tenant-secret")), "provider_rate_limited", null],
    ["malformed-2xx", () => Promise.resolve(new Response("client_secret=tenant-secret", { status: 200 })), "provider_rate_limited", null],
    ["400", () => Promise.resolve(new Response("tenant-secret", { status: 400 })), "credential_revoked", "revoked"],
    ["401", () => Promise.resolve(new Response("tenant-secret", { status: 401 })), "credential_revoked", "revoked"],
    ["429", () => Promise.resolve(new Response("tenant-secret", { status: 429 })), "provider_rate_limited", null],
    ["500", () => Promise.resolve(new Response("tenant-secret", { status: 500 })), "provider_rate_limited", null],
  ] as const)(
    "normalizes refresh %s failures without leaking or corrupting durable account state",
    async (_name, responseFactory, expectedCode, expectedAccountStatus) => {
      const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
      const statusUpdates: string[] = [];
      const resolver = createProviderCredentialResolver({
        fetch: (async () => responseFactory()) as typeof fetch,
        googleOAuthClientId: "client-id",
        googleOAuthClientSecret: "client-secret",
        keyring,
        now: () => now,
        refreshLock: { async withLock(_key, operation) { return operation(); } },
        storageMode: "encrypted",
        store: createStore({
          accounts: [account],
          connectors: [
            siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
          ],
          onUpdateAccountStatus(input) { statusUpdates.push(input.status); },
          sites: [{ id: "site_a", organizationId: "org_a" }],
        }),
      });

      const result = await resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["gsc"]),
      );

      expect(result.failures).toEqual({ gsc: expectedCode });
      expect(statusUpdates).toEqual(expectedAccountStatus === null ? [] : [expectedAccountStatus]);
      expect(JSON.stringify(result)).not.toContain("tenant-secret");
    },
  );

  it("normalizes lock timeout and unlock failures without restoring account status", async () => {
    const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
    const statusUpdates: string[] = [];
    const baseStoreInput = {
      accounts: [account],
      connectors: [
        siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
      ],
      onUpdateAccountStatus(input: Parameters<ProviderCredentialResolverStore["updateProviderAccountStatus"]>[0]) {
        statusUpdates.push(input.status);
      },
      sites: [{ id: "site_a", organizationId: "org_a" }],
    };
    const timeoutResolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      refreshLock: createRedisProviderAccountRefreshLock(
        async () => ({ async eval() { return 0; }, async set() { return null; } }),
        { retryDelayMs: 1, waitTimeoutMs: 0 },
      ),
      storageMode: "encrypted",
      store: createStore(baseStoreInput),
    });
    const fresh = encryptedAccount({ tokenExpiresAt: "2026-07-14T01:00:00.000Z" });
    const unlockResolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      refreshLock: createRedisProviderAccountRefreshLock(async () => ({
        async eval() { throw new Error("redis://secret-host"); },
        async set() { return "OK"; },
      })),
      storageMode: "encrypted",
      store: createStore({ ...baseStoreInput, accountReads: [account, fresh] }),
    });

    await expect(
      timeoutResolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["gsc"])),
    ).resolves.toMatchObject({ failures: { gsc: "provider_rate_limited" } });
    await expect(
      unlockResolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["gsc"])),
    ).resolves.toMatchObject({ failures: { gsc: "provider_rate_limited" } });
    expect(statusUpdates).toEqual([]);
  });

  it("rejects a connector whose provider does not match the requested provider", async () => {
    const baseStore = createStore({
      accounts: [encryptedAccount()],
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store: {
        ...baseStore,
        async getSiteConnector() {
          return siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" });
        },
      },
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"])),
    ).resolves.toEqual({
      configs: {},
      credentialSources: {},
      failures: { ga4: "connector_missing" },
    });
  });

  it.each([
    ["credential_expired", "expired", "expired"],
    ["credential_revoked", "revoked", "revoked"],
    ["resource_access_denied", null, "error"],
    ["provider_rate_limited", null, "error"],
  ] as const)(
    "writes the normalized %s provider outcome without breaking shared-account state",
    async (code, expectedAccountStatus, expectedConnectorStatus) => {
      const accountUpdates: unknown[] = [];
      const connectorUpdates: unknown[] = [];
      const resolver = createProviderCredentialResolver({
        keyring,
        now: () => now,
        storageMode: "encrypted",
        store: createStore({
          accounts: [encryptedAccount()],
          connectors: [siteConnector()],
          onUpdateAccountStatus(input) { accountUpdates.push(input); },
          onUpdateSiteConnectorStatus(input) { connectorUpdates.push(input); },
          sites: [{ id: "site_a", organizationId: "org_a" }],
        }),
      });
      const result: ConnectorRunResult = {
        error: { code, message: "safe fixed message" },
        fetchedAt: now.toISOString(),
        fixture: false,
        provider: "ga4",
        records: [],
        status: code === "resource_access_denied" || code === "provider_rate_limited"
          ? "failed"
          : "setup_required",
      };

      await resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"]));
      await resolver.recordConnectorProviderOutcomes(connectorJob("site_a", ["ga4"]), [result]);

      expect(accountUpdates).toEqual(
        expectedAccountStatus === null
          ? []
          : [
              expect.objectContaining({
                expectedStatus: "connected",
                expectedUpdatedAt: "2026-07-14T00:00:00.000Z",
                organizationId: "org_a",
                providerAccountId: "pa_google",
                status: expectedAccountStatus,
              }),
            ],
      );
      expect(connectorUpdates).toEqual([
        expect.objectContaining({
          lastErrorCode: code,
          organizationId: "org_a",
          provider: "ga4",
          siteId: "site_a",
          status: expectedConnectorStatus,
        }),
      ]);
    },
  );

  it("clears only the recovering site connector error on provider success", async () => {
    const accountUpdates: unknown[] = [];
    const connectorUpdates: unknown[] = [];
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store: createStore({
        accounts: [encryptedAccount()],
        connectors: [siteConnector({ lastErrorCode: "credential_revoked", status: "revoked" })],
        onUpdateAccountStatus(input) { accountUpdates.push(input); },
        onUpdateSiteConnectorStatus(input) { connectorUpdates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    await resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"]));
    await resolver.recordConnectorProviderOutcomes(connectorJob("site_a", ["ga4"]), [
      {
        fetchedAt: now.toISOString(),
        fixture: false,
        provider: "ga4",
        records: [],
        status: "ok",
      },
    ]);

    expect(accountUpdates).toEqual([]);
    expect(connectorUpdates).toEqual([
      expect.objectContaining({ lastErrorCode: null, status: "connected" }),
    ]);
  });

  it("does not apply a stale provider failure to a rotated shared account", async () => {
    const accounts = [encryptedAccount()];
    const accountUpdates: unknown[] = [];
    const connectorUpdates: unknown[] = [];
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store: createStore({
        accounts,
        connectors: [siteConnector()],
        onUpdateAccountStatus(input) { accountUpdates.push(input); },
        onUpdateSiteConnectorStatus(input) { connectorUpdates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });
    const job = connectorJob("site_a", ["ga4"]);
    await resolver.resolveConnectorProviderConfigs(job);
    accounts[0] = { ...accounts[0]!, updatedAt: "2026-07-14T00:00:05.000Z" };

    await resolver.recordConnectorProviderOutcomes(job, [
      {
        error: { code: "credential_expired", message: "safe fixed message" },
        fetchedAt: now.toISOString(),
        fixture: false,
        provider: "ga4",
        records: [],
        status: "setup_required",
      },
    ]);

    expect(accountUpdates).toEqual([]);
    expect(connectorUpdates).toEqual([]);
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

function successfulRefreshFetch(accessToken: string): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({ access_token: accessToken, expires_in: 3600, token_type: "Bearer" }),
      { status: 200 },
    )) as typeof fetch;
}

function encryptedAccount(
  overrides: Partial<ProviderAccountSecretRecord> = {},
): ProviderAccountSecretRecord {
  return encryptedAccountWithKeyring(keyring, overrides);
}

function encryptedAccountWithKeyring(
  credentialKeyring: CredentialKeyring,
  overrides: Partial<ProviderAccountSecretRecord> = {},
): ProviderAccountSecretRecord {
  const organizationId = overrides.organizationId ?? "org_a";
  const id = overrides.id ?? "pa_google";
  const provider = overrides.provider ?? "google";
  const envelope = encryptProviderCredential(
    credentialKeyring,
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
  readonly accountReads?: readonly (ProviderAccountSecretRecord | null)[];
  readonly accounts?: readonly ProviderAccountSecretRecord[];
  readonly connectors?: readonly SiteConnector[];
  readonly legacyCredentials?: Awaited<
    ReturnType<ProviderCredentialResolverStore["listLegacyGoogleCredentials"]>
  >;
  readonly onUpdateAccount?: (
    input: Parameters<ProviderCredentialResolverStore["updateProviderAccountCredential"]>[0],
  ) => void;
  readonly onUpdateAccountStatus?: (
    input: Parameters<ProviderCredentialResolverStore["updateProviderAccountStatus"]>[0],
  ) => void;
  readonly onUpdateSiteConnectorStatus?: (
    input: Parameters<ProviderCredentialResolverStore["updateSiteConnectorStatus"]>[0],
  ) => void;
  readonly onListLegacyCredentials?: () => void;
  readonly sites?: readonly { readonly id: string; readonly organizationId: string }[];
  readonly updateAccountResult?: boolean;
}): ProviderCredentialResolverStore {
  let accountReadIndex = 0;
  return {
    async getProviderAccount(inputArgs) {
      if (input.accountReads !== undefined && accountReadIndex < input.accountReads.length) {
        return input.accountReads[accountReadIndex++] ?? null;
      }
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
      return input.updateAccountResult === false
        ? null
        : { updatedAt: inputArgs.expectedUpdatedAt };
    },
    async updateProviderAccountStatus(inputArgs) {
      input.onUpdateAccountStatus?.(inputArgs);
      return true;
    },
    async updateSiteConnectorStatus(inputArgs) {
      input.onUpdateSiteConnectorStatus?.(inputArgs);
    },
  };
}
