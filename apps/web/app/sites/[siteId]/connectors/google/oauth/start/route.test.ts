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

  // 이전에는 상태 코드까지 숨겼다. 그 결과 화면에 oauth=failed 만 남아 운영자가
  // 손댈 곳을 찾지 못했다(실제로 겪었다). 상태 코드는 자격증명이 아니고 이미 인증된
  // 사용자에게만 보인다. 숨겨야 하는 것은 응답 본문과 토큰이고, 그 둘은 그대로 막는다.
  it("carries the failure code back without leaking the body or the user token", async () => {
    session("private-user-token");
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");
    mocks.apiFetchAsUser.mockResolvedValue(
      new Response("provider-body-sentinel", { status: 502 }),
    );

    const response = await GET(request(), context);
    const location = response.headers.get("location") ?? "";

    expect(location).toBe(
      "https://app.searchops.test/sites/site_123/connectors?oauth=failed&oauthReason=http_502",
    );
    expect(location).not.toContain("provider-body-sentinel");
    expect(location).not.toContain("private-user-token");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("reports the API error code so the screen can name the missing configuration", async () => {
    session("private-user-token");
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");
    mocks.apiFetchAsUser.mockResolvedValue(
      Response.json(
        { error: "oauth_service_unavailable", message: "Google OAuth service is unavailable" },
        { status: 503 },
      ),
    );

    const response = await GET(request(), context);

    expect(response.headers.get("location")).toBe(
      "https://app.searchops.test/sites/site_123/connectors?oauth=failed&oauthReason=oauth_service_unavailable",
    );
  });

  // error 필드에 값이 섞여 들어오면 그대로 주소창에 실려 나간다. 코드 모양이 아니면 버린다.
  it("drops an error field that does not look like a code", async () => {
    session("private-user-token");
    mocks.getApiBaseUrl.mockReturnValue("https://api.searchops.test");
    mocks.apiFetchAsUser.mockResolvedValue(
      Response.json({ error: "postgres://user:hunter2@db.internal:5432" }, { status: 500 }),
    );

    const response = await GET(request(), context);
    const location = response.headers.get("location") ?? "";

    expect(location).not.toContain("hunter2");
    expect(location).toContain("oauthReason=http_500");
  });
});
