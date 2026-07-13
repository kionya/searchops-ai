import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProviderAccountClientError,
  canManageProviderAccounts,
  canRunConnectorSync,
  createApiKeyProviderAccount,
  deleteProviderAccount,
  loadProviderAccounts,
  normalizeSiteConnectorResource,
  resolveVerifiedProviderUser,
  saveSiteConnector,
  triggerSiteConnectorSync,
  type ProviderUserContext,
} from "./provider-accounts";

const now = "2026-07-14T00:00:00.000Z";
const context: ProviderUserContext = {
  accessToken: "current-user-token",
  organizationId: "org_1",
  role: "owner",
  userId: "user_1",
};

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "pa_1",
    organizationId: "org_1",
    provider: "geo_chatgpt",
    authType: "api_key",
    externalAccountId: null,
    accountEmail: null,
    displayName: "Primary",
    status: "connected",
    scopes: [],
    tokenExpiresAt: null,
    isDefault: true,
    legacyCredentialId: null,
    connectedByUserId: "user_1",
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    credentialSource: "encrypted",
    ...overrides,
  };
}

function connector(overrides: Record<string, unknown> = {}) {
  return {
    id: "connector_ga4",
    organizationId: "org_1",
    siteId: "site_1",
    provider: "ga4",
    providerAccountId: "pa_google",
    externalResourceId: "properties/123456789",
    config: {},
    status: "connected",
    lastErrorCode: null,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("provider account web client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards the current user bearer token and never returns the submitted API key", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ providerAccount: account() }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApiKeyProviderAccount(context, {
      provider: "geo_chatgpt",
      displayName: "Primary",
      apiKey: "raw-key-sentinel",
      isDefault: true,
    });

    expect(JSON.stringify(result)).not.toContain("raw-key-sentinel");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input).toBe(
      "https://api.searchops.test/organizations/org_1/provider-accounts/geo_chatgpt/api-key",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });

  it("does not echo raw keys or arbitrary API errors on failed creation", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "provider_failed", message: "raw-key-sentinel provider-body-sentinel" },
          { status: 502 },
        ),
      ),
    );

    let error: unknown;
    try {
      await createApiKeyProviderAccount(context, {
        provider: "bing",
        displayName: "Bing",
        apiKey: "raw-key-sentinel",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toEqual(
      expect.objectContaining({ code: "request_failed", name: "ProviderAccountClientError" }),
    );
    expect(JSON.stringify(error)).not.toContain("raw-key-sentinel");
    expect(JSON.stringify(error)).not.toContain("provider-body-sentinel");
  });

  it.each([
    [401, "authentication_required"],
    [403, "forbidden"],
  ] as const)("maps %i to the fixed %s error", async (status, code) => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-body", { status })));

    await expect(loadProviderAccounts(context)).rejects.toEqual(
      expect.objectContaining({ code, name: "ProviderAccountClientError" }),
    );
  });

  it("parses account list responses strictly and rejects credential-shaped fields", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          providerAccounts: [
            account({ bindingCount: 0, credentialCiphertext: "ciphertext-sentinel" }),
          ],
        }),
      ),
    );

    await expect(loadProviderAccounts(context)).rejects.toBeDefined();
  });

  it("normalizes numeric GA4 input before serialization", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ siteConnector: connector() }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveSiteConnector(context, {
      siteId: "site_1",
      provider: "ga4",
      providerAccountId: "pa_google",
      externalResourceId: "123456789",
    });

    const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(JSON.parse(body)).toEqual({
      providerAccountId: "pa_google",
      externalResourceId: "properties/123456789",
    });
  });

  it("enqueues connector sync with the current user bearer token", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        connectorSyncRun: {
          id: "run_1",
          organizationId: "org_1",
          siteId: "site_1",
          providers: ["gsc", "ga4"],
          status: "queued",
          requestedByUserId: "user_1",
          fixture: false,
          startedAt: now,
          endedAt: null,
          summary: null,
        },
        job: {
          id: "job_1",
          name: "connector-sync",
          payload: {
            connectorSyncRunId: "run_1",
            organizationId: "org_1",
            siteId: "site_1",
            siteDomain: "example.com",
            requestedByUserId: "user_1",
            fetchedAt: now,
            providers: ["gsc", "ga4"],
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      triggerSiteConnectorSync(context, "site_1", ["gsc", "ga4"]),
    ).resolves.toMatchObject({ connectorSyncRunId: "run_1" });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });

  it.each([
    ["gsc", "sc-domain:Example.COM", "sc-domain:example.com"],
    ["gsc", "https://example.com/prefix/", "https://example.com/prefix/"],
    ["bing", "https://example.com/site", "https://example.com/site"],
  ] as const)("normalizes %s resource %s", (provider, value, expected) => {
    expect(normalizeSiteConnectorResource(provider, value)).toBe(expected);
  });

  it.each([
    ["ga4", "properties/00123"],
    ["gsc", "sc-domain:https://example.com"],
    ["gsc", "sc-domain:example.com/path"],
    ["gsc", "ftp://example.com/"],
    ["bing", "http://example.com/"],
    ["bing", "example.com"],
    ["bing", "https://user:pass@example.com/"],
  ] as const)("rejects malformed %s resource %s", (provider, value) => {
    expect(() => normalizeSiteConnectorResource(provider, value)).toThrow(
      ProviderAccountClientError,
    );
  });

  it("maps account-in-use deletion to a fixed status without reading the response body", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private-account-body", { status: 409 })),
    );

    await expect(deleteProviderAccount(context, "pa_1")).rejects.toEqual(
      expect.objectContaining({ code: "account_in_use" }),
    );
  });
});

describe("verified provider user claims", () => {
  it("accepts a verified Supabase user role and derives fixed permissions", () => {
    const user = resolveVerifiedProviderUser({
      accessToken: "token",
      claims: {
        sub: "user_1",
        organization_id: "org_1",
        role: "authenticated",
        user_role: "editor",
      },
      sessionUserId: "user_1",
    });

    expect(user).toEqual({
      accessToken: "token",
      organizationId: "org_1",
      role: "editor",
      userId: "user_1",
    });
    expect(canManageProviderAccounts(user.role)).toBe(false);
    expect(canRunConnectorSync(user.role)).toBe(true);
    expect(canRunConnectorSync("viewer")).toBe(false);
    expect(canManageProviderAccounts("admin")).toBe(true);
    expect(canManageProviderAccounts("owner")).toBe(true);
    expect(canManageProviderAccounts("system")).toBe(true);
  });

  it.each([
    { user_role: "unknown" },
    { role: "admin", user_role: "viewer" },
    { role: "authenticated", user_role: "owner", token_use: "service" },
    { role: "authenticated", user_role: "viewer", principal_type: "service" },
  ])("fails closed for unknown, conflicting, or service claims: %j", (overrides) => {
    expect(() =>
      resolveVerifiedProviderUser({
        accessToken: "token",
        claims: {
          sub: "user_1",
          organization_id: "org_1",
          role: "authenticated",
          ...overrides,
        },
        sessionUserId: "user_1",
      }),
    ).toThrow(ProviderAccountClientError);
  });
});
