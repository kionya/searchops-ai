import { createHmac, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  AuthVerificationError,
  canManageProviderCredentials,
  createHmacJwtIdpTokenVerifier,
  createJwksRs256IdpTokenVerifier,
  mapIdpClaimsToUserContext,
  parseJwksJson,
} from "./auth.js";

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
      principalType: "user",
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

  it("verifies RS256 JWTs with JWKS keys and maps deployment IdP claims", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = {
      ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>),
      alg: "RS256",
      kid: "searchops-key-1",
      use: "sig",
    };
    const verifier = createJwksRs256IdpTokenVerifier({
      audience: "searchops-api",
      currentTime: () => new Date("2026-05-26T00:00:00.000Z"),
      issuer: "https://idp.example.com/",
      jwks: parseJwksJson(JSON.stringify({ keys: [jwk] })),
      organizationIdClaim: "org_id",
      provider: "auth0",
    });
    const token = signRs256Jwt(
      {
        aud: "searchops-api",
        email: "owner@example.com",
        exp: 1_779_756_000,
        iss: "https://idp.example.com/",
        org_id: "org_demo",
        role: "owner",
        sub: "idp_owner_1",
      },
      privateKey,
      "searchops-key-1",
    );

    expect(verifier.verify(token)).toEqual({
      email: "owner@example.com",
      organizationId: "org_demo",
      principalType: "user",
      provider: "auth0",
      role: "owner",
      subject: "idp_owner_1",
    });
  });

  it("uses a valid top-level user_role for the Supabase authenticated role", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });
    const claims = verifier.verify(
      signJwt({
        organization_id: "org_demo",
        role: "authenticated",
        sub: "supabase_owner_1",
        user_metadata: { organization_id: "org_untrusted", role: "viewer" },
        user_role: "owner",
      }),
    );

    expect(mapIdpClaimsToUserContext(claims)).toMatchObject({
      organizationId: "org_demo",
      principalType: "user",
      role: "owner",
      userId: "supabase_owner_1",
    });
  });

  it("maps token_use service while preserving configured role-claim compatibility", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ roleClaim: "searchops_role", secret });

    expect(
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          searchops_role: "admin",
          sub: "service_dashboard",
          token_use: "service",
        }),
      ),
    ).toMatchObject({ principalType: "service", role: "admin" });
  });

  it("maps an explicit token_use user as a user principal", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });

    expect(
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          role: "viewer",
          sub: "explicit_user",
          token_use: "user",
        }),
      ),
    ).toMatchObject({ principalType: "user", role: "viewer" });
  });

  it.each(["backend", 42])("rejects unsupported token_use value %j", (tokenUse) => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });
    const verify = () =>
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          role: "owner",
          sub: "ambiguous_principal",
          token_use: tokenUse,
        }),
      );

    expect(verify).toThrow(AuthVerificationError);
    expect(verify).toThrow("Bearer token has unsupported token_use.");
  });

  it("rejects conflicting valid role and user_role claims", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });

    expect(() =>
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          role: "viewer",
          sub: "conflicting_user",
          user_role: "owner",
        }),
      ),
    ).toThrow("Bearer token contains conflicting role claims.");
  });

  it("accepts matching valid role and user_role claims", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });

    expect(
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          role: "viewer",
          sub: "matching_user",
          user_role: "viewer",
        }),
      ),
    ).toMatchObject({ principalType: "user", role: "viewer" });
  });

  it.each([undefined, "invalid-role"])(
    "rejects Supabase authenticated tokens without a valid user_role (%j)",
    (userRole) => {
      const verifier = createHmacJwtIdpTokenVerifier({ secret });
      const payload: Record<string, unknown> = {
        organization_id: "org_demo",
        role: "authenticated",
        sub: "supabase_user",
      };
      if (userRole !== undefined) {
        payload.user_role = userRole;
      }

      expect(() => verifier.verify(signJwt(payload))).toThrow(
        "Bearer token is missing a valid user_role.",
      );
    },
  );

  it("keeps a configured custom role claim authoritative", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ roleClaim: "searchops_role", secret });

    expect(
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          searchops_role: "admin",
          sub: "custom_role_user",
        }),
      ),
    ).toMatchObject({ role: "admin" });
    expect(() =>
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          searchops_role: "admin",
          sub: "conflicting_custom_role_user",
          user_role: "owner",
        }),
      ),
    ).toThrow("Bearer token contains conflicting role claims.");
  });

  it("parses user_role directly when it is the configured role claim", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ roleClaim: "user_role", secret });

    expect(
      verifier.verify(
        signJwt({
          organization_id: "org_demo",
          sub: "direct_user_role",
          user_role: "editor",
        }),
      ),
    ).toMatchObject({ role: "editor" });
  });

  it("keeps existing non-Supabase role tokens compatible as user principals", () => {
    const verifier = createHmacJwtIdpTokenVerifier({ secret });

    expect(
      verifier.verify(
        signJwt({ organization_id: "org_demo", role: "editor", sub: "legacy_editor" }),
      ),
    ).toMatchObject({ principalType: "user", role: "editor" });
  });
});

describe("provider credential authorization", () => {
  it.each(["owner", "admin", "system"] as const)(
    "allows a user %s principal",
    (role) => {
      expect(canManageProviderCredentials({ principalType: "user", role })).toBe(true);
    },
  );

  it.each(["editor", "viewer"] as const)("rejects a user %s principal", (role) => {
    expect(canManageProviderCredentials({ principalType: "user", role })).toBe(false);
  });

  it.each(["owner", "admin", "system", "editor", "viewer"] as const)(
    "rejects every service %s principal",
    (role) => {
      expect(canManageProviderCredentials({ principalType: "service", role })).toBe(false);
    },
  );
});

function signJwt(payload: Record<string, unknown>) {
  const header = encodeJwtSegment({ alg: "HS256", typ: "JWT" });
  const body = encodeJwtSegment(payload);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
  keyId: string,
) {
  const header = encodeJwtSegment({ alg: "RS256", kid: keyId, typ: "JWT" });
  const body = encodeJwtSegment(payload);
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${body}`)
    .sign(privateKey, "base64url");
  return `${header}.${body}.${signature}`;
}

function encodeJwtSegment(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
