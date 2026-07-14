import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProtectedConnectorPageData } from "./connector-page-data";
import { loadConnectorLiveSetupDataAsUser } from "./connector-live-setup";
import { loadConnectorOAuthData } from "./connector-oauth";
import { loadConnectorSyncHistoryAsUser } from "./connector-sync-history";
import { loadDashboardSiteAsUser } from "./dashboard-shell";
import type { ProviderUserContext } from "./provider-accounts";

const context: ProviderUserContext = {
  accessToken: "current-user-token",
  organizationId: "org_a",
  role: "viewer",
  userId: "user_a",
};

const site = {
  id: "site_a",
  organizationId: "org_a",
  domain: "example.com",
  name: "Example",
  industry: "other" as const,
  language: "ko",
  country: "KR",
  createdAt: "2026-07-14T00:00:00.000Z",
};

describe("protected connector loaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stops after a cross-organization site denial without service or fixture reads", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubEnv("SEARCHOPS_IDP_JWT_HS256_SECRET", "service-secret-must-not-be-used");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("private", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadProtectedConnectorPageData(context, "site_cross_org");

    expect(result).toEqual({ status: "site_unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
    expect(JSON.stringify(result)).not.toContain("site_demo");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("service-secret-must-not-be-used");
  });

  it("loads a protected site with the current user and rejects an organization mismatch", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ...site, organizationId: "org_b" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDashboardSiteAsUser(context, "site_a")).resolves.toBeNull();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });

  it("does not substitute fixture sync history after protected 401", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("private", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const history = await loadConnectorSyncHistoryAsUser(context, site);

    expect(history).toMatchObject({ source: "api", runs: [], errorMessage: "동기화 이력을 불러오지 못했습니다." });
    expect(JSON.stringify(history)).not.toContain("sync_demo");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });

  it("does not substitute fixture live setup after protected 403", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("private", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadConnectorLiveSetupDataAsUser(context)).resolves.toEqual({
      errorMessage: "Live setup 정보를 불러오지 못했습니다.",
      report: null,
      source: "api",
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });

  it("loads OAuth status with the current user and no protected fixture fallback", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("private", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = await loadConnectorOAuthData("site_a", context);

    expect(data).toEqual({
      credentials: [],
      errorMessage: "OAuth 상태를 불러오지 못했습니다.",
      source: "api",
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer current-user-token",
    );
  });
});
