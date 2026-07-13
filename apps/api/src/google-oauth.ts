import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import {
  ConnectorOAuthProviderListSchema,
  type ConnectorOAuthProvider,
  type ConnectorOAuthProviderList,
} from "@searchops/types";
import { z } from "zod";

const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleUserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const stateMaxAgeMs = 10 * 60 * 1000;
const tokenExchangeErrorMessage = "Google OAuth token exchange failed.";
const identityVerificationErrorMessage = "Google OAuth identity verification failed.";

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
  readonly externalAccountEmail: string;
  readonly externalAccountId: string;
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

const GoogleTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().finite().nonnegative().optional(),
    refresh_token: z.string().min(1).optional(),
    scope: z.string().optional(),
    token_type: z.string().min(1).optional(),
  })
  .passthrough();

const GoogleUserInfoSchema = z
  .object({
    sub: z.string().trim().min(1),
    email: z.string().trim().email(),
    email_verified: z.literal(true),
  })
  .passthrough();

type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;

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
      const scopes = ["openid", "email", ...providers.map((provider) => googleConnectorOAuthScopes[provider])];
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
      let tokenResponse: GoogleTokenResponse;
      try {
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
        if (!response.ok) {
          throw new Error(tokenExchangeErrorMessage);
        }
        tokenResponse = GoogleTokenResponseSchema.parse(await response.json());
      } catch {
        throw new Error(tokenExchangeErrorMessage);
      }

      const tokenResult = parseGoogleTokenResponse(tokenResponse, currentTime());
      try {
        const response = await fetchFn(googleUserInfoEndpoint, {
          headers: { authorization: `Bearer ${tokenResult.accessToken}` },
          method: "GET",
        });
        if (!response.ok) {
          throw new Error(identityVerificationErrorMessage);
        }
        const identity = GoogleUserInfoSchema.parse(await response.json());
        return {
          ...tokenResult,
          externalAccountEmail: identity.email,
          externalAccountId: identity.sub,
        };
      } catch {
        throw new Error(identityVerificationErrorMessage);
      }
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
): Omit<GoogleOAuthTokenResult, "externalAccountEmail" | "externalAccountId"> {
  const accessToken = response.access_token;
  const scopes =
    typeof response.scope === "string"
      ? response.scope.split(" ").filter((scope) => scope.length > 0)
      : [];
  const expiresInSeconds =
    response.expires_in === undefined ? null : response.expires_in;

  return {
    accessToken,
    expiresAt:
      expiresInSeconds === null
        ? null
        : new Date(receivedAt.getTime() + expiresInSeconds * 1000).toISOString(),
    refreshToken: response.refresh_token ?? null,
    scopes,
    tokenType: response.token_type ?? null,
  };
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
