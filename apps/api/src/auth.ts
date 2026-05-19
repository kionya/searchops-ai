import type { FastifyRequest } from "fastify";

import { phaseOneSeedIds } from "@searchops/db";
import { MockUserContextSchema } from "@searchops/types";

function readHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveMockUserContext(request: FastifyRequest) {
  return MockUserContextSchema.parse({
    userId: readHeader(request, "x-mock-user-id") ?? phaseOneSeedIds.userId,
    organizationId: readHeader(request, "x-mock-organization-id") ?? phaseOneSeedIds.organizationId,
    source: "mock"
  });
}