import { createHmac } from "node:crypto";

import { getApiBaseUrl } from "./api-base-url";

export { getApiBaseUrl };

const TOKEN_TTL_SECONDS = 600;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mintServiceToken(secret: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    sub: process.env.SEARCHOPS_API_SERVICE_SUBJECT?.trim() || "user_demo_owner",
    organization_id: process.env.SEARCHOPS_API_SERVICE_ORG?.trim() || "org_demo",
    role: process.env.SEARCHOPS_API_SERVICE_ROLE?.trim() || "owner",
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  });
  const data = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

/**
 * Builds the Authorization header for server-side calls to the SearchOps API.
 *
 * When `SEARCHOPS_IDP_JWT_HS256_SECRET` is set (same value as the API runtime),
 * a short-lived HS256 service token is minted so the web dashboards can read
 * authenticated `/ops/*` and tenant-scoped routes. When the secret is absent the
 * caller sends no Authorization header, the API answers 401, and the dashboards
 * fall back to fixture/demo data — so this is safe to deploy before the secret
 * is configured.
 */
export function getApiAuthHeaders(): Record<string, string> {
  const secret = process.env.SEARCHOPS_IDP_JWT_HS256_SECRET?.trim();
  if (!secret) {
    return {};
  }

  return { authorization: `Bearer ${mintServiceToken(secret)}` };
}

/**
 * Drop-in replacement for `fetch` targeting the SearchOps API. Mirrors the
 * `fetch(input, init)` signature, defaults to `cache: "no-store"`, and injects
 * the service Authorization header unless the caller already set one.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("authorization")) {
    for (const [key, value] of Object.entries(getApiAuthHeaders())) {
      headers.set(key, value);
    }
  }

  return fetch(input, { cache: "no-store", ...init, headers });
}
