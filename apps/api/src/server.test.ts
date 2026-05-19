import { describe, expect, it } from "vitest";

import type { Organization } from "@searchops/types";

import { createMemoryRepository } from "./repository.js";
import { buildApiServer } from "./server.js";

const createdAt = "2026-05-19T00:00:00.000Z";
const seededOrganization: Organization = {
  id: "org_seed",
  name: "Seed Organization",
  createdAt
};

function buildTestServer() {
  return buildApiServer({
    repository: createMemoryRepository({ organizations: [seededOrganization] })
  });
}

describe("api foundation", () => {
  it("serves a health check", async () => {
    const server = buildTestServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "api" });
  });

  it("provides mock auth context without real login", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "GET",
      url: "/auth/context",
      headers: {
        "x-mock-user-id": "user_test",
        "x-mock-organization-id": "org_seed"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: "user_test",
      organizationId: "org_seed",
      source: "mock"
    });
  });

  it("creates and lists organizations", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      payload: { name: "New Organization" }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ name: "New Organization" });

    const listResponse = await server.inject({ method: "GET", url: "/organizations" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().organizations).toHaveLength(2);
  });

  it("creates, reads, updates, lists, and deletes sites", async () => {
    const server = buildTestServer();
    const createResponse = await server.inject({
      method: "POST",
      url: "/organizations/org_seed/sites",
      payload: {
        domain: "ExampleClinic.COM",
        name: "Example Clinic",
        industry: "medical"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({
      organizationId: "org_seed",
      domain: "exampleclinic.com",
      name: "Example Clinic",
      industry: "medical",
      language: "ko",
      country: "KR"
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/organizations/org_seed/sites"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().sites).toHaveLength(1);

    const readResponse = await server.inject({ method: "GET", url: `/sites/${created.id}` });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().domain).toBe("exampleclinic.com");

    const updateResponse = await server.inject({
      method: "PATCH",
      url: `/sites/${created.id}`,
      payload: { name: "Updated Clinic", language: "en" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ name: "Updated Clinic", language: "en" });

    const deleteResponse = await server.inject({ method: "DELETE", url: `/sites/${created.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const missingResponse = await server.inject({ method: "GET", url: `/sites/${created.id}` });
    expect(missingResponse.statusCode).toBe(404);
  });

  it("returns clear validation errors", async () => {
    const server = buildTestServer();
    const response = await server.inject({
      method: "POST",
      url: "/organizations/org_seed/sites",
      payload: { domain: "not-a-domain" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("domain");
  });
});