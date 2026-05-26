import type { FastifyRequest } from "fastify";

import { phaseOneSeedIds } from "@searchops/db";
import {
  AuthRoleSchema,
  MockUserContextSchema,
  type AuthRole,
  type MockUserContext,
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
    source: "mock"
  });
}

export function canAccessOrganization(
  userContext: MockUserContext,
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
