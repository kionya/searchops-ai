import Fastify from "fastify";
import { ZodError, z } from "zod";

import {
  CreateCrawlRunRequestSchema,
  CreateCrawlRunResponseSchema,
  CreateOrganizationRequestSchema,
  CreateSiteRequestSchema,
  HealthResponseSchema,
  OrganizationListResponseSchema,
  SiteListResponseSchema,
  SiteSchema,
  UpdateSiteRequestSchema
} from "@searchops/types";
import { isUrlAllowedForCrawl } from "@searchops/crawler-core";

import { resolveMockUserContext } from "./auth.js";
import { type CrawlRunQueue, createMemoryCrawlRunQueue } from "./queue.js";
import { type SearchOpsRepository, createMemoryRepository } from "./repository.js";

const IdParamsSchema = z.object({ id: z.string().min(1) });
const OrganizationParamsSchema = z.object({ organizationId: z.string().min(1) });

export interface BuildApiServerOptions {
  readonly repository?: SearchOpsRepository;
  readonly crawlRunQueue?: CrawlRunQueue;
}

function notFound(message: string) {
  return { error: "not_found", message };
}

export function buildApiServer(options: BuildApiServerOptions = {}) {
  const repository = options.repository ?? createMemoryRepository();
  const crawlRunQueue = options.crawlRunQueue ?? createMemoryCrawlRunQueue();
  const server = Fastify({ logger: false });

  server.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "validation_error",
        message: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    reply.status(500).send({ error: "internal_error", message });
  });

  server.get("/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "api"
    }),
  );

  server.get("/auth/context", async (request) => resolveMockUserContext(request));

  server.get("/organizations", async () =>
    OrganizationListResponseSchema.parse({ organizations: await repository.listOrganizations() }),
  );

  server.post("/organizations", async (request, reply) => {
    const input = CreateOrganizationRequestSchema.parse(request.body);
    const organization = await repository.createOrganization(input);
    reply.status(201).send(organization);
  });

  server.get("/organizations/:organizationId/sites", async (request, reply) => {
    const { organizationId } = OrganizationParamsSchema.parse(request.params);
    const organization = await repository.getOrganization(organizationId);
    if (!organization) {
      reply.status(404).send(notFound("Organization not found"));
      return;
    }

    reply.send(SiteListResponseSchema.parse({ sites: await repository.listSites(organizationId) }));
  });

  server.post("/organizations/:organizationId/sites", async (request, reply) => {
    const { organizationId } = OrganizationParamsSchema.parse(request.params);
    const input = CreateSiteRequestSchema.parse(request.body);
    const site = await repository.createSite(organizationId, input);
    if (!site) {
      reply.status(404).send(notFound("Organization not found"));
      return;
    }

    reply.status(201).send(SiteSchema.parse(site));
  });

  server.get("/sites/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(SiteSchema.parse(site));
  });

  server.post("/sites/:id/crawl-runs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateCrawlRunRequestSchema.parse(request.body ?? {});
    const startUrl = input.startUrl ?? `https://${site.domain}/`;
    if (!isUrlAllowedForCrawl(startUrl, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "startUrl must be within the site domain or its subdomains"
      });
      return;
    }

    const crawlRun = await repository.createCrawlRun(id, { ...input, startUrl });
    if (!crawlRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const userContext = resolveMockUserContext(request);
    const job = await crawlRunQueue.enqueueCrawl({
      crawlRunId: crawlRun.id,
      siteId: id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      startUrl,
      maxPages: input.maxPages,
      pages: []
    });

    reply.status(202).send(CreateCrawlRunResponseSchema.parse({ crawlRun, job }));
  });

  server.patch("/sites/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const input = UpdateSiteRequestSchema.parse(request.body);
    const site = await repository.updateSite(id, input);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(SiteSchema.parse(site));
  });

  server.delete("/sites/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const deleted = await repository.deleteSite(id);
    if (!deleted) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.status(204).send();
  });

  return server;
}
