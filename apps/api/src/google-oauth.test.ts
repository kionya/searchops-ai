import { describe, expect, it } from "vitest";

import {
  createGoogleConnectorOAuthClient,
  googleConnectorOAuthScopes,
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from "./google-oauth.js";

const currentTime = () => new Date("2026-05-27T00:00:00.000Z");
const stateSecret = "test_state_secret_12345";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function createFetchSequence(responses: readonly Response[]) {
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
  let index = 0;
  const fetchFn: typeof globalThis.fetch = async (input, init) => {
    calls.push({ init, url: String(input) });
    const response = responses[index];
    index += 1;
    if (response === undefined) {
      throw new Error("Unexpected fetch call");
    }
    return response;
  };
  return { calls, fetch: fetchFn };
}

function oauthClient(fetch: typeof globalThis.fetch) {
  return createGoogleConnectorOAuthClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    currentTime,
    fetch,
    redirectUri: "https://api.example.com/connectors/google/oauth/callback",
    stateSecret,
  });
}

function stateClientAt(time: string) {
  return createGoogleConnectorOAuthClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    currentTime: () => new Date(time),
    redirectUri: "https://api.example.com/connectors/google/oauth/callback",
    stateSecret,
  });
}

describe("google-oauth", () => {
  it("creates a signed authorization URL with GSC and GA4 readonly scopes", () => {
    const client = createGoogleConnectorOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      currentTime,
      redirectUri: "https://api.example.com/connectors/google/oauth/callback",
      stateSecret,
    });

    const authorization = client.createAuthorizationUrl({
      organizationId: "org_1",
      providers: ["gsc", "ga4"],
      requestedByUserId: "user_1",
      returnTo: "https://searchops.example.com/sites/site_1/connectors",
      siteId: "site_1",
    });
    const url = new URL(authorization.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain(googleConnectorOAuthScopes.gsc);
    expect(url.searchParams.get("scope")).toContain(googleConnectorOAuthScopes.ga4);
    expect(client.verifyState(url.searchParams.get("state")!)).toMatchObject({
      providers: ["gsc", "ga4"],
      siteId: "site_1",
    });
    expect(authorization.stateIdentifier).toBe(
      client.verifyState(authorization.state).nonce,
    );
  });

  it("rejects tampered state payloads", () => {
    const state = signGoogleOAuthState(
      {
        issuedAt: "2026-05-27T00:00:00.000Z",
        nonce: "nonce",
        organizationId: "org_1",
        providers: ["gsc"],
        requestedByUserId: "user_1",
        returnTo: null,
        siteId: "site_1",
      },
      stateSecret,
    );

    expect(verifyGoogleOAuthState(state, stateSecret)).toMatchObject({ siteId: "site_1" });
    expect(() => verifyGoogleOAuthState(`${state}x`, stateSecret)).toThrow(/signature/i);
  });

  it("accepts state time boundaries and rejects excessive future skew or age", () => {
    const stateFor = (issuedAt: string) =>
      signGoogleOAuthState(
        {
          issuedAt,
          nonce: `nonce-${issuedAt}`,
          organizationId: "org_1",
          providers: ["gsc"],
          requestedByUserId: "user_1",
          returnTo: null,
          siteId: "site_1",
        },
        stateSecret,
      );
    const client = stateClientAt("2026-05-27T00:10:00.000Z");

    expect(() => client.verifyState(stateFor("2026-05-27T00:00:00.000Z"))).not.toThrow();
    expect(() => client.verifyState(stateFor("2026-05-27T00:11:00.000Z"))).not.toThrow();
    expect(() => client.verifyState(stateFor("2026-05-26T23:59:59.999Z"))).toThrow(/expired/i);
    expect(() => client.verifyState(stateFor("2026-05-27T00:11:00.001Z"))).toThrow(/future/i);
  });

  it("exchanges tokens then loads a verified Google sub and email", async () => {
    const sequence = createFetchSequence([
      jsonResponse({
        access_token: "access-token",
        expires_in: 3600,
        id_token: "unsigned.payload.must-not-be-used",
        refresh_token: "refresh-token",
        scope: `${googleConnectorOAuthScopes.gsc} ${googleConnectorOAuthScopes.ga4}`,
        token_type: "Bearer",
      }),
      jsonResponse({
        sub: "google-sub-123",
        email: "verified-owner@example.com",
        email_verified: true,
      }),
    ]);
    const client = oauthClient(sequence.fetch);

    const tokens = await client.exchangeCodeForTokens("code_123");

    expect(sequence.calls).toHaveLength(2);
    expect(tokens).toMatchObject({
      accessToken: "access-token",
      externalAccountEmail: "verified-owner@example.com",
      externalAccountId: "google-sub-123",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
    });
    expect(tokens.expiresAt).toBe("2026-05-27T01:00:00.000Z");
    expect(sequence.calls[1]).toEqual({
      init: {
        headers: { authorization: "Bearer access-token" },
        method: "GET",
      },
      url: "https://openidconnect.googleapis.com/v1/userinfo",
    });
    expect(sequence.calls[1]!.url).not.toContain("access-token");
    expect(sequence.calls[1]!.url).not.toContain("refresh-token");
  });

  it.each([
    ["non-2xx", jsonResponse({ error: "access-token-sentinel" }, 401)],
    ["missing sub", jsonResponse({ email: "owner@example.com", email_verified: true })],
    ["empty sub", jsonResponse({ sub: "", email: "owner@example.com", email_verified: true })],
    ["missing email", jsonResponse({ sub: "google-sub", email_verified: true })],
    ["invalid email", jsonResponse({ sub: "google-sub", email: "invalid", email_verified: true })],
    ["unverified email", jsonResponse({ sub: "google-sub", email: "owner@example.com", email_verified: false })],
    ["nonboolean verification", jsonResponse({ sub: "google-sub", email: "owner@example.com", email_verified: "true" })],
  ])("rejects %s userinfo with a stable identity error", async (_name, userinfoResponse) => {
    const sequence = createFetchSequence([
      jsonResponse({ access_token: "access-token", refresh_token: "refresh-token" }),
      userinfoResponse,
    ]);

    await expect(oauthClient(sequence.fetch).exchangeCodeForTokens("code_123")).rejects.toEqual(
      new Error("Google OAuth identity verification failed."),
    );
  });

  it("does not leak token response details or token values in exchange errors", async () => {
    const accessToken = "access-token-response-sentinel";
    const refreshToken = "refresh-token-response-sentinel";
    const sequence = createFetchSequence([
      jsonResponse(
        {
          error: "invalid_grant",
          error_description: `${accessToken}:${refreshToken}`,
        },
        400,
      ),
    ]);

    const error = await oauthClient(sequence.fetch)
      .exchangeCodeForTokens("code_123")
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new Error("Google OAuth token exchange failed."));
    expect(String(error)).not.toContain(accessToken);
    expect(String(error)).not.toContain(refreshToken);
  });

  it.each([
    ["malformed JSON", new Response("not-json", { status: 200 })],
    ["out-of-range expiry", jsonResponse({ access_token: "access", expires_in: 1e20 })],
  ])("returns a stable token error for %s", async (_name, response) => {
    const sequence = createFetchSequence([response]);

    await expect(oauthClient(sequence.fetch).exchangeCodeForTokens("code_123")).rejects.toEqual(
      new Error("Google OAuth token exchange failed."),
    );
    expect(sequence.calls).toHaveLength(1);
  });

  it("does not leak access or refresh token values in userinfo errors", async () => {
    const accessToken = "userinfo-access-token-sentinel";
    const refreshToken = "userinfo-refresh-token-sentinel";
    const sequence = createFetchSequence([
      jsonResponse({ access_token: accessToken, refresh_token: refreshToken }),
      jsonResponse({
        sub: accessToken,
        email: refreshToken,
        email_verified: false,
      }),
    ]);

    const error = await oauthClient(sequence.fetch)
      .exchangeCodeForTokens("code_123")
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new Error("Google OAuth identity verification failed."));
    expect(String(error)).not.toContain(accessToken);
    expect(String(error)).not.toContain(refreshToken);
  });
});
