import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  ConnectorOAuthProviderListSchema,
  type ConnectorOAuthProvider,
  type ConnectorOAuthProviderList,
} from "@searchops/types";

const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const stateMaxAgeMs = 10 * 60 * 1000;

export const googleConnectorOAuthScopes = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
} as const satisfies Record<ConnectorOAuthProvider, string>;

export interface GoogleOAuthStatePayload {
  readonly issuedAt: string;
  readonly nonce: string;
  readonly organizationId: string;
  readonly providers: ConnectorOAuthProviderList;
  readonly requestedByUserId: string;
  readonly returnTo: string | null;
  readonly siteId: string;
}

export interface GoogleOAuthAuthorizationInput {
  readonly organizationId: string;
  readonly providers: ConnectorOAuthProviderList;
  readonly requestedByUserId: string;
  readonly returnTo?: string | undefined;
  readonly siteId: string;
}

export interface GoogleOAuthAuthorization {
  readonly authorizationUrl: string;
  readonly providers: ConnectorOAuthProviderList;
  readonly state: string;
  readonly stateExpiresAt: string;
}

export interface GoogleOAuthTokenResult {
  readonly accessToken: string;
  readonly expiresAt: string | null;
  readonly externalAccountEmail: string | null;
  readonly refreshToken: string | null;
  readonly scopes: readonly string[];
  readonly tokenType: string | null;
}

export interface GoogleConnectorOAuthClient {
  createAuthorizationUrl(input: GoogleOAuthAuthorizationInput): GoogleOAuthAuthorization;
  exchangeCodeForTokens(code: string): Promise<GoogleOAuthTokenResult>;
  verifyState(state: string): GoogleOAuthStatePayload;
}

export interface CreateGoogleConnectorOAuthClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly currentTime?: () => Date;
  readonly fetch?: typeof fetch;
  readonly redirectUri: string;
  readonly stateSecret: string;
}

interface GoogleTokenResponse {
  readonly access_token?: unknown;
  readonly expires_in?: unknown;
  readonly id_token?: unknown;
  readonly refresh_token?: unknown;
  readonly scope?: unknown;
  readonly token_type?: unknown;
}

export function createGoogleConnectorOAuthClient({
  clientId,
  clientSecret,
  currentTime = () => new Date(),
  fetch: fetchFn = fetch,
  redirectUri,
  stateSecret,
}: CreateGoogleConnectorOAuthClientOptions): GoogleConnectorOAuthClient {
  return {
    createAuthorizationUrl(input) {
      const providers = ConnectorOAuthProviderListSchema.parse(input.providers);
      const issuedAt = currentTime();
      const statePayload: GoogleOAuthStatePayload = {
        issuedAt: issuedAt.toISOString(),
        nonce: randomUUID(),
        organizationId: input.organizationId,
        providers,
        requestedByUserId: input.requestedByUserId,
        returnTo: input.returnTo ?? null,
        siteId: input.siteId,
      };
      const state = signGoogleOAuthState(statePayload, stateSecret);
      const scopes = providers.map((provider) => googleConnectorOAuthScopes[provider]);
      const authorizationUrl = new URL(googleAuthorizationEndpoint);
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("client_id", clientId);
      authorizationUrl.searchParams.set("include_granted_scopes", "true");
      authorizationUrl.searchParams.set("prompt", "consent");
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);

      return {
        authorizationUrl: authorizationUrl.toString(),
        providers,
        state,
        stateExpiresAt: new Date(issuedAt.getTime() + stateMaxAgeMs).toISOString(),
      };
    },

    async exchangeCodeForTokens(code) {
      const response = await fetchFn(googleTokenEndpoint, {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      });
      const tokenResponse = (await response.json()) as GoogleTokenResponse;
      if (!response.ok) {
        throw new Error("Google OAuth token exchange failed.");
      }

      return parseGoogleTokenResponse(tokenResponse, currentTime());
    },

    verifyState(state) {
      const payload = verifyGoogleOAuthState(state, stateSecret);
      const issuedAtMs = new Date(payload.issuedAt).getTime();
      if (!Number.isFinite(issuedAtMs)) {
        throw new Error("Invalid Google OAuth state timestamp.");
      }

      if (currentTime().getTime() - issuedAtMs > stateMaxAgeMs) {
        throw new Error("Google OAuth state expired.");
      }

      return payload;
    },
  };
}

export function createGoogleConnectorOAuthClientFromEnv(
  env: NodeJS.ProcessEnv,
): GoogleConnectorOAuthClient | undefined {
  const clientId = env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = env.SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI;
  const stateSecret = env.SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET;

  if (
    clientId === undefined ||
    clientSecret === undefined ||
    redirectUri === undefined ||
    stateSecret === undefined
  ) {
    return undefined;
  }

  return createGoogleConnectorOAuthClient({
    clientId,
    clientSecret,
    redirectUri,
    stateSecret,
  });
}

export function signGoogleOAuthState(
  payload: GoogleOAuthStatePayload,
  secret: string,
) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyGoogleOAuthState(state: string, secret: string): GoogleOAuthStatePayload {
  const segments = state.split(".");
  if (segments.length !== 2) {
    throw new Error("Invalid Google OAuth state.");
  }

  const [encodedPayload, signature] = segments as [string, string];
  const expectedSignature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  if (!timingSafeStringEqual(signature, expectedSignature)) {
    throw new Error("Invalid Google OAuth state signature.");
  }

  const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
  return parseGoogleOAuthStatePayload(decoded);
}

function parseGoogleOAuthStatePayload(input: unknown): GoogleOAuthStatePayload {
  if (typeof input !== "object" || input === null) {
    throw new Error("Invalid Google OAuth state payload.");
  }
  const record = input as Record<string, unknown>;

  return {
    issuedAt: requireString(record.issuedAt, "issuedAt"),
    nonce: requireString(record.nonce, "nonce"),
    organizationId: requireString(record.organizationId, "organizationId"),
    providers: ConnectorOAuthProviderListSchema.parse(record.providers),
    requestedByUserId: requireString(record.requestedByUserId, "requestedByUserId"),
    returnTo: record.returnTo === null ? null : requireString(record.returnTo, "returnTo"),
    siteId: requireString(record.siteId, "siteId"),
  };
}

function parseGoogleTokenResponse(
  response: GoogleTokenResponse,
  receivedAt: Date,
): GoogleOAuthTokenResult {
  const accessToken = requireString(response.access_token, "access_token");
  const scopes =
    typeof response.scope === "string"
      ? response.scope.split(" ").filter((scope) => scope.length > 0)
      : [];
  const expiresInSeconds =
    typeof response.expires_in === "number" && Number.isFinite(response.expires_in)
      ? response.expires_in
      : null;

  return {
    accessToken,
    expiresAt:
      expiresInSeconds === null
        ? null
        : new Date(receivedAt.getTime() + expiresInSeconds * 1000).toISOString(),
    externalAccountEmail: parseEmailFromIdToken(response.id_token),
    refreshToken:
      typeof response.refresh_token === "string" && response.refresh_token.length > 0
        ? response.refresh_token
        : null,
    scopes,
    tokenType:
      typeof response.token_type === "string" && response.token_type.length > 0
        ? response.token_type
        : null,
  };
}

function parseEmailFromIdToken(idToken: unknown) {
  if (typeof idToken !== "string") {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length < 2 || segments[1] === undefined) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as {
      email?: unknown;
    };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Google OAuth ${field} is required.`);
  }
  return value;
}

function timingSafeStringEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
