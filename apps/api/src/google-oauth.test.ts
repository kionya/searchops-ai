import { describe, expect, it } from "vitest";

import {
  createGoogleConnectorOAuthClient,
  googleConnectorOAuthScopes,
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from "./google-oauth.js";

const currentTime = () => new Date("2026-05-27T00:00:00.000Z");
const stateSecret = "test_state_secret_12345";

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

  it("exchanges a code for token metadata without exposing raw response shape", async () => {
    const idTokenPayload = Buffer.from(
      JSON.stringify({ email: "owner@example.com" }),
      "utf8",
    ).toString("base64url");
    const fetchCalls: unknown[] = [];
    const client = createGoogleConnectorOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      currentTime,
      fetch: (async (url, init) => {
        fetchCalls.push({ init, url: String(url) });
        return {
          json: async () => ({
            access_token: "access-token",
            expires_in: 3600,
            id_token: `header.${idTokenPayload}.signature`,
            refresh_token: "refresh-token",
            scope: `${googleConnectorOAuthScopes.gsc} ${googleConnectorOAuthScopes.ga4}`,
            token_type: "Bearer",
          }),
          ok: true,
        } as Response;
      }) as typeof fetch,
      redirectUri: "https://api.example.com/connectors/google/oauth/callback",
      stateSecret,
    });

    const tokens = await client.exchangeCodeForTokens("code_123");

    expect(fetchCalls).toHaveLength(1);
    expect(tokens).toMatchObject({
      accessToken: "access-token",
      externalAccountEmail: "owner@example.com",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
    });
    expect(tokens.expiresAt).toBe("2026-05-27T01:00:00.000Z");
  });
});
