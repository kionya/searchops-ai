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
  const idpClaims = readIdpClaimsFromHeaders(request);
  if (idpClaims !== null) {
    return mapIdpClaimsToUserContext(idpClaims);
  }

  return resolveMockUserContext(request);
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

function readIdpClaimsFromHeaders(request: FastifyRequest) {
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
