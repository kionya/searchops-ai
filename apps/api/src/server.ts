import Fastify from "fastify";
import { ZodError, z } from "zod";
import { createContentBriefDraft, evaluateAeoReadiness } from "@searchops/aeo-core";
import { evaluateGeoVisibility } from "@searchops/geo-core";
import { extractJsonLdTypes, hasSchemaType, recommendJsonLdForSnapshots } from "@searchops/schema-core";
import {
  createWorkOrderFromGeoVisibilityReport,
  createWorkOrderFromSchemaRecommendation
} from "@searchops/workorders";

import {
  AeoReadinessReportListResponseSchema,
  ContentBriefDetailResponseSchema,
  ContentBriefListResponseSchema,
  CreateAeoReadinessReportRequestSchema,
  CreateAeoReadinessReportResponseSchema,
  CreateConnectorSyncRunRequestSchema,
  CreateConnectorSyncRunResponseSchema,
  CreateContentBriefDraftRequestSchema,
  CreateContentBriefDraftResponseSchema,
  ConnectorSyncRunDetailResponseSchema,
  ConnectorSyncRunListResponseSchema,
  CreateCrawlRunRequestSchema,
  CreateCrawlRunResponseSchema,
  CreateGeoVisibilityReportRequestSchema,
  CreateGeoVisibilityReportResponseSchema,
  CreateGeoVisibilityReportWorkOrderResponseSchema,
  CreateOrganizationRequestSchema,
  CreateSchemaRecommendationWorkOrderResponseSchema,
  CreateSchemaRecommendationsRequestSchema,
  CreateSchemaRecommendationsResponseSchema,
  CreateSiteRequestSchema,
  HealthResponseSchema,
  GeoVisibilityReportListResponseSchema,
  OrganizationListResponseSchema,
  RecheckSchemaRecommendationRequestSchema,
  RecheckSchemaRecommendationResponseSchema,
  RecheckWorkOrderRequestSchema,
  RecheckWorkOrderResponseSchema,
  ResolveWorkOrderIssueResponseSchema,
  SchemaRecommendationDetailResponseSchema,
  SchemaRecommendationListResponseSchema,
  SiteListResponseSchema,
  SiteSchema,
  UpdateSiteRequestSchema,
  UpdateWorkOrderRequestSchema,
  WorkOrderListResponseSchema,
  WorkOrderSchema,
  type KeywordTarget
} from "@searchops/types";
import { isUrlAllowedForCrawl } from "@searchops/crawler-core";

import { resolveMockUserContext } from "./auth.js";
import {
  type ConnectorSyncQueue,
  type CrawlRunQueue,
  createMemoryConnectorSyncQueue,
  createMemoryCrawlRunQueue
} from "./queue.js";
import { type SearchOpsRepository, createMemoryRepository } from "./repository.js";

const IdParamsSchema = z.object({ id: z.string().min(1) });
const OrganizationParamsSchema = z.object({ organizationId: z.string().min(1) });

export interface BuildApiServerOptions {
  readonly repository?: SearchOpsRepository;
  readonly crawlRunQueue?: CrawlRunQueue;
  readonly connectorSyncQueue?: ConnectorSyncQueue;
}

function notFound(message: string) {
  return { error: "not_found", message };
}

export function buildApiServer(options: BuildApiServerOptions = {}) {
  const repository = options.repository ?? createMemoryRepository();
  const crawlRunQueue = options.crawlRunQueue ?? createMemoryCrawlRunQueue();
  const connectorSyncQueue = options.connectorSyncQueue ?? createMemoryConnectorSyncQueue();
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

  server.get("/sites/:id/work-orders", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const workOrders = await repository.listWorkOrders(id);
    if (!workOrders) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(WorkOrderListResponseSchema.parse({ workOrders }));
  });

  server.get("/sites/:id/content-briefs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const contentBriefs = await repository.listContentBriefs(id);
    if (!contentBriefs) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(ContentBriefListResponseSchema.parse({ contentBriefs }));
  });

  server.get("/sites/:id/aeo-readiness-reports", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const reports = await repository.listAeoReadinessReports(id);
    if (!reports) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(AeoReadinessReportListResponseSchema.parse({ reports }));
  });

  server.get("/sites/:id/geo-visibility-reports", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const reports = await repository.listGeoVisibilityReports(id);
    if (!reports) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(GeoVisibilityReportListResponseSchema.parse({ reports }));
  });

  server.get("/sites/:id/schema-recommendations", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const recommendations = await repository.listSchemaRecommendations(id);
    if (!recommendations) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(SchemaRecommendationListResponseSchema.parse({ recommendations }));
  });

  server.post("/sites/:id/schema-recommendations", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateSchemaRecommendationsRequestSchema.parse(request.body ?? {});
    if (input.snapshots.some((snapshot) => !isUrlAllowedForCrawl(snapshot.url, site.domain))) {
      reply.status(400).send({
        error: "validation_error",
        message: "schema recommendation snapshot URLs must be within the site domain or its subdomains"
      });
      return;
    }

    const recommendationSets = recommendJsonLdForSnapshots({
      ...(input.organizationName === undefined ? {} : { organizationName: input.organizationName }),
      site,
      snapshots: input.snapshots
    });
    const recommendations = await repository.createSchemaRecommendations(id, {
      recommendationSets
    });
    if (!recommendations) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply
      .status(201)
      .send(
        CreateSchemaRecommendationsResponseSchema.parse({
          recommendationSets,
          recommendations
        }),
      );
  });

  server.post("/sites/:id/aeo-readiness-reports", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateAeoReadinessReportRequestSchema.parse(request.body ?? {});
    const candidatePage = input.candidatePage ?? null;
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
    const keyword: KeywordTarget = {
      siteId: site.id,
      phrase: input.keyword.phrase,
      locale: input.keyword.locale ?? `${site.language}-${site.country}`,
      language: input.keyword.language ?? site.language,
      country: input.keyword.country ?? site.country,
      intent: input.keyword.intent ?? null,
      source: input.keyword.source ?? "manual"
    };

    let readinessReport;
    try {
      readinessReport = evaluateAeoReadiness(
        {
          candidatePage,
          keyword
        },
        { evaluatedAt },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid AEO readiness input";
      reply.status(400).send({ error: "validation_error", message });
      return;
    }

    const report = await repository.createAeoReadinessReport(id, {
      keywordId: input.keywordId ?? null,
      readinessReport
    });
    if (!report) {
      reply.status(404).send(notFound("Site or keyword not found"));
      return;
    }

    reply
      .status(201)
      .send(CreateAeoReadinessReportResponseSchema.parse({ report, readinessReport }));
  });

  server.post("/sites/:id/geo-visibility-reports", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateGeoVisibilityReportRequestSchema.parse(request.body ?? {});
    if (input.target.siteId !== site.id) {
      reply.status(400).send({
        error: "validation_error",
        message: "GEO target siteId must match the route site"
      });
      return;
    }

    if (!isDomainAllowedForSite(input.target.domain, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "GEO target domain must be the site domain or one of its subdomains"
      });
      return;
    }

    let visibilityReport;
    try {
      visibilityReport = evaluateGeoVisibility(input, {
        evaluatedAt: input.evaluatedAt ?? new Date().toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid GEO visibility input";
      reply.status(400).send({ error: "validation_error", message });
      return;
    }

    const report = await repository.createGeoVisibilityReport(id, { visibilityReport });
    if (!report) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply
      .status(201)
      .send(CreateGeoVisibilityReportResponseSchema.parse({ report, visibilityReport }));
  });

  server.post("/sites/:id/content-briefs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateContentBriefDraftRequestSchema.parse(request.body ?? {});
    const candidatePage = input.candidatePage ?? null;
    const evaluatedAt =
      input.evaluatedAt ??
      input.readinessReport?.evaluatedAt ??
      input.faqGapSet?.evaluatedAt ??
      new Date().toISOString();
    const keyword: KeywordTarget = {
      siteId: site.id,
      phrase: input.keyword.phrase,
      locale: input.keyword.locale ?? `${site.language}-${site.country}`,
      language: input.keyword.language ?? site.language,
      country: input.keyword.country ?? site.country,
      intent: input.keyword.intent ?? null,
      source: input.keyword.source ?? "manual"
    };

    let readinessReport;
    let draft;
    try {
      readinessReport =
        input.readinessReport ??
        evaluateAeoReadiness(
          {
            candidatePage,
            keyword
          },
          { evaluatedAt },
        );
      draft = createContentBriefDraft({
        candidatePage,
        evaluatedAt,
        keyword,
        keywordId: input.keywordId ?? null,
        readinessReport,
        ...(input.faqGapSet === undefined ? {} : { faqGapSet: input.faqGapSet })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid content brief input";
      reply.status(400).send({ error: "validation_error", message });
      return;
    }

    const contentBrief = await repository.createContentBriefDraft(id, { draft });
    if (!contentBrief) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply
      .status(201)
      .send(CreateContentBriefDraftResponseSchema.parse({ contentBrief, draft, readinessReport }));
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

  server.post("/sites/:id/connector-sync-runs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateConnectorSyncRunRequestSchema.parse(request.body ?? {});
    const userContext = resolveMockUserContext(request);
    const connectorSyncRun = await repository.createConnectorSyncRun(site.id, {
      providers: input.providers,
      requestedByUserId: userContext.userId
    });
    if (!connectorSyncRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const job = await connectorSyncQueue.enqueueConnectorSync({
      connectorSyncRunId: connectorSyncRun.id,
      organizationId: site.organizationId,
      siteId: site.id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      fetchedAt: new Date().toISOString(),
      providers: input.providers
    });

    reply
      .status(202)
      .send(CreateConnectorSyncRunResponseSchema.parse({ connectorSyncRun, job }));
  });

  server.get("/sites/:id/connector-sync-runs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const connectorSyncRuns = await repository.listConnectorSyncRuns(id);
    if (!connectorSyncRuns) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(ConnectorSyncRunListResponseSchema.parse({ connectorSyncRuns }));
  });

  server.get("/connector-sync-runs/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const result = await repository.getConnectorSyncRun(id);
    if (!result) {
      reply.status(404).send(notFound("Connector sync run not found"));
      return;
    }

    reply.send(ConnectorSyncRunDetailResponseSchema.parse(result));
  });

  server.post("/geo-visibility-reports/:id/work-order", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const report = await repository.getGeoVisibilityReport(id);
    if (!report) {
      reply.status(404).send(notFound("GEO visibility report not found"));
      return;
    }

    const draft = createWorkOrderFromGeoVisibilityReport(report);
    const result = await repository.createGeoVisibilityReportWorkOrder(id, { draft });
    if (!result) {
      reply.status(404).send(notFound("GEO visibility report not found"));
      return;
    }

    reply.status(201).send(CreateGeoVisibilityReportWorkOrderResponseSchema.parse(result));
  });

  server.get("/schema-recommendations/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const recommendation = await repository.getSchemaRecommendation(id);
    if (!recommendation) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    reply.send(SchemaRecommendationDetailResponseSchema.parse({ recommendation }));
  });

  server.post("/schema-recommendations/:id/work-order", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const recommendation = await repository.getSchemaRecommendation(id);
    if (!recommendation) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    if (recommendation.status === "dismissed") {
      reply.status(400).send({
        error: "validation_error",
        message: "Dismissed schema recommendations cannot be converted to work orders"
      });
      return;
    }

    const draft = createWorkOrderFromSchemaRecommendation(recommendation);
    const result = await repository.createSchemaRecommendationWorkOrder(id, { draft });
    if (!result) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    reply.status(201).send(CreateSchemaRecommendationWorkOrderResponseSchema.parse(result));
  });

  server.post("/schema-recommendations/:id/recheck", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const recommendation = await repository.getSchemaRecommendation(id);
    if (!recommendation) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    const site = await repository.getSite(recommendation.siteId);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = RecheckSchemaRecommendationRequestSchema.parse(request.body ?? {});
    const snapshotUrl = input.snapshot.finalUrl ?? input.snapshot.url;
    if (input.snapshot.url !== recommendation.pageUrl && snapshotUrl !== recommendation.pageUrl) {
      reply.status(400).send({
        error: "validation_error",
        message: "schema recheck snapshot URL must match the recommendation pageUrl"
      });
      return;
    }

    if (
      !isUrlAllowedForCrawl(input.snapshot.url, site.domain) ||
      (input.snapshot.finalUrl !== null && !isUrlAllowedForCrawl(input.snapshot.finalUrl, site.domain))
    ) {
      reply.status(400).send({
        error: "validation_error",
        message: "schema recheck snapshot URLs must be within the site domain or its subdomains"
      });
      return;
    }

    const observedTypes = extractJsonLdTypes(input.snapshot);
    const result = await repository.recheckSchemaRecommendation(id, {
      observedTypes,
      resolved: hasSchemaType(input.snapshot, recommendation.type),
      snapshot: input.snapshot
    });
    if (!result) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    reply.send(RecheckSchemaRecommendationResponseSchema.parse(result));
  });

  server.get("/content-briefs/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const contentBrief = await repository.getContentBrief(id);
    if (!contentBrief) {
      reply.status(404).send(notFound("Content brief not found"));
      return;
    }

    reply.send(ContentBriefDetailResponseSchema.parse({ contentBrief }));
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

  server.get("/work-orders/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const workOrder = await repository.getWorkOrder(id);
    if (!workOrder) {
      reply.status(404).send(notFound("Work order not found"));
      return;
    }

    reply.send(WorkOrderSchema.parse(workOrder));
  });

  server.post("/work-orders/:id/recheck", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const workOrder = await repository.getWorkOrder(id);
    if (!workOrder) {
      reply.status(404).send(notFound("Work order not found"));
      return;
    }

    if (workOrder.siteId === null) {
      reply.status(400).send({
        error: "validation_error",
        message: "Work order must be attached to a site before recheck"
      });
      return;
    }

    const site = await repository.getSite(workOrder.siteId);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = RecheckWorkOrderRequestSchema.parse(request.body ?? {});
    const startUrl = input.startUrl ?? workOrder.evidence?.url ?? `https://${site.domain}/`;
    if (!isUrlAllowedForCrawl(startUrl, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "recheck startUrl must be within the site domain or its subdomains"
      });
      return;
    }

    const crawlRun = await repository.createCrawlRun(site.id, {
      maxPages: input.maxPages,
      startUrl
    });
    if (!crawlRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const userContext = resolveMockUserContext(request);
    const job = await crawlRunQueue.enqueueCrawl({
      crawlRunId: crawlRun.id,
      siteId: site.id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      startUrl,
      maxPages: input.maxPages,
      pages: []
    });
    const updatedWorkOrder = await repository.updateWorkOrder(id, { status: "in_review" });
    if (!updatedWorkOrder) {
      reply.status(404).send(notFound("Work order not found"));
      return;
    }

    reply
      .status(202)
      .send(RecheckWorkOrderResponseSchema.parse({ workOrder: updatedWorkOrder, crawlRun, job }));
  });

  server.post("/work-orders/:id/resolve", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const result = await repository.resolveWorkOrderIssue(id);
    if (!result) {
      reply.status(404).send(notFound("Work order not found"));
      return;
    }

    reply.send(ResolveWorkOrderIssueResponseSchema.parse(result));
  });

  server.patch("/work-orders/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const input = UpdateWorkOrderRequestSchema.parse(request.body);
    const workOrder = await repository.updateWorkOrder(id, input);
    if (!workOrder) {
      reply.status(404).send(notFound("Work order not found"));
      return;
    }

    reply.send(WorkOrderSchema.parse(workOrder));
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

function isDomainAllowedForSite(domain: string, siteDomain: string) {
  const normalizedDomain = domain.trim().toLowerCase().replace(/^www\./u, "");
  const normalizedSiteDomain = siteDomain.trim().toLowerCase().replace(/^www\./u, "");

  return (
    normalizedDomain === normalizedSiteDomain ||
    normalizedDomain.endsWith(`.${normalizedSiteDomain}`)
  );
}
