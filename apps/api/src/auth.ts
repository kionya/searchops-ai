import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

import { phaseOneSeedIds } from "@searchops/db";
import {
  AuthenticatedUserContextSchema,
  AuthRoleSchema,
  IdpClaimMappingInputSchema,
  MockUserContextSchema,
  type AuthenticatedUserContext,
  type AuthRole,
  type IdpClaimMappingInput,
} from "@searchops/types";

export interface AuthContextResolverOptions {
  readonly allowMockFallback?: boolean;
  readonly allowTrustedHeaders?: boolean;
  readonly tokenVerifier?: IdpTokenVerifier;
}

export type AuthContextResolver = (request: FastifyRequest) => AuthenticatedUserContext;

export interface IdpTokenVerifier {
  verify(token: string): IdpClaimMappingInput;
}

export interface CreateHmacJwtIdpTokenVerifierOptions {
  readonly audience?: string | undefined;
  readonly currentTime?: () => Date;
  readonly issuer?: string | undefined;
  readonly organizationIdClaim?: string;
  readonly provider?: string;
  readonly roleClaim?: string;
  readonly secret: string;
}

export class AuthVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthVerificationError";
  }
}

function readHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveMockUserContext(request: FastifyRequest) {
  return MockUserContextSchema.parse({
    userId: readHeader(request, "x-mock-user-id") ?? phaseOneSeedIds.userId,
    organizationId: readHeader(request, "x-mock-organization-id") ?? phaseOneSeedIds.organizationId,
    role: AuthRoleSchema.parse(readHeader(request, "x-mock-user-role") ?? "admin"),
    source: "mock",
  });
}

export function resolveAuthenticatedUserContext(request: FastifyRequest) {
  return createRequestAuthContextResolver()(request);
}

export function createRequestAuthContextResolver(
  options: AuthContextResolverOptions = {},
): AuthContextResolver {
  return (request) => {
    const bearerToken = readBearerToken(request);
    if (bearerToken !== null) {
      if (options.tokenVerifier === undefined) {
        throw new AuthVerificationError("Bearer token verification is not configured.");
      }

      try {
        return mapIdpClaimsToUserContext(options.tokenVerifier.verify(bearerToken));
      } catch (error) {
        if (error instanceof AuthVerificationError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : "Invalid bearer token.";
        throw new AuthVerificationError(message);
      }
    }

    if (options.allowTrustedHeaders !== false) {
      const idpClaims = readIdpClaimsFromHeaders(request);
      if (idpClaims !== null) {
        return mapIdpClaimsToUserContext(idpClaims);
      }
    }

    if (options.allowMockFallback === false) {
      throw new AuthVerificationError("Authentication is required.");
    }

    return resolveMockUserContext(request);
  };
}

export function createHmacJwtIdpTokenVerifier({
  audience,
  currentTime = () => new Date(),
  issuer,
  organizationIdClaim = "organization_id",
  provider = "idp",
  roleClaim = "role",
  secret,
}: CreateHmacJwtIdpTokenVerifierOptions): IdpTokenVerifier {
  return {
    verify(token) {
      const tokenSegments = token.split(".");
      if (tokenSegments.length !== 3) {
        throw new AuthVerificationError("Bearer token must be a compact JWT.");
      }
      const encodedHeader = tokenSegments[0]!;
      const encodedPayload = tokenSegments[1]!;
      const signature = tokenSegments[2]!;

      const header = parseJwtSegment(encodedHeader);
      if (header.alg !== "HS256") {
        throw new AuthVerificationError("Only HS256 IdP tokens are supported by this verifier.");
      }

      verifyHs256Signature({
        encodedHeader,
        encodedPayload,
        secret,
        signature,
      });

      const payload = parseJwtSegment(encodedPayload);
      validateJwtTemporalClaims(payload, currentTime());
      validateJwtIssuerAndAudience({ audience, issuer, payload });

      return IdpClaimMappingInputSchema.parse({
        email: typeof payload.email === "string" ? payload.email : null,
        organizationId: readStringClaim(payload, organizationIdClaim),
        provider:
          typeof payload.provider === "string" && payload.provider.length > 0
            ? payload.provider
            : provider,
        role: readStringClaim(payload, roleClaim),
        subject: readStringClaim(payload, "sub"),
      });
    },
  };
}

function readBearerToken(request: FastifyRequest) {
  const authorization = readHeader(request, "authorization");
  if (authorization === undefined) {
    return null;
  }

  const authorizationSegments = authorization.split(" ");
  const [scheme, token] = authorizationSegments;
  if (
    authorizationSegments.length !== 2 ||
    scheme?.toLowerCase() !== "bearer" ||
    token === undefined ||
    token.length === 0
  ) {
    throw new AuthVerificationError("Authorization header must use the Bearer scheme.");
  }

  return token;
}

function parseJwtSegment(segment: string): Record<string, unknown> {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("JWT segment must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AuthVerificationError("Bearer token contains invalid JWT JSON.");
  }
}

function verifyHs256Signature({
  encodedHeader,
  encodedPayload,
  secret,
  signature,
}: {
  readonly encodedHeader: string;
  readonly encodedPayload: string;
  readonly secret: string;
  readonly signature: string;
}) {
  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new AuthVerificationError("Bearer token signature verification failed.");
  }
}

function validateJwtTemporalClaims(payload: Record<string, unknown>, now: Date) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds) {
    throw new AuthVerificationError("Bearer token has expired.");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    throw new AuthVerificationError("Bearer token is not valid yet.");
  }
}

function validateJwtIssuerAndAudience({
  audience,
  issuer,
  payload,
}: {
  readonly audience: string | undefined;
  readonly issuer: string | undefined;
  readonly payload: Record<string, unknown>;
}) {
  if (issuer !== undefined && payload.iss !== issuer) {
    throw new AuthVerificationError("Bearer token issuer is not trusted.");
  }

  if (audience === undefined) {
    return;
  }

  const tokenAudience = payload.aud;
  if (typeof tokenAudience === "string" && tokenAudience === audience) {
    return;
  }
  if (Array.isArray(tokenAudience) && tokenAudience.includes(audience)) {
    return;
  }

  throw new AuthVerificationError("Bearer token audience is not trusted.");
}

function readStringClaim(payload: Record<string, unknown>, claimName: string) {
  const value = payload[claimName];
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthVerificationError(`Bearer token is missing ${claimName}.`);
  }
  return value;
}

function readIdpClaimsFromHeaders(request: FastifyRequest) {
  return readTrustedIdpClaimsFromHeaders(request);
}

export function mapIdpClaimsToUserContext(claims: IdpClaimMappingInput) {
  return AuthenticatedUserContextSchema.parse({
    email: claims.email,
    organizationId: claims.organizationId,
    provider: claims.provider,
    role: claims.role,
    source: "idp",
    userId: claims.subject,
  });
}

export function canAccessOrganization(
  userContext: AuthenticatedUserContext,
  organizationId: string,
) {
  return userContext.role === "system" || userContext.organizationId === organizationId;
}

export function canWriteWithRole(role: AuthRole) {
  return role === "admin" || role === "editor" || role === "owner" || role === "system";
}

export function canManageOperations(role: AuthRole) {
  return role === "admin" || role === "owner" || role === "system";
}

function readTrustedIdpClaimsFromHeaders(request: FastifyRequest) {
  const provider = readHeader(request, "x-searchops-idp-provider");
  const subject = readHeader(request, "x-searchops-idp-subject");
  const organizationId = readHeader(request, "x-searchops-idp-organization-id");
  const role = readHeader(request, "x-searchops-idp-role");
  const email = readHeader(request, "x-searchops-idp-email");

  if (
    provider === undefined &&
    subject === undefined &&
    organizationId === undefined &&
    role === undefined &&
    email === undefined
  ) {
    return null;
  }

  return IdpClaimMappingInputSchema.parse({
    email: email ?? null,
    organizationId,
    provider,
    role,
    subject,
  });
}
