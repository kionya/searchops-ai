import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError, z } from "zod";
import {
  createContentBriefDraft,
  evaluateAeoReadiness,
  generateAeoFaqGapSet,
} from "@searchops/aeo-core";
import { evaluateCompliance } from "@searchops/compliance";
import {
  CmsWebhookProviderSchema,
  discoverKeywordTargetsFromConnectorResults,
  normalizeCmsWebhookPayload,
} from "@searchops/connectors";
import { evaluateGeoVisibility } from "@searchops/geo-core";
import {
  extractJsonLdTypes,
  hasSchemaType,
  recommendJsonLdForSnapshots,
} from "@searchops/schema-core";
import {
  createWorkOrderFromComplianceFlag,
  createWorkOrderFromGeoVisibilityReport,
  createWorkOrderFromSchemaRecommendation,
} from "@searchops/workorders";

import {
  ApiMetricsResponseSchema,
  AeoReadinessReportListResponseSchema,
  ClosedLoopAuditEventListResponseSchema,
  CmsContentUpdatedEventRequestSchema,
  CmsContentUpdatedEventResponseSchema,
  ComplianceFlagListResponseSchema,
  ComplianceFlagSchema,
  ContentBriefDetailResponseSchema,
  ContentBriefListResponseSchema,
  CreateAeoReadinessReportRequestSchema,
  CreateComplianceFlagWorkOrderResponseSchema,
  CreateComplianceReviewRequestSchema,
  CreateComplianceReviewResponseSchema,
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
  CreateKeywordDiscoveryRequestSchema,
  CreateKeywordDiscoveryResponseSchema,
  CreateOrganizationRequestSchema,
  CreateSchemaRecommendationWorkOrderResponseSchema,
  CreateSchemaRecommendationsRequestSchema,
  CreateSchemaRecommendationsResponseSchema,
  CreateSiteRequestSchema,
  DeadLetterJobListResponseSchema,
  DeleteDeadLetterJobResponseSchema,
  HealthResponseSchema,
  GeoVisibilityReportListResponseSchema,
  KeywordDiscoveryListResponseSchema,
  OrganizationListResponseSchema,
  QueueGeoAnswerMonitorRequestSchema,
  QueueGeoAnswerMonitorResponseSchema,
  QueueSchemaRecommendationRecheckCrawlResponseSchema,
  QueueSchemaRichResultValidationRequestSchema,
  QueueSchemaRichResultValidationResponseSchema,
  RecheckComplianceFlagRequestSchema,
  RecheckComplianceFlagResponseSchema,
  RecheckSchemaRecommendationRequestSchema,
  RecheckSchemaRecommendationResponseSchema,
  RecheckWorkOrderRequestSchema,
  RecheckWorkOrderResponseSchema,
  ResolveWorkOrderIssueResponseSchema,
  SchemaRecommendationDetailResponseSchema,
  SchemaRecommendationListResponseSchema,
  SiteListResponseSchema,
  SiteSchema,
  UpdateComplianceFlagRequestSchema,
  UpdateSiteRequestSchema,
  UpdateWorkOrderRequestSchema,
  WorkOrderListResponseSchema,
  WorkOrderSchema,
  type CmsContentUpdatedEventRequest,
  type ComplianceFlag,
  type KeywordTarget,
  type RecheckComplianceFlagResponse,
  type Site,
} from "@searchops/types";
import { isUrlAllowedForCrawl } from "@searchops/crawler-core";

import {
  canAccessOrganization,
  canManageOperations,
  canWriteWithRole,
  resolveAuthenticatedUserContext,
} from "./auth.js";
import {
  type ConnectorSyncQueue,
  type CrawlRunQueue,
  type GeoAnswerMonitorQueue,
  type SchemaRichResultValidationQueue,
  createMemoryConnectorSyncQueue,
  createMemoryCrawlRunQueue,
  createMemoryGeoAnswerMonitorQueue,
  createMemorySchemaRichResultValidationQueue,
} from "./queue.js";
import {
  type DeadLetterJobStore,
  createMemoryDeadLetterJobStore,
  summarizeDeadLetterJobs,
} from "./dead-letter-store.js";
import {
  createMemoryApiRateLimitStore,
  type ApiRateLimitStore,
} from "./rate-limit.js";
import {
  type CreateClosedLoopAuditEventInput,
  type SearchOpsRepository,
  createMemoryRepository,
} from "./repository.js";
import {
  parseCmsWebhookSecrets,
  verifyCmsWebhookRequest,
  type CmsWebhookSecretMap,
} from "./webhook-security.js";
import {
  createNoopOperationalAlertRouter,
  createNoopOperationalLogDrain,
  createOperationalMetricsExport,
  type OperationalAlertRouter,
  type OperationalLogDrain,
} from "./observability.js";

const IdParamsSchema = z.object({ id: z.string().min(1) });
const OrganizationParamsSchema = z.object({ organizationId: z.string().min(1) });
const CmsWebhookParamsSchema = z.object({
  cmsType: CmsWebhookProviderSchema,
  id: z.string().min(1),
});

export interface BuildApiServerOptions {
  readonly repository?: SearchOpsRepository;
  readonly crawlRunQueue?: CrawlRunQueue;
  readonly connectorSyncQueue?: ConnectorSyncQueue;
  readonly geoAnswerMonitorQueue?: GeoAnswerMonitorQueue;
  readonly schemaRichResultValidationQueue?: SchemaRichResultValidationQueue;
  readonly deadLetterJobStore?: DeadLetterJobStore;
  readonly cmsWebhookSecrets?: CmsWebhookSecretMap;
  readonly currentTime?: () => Date;
  readonly rateLimit?: ApiRateLimitOptions;
  readonly rateLimitStore?: ApiRateLimitStore;
  readonly requireCmsWebhookSignature?: boolean;
  readonly operationalAlertRouter?: OperationalAlertRouter;
  readonly operationalLogDrain?: OperationalLogDrain;
}

export interface ApiRateLimitOptions {
  readonly enabled: boolean;
  readonly maxRequests: number;
  readonly windowMs: number;
}

function notFound(message: string) {
  return { error: "not_found", message };
}

function forbidden(message: string) {
  return { error: "forbidden", message };
}

function getRateLimitKey(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedIp = firstForwardedFor?.split(",")[0]?.trim();

  return forwardedIp && forwardedIp.length > 0 ? forwardedIp : request.ip;
}

function isActiveComplianceFlag(flag: ComplianceFlag) {
  return flag.status !== "dismissed" && flag.status !== "resolved";
}

function doesCmsEventMatchComplianceFlag(
  flag: ComplianceFlag,
  event: CmsContentUpdatedEventRequest,
) {
  return flag.subjectId === event.externalId || flag.url === event.url;
}

function mapCmsContentStatusToPublishState(status: CmsContentUpdatedEventRequest["status"]) {
  return status === "published" ? "published" : "draft";
}

export function buildApiServer(options: BuildApiServerOptions = {}) {
  const repository = options.repository ?? createMemoryRepository();
  const crawlRunQueue = options.crawlRunQueue ?? createMemoryCrawlRunQueue();
  const connectorSyncQueue = options.connectorSyncQueue ?? createMemoryConnectorSyncQueue();
  const geoAnswerMonitorQueue =
    options.geoAnswerMonitorQueue ?? createMemoryGeoAnswerMonitorQueue();
  const schemaRichResultValidationQueue =
    options.schemaRichResultValidationQueue ?? createMemorySchemaRichResultValidationQueue();
  const deadLetterJobStore = options.deadLetterJobStore ?? createMemoryDeadLetterJobStore();
  const cmsWebhookSecrets =
    options.cmsWebhookSecrets ?? parseCmsWebhookSecrets(process.env.SEARCHOPS_CMS_WEBHOOK_SECRETS);
  const requireCmsWebhookSignature =
    options.requireCmsWebhookSignature ??
    (Object.keys(cmsWebhookSecrets).length > 0 || process.env.NODE_ENV === "production");
  const currentTime = options.currentTime ?? (() => new Date());
  const rateLimit = options.rateLimit ?? {
    enabled: false,
    maxRequests: 120,
    windowMs: 60_000,
  };
  const rateLimitStore = options.rateLimitStore ?? createMemoryApiRateLimitStore();
  const operationalAlertRouter =
    options.operationalAlertRouter ?? createNoopOperationalAlertRouter();
  const operationalLogDrain = options.operationalLogDrain ?? createNoopOperationalLogDrain();
  const metricsStartedAtMs = currentTime().getTime();
  const requestMetrics = {
    byStatus: new Map<number, number>(),
    total: 0,
  };
  const server = Fastify({ logger: false });

  function getRequestMetricsSnapshot() {
    return {
      total: requestMetrics.total,
      byStatus: Object.fromEntries(
        [...requestMetrics.byStatus.entries()].map(([status, count]) => [String(status), count]),
      ),
    };
  }

  function isWriteRequest(request: FastifyRequest) {
    return request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS";
  }

  function sendForbidden(reply: FastifyReply, message: string) {
    reply.status(403).send(forbidden(message));
  }

  function ensureOrganizationAccess({
    organizationId,
    reply,
    request,
  }: {
    readonly organizationId: string;
    readonly reply: FastifyReply;
    readonly request: FastifyRequest;
  }) {
    const userContext = resolveAuthenticatedUserContext(request);
    if (!canAccessOrganization(userContext, organizationId)) {
      sendForbidden(reply, "User cannot access this organization");
      return false;
    }

    if (isWriteRequest(request) && !canWriteWithRole(userContext.role)) {
      sendForbidden(reply, "User role cannot modify this resource");
      return false;
    }

    return true;
  }

  async function ensureSiteAccess({
    reply,
    request,
    siteId,
  }: {
    readonly reply: FastifyReply;
    readonly request: FastifyRequest;
    readonly siteId: string;
  }) {
    const site = await repository.getSite(siteId);
    if (!site) {
      return true;
    }

    return ensureOrganizationAccess({
      organizationId: site.organizationId,
      reply,
      request,
    });
  }

  async function ensureSiteScopedResourceAccess({
    getSiteId,
    reply,
    request,
  }: {
    readonly getSiteId: () => Promise<string | null>;
    readonly reply: FastifyReply;
    readonly request: FastifyRequest;
  }) {
    const siteId = await getSiteId();
    if (siteId === null) {
      return true;
    }

    return ensureSiteAccess({ reply, request, siteId });
  }

  async function authorizeTenantAccess(request: FastifyRequest, reply: FastifyReply) {
    const routeUrl = request.routeOptions.url ?? "";

    if (
      routeUrl === "/health" ||
      routeUrl === "/metrics" ||
      routeUrl === "/auth/context" ||
      routeUrl === "/sites/:id/cms/content-updated-events" ||
      routeUrl === "/sites/:id/cms/webhooks/:cmsType"
    ) {
      return true;
    }

    if (routeUrl.startsWith("/ops/")) {
      const userContext = resolveAuthenticatedUserContext(request);
      if (!canManageOperations(userContext.role)) {
        sendForbidden(reply, "User role cannot manage operations");
        return false;
      }
      return true;
    }

    if (routeUrl === "/organizations/:organizationId/sites") {
      const { organizationId } = OrganizationParamsSchema.parse(request.params);
      return ensureOrganizationAccess({ organizationId, reply, request });
    }

    if (routeUrl.startsWith("/sites/:id")) {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteAccess({ reply, request, siteId: id });
    }

    if (routeUrl === "/connector-sync-runs/:id") {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteScopedResourceAccess({
        getSiteId: async () => (await repository.getConnectorSyncRun(id))?.connectorSyncRun.siteId ?? null,
        reply,
        request,
      });
    }

    if (routeUrl === "/geo-visibility-reports/:id/work-order") {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteScopedResourceAccess({
        getSiteId: async () => (await repository.getGeoVisibilityReport(id))?.siteId ?? null,
        reply,
        request,
      });
    }

    if (routeUrl.startsWith("/compliance-flags/:id")) {
      const { id } = IdParamsSchema.parse(request.params);
      const complianceFlag = await repository.getComplianceFlag(id);
      if (!complianceFlag) {
        return true;
      }

      if (complianceFlag.siteId !== null) {
        return ensureSiteAccess({ reply, request, siteId: complianceFlag.siteId });
      }

      return ensureOrganizationAccess({
        organizationId: complianceFlag.organizationId,
        reply,
        request,
      });
    }

    if (routeUrl.startsWith("/schema-recommendations/:id")) {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteScopedResourceAccess({
        getSiteId: async () => (await repository.getSchemaRecommendation(id))?.siteId ?? null,
        reply,
        request,
      });
    }

    if (routeUrl === "/content-briefs/:id") {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteScopedResourceAccess({
        getSiteId: async () => (await repository.getContentBrief(id))?.siteId ?? null,
        reply,
        request,
      });
    }

    if (routeUrl.startsWith("/work-orders/:id")) {
      const { id } = IdParamsSchema.parse(request.params);
      return ensureSiteScopedResourceAccess({
        getSiteId: async () => (await repository.getWorkOrder(id))?.siteId ?? null,
        reply,
        request,
      });
    }

    return true;
  }

  server.addHook("onRequest", async (request, reply) => {
    if (!rateLimit.enabled) {
      return;
    }

    const decision = await rateLimitStore.consume({
      key: getRateLimitKey(request),
      maxRequests: rateLimit.maxRequests,
      nowMs: currentTime().getTime(),
      windowMs: rateLimit.windowMs,
    });
    if (decision.limited) {
      return reply.status(429).send({
        error: "rate_limited",
        message: "Too many requests.",
      });
    }
  });

  server.addHook("onResponse", async (_request, reply) => {
    requestMetrics.total += 1;
    requestMetrics.byStatus.set(
      reply.statusCode,
      (requestMetrics.byStatus.get(reply.statusCode) ?? 0) + 1,
    );
  });

  server.addHook("preHandler", async (request, reply) => {
    const authorized = await authorizeTenantAccess(request, reply);
    if (!authorized) {
      return reply;
    }
  });

  async function sendCmsContentUpdatedEventResponse({
    event,
    now,
    reply,
    request,
    routeSiteId,
    site: preloadedSite,
  }: {
    readonly event: CmsContentUpdatedEventRequest;
    readonly now: Date;
    readonly reply: FastifyReply;
    readonly request: FastifyRequest;
    readonly routeSiteId: string;
    readonly site?: Site;
  }) {
    const webhookVerification = verifyCmsWebhookRequest({
      event,
      headers: request.headers,
      now,
      required: requireCmsWebhookSignature,
      secrets: cmsWebhookSecrets,
    });
    if (!webhookVerification.ok) {
      reply.status(401).send({
        error: "unauthorized",
        message: webhookVerification.message ?? "CMS webhook signature verification failed.",
      });
      return;
    }

    const site = preloadedSite ?? (await repository.getSite(routeSiteId));
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    if (event.siteId !== site.id) {
      reply.status(400).send({
        error: "validation_error",
        message: "CMS content updated event siteId must match the route site",
      });
      return;
    }

    if (!isUrlAllowedForCrawl(event.url, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "CMS content updated event URL must be within the site domain or its subdomains",
      });
      return;
    }

    await recordClosedLoopAuditEvent({
      cmsType: event.cmsType,
      eventType: "cms_content_updated",
      externalId: event.externalId,
      message: `CMS content update received for ${event.url}.`,
      metadata: {
        status: event.status,
        updatedAt: event.updatedAt,
        url: event.url,
      },
      organizationId: site.organizationId,
      siteId: site.id,
      source: "cms_webhook",
      status: "received",
      subjectId: event.externalId,
      subjectType: "page_copy",
    });

    const complianceFlags = await repository.listComplianceFlags(site.id);
    if (!complianceFlags) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const activeMatchingFlags = complianceFlags.filter(
      (flag) => isActiveComplianceFlag(flag) && doesCmsEventMatchComplianceFlag(flag, event),
    );
    const rechecks: RecheckComplianceFlagResponse[] = [];
    let skippedFlagCount = 0;

    if (activeMatchingFlags.length === 0) {
      await recordClosedLoopAuditEvent({
        cmsType: event.cmsType,
        eventType: "compliance_recheck",
        externalId: event.externalId,
        message: `No active compliance flags matched CMS content ${event.externalId}.`,
        metadata: {
          matchedFlagCount: 0,
          url: event.url,
        },
        organizationId: site.organizationId,
        siteId: site.id,
        source: "cms_webhook",
        status: "skipped",
        subjectId: event.externalId,
        subjectType: "page_copy",
      });
    }

    for (const complianceFlag of activeMatchingFlags) {
      if (complianceFlag.ruleId === undefined || complianceFlag.siteId === null) {
        skippedFlagCount += 1;
        continue;
      }

      const report = evaluateCompliance(
        {
          industry: event.industry === undefined ? site.industry : event.industry,
          locale: event.locale ?? `${site.language}-${site.country}`,
          publishState: mapCmsContentStatusToPublishState(event.status),
          siteId: site.id,
          source: event.source,
          subjectId: event.externalId,
          subjectType: "page_copy",
          text: event.text,
          title: event.title,
          url: event.url,
        },
        { evaluatedAt: event.updatedAt },
      );
      const matchingFlag =
        report.flags.find((flag) => flag.ruleId === complianceFlag.ruleId) ?? null;
      const result = await repository.recheckComplianceFlag(complianceFlag.id, {
        matchingFlag,
        report,
        resolved: matchingFlag === null,
      });

      if (result === null) {
        skippedFlagCount += 1;
        continue;
      }

      await recordClosedLoopAuditEvent({
        cmsType: event.cmsType,
        complianceFlagId: result.complianceFlag.id,
        eventType: "compliance_recheck",
        externalId: event.externalId,
        message: `Compliance flag ${result.complianceFlag.id} rechecked after CMS update.`,
        metadata: {
          reportStatus: report.status,
          resolved: result.resolved,
          ruleId: complianceFlag.ruleId,
          workOrderStatus: result.workOrder?.status ?? null,
        },
        organizationId: site.organizationId,
        siteId: site.id,
        source: "cms_webhook",
        status: result.resolved ? "resolved" : "open",
        subjectId: event.externalId,
        subjectType: "page_copy",
        workOrderId: result.workOrder?.id ?? complianceFlag.workOrderId ?? null,
      });

      if (result.resolved) {
        await recordClosedLoopAuditEvent({
          cmsType: event.cmsType,
          complianceFlagId: result.complianceFlag.id,
          eventType: "compliance_flag_resolved",
          externalId: event.externalId,
          message: `Compliance flag ${result.complianceFlag.id} resolved after CMS update.`,
          metadata: {
            ruleId: complianceFlag.ruleId,
            url: event.url,
          },
          organizationId: site.organizationId,
          siteId: site.id,
          source: "cms_webhook",
          status: "resolved",
          subjectId: event.externalId,
          subjectType: "page_copy",
          workOrderId: result.workOrder?.id ?? complianceFlag.workOrderId ?? null,
        });
      }

      if (result.workOrder?.status === "done") {
        await recordClosedLoopAuditEvent({
          cmsType: event.cmsType,
          complianceFlagId: result.complianceFlag.id,
          eventType: "work_order_done",
          externalId: event.externalId,
          message: `Work order ${result.workOrder.id} completed after CMS recheck.`,
          metadata: {
            complianceFlagId: result.complianceFlag.id,
            ruleId: complianceFlag.ruleId,
          },
          organizationId: site.organizationId,
          siteId: site.id,
          source: "cms_webhook",
          status: "done",
          subjectId: event.externalId,
          subjectType: "page_copy",
          workOrderId: result.workOrder.id,
        });
      }

      rechecks.push(result);
    }

    reply.send(
      CmsContentUpdatedEventResponseSchema.parse({
        event,
        matchedFlagCount: activeMatchingFlags.length,
        rechecks,
        skippedFlagCount,
      }),
    );
  }

  async function recordClosedLoopAuditEvent(input: CreateClosedLoopAuditEventInput) {
    await repository.createClosedLoopAuditEvent(input);
  }

  server.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "validation_error",
        message: error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    reply.status(500).send({ error: "internal_error", message });
  });

  server.get("/health", async () =>
    HealthResponseSchema.parse({
      ok: true,
      service: "api",
    }),
  );

  server.get("/metrics", async () =>
    ApiMetricsResponseSchema.parse({
      service: "api",
      uptimeSeconds: Math.max(0, (currentTime().getTime() - metricsStartedAtMs) / 1000),
      requests: getRequestMetricsSnapshot(),
    }),
  );

  server.get("/ops/metrics-export", async () => {
    const deadLetterJobs = await deadLetterJobStore.listDeadLetterJobs({ limit: 100 });
    const exportPayload = createOperationalMetricsExport({
      generatedAt: currentTime(),
      metricsStartedAtMs,
      requestMetrics: getRequestMetricsSnapshot(),
      workerDeadLetterSummary: summarizeDeadLetterJobs(deadLetterJobs),
    });

    await operationalLogDrain.writeMetricsExport(exportPayload);
    await operationalAlertRouter.routeAlerts(exportPayload.alerts, exportPayload);

    return exportPayload;
  });

  server.get("/ops/dead-letter-jobs", async (request) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    const deadLetterJobs = await deadLetterJobStore.listDeadLetterJobs({
      limit: query.limit,
    });

    return DeadLetterJobListResponseSchema.parse({
      deadLetterJobs,
      summary: summarizeDeadLetterJobs(deadLetterJobs),
    });
  });

  server.delete("/ops/dead-letter-jobs/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const removed = await deadLetterJobStore.removeDeadLetterJob(id);
    if (!removed) {
      reply.status(404).send(notFound("Dead-letter job not found"));
      return;
    }

    reply.send(
      DeleteDeadLetterJobResponseSchema.parse({
        deadLetterJobId: id,
        removed,
      }),
    );
  });

  server.get("/auth/context", async (request) => resolveAuthenticatedUserContext(request));

  server.get("/organizations", async (request) => {
    const userContext = resolveAuthenticatedUserContext(request);
    const organizations = await repository.listOrganizations();

    return OrganizationListResponseSchema.parse({
      organizations:
        userContext.role === "system"
          ? organizations
          : organizations.filter((organization) => organization.id === userContext.organizationId),
    });
  });

  server.post("/organizations", async (request, reply) => {
    const userContext = resolveAuthenticatedUserContext(request);
    if (!canWriteWithRole(userContext.role)) {
      reply.status(403).send(forbidden("User role cannot create organizations"));
      return;
    }

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

  server.get("/sites/:id/keyword-discoveries", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const candidates = await repository.listKeywordDiscoveryCandidates(id);
    if (!candidates) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(KeywordDiscoveryListResponseSchema.parse({ candidates }));
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

  server.get("/sites/:id/compliance-flags", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const complianceFlags = await repository.listComplianceFlags(id);
    if (!complianceFlags) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(ComplianceFlagListResponseSchema.parse({ complianceFlags }));
  });

  server.get("/sites/:id/closed-loop-audit-events", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const auditEvents = await repository.listClosedLoopAuditEvents(id);
    if (!auditEvents) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.send(ClosedLoopAuditEventListResponseSchema.parse({ auditEvents }));
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
        message:
          "schema recommendation snapshot URLs must be within the site domain or its subdomains",
      });
      return;
    }

    const recommendationSets = recommendJsonLdForSnapshots({
      ...(input.organizationName === undefined ? {} : { organizationName: input.organizationName }),
      site,
      snapshots: input.snapshots,
    });
    const recommendations = await repository.createSchemaRecommendations(id, {
      recommendationSets,
    });
    if (!recommendations) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.status(201).send(
      CreateSchemaRecommendationsResponseSchema.parse({
        recommendationSets,
        recommendations,
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
      source: input.keyword.source ?? "manual",
    };

    let readinessReport;
    try {
      readinessReport = evaluateAeoReadiness(
        {
          candidatePage,
          keyword,
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
      readinessReport,
    });
    if (!report) {
      reply.status(404).send(notFound("Site or keyword not found"));
      return;
    }

    reply
      .status(201)
      .send(CreateAeoReadinessReportResponseSchema.parse({ report, readinessReport }));
  });

  server.post("/sites/:id/keyword-discoveries", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateKeywordDiscoveryRequestSchema.parse(request.body ?? {});
    const syncDetail = await repository.getConnectorSyncRun(input.connectorSyncRunId);
    if (!syncDetail) {
      reply.status(404).send(notFound("Connector sync run not found"));
      return;
    }

    if (syncDetail.connectorSyncRun.siteId !== site.id) {
      reply.status(400).send({
        error: "validation_error",
        message: "connectorSyncRunId must belong to the route site",
      });
      return;
    }

    const connectorResults = syncDetail.results.map((result) => ({
      fetchedAt: result.fetchedAt,
      fixture: result.fixture,
      provider: result.provider,
      records: result.records,
      status: result.status,
    }));
    const discoverySet = discoverKeywordTargetsFromConnectorResults(connectorResults, {
      ...(input.country === undefined ? {} : { country: input.country }),
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      discoveredAt: input.discoveredAt ?? new Date().toISOString(),
      maxCandidates: input.maxCandidates,
      minImpressions: input.minImpressions,
      siteId: site.id,
    });

    const candidates = await repository.createKeywordDiscoveryCandidates(site.id, {
      discoverySet,
    });
    if (!candidates) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.status(201).send(
      CreateKeywordDiscoveryResponseSchema.parse({
        discoverySet,
        candidates,
      }),
    );
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
        message: "GEO target siteId must match the route site",
      });
      return;
    }

    if (!isDomainAllowedForSite(input.target.domain, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "GEO target domain must be the site domain or one of its subdomains",
      });
      return;
    }

    let visibilityReport;
    try {
      visibilityReport = evaluateGeoVisibility(input, {
        evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
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

  server.post("/sites/:id/geo-answer-monitor-jobs", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = QueueGeoAnswerMonitorRequestSchema.parse(request.body ?? {});
    if (input.target.siteId !== site.id) {
      reply.status(400).send({
        error: "validation_error",
        message: "GEO monitor target siteId must match the route site",
      });
      return;
    }

    if (!isDomainAllowedForSite(input.target.domain, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "GEO monitor target domain must be the site domain or one of its subdomains",
      });
      return;
    }

    const userContext = resolveAuthenticatedUserContext(request);
    const observedAt = input.observedAt ?? currentTime().toISOString();
    const job = await geoAnswerMonitorQueue.enqueueGeoAnswerMonitor({
      organizationId: site.organizationId,
      siteId: site.id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      target: input.target,
      queries: input.queries,
      observedAt,
      providers: input.providers,
    });

    reply.status(202).send(QueueGeoAnswerMonitorResponseSchema.parse({ job }));
  });

  server.post("/sites/:id/compliance-reviews", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = CreateComplianceReviewRequestSchema.parse(request.body ?? {});
    if (input.siteId !== site.id) {
      reply.status(400).send({
        error: "validation_error",
        message: "Compliance review siteId must match the route site",
      });
      return;
    }

    if (input.url !== null && !isUrlAllowedForCrawl(input.url, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "Compliance review URL must be within the site domain or its subdomains",
      });
      return;
    }

    const { evaluatedAt, ...reviewInput } = input;
    const report = evaluateCompliance(
      {
        ...reviewInput,
        industry: input.industry ?? site.industry,
      },
      { evaluatedAt: evaluatedAt ?? new Date().toISOString() },
    );
    const complianceFlags = await repository.createComplianceReview(id, { report });
    if (!complianceFlags) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    reply.status(201).send(CreateComplianceReviewResponseSchema.parse({ complianceFlags, report }));
  });

  server.post("/sites/:id/cms/content-updated-events", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const event = CmsContentUpdatedEventRequestSchema.parse(request.body ?? {});

    await sendCmsContentUpdatedEventResponse({
      event,
      now: currentTime(),
      reply,
      request,
      routeSiteId: id,
    });
  });

  server.post("/sites/:id/cms/webhooks/:cmsType", async (request, reply) => {
    const { cmsType, id } = CmsWebhookParamsSchema.parse(request.params);
    const site = await repository.getSite(id);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const now = currentTime();
    const event = normalizeCmsWebhookPayload(cmsType, {
      defaultIndustry: site.industry,
      defaultLocale: `${site.language}-${site.country}`,
      payload: request.body ?? {},
      receivedAt: now.toISOString(),
      siteDomain: site.domain,
      siteId: site.id,
    });

    await sendCmsContentUpdatedEventResponse({
      event,
      now,
      reply,
      request,
      routeSiteId: id,
      site,
    });
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
      source: input.keyword.source ?? "manual",
    };

    let readinessReport;
    let draft;
    let faqGapSet;
    try {
      readinessReport =
        input.readinessReport ??
        evaluateAeoReadiness(
          {
            candidatePage,
            keyword,
          },
          { evaluatedAt },
        );
      faqGapSet =
        input.faqGapSet ??
        generateAeoFaqGapSet(
          {
            candidatePage,
            keyword,
          },
          { evaluatedAt, readinessReport },
        );
      draft = createContentBriefDraft({
        candidatePage,
        evaluatedAt,
        faqGapSet,
        keyword,
        keywordId: input.keywordId ?? null,
        readinessReport,
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
      .send(
        CreateContentBriefDraftResponseSchema.parse({
          contentBrief,
          draft,
          faqGapSet,
          readinessReport,
        }),
      );
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
        message: "startUrl must be within the site domain or its subdomains",
      });
      return;
    }

    const crawlRun = await repository.createCrawlRun(id, { ...input, startUrl });
    if (!crawlRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const userContext = resolveAuthenticatedUserContext(request);
    const job = await crawlRunQueue.enqueueCrawl({
      crawlRunId: crawlRun.id,
      siteId: id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      startUrl,
      maxPages: input.maxPages,
      pages: [],
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
    const userContext = resolveAuthenticatedUserContext(request);
    const connectorSyncRun = await repository.createConnectorSyncRun(site.id, {
      providers: input.providers,
      requestedByUserId: userContext.userId,
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
      providers: input.providers,
    });

    reply.status(202).send(CreateConnectorSyncRunResponseSchema.parse({ connectorSyncRun, job }));
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

  server.post("/compliance-flags/:id/work-order", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const complianceFlag = await repository.getComplianceFlag(id);
    if (!complianceFlag) {
      reply.status(404).send(notFound("Compliance flag not found"));
      return;
    }

    if (complianceFlag.status === "dismissed" || complianceFlag.status === "resolved") {
      reply.status(400).send({
        error: "validation_error",
        message: "Dismissed or resolved compliance flags cannot be converted to work orders",
      });
      return;
    }

    let draft;
    try {
      draft = createWorkOrderFromComplianceFlag(complianceFlag);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid compliance flag work order input";
      reply.status(400).send({ error: "validation_error", message });
      return;
    }

    const result = await repository.createComplianceFlagWorkOrder(id, { draft });
    if (!result) {
      reply.status(404).send(notFound("Compliance flag not found"));
      return;
    }

    reply.status(201).send(CreateComplianceFlagWorkOrderResponseSchema.parse(result));
  });

  server.post("/compliance-flags/:id/recheck", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const complianceFlag = await repository.getComplianceFlag(id);
    if (!complianceFlag) {
      reply.status(404).send(notFound("Compliance flag not found"));
      return;
    }

    if (complianceFlag.ruleId === undefined) {
      reply.status(400).send({
        error: "validation_error",
        message: "Compliance flag must include a ruleId before recheck",
      });
      return;
    }

    if (complianceFlag.siteId === null) {
      reply.status(400).send({
        error: "validation_error",
        message: "Compliance flag must be attached to a site before recheck",
      });
      return;
    }

    const site = await repository.getSite(complianceFlag.siteId);
    if (!site) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const input = RecheckComplianceFlagRequestSchema.parse(request.body ?? {});
    const url = input.url === undefined ? (complianceFlag.url ?? null) : input.url;
    if (url !== null && !isUrlAllowedForCrawl(url, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "Compliance recheck URL must be within the site domain or its subdomains",
      });
      return;
    }

    const report = evaluateCompliance(
      {
        industry: input.industry === undefined ? site.industry : input.industry,
        locale: input.locale ?? `${site.language}-${site.country}`,
        publishState: input.publishState ?? "draft",
        siteId: site.id,
        source: input.source ?? "work_order",
        subjectId: complianceFlag.subjectId ?? null,
        subjectType: complianceFlag.subjectType ?? "page_copy",
        text: input.text,
        title: input.title === undefined ? (complianceFlag.title ?? null) : input.title,
        url,
      },
      { evaluatedAt: input.evaluatedAt ?? new Date().toISOString() },
    );
    const matchingFlag = report.flags.find((flag) => flag.ruleId === complianceFlag.ruleId) ?? null;
    const result = await repository.recheckComplianceFlag(id, {
      matchingFlag,
      report,
      resolved: matchingFlag === null,
    });
    if (!result) {
      reply.status(404).send(notFound("Compliance flag not found"));
      return;
    }

    reply.send(RecheckComplianceFlagResponseSchema.parse(result));
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
        message: "Dismissed schema recommendations cannot be converted to work orders",
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
        message: "schema recheck snapshot URL must match the recommendation pageUrl",
      });
      return;
    }

    if (
      !isUrlAllowedForCrawl(input.snapshot.url, site.domain) ||
      (input.snapshot.finalUrl !== null &&
        !isUrlAllowedForCrawl(input.snapshot.finalUrl, site.domain))
    ) {
      reply.status(400).send({
        error: "validation_error",
        message: "schema recheck snapshot URLs must be within the site domain or its subdomains",
      });
      return;
    }

    const observedTypes = extractJsonLdTypes(input.snapshot);
    const result = await repository.recheckSchemaRecommendation(id, {
      observedTypes,
      resolved: hasSchemaType(input.snapshot, recommendation.type),
      snapshot: input.snapshot,
    });
    if (!result) {
      reply.status(404).send(notFound("Schema recommendation not found"));
      return;
    }

    reply.send(RecheckSchemaRecommendationResponseSchema.parse(result));
  });

  server.post("/schema-recommendations/:id/recheck-crawl", async (request, reply) => {
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

    if (!isUrlAllowedForCrawl(recommendation.pageUrl, site.domain)) {
      reply.status(400).send({
        error: "validation_error",
        message: "schema recommendation pageUrl must be within the site domain or its subdomains",
      });
      return;
    }

    const crawlRun = await repository.createCrawlRun(site.id, {
      maxPages: 1,
      startUrl: recommendation.pageUrl,
    });
    if (!crawlRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const userContext = resolveAuthenticatedUserContext(request);
    const job = await crawlRunQueue.enqueueCrawl({
      crawlRunId: crawlRun.id,
      siteId: site.id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      schemaRecommendationId: recommendation.id,
      startUrl: recommendation.pageUrl,
      maxPages: 1,
      pages: [],
    });

    reply.status(202).send(
      QueueSchemaRecommendationRecheckCrawlResponseSchema.parse({
        crawlRun,
        job,
        recommendation,
      }),
    );
  });

  server.post(
    "/schema-recommendations/:id/rich-result-validation-jobs",
    async (request, reply) => {
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

      if (!isUrlAllowedForCrawl(recommendation.pageUrl, site.domain)) {
        reply.status(400).send({
          error: "validation_error",
          message:
            "schema recommendation pageUrl must be within the site domain or its subdomains",
        });
        return;
      }

      const input = QueueSchemaRichResultValidationRequestSchema.parse(request.body ?? {});
      const userContext = resolveAuthenticatedUserContext(request);
      const job = await schemaRichResultValidationQueue.enqueueSchemaRichResultValidation({
        recommendationId: recommendation.id,
        siteId: site.id,
        siteDomain: site.domain,
        requestedByUserId: userContext.userId,
        requestedAt: input.requestedAt ?? currentTime().toISOString(),
        url: recommendation.pageUrl,
        type: recommendation.type,
        jsonLd: recommendation.jsonLd,
        requiredFields: recommendation.requiredFields,
        recommendedFields: recommendation.recommendedFields,
      });

      reply.status(202).send(
        QueueSchemaRichResultValidationResponseSchema.parse({
          job,
          recommendation,
        }),
      );
    },
  );

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
        message: "Work order must be attached to a site before recheck",
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
        message: "recheck startUrl must be within the site domain or its subdomains",
      });
      return;
    }

    const crawlRun = await repository.createCrawlRun(site.id, {
      maxPages: input.maxPages,
      startUrl,
    });
    if (!crawlRun) {
      reply.status(404).send(notFound("Site not found"));
      return;
    }

    const userContext = resolveAuthenticatedUserContext(request);
    const job = await crawlRunQueue.enqueueCrawl({
      crawlRunId: crawlRun.id,
      siteId: site.id,
      siteDomain: site.domain,
      requestedByUserId: userContext.userId,
      startUrl,
      maxPages: input.maxPages,
      pages: [],
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

  server.patch("/compliance-flags/:id", async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const input = UpdateComplianceFlagRequestSchema.parse(request.body);
    const complianceFlag = await repository.updateComplianceFlag(id, input);
    if (!complianceFlag) {
      reply.status(404).send(notFound("Compliance flag not found"));
      return;
    }

    reply.send(ComplianceFlagSchema.parse(complianceFlag));
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
  const normalizedDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./u, "");
  const normalizedSiteDomain = siteDomain
    .trim()
    .toLowerCase()
    .replace(/^www\./u, "");

  return (
    normalizedDomain === normalizedSiteDomain ||
    normalizedDomain.endsWith(`.${normalizedSiteDomain}`)
  );
}
