import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AuthVerificationError, createHmacJwtIdpTokenVerifier } from "./auth.js";

const secret = "idp_secret";

describe("IdP token verification", () => {
  it("verifies HS256 JWTs and maps deployment IdP claims", () => {
    const verifier = createHmacJwtIdpTokenVerifier({
      audience: "searchops-api",
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      issuer: "https://idp.example.com/",
      organizationIdClaim: "org_id",
      provider: "auth0",
      secret,
    });
    const token = signJwt({
      aud: "searchops-api",
      email: "owner@example.com",
      exp: 1_779_756_000,
      iss: "https://idp.example.com/",
      org_id: "org_demo",
      role: "owner",
      sub: "idp_owner_1",
    });

    expect(verifier.verify(token)).toEqual({
      email: "owner@example.com",
      organizationId: "org_demo",
      provider: "auth0",
      role: "owner",
      subject: "idp_owner_1",
    });
  });

  it("rejects expired or tampered bearer tokens", () => {
    const verifier = createHmacJwtIdpTokenVerifier({
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      secret,
    });
    const expiredToken = signJwt({
      exp: 1_000,
      organization_id: "org_demo",
      role: "admin",
      sub: "idp_admin_1",
    });
    const tamperedToken = `${signJwt({
      exp: 1_779_756_000,
      organization_id: "org_demo",
      role: "admin",
      sub: "idp_admin_1",
    }).slice(0, -2)}xx`;

    expect(() => verifier.verify(expiredToken)).toThrow(AuthVerificationError);
    expect(() => verifier.verify(tamperedToken)).toThrow(AuthVerificationError);
  });
});

function signJwt(payload: Record<string, unknown>) {
  const header = encodeJwtSegment({ alg: "HS256", typ: "JWT" });
  const body = encodeJwtSegment(payload);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function encodeJwtSegment(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
