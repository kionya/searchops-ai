import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifyAsymmetricSignature,
  type JsonWebKey,
} from "node:crypto";
import type { FastifyRequest } from "fastify";

import { phaseOneSeedIds } from "@searchops/db";
import {
  AuthenticatedUserContextSchema,
  AuthRoleSchema,
  IdpClaimMappingInputSchema,
  MockUserContextSchema,
  type AuthenticatedUserContext,
  type AuthPrincipalType,
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

export interface CreateJwksIdpTokenVerifierOptions {
  readonly audience?: string | undefined;
  readonly currentTime?: () => Date;
  readonly issuer?: string | undefined;
  readonly jwks: readonly Record<string, unknown>[];
  readonly organizationIdClaim?: string;
  readonly provider?: string;
  readonly roleClaim?: string;
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

      return mapJwtPayloadToIdpClaims({ organizationIdClaim, payload, provider, roleClaim });
    },
  };
}

export function createJwksIdpTokenVerifier({
  audience,
  currentTime = () => new Date(),
  issuer,
  jwks,
  organizationIdClaim = "organization_id",
  provider = "idp",
  roleClaim = "role",
}: CreateJwksIdpTokenVerifierOptions): IdpTokenVerifier {
  const publicKeys = jwks.map(createJwksPublicKey);

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
      if (!isSupportedJwksAlgorithm(header.alg)) {
        throw new AuthVerificationError(
          "Only RS256 and ES256 IdP tokens are supported by this verifier.",
        );
      }

      verifyJwksSignature({
        algorithm: header.alg,
        encodedHeader,
        encodedPayload,
        keyId: typeof header.kid === "string" ? header.kid : undefined,
        publicKeys,
        signature,
      });

      const payload = parseJwtSegment(encodedPayload);
      validateJwtTemporalClaims(payload, currentTime());
      validateJwtIssuerAndAudience({ audience, issuer, payload });

      return mapJwtPayloadToIdpClaims({ organizationIdClaim, payload, provider, roleClaim });
    },
  };
}

export function parseJwksJson(value: string): readonly Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AuthVerificationError("SEARCHOPS_IDP_JWKS_JSON must be valid JSON.");
  }

  if (Array.isArray(parsed)) {
    return parsed.map(parseJwksKey);
  }

  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { keys?: unknown }).keys)) {
    return (parsed as { keys: unknown[] }).keys.map(parseJwksKey);
  }

  throw new AuthVerificationError("SEARCHOPS_IDP_JWKS_JSON must be a JWKS object with keys.");
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

function parseJwksKey(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AuthVerificationError("JWKS keys must be JSON objects.");
  }

  return value as Record<string, unknown>;
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

function verifyJwksSignature({
  algorithm,
  encodedHeader,
  encodedPayload,
  keyId,
  publicKeys,
  signature,
}: {
  readonly algorithm: JwksAlgorithm;
  readonly encodedHeader: string;
  readonly encodedPayload: string;
  readonly keyId: string | undefined;
  readonly publicKeys: readonly JwksPublicKey[];
  readonly signature: string;
}) {
  const spec = jwksAlgorithms[algorithm];
  const byKeyId =
    keyId === undefined ? publicKeys : publicKeys.filter((publicKey) => publicKey.keyId === keyId);
  // alg 와 키 종류가 어긋나는 후보는 버린다. 이게 없으면 alg 를 바꿔 다른 종류의 키로
  // 검증되게 유도하는 알고리즘 혼동 공격의 여지가 남는다.
  const candidates = byKeyId.filter((publicKey) => publicKey.keyType === spec.kty);

  if (candidates.length === 0) {
    throw new AuthVerificationError("Bearer token key id is not trusted.");
  }

  const signedInput = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const verified = candidates.some((candidate) =>
    verifyAsymmetricSignature(
      spec.digest,
      signedInput,
      spec.dsaEncoding === undefined
        ? candidate.publicKey
        : { dsaEncoding: spec.dsaEncoding, key: candidate.publicKey },
      signatureBuffer,
    ),
  );

  if (!verified) {
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

// 지원하는 서명 알고리즘. **허용목록이다** — 여기 없는 alg 는 전부 거부한다.
// 특히 "none" 을 명시적으로 막는 효과가 있다.
//
// 키 종류(kty)를 같이 묶는 이유: 토큰의 alg 만 보고 검증기를 고르면, 공격자가
// alg 를 바꿔 다른 종류의 키로 검증되게 유도하는 알고리즘 혼동(algorithm confusion)이
// 가능해진다. alg 와 JWKS 키의 kty 가 맞지 않으면 후보에서 제외한다.
const jwksAlgorithms = {
  // ECDSA. JWT 의 ES256 서명은 raw R‖S(IEEE P1363)인데 Node 의 기본은 DER 이라
  // dsaEncoding 을 지정하지 않으면 정상 토큰도 전부 검증 실패한다.
  ES256: { digest: "SHA256", dsaEncoding: "ieee-p1363", kty: "EC" },
  RS256: { digest: "RSA-SHA256", dsaEncoding: undefined, kty: "RSA" },
} as const satisfies Record<
  string,
  { readonly digest: string; readonly dsaEncoding: "ieee-p1363" | undefined; readonly kty: string }
>;

type JwksAlgorithm = keyof typeof jwksAlgorithms;

function isSupportedJwksAlgorithm(value: unknown): value is JwksAlgorithm {
  return typeof value === "string" && Object.hasOwn(jwksAlgorithms, value);
}

interface JwksPublicKey {
  readonly keyId: string | undefined;
  readonly keyType: string;
  readonly publicKey: ReturnType<typeof createPublicKey>;
}

function createJwksPublicKey(jwk: Record<string, unknown>): JwksPublicKey {
  // Supabase 는 프로젝트에 따라 RSA(RS256) 또는 EC(ES256) 키를 발급한다.
  // 예전에는 RSA 만 받았는데, ES256 을 쓰는 프로젝트에서는 설정이 맞아도
  // 모든 토큰이 거부돼 인증 경로 전체가 죽는다.
  const keyType = jwk.kty;
  if (keyType !== "RSA" && keyType !== "EC") {
    throw new AuthVerificationError("JWKS key must be an RSA or EC key.");
  }

  try {
    return {
      keyId: typeof jwk.kid === "string" ? jwk.kid : undefined,
      keyType,
      publicKey: createPublicKey({ format: "jwk", key: jwk as JsonWebKey }),
    };
  } catch {
    throw new AuthVerificationError(`JWKS ${keyType} key could not be imported.`);
  }
}

function mapJwtPayloadToIdpClaims({
  organizationIdClaim,
  payload,
  provider,
  roleClaim,
}: {
  readonly organizationIdClaim: string;
  readonly payload: Record<string, unknown>;
  readonly provider: string;
  readonly roleClaim: string;
}) {
  const role = resolveJwtAuthRole(payload, roleClaim);
  const principalType = resolveJwtPrincipalType(payload);

  return IdpClaimMappingInputSchema.parse({
    email: typeof payload.email === "string" ? payload.email : null,
    organizationId: readStringClaim(payload, organizationIdClaim),
    principalType,
    provider:
      typeof payload.provider === "string" && payload.provider.length > 0
        ? payload.provider
        : provider,
    role,
    subject: readStringClaim(payload, "sub"),
  });
}

function resolveJwtPrincipalType(payload: Record<string, unknown>): AuthPrincipalType {
  if (!Object.prototype.hasOwnProperty.call(payload, "token_use")) {
    return "user";
  }

  if (payload.token_use === "user" || payload.token_use === "service") {
    return payload.token_use;
  }

  throw new AuthVerificationError("Bearer token has unsupported token_use.");
}

function resolveJwtAuthRole(payload: Record<string, unknown>, roleClaim: string): AuthRole {
  const configuredRoleValue = readStringClaim(payload, roleClaim);
  const configuredRole = AuthRoleSchema.safeParse(configuredRoleValue);

  if (roleClaim === "user_role") {
    if (configuredRole.success) {
      return configuredRole.data;
    }
    throw new AuthVerificationError("Bearer token has invalid user_role.");
  }

  const hasUserRole = Object.prototype.hasOwnProperty.call(payload, "user_role");
  const userRole = AuthRoleSchema.safeParse(payload.user_role);

  if (configuredRole.success) {
    if (hasUserRole && userRole.success && userRole.data !== configuredRole.data) {
      throw new AuthVerificationError("Bearer token contains conflicting role claims.");
    }
    return configuredRole.data;
  }

  if (configuredRoleValue === "authenticated") {
    if (userRole.success) {
      return userRole.data;
    }
    throw new AuthVerificationError("Bearer token is missing a valid user_role.");
  }

  throw new AuthVerificationError(`Bearer token has invalid ${roleClaim}.`);
}

function readIdpClaimsFromHeaders(request: FastifyRequest) {
  return readTrustedIdpClaimsFromHeaders(request);
}

export function mapIdpClaimsToUserContext(claims: IdpClaimMappingInput) {
  return AuthenticatedUserContextSchema.parse({
    email: claims.email,
    organizationId: claims.organizationId,
    principalType: claims.principalType,
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

export function canManageProviderCredentials(context: {
  readonly principalType: AuthPrincipalType;
  readonly role: AuthRole;
}) {
  return context.principalType === "user" && canManageOperations(context.role);
}

function readTrustedIdpClaimsFromHeaders(request: FastifyRequest) {
  const provider = readHeader(request, "x-searchops-idp-provider");
  const subject = readHeader(request, "x-searchops-idp-subject");
  const organizationId = readHeader(request, "x-searchops-idp-organization-id");
  const role = readHeader(request, "x-searchops-idp-role");
  const principalType = readHeader(request, "x-searchops-idp-principal-type");
  const email = readHeader(request, "x-searchops-idp-email");

  if (
    provider === undefined &&
    subject === undefined &&
    organizationId === undefined &&
    role === undefined &&
    principalType === undefined &&
    email === undefined
  ) {
    return null;
  }

  return IdpClaimMappingInputSchema.parse({
    email: email ?? null,
    organizationId,
    principalType,
    provider,
    role,
    subject,
  });
}
