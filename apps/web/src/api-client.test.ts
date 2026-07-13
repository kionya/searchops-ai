import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiAuthenticationRequiredError,
  apiFetchAsUser,
  getApiAuthHeaders,
} from "./api-client";

describe("apiFetchAsUser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([null, "", "   "])("rejects a missing token before fetch (%j)", async (token) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchAsUser("https://api.searchops.test/secure", token)).rejects.toEqual(
      expect.objectContaining({
        code: "authentication_required",
        name: "ApiAuthenticationRequiredError",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the supplied user token and preserves caller request options", async () => {
    vi.stubEnv("SEARCHOPS_IDP_JWT_HS256_SECRET", "service-secret-must-not-be-used");
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiFetchAsUser("https://api.searchops.test/secure", " user-access-token ", {
      cache: "force-cache",
      headers: { "x-request-id": "request-1" },
      method: "PATCH",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(input).toBe("https://api.searchops.test/secure");
    expect(init).toMatchObject({ cache: "force-cache", method: "PATCH" });
    expect(headers.get("authorization")).toBe("Bearer user-access-token");
    expect(headers.get("x-request-id")).toBe("request-1");
  });

  it("mints service tokens with explicit service and SearchOps role claims", () => {
    vi.stubEnv("SEARCHOPS_IDP_JWT_HS256_SECRET", "service-secret");
    vi.stubEnv("SEARCHOPS_API_SERVICE_ROLE", "admin");

    const authorization = getApiAuthHeaders().authorization;
    const token = authorization?.replace(/^Bearer /, "") ?? "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
      role?: string;
      token_use?: string;
      user_role?: string;
    };

    expect(payload).toMatchObject({
      role: "admin",
      token_use: "service",
      user_role: "admin",
    });
  });

  it("exposes a typed authentication-required error", () => {
    const error = new ApiAuthenticationRequiredError();
    expect(error).toMatchObject({
      code: "authentication_required",
      name: "ApiAuthenticationRequiredError",
    });
  });
});
