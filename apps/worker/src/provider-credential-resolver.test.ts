import { describe, expect, it } from "vitest";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type ConnectorSyncProviderFeedbackInput,
  type CredentialKeyring,
  type ProviderAccountSecretRecord,
} from "@searchops/db";
import type {
  ConnectorRunResult,
  ConnectorSyncJobPayload,
  GeoAnswerMonitorJobPayload,
  SiteConnector,
} from "@searchops/types";

import {
  createProviderCredentialResolver,
  createPlatformGeoProviderResolver,
  createInProcessProviderAccountRefreshLock,
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

  it("prefers each organization's default encrypted GEO BYOK over the platform key", async () => {
    const authorizationHeaders: string[] = [];
    const store = createStore({
      defaultGeoAccounts: [
        encryptedGeoAccount("org-a-key", { id: "pa_geo_a", organizationId: "org_a" }),
        encryptedGeoAccount("org-b-key", { id: "pa_geo_b", organizationId: "org_b" }),
      ],
      sites: [
        { id: "site_a", organizationId: "org_a" },
        { id: "site_b", organizationId: "org_b" },
      ],
    });
    const resolver = createProviderCredentialResolver({
      fetch: successfulGeoFetch(authorizationHeaders),
      geoPlatformApiKeys: { geo_chatgpt: "platform-key" },
      keyring,
      storageMode: "encrypted",
      store,
    });

    const orgA = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt"]),
    );
    const orgB = await resolver.resolveGeoProviderAdapters(
      geoJob("org_b", "site_b", ["chatgpt"]),
    );
    await orgA.adapters.chatgpt?.monitor(geoMonitorRequest("site_a"));
    await orgB.adapters.chatgpt?.monitor(geoMonitorRequest("site_b"));

    expect(orgA.credentialSources).toEqual({ chatgpt: "encrypted" });
    expect(orgB.credentialSources).toEqual({ chatgpt: "encrypted" });
    expect(authorizationHeaders).toEqual(["Bearer org-a-key", "Bearer org-b-key"]);
    expect(JSON.stringify([orgA, orgB])).not.toContain("org-a-key");
    expect(JSON.stringify([orgA, orgB])).not.toContain("org-b-key");
  });

  it.each([
    ["non-default", { isDefault: false }],
    ["revoked", { status: "revoked" as const }],
  ])("does not decrypt a %s GEO account and uses the platform key", async (_name, change) => {
    const authorizationHeaders: string[] = [];
    const unsafeAccount = {
      ...encryptedGeoAccount("must-not-decrypt"),
      ...change,
      credentialAuthTag: Buffer.alloc(16, 9).toString("base64"),
    };
    const baseStore = createStore({
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      fetch: successfulGeoFetch(authorizationHeaders),
      geoPlatformApiKeys: { geo_chatgpt: "platform-key" },
      keyring,
      storageMode: "encrypted",
      store: {
        ...baseStore,
        async getDefaultGeoProviderAccount() {
          return unsafeAccount;
        },
      },
    });

    const resolved = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt"]),
    );
    await resolved.adapters.chatgpt?.monitor(geoMonitorRequest("site_a"));

    expect(resolved.credentialSources).toEqual({ chatgpt: "platform" });
    expect(resolved.failures).toEqual({});
    expect(authorizationHeaders).toEqual(["Bearer platform-key"]);
  });

  it.each([
    ["cross-tenant", { organizationId: "org_b" }],
    ["wrong-provider", { provider: "geo_claude" as const }],
    ["wrong-auth", { authType: "oauth2" }],
    ["malformed-secret", { credentialIv: "not-base64" }],
  ])("fails closed for a non-null %s GEO account invariant mismatch", async (_name, change) => {
    const authorizationHeaders: string[] = [];
    const unsafeAccount = {
      ...encryptedGeoAccount("must-not-decrypt"),
      ...change,
    };
    const baseStore = createStore({
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      fetch: successfulGeoFetch(authorizationHeaders),
      geoPlatformApiKeys: { geo_chatgpt: "platform-key" },
      keyring,
      storageMode: "encrypted",
      store: {
        ...baseStore,
        async getDefaultGeoProviderAccount() {
          return unsafeAccount as never;
        },
      },
    });

    const resolved = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt"]),
    );

    expect(resolved).toEqual({
      adapters: {},
      credentialSources: {},
      failures: { chatgpt: "provider_request_failed" },
    });
    expect(authorizationHeaders).toEqual([]);
    expect(JSON.stringify(resolved)).not.toContain("must-not-decrypt");
    expect(JSON.stringify(resolved)).not.toContain("platform-key");
  });

  it("returns a safe failure when a valid default GEO account cannot be decrypted", async () => {
    const account = encryptedGeoAccount("tenant-secret");
    const resolver = createProviderCredentialResolver({
      geoPlatformApiKeys: { geo_chatgpt: "platform-key" },
      keyring,
      storageMode: "encrypted",
      store: createStore({
        defaultGeoAccounts: [
          { ...account, credentialAuthTag: Buffer.alloc(16, 9).toString("base64") },
        ],
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    const resolved = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt"]),
    );

    expect(resolved).toEqual({
      adapters: {},
      credentialSources: {},
      failures: { chatgpt: "credential_decryption_failed" },
    });
    expect(JSON.stringify(resolved)).not.toContain("tenant-secret");
    expect(JSON.stringify(resolved)).not.toContain(account.credentialCiphertext);
  });

  it("resolves only requested supported GEO providers and leaves Copilot unsupported", async () => {
    const lookups: unknown[] = [];
    const store = createStore({
      onGetDefaultGeoAccount(input) {
        lookups.push(input);
      },
      sites: [{ id: "site_a", organizationId: "org_a" }],
    });
    const resolver = createProviderCredentialResolver({
      geoPlatformApiKeys: {
        geo_chatgpt: "chatgpt-platform-key",
        geo_claude: "claude-platform-key",
        geo_gemini: "gemini-platform-key",
        geo_perplexity: "perplexity-platform-key",
      },
      keyring,
      storageMode: "encrypted",
      store,
    });

    const resolved = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["claude", "copilot"]),
    );

    expect(Object.keys(resolved.adapters)).toEqual(["claude"]);
    expect(resolved.credentialSources).toEqual({ claude: "platform" });
    expect(resolved.failures).toEqual({ copilot: "account_missing" });
    expect(lookups).toEqual([
      {
        authType: "api_key",
        organizationId: "org_a",
        provider: "geo_claude",
      },
    ]);
    expect(JSON.stringify(resolved)).not.toContain("claude-platform-key");
  });

  it("creates only requested supported adapters in platform-only GEO mode", async () => {
    const authorizationHeaders: string[] = [];
    const resolver = createPlatformGeoProviderResolver({
      fetch: successfulGeoFetch(authorizationHeaders),
      geoPlatformApiKeys: {
        geo_chatgpt: "chatgpt-platform-key",
        geo_copilot: "unsupported-key",
      } as never,
    });

    const resolved = await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt", "copilot"]),
    );
    await resolved.adapters.chatgpt?.monitor(geoMonitorRequest("site_a"));

    expect(Object.keys(resolved.adapters)).toEqual(["chatgpt"]);
    expect(resolved.credentialSources).toEqual({ chatgpt: "platform" });
    expect(resolved.failures).toEqual({ copilot: "account_missing" });
    expect(authorizationHeaders).toEqual(["Bearer chatgpt-platform-key"]);
  });

  it("maps every supported GEO monitor provider to its account provider", async () => {
    const lookups: unknown[] = [];
    const resolver = createProviderCredentialResolver({
      keyring,
      storageMode: "encrypted",
      store: createStore({
        onGetDefaultGeoAccount(input) {
          lookups.push(input);
        },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    await resolver.resolveGeoProviderAdapters(
      geoJob("org_a", "site_a", ["chatgpt", "claude", "gemini", "perplexity"]),
    );

    expect(lookups).toEqual([
      { authType: "api_key", organizationId: "org_a", provider: "geo_chatgpt" },
      { authType: "api_key", organizationId: "org_a", provider: "geo_claude" },
      { authType: "api_key", organizationId: "org_a", provider: "geo_gemini" },
      { authType: "api_key", organizationId: "org_a", provider: "geo_perplexity" },
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

  it.each([
    ["gsc", "readonly-only", ["https://www.googleapis.com/auth/webmasters.readonly"], true],
    ["gsc", "full-only", ["https://www.googleapis.com/auth/webmasters"], true],
    ["gsc", "both", [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ], true],
    ["gsc", "neither", [], false],
    ["ga4", "readonly-only", ["https://www.googleapis.com/auth/analytics.readonly"], true],
    ["ga4", "full-only", ["https://www.googleapis.com/auth/analytics"], true],
    ["ga4", "both", [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics",
    ], true],
    ["ga4", "neither", [], false],
  ] as const)(
    "resolves %s with a %s Google scope grant",
    async (provider, _scopeCase, scopes, allowed) => {
      const resolver = createProviderCredentialResolver({
        keyring,
        now: () => now,
        storageMode: "encrypted",
        store: createStore({
          accounts: [encryptedAccount({ scopes: [...scopes] })],
          connectors: [
            siteConnector({
              externalResourceId:
                provider === "gsc" ? "sc-domain:example.com" : "properties/111",
              id: provider === "gsc" ? "sc_gsc" : "sc_ga4",
              provider,
            }),
          ],
          sites: [{ id: "site_a", organizationId: "org_a" }],
        }),
      });

      const result = await resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", [provider]),
      );

      if (allowed) {
        expect(result.failures).toEqual({});
        expect(result.credentialSources).toEqual({ [provider]: "encrypted" });
        expect(result.configs[provider]).toBeDefined();
      } else {
        expect(result).toMatchObject({
          configs: {},
          credentialSources: {},
          failures: { [provider]: "scope_missing" },
        });
      }
    },
  );

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

  it("keeps legacy Google to dual mode but honours the global Bing key in both", async () => {
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
      // 전역 Bing 키의 출처는 이제 두 모드 모두 platform 이다. legacy 는 사이트별
      // 레거시 자격증명을 가리키는 이름인데 이 키는 그게 아니다.
      credentialSources: { bing: "platform", ga4: "legacy" },
      failures: {},
    });
    // encrypted 모드에서 legacy Google 자격증명은 여전히 안 쓴다. 그게 dual 의 존재
    // 이유다. 다만 전역 Bing 키는 legacy 자격증명이 아니라 PageSpeed 키와 같은 플랫폼
    // 키인데, 예전에는 이 분기에 묶여 있어 encrypted 모드에서 조용히 무시됐다 —
    // 운영자가 SEARCHOPS_BING_API_KEY 를 넣어도 아무 일도 일어나지 않았다.
    await expect(
      encryptedResolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["ga4", "bing"]),
      ),
    ).resolves.toEqual({
      configs: { bing: { apiKey: "global-bing", siteUrl: "example.com" } },
      credentialSources: { bing: "platform" },
      failures: { ga4: "connector_missing" },
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

  // expired 는 회복 가능한 상태다. 그런데 상태 검사가 갱신 경로보다 앞에 있어서, 한 번
  // expired 로 찍힌 계정은 영원히 갱신되지 못했다 — 상태를 connected 로 되돌릴 수 있는
  // 건 성공한 갱신뿐인데 그 갱신에 도달하지 못한다. 운영에서 GSC/GA4 가 그렇게 잠겼고,
  // 매일 배치가 돌아도 사용자에게 남은 길은 수동 재연결뿐이었다.
  it("refreshes an account already marked expired instead of failing it forever", async () => {
    const updatedAccounts: unknown[] = [];
    const resolver = createProviderCredentialResolver({
      fetch: (async () =>
        new Response(
          JSON.stringify({ access_token: "fresh-access", expires_in: 3600, token_type: "Bearer" }),
          { status: 200 },
        )) as typeof fetch,
      googleOAuthClientId: "client-id",
      googleOAuthClientSecret: "client-secret",
      keyring,
      now: () => now,
      refreshLock: { async withLock(_key, operation) { return operation(); } },
      storageMode: "encrypted",
      store: createStore({
        accounts: [
          encryptedAccount({ status: "expired", tokenExpiresAt: "2026-07-14T00:01:00.000Z" }),
        ],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        onUpdateAccount(input) { updatedAccounts.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
    });

    const result = await resolver.resolveConnectorProviderConfigs(
      connectorJob("site_a", ["gsc"]),
    );

    expect(result.failures).toEqual({});
    expect(result.configs.gsc?.credential.accessToken).toBe("fresh-access");
    // 갱신이 계정을 connected 로 되돌려야 다음 실행이 정상 경로를 탄다.
    expect(updatedAccounts[0]).toMatchObject({ status: "connected" });
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
    [
      "gsc",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ],
    [
      "ga4",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics",
    ],
  ] as const)(
    "accepts a full-only %s scope on the post-lock account reread",
    async (provider, readonlyScope, fullScope) => {
      const expiring = encryptedAccount({
        scopes: [readonlyScope],
        tokenExpiresAt: "2026-07-14T00:01:00.000Z",
      });
      const fresh = encryptedAccount({
        scopes: [fullScope],
        tokenExpiresAt: "2026-07-14T01:00:00.000Z",
        updatedAt: "2026-07-14T00:00:01.000Z",
      });
      let fetchCount = 0;
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
            siteConnector({
              externalResourceId:
                provider === "gsc" ? "sc-domain:example.com" : "properties/111",
              id: provider === "gsc" ? "sc_gsc" : "sc_ga4",
              provider,
            }),
          ],
          sites: [{ id: "site_a", organizationId: "org_a" }],
        }),
      });

      const result = await resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", [provider]),
      );

      expect(result.failures).toEqual({});
      expect(result.credentialSources).toEqual({ [provider]: "encrypted" });
      expect(fetchCount).toBe(0);
    },
  );

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
    ["network", () => Promise.reject(new Error("https://provider.test?api_key=tenant-secret")), "provider_rate_limited", false],
    ["malformed-2xx", () => Promise.resolve(new Response("client_secret=tenant-secret", { status: 200 })), "provider_rate_limited", false],
    ["invalid-grant-400", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant", error_description: "tenant-secret" }), { status: 400 })), "credential_revoked", true],
    ["invalid-grant-401", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 })), "credential_revoked", true],
    ["invalid-client", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_client", client_secret: "tenant-secret" }), { status: 401 })), "provider_rate_limited", false],
    ["invalid-request", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 })), "provider_rate_limited", false],
    ["unauthorized-client", () => Promise.resolve(new Response(JSON.stringify({ error: "unauthorized_client" }), { status: 400 })), "provider_rate_limited", false],
    ["unknown-400", () => Promise.resolve(new Response(JSON.stringify({ error: "provider_custom_error" }), { status: 400 })), "provider_rate_limited", false],
    ["unknown-401", () => Promise.resolve(new Response(JSON.stringify({ error: "provider_custom_error" }), { status: 401 })), "provider_rate_limited", false],
    ["malformed-401", () => Promise.resolve(new Response("client_secret=tenant-secret", { status: 401 })), "provider_rate_limited", false],
    ["oversized-400", () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant", padding: "x".repeat(8_192) }), { status: 400 })), "provider_rate_limited", false],
    ["429", () => Promise.resolve(new Response("tenant-secret", { status: 429 })), "provider_rate_limited", false],
    ["500", () => Promise.resolve(new Response("tenant-secret", { status: 500 })), "provider_rate_limited", false],
  ] as const)(
    "normalizes refresh %s failures without leaking or corrupting durable account state",
    async (_name, responseFactory, expectedCode, shouldRevoke) => {
      const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
      const accountStatusUpdates: string[] = [];
      const connectorStatusUpdates: string[] = [];
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
          onUpdateAccountStatus(input) {
            if (input.accountStatus !== null) accountStatusUpdates.push(input.accountStatus);
          },
          onUpdateSiteConnectorStatus(input) { connectorStatusUpdates.push(input.status); },
          sites: [{ id: "site_a", organizationId: "org_a" }],
        }),
      });

      const result = await resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["gsc"]),
      );

      expect(result.failures).toEqual({ gsc: expectedCode });
      expect(accountStatusUpdates).toEqual(shouldRevoke ? ["revoked"] : []);
      expect(connectorStatusUpdates).toEqual(shouldRevoke ? ["revoked"] : []);
      expect(JSON.stringify(result)).not.toContain("tenant-secret");
    },
  );

  it.each(["reread", "credential-update"] as const)(
    "normalizes refresh %s store exceptions as non-mutating transient failures",
    async (failurePoint) => {
      const account = encryptedAccount({ tokenExpiresAt: "2026-07-14T00:01:00.000Z" });
      const accountStatusUpdates: unknown[] = [];
      const connectorStatusUpdates: unknown[] = [];
      const baseStore = createStore({
        accounts: [account],
        connectors: [
          siteConnector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        ],
        onUpdateAccountStatus(input) { accountStatusUpdates.push(input); },
        onUpdateSiteConnectorStatus(input) { connectorStatusUpdates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      });
      let accountReads = 0;
      const store: ProviderCredentialResolverStore = {
        ...baseStore,
        async getProviderAccount(input) {
          accountReads += 1;
          if (failurePoint === "reread" && accountReads === 2) {
            throw new Error("postgres://user:tenant-secret@db.internal/searchops");
          }
          return baseStore.getProviderAccount(input);
        },
        async updateProviderAccountCredential(input) {
          if (failurePoint === "credential-update") {
            throw new Error("postgres://user:tenant-secret@db.internal/searchops");
          }
          return baseStore.updateProviderAccountCredential(input);
        },
      };
      const resolver = createProviderCredentialResolver({
        fetch: successfulRefreshFetch("new-access"),
        googleOAuthClientId: "client-id",
        googleOAuthClientSecret: "client-secret",
        keyring,
        now: () => now,
        refreshLock: { async withLock(_key, operation) { return operation(); } },
        storageMode: "encrypted",
        store,
      });

      const result = await resolver.resolveConnectorProviderConfigs(
        connectorJob("site_a", ["gsc"]),
      );

      expect(result.failures).toEqual({ gsc: "provider_rate_limited" });
      expect(accountStatusUpdates).toEqual([]);
      expect(connectorStatusUpdates).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("tenant-secret");
      expect(JSON.stringify(result)).not.toContain("db.internal");
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
      onUpdateAccountStatus(input: ConnectorSyncProviderFeedbackInput) {
        if (input.accountStatus !== null) statusUpdates.push(input.accountStatus);
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
                accountStatus: expectedAccountStatus,
                expectedAccountStatus: "connected",
                expectedAccountUpdatedAt: "2026-07-14T00:00:00.000Z",
                expectedConnectorUpdatedAt: "2026-07-14T00:00:00.000Z",
                organizationId: "org_a",
                providerAccountId: "pa_google",
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

  it("applies neither stale outcome mutation when the connector is rebound atomically", async () => {
    const accountUpdates: unknown[] = [];
    const connectorUpdates: unknown[] = [];
    const feedbackAttempts: unknown[] = [];
    const store = Object.assign(
      createStore({
        accounts: [encryptedAccount()],
        connectors: [siteConnector()],
        onUpdateAccountStatus(input) { accountUpdates.push(input); },
        onUpdateSiteConnectorStatus(input) { connectorUpdates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
      {
        async applyProviderFeedback(input: unknown) {
          feedbackAttempts.push(input);
          return false;
        },
      },
    );
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store,
    });
    const job = connectorJob("site_a", ["ga4"]);
    await resolver.resolveConnectorProviderConfigs(job);

    await resolver.recordConnectorProviderOutcomes(job, [
      {
        error: { code: "credential_revoked", message: "credential_revoked" },
        fetchedAt: now.toISOString(),
        fixture: false,
        provider: "ga4",
        records: [],
        status: "setup_required",
      },
    ]);

    expect(feedbackAttempts).toEqual([
      expect.objectContaining({
        expectedAccountUpdatedAt: "2026-07-14T00:00:00.000Z",
        expectedConnectorUpdatedAt: "2026-07-14T00:00:00.000Z",
        organizationId: "org_a",
        provider: "ga4",
        providerAccountId: "pa_google",
        siteId: "site_a",
      }),
    ]);
    expect(accountUpdates).toEqual([]);
    expect(connectorUpdates).toEqual([]);
  });

  it("applies neither stale resolution-failure mutation when the account rotates atomically", async () => {
    const account = encryptedAccount();
    const accountUpdates: unknown[] = [];
    const connectorUpdates: unknown[] = [];
    const feedbackAttempts: unknown[] = [];
    const store = Object.assign(
      createStore({
        accounts: [
          { ...account, credentialAuthTag: Buffer.alloc(16, 9).toString("base64") },
        ],
        connectors: [siteConnector()],
        onUpdateAccountStatus(input) { accountUpdates.push(input); },
        onUpdateSiteConnectorStatus(input) { connectorUpdates.push(input); },
        sites: [{ id: "site_a", organizationId: "org_a" }],
      }),
      {
        async applyProviderFeedback(input: unknown) {
          feedbackAttempts.push(input);
          return false;
        },
      },
    );
    const resolver = createProviderCredentialResolver({
      keyring,
      now: () => now,
      storageMode: "encrypted",
      store,
    });

    await expect(
      resolver.resolveConnectorProviderConfigs(connectorJob("site_a", ["ga4"])),
    ).resolves.toMatchObject({ failures: { ga4: "credential_decryption_failed" } });

    expect(feedbackAttempts).toEqual([
      expect.objectContaining({
        expectedAccountUpdatedAt: "2026-07-14T00:00:00.000Z",
        expectedConnectorUpdatedAt: "2026-07-14T00:00:00.000Z",
        organizationId: "org_a",
        provider: "ga4",
        providerAccountId: "pa_google",
        siteId: "site_a",
      }),
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

function geoJob(
  organizationId: string,
  siteId: string,
  providers: GeoAnswerMonitorJobPayload["providers"],
): GeoAnswerMonitorJobPayload {
  return {
    observedAt: now.toISOString(),
    organizationId,
    providers,
    queries: [{ query: "best seo clinic", locale: "ko-KR" }],
    requestedByUserId: "user_a",
    siteDomain: "example.com",
    siteId,
    target: {
      brandName: "Example Clinic",
      domain: "example.com",
      locale: "ko-KR",
      market: "KR",
      siteId,
    },
  };
}

function geoMonitorRequest(siteId: string) {
  return {
    observedAt: now.toISOString(),
    queries: [{ query: "best seo clinic", locale: "ko-KR" }],
    target: {
      brandName: "Example Clinic",
      domain: "example.com",
      locale: "ko-KR",
      market: "KR",
      siteId,
    },
  };
}

function successfulGeoFetch(authorizationHeaders: string[]): typeof fetch {
  return (async (_url, init) => {
    const headers = new Headers(init?.headers);
    authorizationHeaders.push(headers.get("authorization") ?? "");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "Example Clinic is cited." } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
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

type GeoAccountRecord = Omit<ProviderAccountSecretRecord, "authType" | "provider"> & {
  readonly authType: "api_key";
  readonly isDefault: boolean;
  readonly provider: "geo_chatgpt" | "geo_claude" | "geo_gemini" | "geo_perplexity";
};

function encryptedGeoAccount(
  apiKey: string,
  overrides: Partial<GeoAccountRecord> = {},
): GeoAccountRecord {
  const organizationId = overrides.organizationId ?? "org_a";
  const id = overrides.id ?? "pa_geo_chatgpt";
  const provider = overrides.provider ?? "geo_chatgpt";
  const envelope = encryptProviderCredential(
    keyring,
    { organizationId, provider, providerAccountId: id },
    { apiKey, kind: "api_key" },
  );

  return {
    ...envelope,
    authType: "api_key",
    id,
    isDefault: true,
    organizationId,
    provider,
    scopes: [],
    status: "connected",
    tokenExpiresAt: null,
    updatedAt: now.toISOString(),
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
  readonly defaultGeoAccounts?: readonly GeoAccountRecord[];
  readonly legacyCredentials?: Awaited<
    ReturnType<ProviderCredentialResolverStore["listLegacyGoogleCredentials"]>
  >;
  readonly onUpdateAccount?: (
    input: Parameters<ProviderCredentialResolverStore["updateProviderAccountCredential"]>[0],
  ) => void;
  readonly onUpdateAccountStatus?: (
    input: ConnectorSyncProviderFeedbackInput,
  ) => void;
  readonly onUpdateSiteConnectorStatus?: (
    input: ConnectorSyncProviderFeedbackInput,
  ) => void;
  readonly onListLegacyCredentials?: () => void;
  readonly onGetDefaultGeoAccount?: (input: {
    readonly authType: "api_key";
    readonly organizationId: string;
    readonly provider: "geo_chatgpt" | "geo_claude" | "geo_gemini" | "geo_perplexity";
  }) => void;
  readonly sites?: readonly { readonly id: string; readonly organizationId: string }[];
  readonly updateAccountResult?: boolean;
}): ProviderCredentialResolverStore {
  let accountReadIndex = 0;
  return {
    async applyProviderFeedback(inputArgs) {
      if (inputArgs.accountStatus !== null) {
        input.onUpdateAccountStatus?.(inputArgs);
      }
      input.onUpdateSiteConnectorStatus?.(inputArgs);
      return true;
    },
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
    async getDefaultGeoProviderAccount(inputArgs) {
      input.onGetDefaultGeoAccount?.(inputArgs);
      return (
        input.defaultGeoAccounts?.find(
          (account) =>
            account.authType === inputArgs.authType &&
            account.isDefault &&
            account.organizationId === inputArgs.organizationId &&
            account.provider === inputArgs.provider &&
            account.status === "connected",
        ) ?? null
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
  };
}

describe("in-process provider account refresh lock", () => {
  it("serializes the same key and keeps going after a failure", async () => {
    const lock = createInProcessProviderAccountRefreshLock();
    const order: string[] = [];
    const gate = { release: () => {} };
    const blocked = new Promise<void>((resolve) => {
      gate.release = resolve;
    });

    const first = lock
      .withLock("account", async () => {
        order.push("first:start");
        await blocked;
        order.push("first:end");
        throw new Error("boom");
      })
      .catch(() => order.push("first:rejected"));
    const second = lock.withLock("account", async () => {
      order.push("second");
      return "ok";
    });
    // 다른 키는 앞 작업을 기다리지 않는다.
    const other = lock.withLock("other", async () => {
      order.push("other");
      return "ok";
    });

    await other;
    expect(order).toEqual(["first:start", "other"]);

    gate.release();
    await first;
    await expect(second).resolves.toBe("ok");
    expect(order).toEqual(["first:start", "other", "first:end", "first:rejected", "second"]);
  });
});
