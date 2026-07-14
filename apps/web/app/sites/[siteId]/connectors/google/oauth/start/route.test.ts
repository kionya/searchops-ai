import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiFetchAsUser: vi.fn(),
  getApiBaseUrl: vi.fn(),
  getSession: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("../../../../../../../src/api-base-url", () => ({
  getApiBaseUrl: mocks.getApiBaseUrl,
}));
vi.mock("../../../../../../../src/api-client", () => ({
  apiFetch: mocks.apiFetch,
  apiFetchAsUser: mocks.apiFetchAsUser,
}));
vi.mock("../../../../../../../src/supabase-server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ siteId: "site_123" }) };

function request(query = "") {
  return new Request(`https://app.searchops.test/sites/site_123/connectors/google/oauth/start${query}`);
}

function session(accessToken: string | null) {
  mocks.getSession.mockResolvedValue({
    data: { session: accessToken === null ? null : { access_token: accessToken } },
  });
  mocks.getSupabaseServerClient.mockResolvedValue({
    auth: { getSession: mocks.getSession },
  });
}

describe("Google OAuth web start route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forwards only the current session token to the same API origin with format=json", async () => {
    session("current-user-token");
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");
    mocks.apiFetchAsUser.mockResolvedValue(
      Response.json({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=signed",
        providers: ["gsc", "ga4"],
        stateExpiresAt: "2026-07-14T00:10:00.000Z",
      }),
    );

    const response = await GET(
      request("?providers=gsc%2Cga4&returnTo=https%3A%2F%2Fapp.searchops.test%2Freturn"),
      context,
    );

    expect(mocks.apiFetchAsUser).toHaveBeenCalledOnce();
    const [input, accessToken, init] = mocks.apiFetchAsUser.mock.calls[0]!;
    const startUrl = new URL(input as string);
    expect(startUrl.origin).toBe("https://api.searchops.test");
    expect(startUrl.pathname).toBe(
      "/sites/site_123/connectors/google/oauth/start",
    );
    expect(Object.fromEntries(startUrl.searchParams)).toEqual({
      format: "json",
      providers: "gsc,ga4",
      returnTo: "https://app.searchops.test/return",
    });
    expect(accessToken).toBe("current-user-token");
    expect(init).toEqual({ cache: "no-store" });
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=signed",
    );
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("redirects authentication_required without any API call when session is missing", async () => {
    session(null);
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");

    const response = await GET(request(), context);

    expect(response.headers.get("location")).toBe(
      "https://app.searchops.test/sites/site_123/connectors?oauth=authentication_required",
    );
    expect(mocks.apiFetchAsUser).not.toHaveBeenCalled();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("keeps API failures local without leaking status, body, or user token", async () => {
    session("private-user-token");
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");
    mocks.apiFetchAsUser.mockResolvedValue(
      new Response("provider-body-sentinel", { status: 502 }),
    );

    const response = await GET(request(), context);
    const location = response.headers.get("location") ?? "";

    expect(location).toBe(
      "https://app.searchops.test/sites/site_123/connectors?oauth=failed",
    );
    expect(location).not.toContain("502");
    expect(location).not.toContain("provider-body-sentinel");
    expect(location).not.toContain("private-user-token");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});
