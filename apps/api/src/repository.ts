import type {
  AeoReadinessReport,
  AeoReadinessReportRecord,
  ClosedLoopAuditEvent,
  ComplianceFlag,
  ComplianceReviewReport,
  ConnectorOAuthCredential,
  ConnectorOAuthProvider,
  ConnectorProviderList,
  ConnectorSyncResult,
  ConnectorSyncRun,
  ContentBrief,
  ContentBriefDraft,
  CrawlRun,
  CrawlerPageSnapshot,
  CreateOrganizationRequest,
  CreateCrawlRunRequest,
  CreateSiteRequest,
  GeoVisibilityReport,
  GeoVisibilityReportRecord,
  JsonLdRecommendationSet,
  KeywordDiscoveryCandidateRecord,
  KeywordDiscoverySet,
  Organization,
  RecheckSchemaRecommendationResponse,
  ResolveWorkOrderIssueResponse,
  SchemaJsonLdType,
  SchemaRecommendationRecord,
  SeoIssue,
  Site,
  UpdateComplianceFlagRequest,
  UpdateSiteRequest,
  UpdateWorkOrderRequest,
  WorkOrder,
  WorkOrderDraft
} from "@searchops/types";

export interface CreateConnectorSyncRunInput {
  providers: ConnectorProviderList;
  requestedByUserId: string;
}

export interface UpsertConnectorOAuthCredentialInput {
  readonly accessToken: string;
  readonly connectedAt: string;
  readonly connectedByUserId: string;
  readonly externalAccountEmail?: string | null;
  readonly provider: ConnectorOAuthProvider;
  readonly refreshToken?: string | null;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt?: string | null;
  readonly tokenType?: string | null;
}

export interface ConnectorSyncRunDetail {
  connectorSyncRun: ConnectorSyncRun;
  results: ConnectorSyncResult[];
}

export interface CreateClosedLoopAuditEventInput {
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly eventType: ClosedLoopAuditEvent["eventType"];
  readonly status: ClosedLoopAuditEvent["status"];
  readonly source: string;
  readonly subjectType?: string | null;
  readonly subjectId?: string | null;
  readonly cmsType?: string | null;
  readonly externalId?: string | null;
  readonly complianceFlagId?: string | null;
  readonly workOrderId?: string | null;
  readonly message: string;
  readonly metadata?: Record<string, unknown> | null;
}

export interface CreateContentBriefDraftInput {
  draft: ContentBriefDraft;
}

export interface CreateAeoReadinessReportInput {
  keywordId?: string | null;
  readinessReport: AeoReadinessReport;
}

export interface CreateKeywordDiscoveryCandidatesInput {
  discoverySet: KeywordDiscoverySet;
}

export interface CreateGeoVisibilityReportInput {
  visibilityReport: GeoVisibilityReport;
}

export interface CreateComplianceReviewInput {
  report: ComplianceReviewReport;
}

export interface CreateSchemaRecommendationsInput {
  recommendationSets: readonly JsonLdRecommendationSet[];
}

export interface CreateSchemaRecommendationWorkOrderInput {
  draft: WorkOrderDraft;
}

export interface CreateSchemaRecommendationWorkOrderResult {
  recommendation: SchemaRecommendationRecord;
  workOrder: WorkOrder;
}

export interface CreateGeoVisibilityReportWorkOrderInput {
  draft: WorkOrderDraft;
}

export interface CreateGeoVisibilityReportWorkOrderResult {
  report: GeoVisibilityReportRecord;
  workOrder: WorkOrder;
}

export interface CreateComplianceFlagWorkOrderInput {
  draft: WorkOrderDraft;
}

export interface CreateComplianceFlagWorkOrderResult {
  complianceFlag: ComplianceFlag;
  workOrder: WorkOrder;
}

export interface RecheckComplianceFlagInput {
  matchingFlag: ComplianceReviewReport["flags"][number] | null;
  report: ComplianceReviewReport;
  resolved: boolean;
}

export interface RecheckComplianceFlagResult {
  complianceFlag: ComplianceFlag;
  report: ComplianceReviewReport;
  resolved: boolean;
  workOrder: WorkOrder | null;
}

export interface RecheckSchemaRecommendationInput {
  observedTypes: readonly SchemaJsonLdType[];
  resolved: boolean;
  snapshot: CrawlerPageSnapshot;
}

export interface SearchOpsRepository {
  listOrganizations(): Promise<Organization[]>;
  createOrganization(input: CreateOrganizationRequest): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;
  listSites(organizationId: string): Promise<Site[]>;
  createSite(organizationId: string, input: CreateSiteRequest): Promise<Site | null>;
  getSite(id: string): Promise<Site | null>;
  updateSite(id: string, input: UpdateSiteRequest): Promise<Site | null>;
  deleteSite(id: string): Promise<boolean>;
  createCrawlRun(siteId: string, input: CreateCrawlRunRequest): Promise<CrawlRun | null>;
  getCrawlRun(id: string): Promise<CrawlRun | null>;
  listCrawlRuns(siteId: string): Promise<CrawlRun[]>;
  createConnectorSyncRun(
    siteId: string,
    input: CreateConnectorSyncRunInput,
  ): Promise<ConnectorSyncRun | null>;
  listConnectorSyncRuns(siteId: string): Promise<ConnectorSyncRun[] | null>;
  getConnectorSyncRun(id: string): Promise<ConnectorSyncRunDetail | null>;
  upsertConnectorOAuthCredentials(
    siteId: string,
    input: readonly UpsertConnectorOAuthCredentialInput[],
  ): Promise<ConnectorOAuthCredential[] | null>;
  listConnectorOAuthCredentials(siteId: string): Promise<ConnectorOAuthCredential[] | null>;
  createClosedLoopAuditEvent(
    input: CreateClosedLoopAuditEventInput,
  ): Promise<ClosedLoopAuditEvent | null>;
  listClosedLoopAuditEvents(siteId: string): Promise<ClosedLoopAuditEvent[] | null>;
  createContentBriefDraft(
    siteId: string,
    input: CreateContentBriefDraftInput,
  ): Promise<ContentBrief | null>;
  listContentBriefs(siteId: string): Promise<ContentBrief[] | null>;
  getContentBrief(id: string): Promise<ContentBrief | null>;
  createAeoReadinessReport(
    siteId: string,
    input: CreateAeoReadinessReportInput,
  ): Promise<AeoReadinessReportRecord | null>;
  listAeoReadinessReports(siteId: string): Promise<AeoReadinessReportRecord[] | null>;
  createKeywordDiscoveryCandidates(
    siteId: string,
    input: CreateKeywordDiscoveryCandidatesInput,
  ): Promise<KeywordDiscoveryCandidateRecord[] | null>;
  listKeywordDiscoveryCandidates(siteId: string): Promise<
    KeywordDiscoveryCandidateRecord[] | null
  >;
  createGeoVisibilityReport(
    siteId: string,
    input: CreateGeoVisibilityReportInput,
  ): Promise<GeoVisibilityReportRecord | null>;
  listGeoVisibilityReports(siteId: string): Promise<GeoVisibilityReportRecord[] | null>;
  getGeoVisibilityReport(id: string): Promise<GeoVisibilityReportRecord | null>;
  createGeoVisibilityReportWorkOrder(
    reportId: string,
    input: CreateGeoVisibilityReportWorkOrderInput,
  ): Promise<CreateGeoVisibilityReportWorkOrderResult | null>;
  createComplianceReview(
    siteId: string,
    input: CreateComplianceReviewInput,
  ): Promise<ComplianceFlag[] | null>;
  listComplianceFlags(siteId: string): Promise<ComplianceFlag[] | null>;
  getComplianceFlag(id: string): Promise<ComplianceFlag | null>;
  updateComplianceFlag(
    id: string,
    input: UpdateComplianceFlagRequest,
  ): Promise<ComplianceFlag | null>;
  createComplianceFlagWorkOrder(
    flagId: string,
    input: CreateComplianceFlagWorkOrderInput,
  ): Promise<CreateComplianceFlagWorkOrderResult | null>;
  recheckComplianceFlag(
    flagId: string,
    input: RecheckComplianceFlagInput,
  ): Promise<RecheckComplianceFlagResult | null>;
  createSchemaRecommendations(
    siteId: string,
    input: CreateSchemaRecommendationsInput,
  ): Promise<SchemaRecommendationRecord[] | null>;
  listSchemaRecommendations(siteId: string): Promise<SchemaRecommendationRecord[] | null>;
  getSchemaRecommendation(id: string): Promise<SchemaRecommendationRecord | null>;
  createSchemaRecommendationWorkOrder(
    recommendationId: string,
    input: CreateSchemaRecommendationWorkOrderInput,
  ): Promise<CreateSchemaRecommendationWorkOrderResult | null>;
  recheckSchemaRecommendation(
    recommendationId: string,
    input: RecheckSchemaRecommendationInput,
  ): Promise<RecheckSchemaRecommendationResponse | null>;
  listWorkOrders(siteId: string): Promise<WorkOrder[] | null>;
  getWorkOrder(id: string): Promise<WorkOrder | null>;
  updateWorkOrder(id: string, input: UpdateWorkOrderRequest): Promise<WorkOrder | null>;
  resolveWorkOrderIssue(id: string): Promise<ResolveWorkOrderIssueResponse | null>;
}

export interface MemoryRepositorySeed {
  readonly organizations?: readonly Organization[];
  readonly sites?: readonly Site[];
  readonly crawlRuns?: readonly CrawlRun[];
  readonly connectorSyncRuns?: readonly ConnectorSyncRun[];
  readonly connectorSyncResults?: readonly ConnectorSyncResult[];
  readonly connectorOAuthCredentials?: readonly ConnectorOAuthCredential[];
  readonly closedLoopAuditEvents?: readonly ClosedLoopAuditEvent[];
  readonly contentBriefs?: readonly ContentBrief[];
  readonly aeoReadinessReports?: readonly AeoReadinessReportRecord[];
  readonly keywordDiscoveryCandidates?: readonly KeywordDiscoveryCandidateRecord[];
  readonly geoVisibilityReports?: readonly GeoVisibilityReportRecord[];
  readonly complianceFlags?: readonly ComplianceFlag[];
  readonly schemaRecommendations?: readonly SchemaRecommendationRecord[];
  readonly seoIssues?: readonly SeoIssue[];
  readonly workOrders?: readonly WorkOrder[];
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string, index: number) {
  return `${prefix}_${index.toString().padStart(4, "0")}`;
}

function createKeywordDiscoveryKey({
  locale,
  phrase,
  siteId,
  source
}: {
  readonly locale: string;
  readonly phrase: string;
  readonly siteId: string;
  readonly source: string;
}) {
  return `${siteId}::${phrase}::${locale}::${source}`;
}

function createConnectorOAuthKey(siteId: string, provider: string) {
  return `${siteId}::${provider}`;
}

export function createMemoryRepository(seed: MemoryRepositorySeed = {}): SearchOpsRepository {
  const organizations = new Map<string, Organization>();
  const sites = new Map<string, Site>();
  const crawlRuns = new Map<string, CrawlRun>();
  const connectorSyncRuns = new Map<string, ConnectorSyncRun>();
  const connectorSyncResults = new Map<string, ConnectorSyncResult>();
  const connectorOAuthCredentials = new Map<string, ConnectorOAuthCredential>();
  const closedLoopAuditEvents = new Map<string, ClosedLoopAuditEvent>();
  const contentBriefs = new Map<string, ContentBrief>();
  const aeoReadinessReports = new Map<string, AeoReadinessReportRecord>();
  const keywordDiscoveryCandidates = new Map<string, KeywordDiscoveryCandidateRecord>();
  const geoVisibilityReports = new Map<string, GeoVisibilityReportRecord>();
  const complianceFlags = new Map<string, ComplianceFlag>();
  const schemaRecommendations = new Map<string, SchemaRecommendationRecord>();
  const seoIssues = new Map<string, SeoIssue>();
  const workOrders = new Map<string, WorkOrder>();
  let organizationCounter = 1;
  let siteCounter = 1;
  let crawlRunCounter = 1;
  let connectorOAuthCredentialCounter = 1;
  let connectorSyncRunCounter = 1;
  let closedLoopAuditEventCounter = 1;
  let contentBriefCounter = 1;
  let aeoReadinessReportCounter = 1;
  let keywordDiscoveryCandidateCounter = 1;
  let geoVisibilityReportCounter = 1;
  let complianceFlagCounter = 1;
  let schemaRecommendationCounter = 1;
  let workOrderCounter = 1;
  let keywordCounter = 1;

  for (const organization of seed.organizations ?? []) {
    organizations.set(organization.id, organization);
    organizationCounter += 1;
  }

  for (const site of seed.sites ?? []) {
    sites.set(site.id, site);
    siteCounter += 1;
  }

  for (const crawlRun of seed.crawlRuns ?? []) {
    crawlRuns.set(crawlRun.id, crawlRun);
    crawlRunCounter += 1;
  }

  for (const connectorSyncRun of seed.connectorSyncRuns ?? []) {
    connectorSyncRuns.set(connectorSyncRun.id, connectorSyncRun);
    connectorSyncRunCounter += 1;
  }

  for (const connectorSyncResult of seed.connectorSyncResults ?? []) {
    connectorSyncResults.set(connectorSyncResult.id, connectorSyncResult);
  }

  for (const credential of seed.connectorOAuthCredentials ?? []) {
    connectorOAuthCredentials.set(createConnectorOAuthKey(credential.siteId, credential.provider), credential);
    connectorOAuthCredentialCounter += 1;
  }

  for (const auditEvent of seed.closedLoopAuditEvents ?? []) {
    closedLoopAuditEvents.set(auditEvent.id, auditEvent);
    closedLoopAuditEventCounter += 1;
  }

  for (const contentBrief of seed.contentBriefs ?? []) {
    contentBriefs.set(contentBrief.id, contentBrief);
    contentBriefCounter += 1;
  }

  for (const aeoReadinessReport of seed.aeoReadinessReports ?? []) {
    aeoReadinessReports.set(aeoReadinessReport.id, aeoReadinessReport);
    aeoReadinessReportCounter += 1;
  }

  for (const candidate of seed.keywordDiscoveryCandidates ?? []) {
    keywordDiscoveryCandidates.set(
      createKeywordDiscoveryKey({
        locale: candidate.locale,
        phrase: candidate.phrase,
        siteId: candidate.siteId,
        source: candidate.source
      }),
      candidate,
    );
    keywordDiscoveryCandidateCounter += 1;
  }

  for (const geoVisibilityReport of seed.geoVisibilityReports ?? []) {
    geoVisibilityReports.set(geoVisibilityReport.id, geoVisibilityReport);
    geoVisibilityReportCounter += 1;
  }

  for (const complianceFlag of seed.complianceFlags ?? []) {
    complianceFlags.set(complianceFlag.id, complianceFlag);
    complianceFlagCounter += 1;
  }

  for (const schemaRecommendation of seed.schemaRecommendations ?? []) {
    schemaRecommendations.set(schemaRecommendation.id, schemaRecommendation);
    schemaRecommendationCounter += 1;
  }

  for (const seoIssue of seed.seoIssues ?? []) {
    seoIssues.set(seoIssue.id, seoIssue);
  }

  for (const workOrder of seed.workOrders ?? []) {
    workOrders.set(workOrder.id, workOrder);
    workOrderCounter += 1;
  }

  return {
    async listOrganizations() {
      return [...organizations.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async createOrganization(input) {
      const organization: Organization = {
        id: createId("org", organizationCounter),
        name: input.name,
        createdAt: nowIso()
      };
      organizationCounter += 1;
      organizations.set(organization.id, organization);
      return organization;
    },

    async getOrganization(id) {
      return organizations.get(id) ?? null;
    },

    async listSites(organizationId) {
      return [...sites.values()]
        .filter((site) => site.organizationId === organizationId)
        .sort((a, b) => a.domain.localeCompare(b.domain));
    },

    async createSite(organizationId, input) {
      if (!organizations.has(organizationId)) {
        return null;
      }

      const site: Site = {
        id: createId("site", siteCounter),
        organizationId,
        domain: input.domain,
        name: input.name ?? null,
        industry: input.industry ?? null,
        language: input.language,
        country: input.country,
        createdAt: nowIso()
      };
      siteCounter += 1;
      sites.set(site.id, site);
      return site;
    },

    async getSite(id) {
      return sites.get(id) ?? null;
    },

    async updateSite(id, input) {
      const existing = sites.get(id);
      if (!existing) {
        return null;
      }

      const updated: Site = {
        ...existing,
        domain: input.domain ?? existing.domain,
        name: input.name === undefined ? existing.name : input.name,
        industry: input.industry === undefined ? existing.industry : input.industry,
        language: input.language ?? existing.language,
        country: input.country ?? existing.country
      };
      sites.set(id, updated);
      return updated;
    },

    async deleteSite(id) {
      return sites.delete(id);
    },

    async createCrawlRun(siteId, input) {
      if (!sites.has(siteId)) {
        return null;
      }

      const crawlRun: CrawlRun = {
        id: createId("crawl", crawlRunCounter),
        siteId,
        status: "queued",
        startedAt: nowIso(),
        endedAt: null,
        summary: {
          startUrl: input.startUrl ?? null,
          maxPages: input.maxPages
        }
      };
      crawlRunCounter += 1;
      crawlRuns.set(crawlRun.id, crawlRun);
      return crawlRun;
    },

    async getCrawlRun(id) {
      return crawlRuns.get(id) ?? null;
    },

    async listCrawlRuns(siteId) {
      return [...crawlRuns.values()]
        .filter((crawlRun) => crawlRun.siteId === siteId)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    },

    async createConnectorSyncRun(siteId, input) {
      const site = sites.get(siteId);
      if (!site) {
        return null;
      }

      const connectorSyncRun: ConnectorSyncRun = {
        id: createId("sync", connectorSyncRunCounter),
        organizationId: site.organizationId,
        siteId,
        status: "queued",
        providers: input.providers,
        requestedByUserId: input.requestedByUserId,
        fixture: true,
        startedAt: nowIso(),
        endedAt: null,
        summary: null
      };
      connectorSyncRunCounter += 1;
      connectorSyncRuns.set(connectorSyncRun.id, connectorSyncRun);
      return connectorSyncRun;
    },

    async listConnectorSyncRuns(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...connectorSyncRuns.values()]
        .filter((connectorSyncRun) => connectorSyncRun.siteId === siteId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    async getConnectorSyncRun(id) {
      const connectorSyncRun = connectorSyncRuns.get(id);
      if (!connectorSyncRun) {
        return null;
      }

      return {
        connectorSyncRun,
        results: [...connectorSyncResults.values()]
          .filter((result) => result.syncRunId === id)
          .sort((a, b) => a.provider.localeCompare(b.provider))
      };
    },

    async upsertConnectorOAuthCredentials(siteId, input) {
      const site = sites.get(siteId);
      if (!site) {
        return null;
      }

      const credentials = input.map((credentialInput) => {
        const existing = connectorOAuthCredentials.get(
          createConnectorOAuthKey(siteId, credentialInput.provider),
        );
        const credential: ConnectorOAuthCredential = {
          id: existing?.id ?? createId("oauth", connectorOAuthCredentialCounter),
          organizationId: site.organizationId,
          siteId,
          provider: credentialInput.provider,
          status: "connected",
          scopes: [...credentialInput.scopes],
          connectedByUserId: credentialInput.connectedByUserId,
          connectedAt: credentialInput.connectedAt,
          tokenExpiresAt: credentialInput.tokenExpiresAt ?? null,
          externalAccountEmail: credentialInput.externalAccountEmail ?? null,
          updatedAt: credentialInput.connectedAt
        };
        if (existing === undefined) {
          connectorOAuthCredentialCounter += 1;
        }
        connectorOAuthCredentials.set(createConnectorOAuthKey(siteId, credential.provider), credential);
        return credential;
      });

      return credentials.sort((a, b) => a.provider.localeCompare(b.provider));
    },

    async listConnectorOAuthCredentials(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...connectorOAuthCredentials.values()]
        .filter((credential) => credential.siteId === siteId)
        .sort((a, b) => a.provider.localeCompare(b.provider));
    },

    async createClosedLoopAuditEvent(input) {
      if (!organizations.has(input.organizationId)) {
        return null;
      }

      if (input.siteId !== null && !sites.has(input.siteId)) {
        return null;
      }

      const auditEvent: ClosedLoopAuditEvent = {
        id: createId("audit", closedLoopAuditEventCounter),
        organizationId: input.organizationId,
        siteId: input.siteId,
        eventType: input.eventType,
        status: input.status,
        source: input.source,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        cmsType: input.cmsType ?? null,
        externalId: input.externalId ?? null,
        complianceFlagId: input.complianceFlagId ?? null,
        workOrderId: input.workOrderId ?? null,
        message: input.message,
        metadata: input.metadata ?? null,
        createdAt: nowIso()
      };
      closedLoopAuditEventCounter += 1;
      closedLoopAuditEvents.set(auditEvent.id, auditEvent);
      return auditEvent;
    },

    async listClosedLoopAuditEvents(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...closedLoopAuditEvents.values()]
        .filter((event) => event.siteId === siteId)
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            a.eventType.localeCompare(b.eventType) ||
            a.id.localeCompare(b.id),
        );
    },

    async createContentBriefDraft(siteId, input) {
      const site = sites.get(siteId);
      if (!site || input.draft.siteId !== siteId) {
        return null;
      }

      const keywordId = input.draft.keywordId ?? createId("keyword", keywordCounter);
      if (input.draft.keywordId === null) {
        keywordCounter += 1;
      }

      const contentBrief: ContentBrief = {
        id: createId("brief", contentBriefCounter),
        siteId,
        keywordId,
        primaryKeyword: input.draft.primaryKeyword,
        locale: input.draft.locale,
        intent: input.draft.intent,
        title: input.draft.title,
        status: input.draft.status,
        summary: input.draft.summary,
        outline: input.draft.outline,
        faqQuestions: input.draft.faqQuestions,
        acceptanceCriteria: input.draft.acceptanceCriteria,
        generationMode: input.draft.generationMode,
        publishPolicy: input.draft.publishPolicy,
        createdAt: nowIso()
      };
      contentBriefCounter += 1;
      contentBriefs.set(contentBrief.id, contentBrief);
      return contentBrief;
    },

    async listContentBriefs(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...contentBriefs.values()]
        .filter((contentBrief) => contentBrief.siteId === siteId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
    },

    async getContentBrief(id) {
      return contentBriefs.get(id) ?? null;
    },

    async createAeoReadinessReport(siteId, input) {
      const site = sites.get(siteId);
      if (!site || input.readinessReport.keyword.siteId !== siteId) {
        return null;
      }

      const keywordId = input.keywordId ?? createId("keyword", keywordCounter);
      if (input.keywordId == null) {
        keywordCounter += 1;
      }

      const report: AeoReadinessReportRecord = {
        id: createId("aeo_report", aeoReadinessReportCounter),
        siteId,
        keywordId,
        phrase: input.readinessReport.keyword.phrase,
        locale: input.readinessReport.keyword.locale,
        intent: input.readinessReport.keyword.intent,
        pageUrl: input.readinessReport.pageUrl,
        status: input.readinessReport.status,
        score: input.readinessReport.score,
        checks: input.readinessReport.checks,
        generatedBy: input.readinessReport.generatedBy,
        evaluatedAt: input.readinessReport.evaluatedAt,
        createdAt: nowIso()
      };
      aeoReadinessReportCounter += 1;
      aeoReadinessReports.set(report.id, report);
      return report;
    },

    async listAeoReadinessReports(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...aeoReadinessReports.values()]
        .filter((report) => report.siteId === siteId)
        .sort(
          (a, b) =>
            b.evaluatedAt.localeCompare(a.evaluatedAt) ||
            b.createdAt.localeCompare(a.createdAt) ||
            a.phrase.localeCompare(b.phrase),
        );
    },

    async createKeywordDiscoveryCandidates(siteId, input) {
      const site = sites.get(siteId);
      if (!site || input.discoverySet.siteId !== siteId) {
        return null;
      }

      const timestamp = nowIso();
      const records = input.discoverySet.candidates.map((candidate) => {
        const key = createKeywordDiscoveryKey({
          locale: candidate.keyword.locale,
          phrase: candidate.keyword.phrase,
          siteId,
          source: candidate.keyword.source
        });
        const existing = keywordDiscoveryCandidates.get(key);
        const keywordId = existing?.keywordId ?? createId("keyword", keywordCounter);
        if (!existing?.keywordId) {
          keywordCounter += 1;
        }

        const record: KeywordDiscoveryCandidateRecord = {
          id: existing?.id ?? createId("keyword_discovery", keywordDiscoveryCandidateCounter),
          siteId,
          keywordId,
          phrase: candidate.keyword.phrase,
          locale: candidate.keyword.locale,
          language: candidate.keyword.language,
          country: candidate.keyword.country,
          intent: candidate.keyword.intent,
          source: candidate.keyword.source,
          pageUrl: candidate.pageUrl,
          score: candidate.score,
          evidence: candidate.evidence,
          generatedBy: input.discoverySet.generatedBy,
          discoveredAt: input.discoverySet.discoveredAt,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp
        };

        if (!existing) {
          keywordDiscoveryCandidateCounter += 1;
        }
        keywordDiscoveryCandidates.set(key, record);
        return record;
      });

      return records.sort(
        (a, b) =>
          b.score - a.score ||
          b.discoveredAt.localeCompare(a.discoveredAt) ||
          a.phrase.localeCompare(b.phrase),
      );
    },

    async listKeywordDiscoveryCandidates(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...keywordDiscoveryCandidates.values()]
        .filter((candidate) => candidate.siteId === siteId)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.discoveredAt.localeCompare(a.discoveredAt) ||
            a.phrase.localeCompare(b.phrase),
        );
    },

    async createGeoVisibilityReport(siteId, input) {
      if (!sites.has(siteId) || input.visibilityReport.target.siteId !== siteId) {
        return null;
      }

      const report: GeoVisibilityReportRecord = {
        id: createId("geo_report", geoVisibilityReportCounter),
        siteId,
        brandName: input.visibilityReport.target.brandName,
        domain: input.visibilityReport.target.domain,
        locale: input.visibilityReport.target.locale,
        market: input.visibilityReport.target.market,
        status: input.visibilityReport.status,
        score: input.visibilityReport.score,
        mentionRate: input.visibilityReport.mentionRate,
        citationRate: input.visibilityReport.citationRate,
        competitorCitationRate: input.visibilityReport.competitorCitationRate,
        queryCount: input.visibilityReport.queryCount,
        providerCount: input.visibilityReport.providerCount,
        observations: input.visibilityReport.observations,
        citations: input.visibilityReport.citations,
        checks: input.visibilityReport.checks,
        generatedBy: input.visibilityReport.generatedBy,
        evaluatedAt: input.visibilityReport.evaluatedAt,
        createdAt: nowIso()
      };
      geoVisibilityReportCounter += 1;
      geoVisibilityReports.set(report.id, report);
      return report;
    },

    async listGeoVisibilityReports(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...geoVisibilityReports.values()]
        .filter((report) => report.siteId === siteId)
        .sort(
          (a, b) =>
            b.evaluatedAt.localeCompare(a.evaluatedAt) ||
            b.createdAt.localeCompare(a.createdAt) ||
            a.brandName.localeCompare(b.brandName),
        );
    },

    async getGeoVisibilityReport(id) {
      return geoVisibilityReports.get(id) ?? null;
    },

    async createGeoVisibilityReportWorkOrder(reportId, input) {
      const report = geoVisibilityReports.get(reportId);
      if (!report) {
        return null;
      }

      const site = sites.get(report.siteId);
      if (!site) {
        return null;
      }

      const existingWorkOrder = [...workOrders.values()].find(
        (workOrder) => workOrder.geoVisibilityReportId === reportId,
      );
      const timestamp = nowIso();
      const workOrder: WorkOrder = {
        id: existingWorkOrder?.id ?? createId("wo", workOrderCounter),
        organizationId: site.organizationId,
        siteId: site.id,
        seoIssueId: null,
        schemaRecommendationId: null,
        geoVisibilityReportId: reportId,
        status: existingWorkOrder?.status ?? "open",
        priority: input.draft.priority,
        title: input.draft.title,
        description: null,
        problem: input.draft.problem,
        evidence: input.draft.evidence,
        impact: input.draft.impact,
        instructions: input.draft.instructions,
        ownerType: input.draft.ownerType,
        acceptanceCriteria: input.draft.acceptanceCriteria,
        verificationMethod: input.draft.verificationMethod,
        estimatedEffort: input.draft.estimatedEffort,
        relatedIssues: input.draft.relatedIssues,
        assignedTo: existingWorkOrder?.assignedTo ?? null,
        dueDate: existingWorkOrder?.dueDate ?? null,
        createdAt: existingWorkOrder?.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      if (!existingWorkOrder) {
        workOrderCounter += 1;
      }

      workOrders.set(workOrder.id, workOrder);

      return {
        report,
        workOrder
      };
    },

    async createComplianceReview(siteId, input) {
      const site = sites.get(siteId);
      if (!site || input.report.input.siteId !== siteId) {
        return null;
      }

      const createdFlags = input.report.flags.map((flagDraft) => {
        const timestamp = nowIso();
        const flag: ComplianceFlag = {
          id: createId("compliance_flag", complianceFlagCounter),
          organizationId: site.organizationId,
          siteId,
          workOrderId: null,
          subjectType: input.report.input.subjectType,
          subjectId: input.report.input.subjectId,
          ruleId: flagDraft.ruleId,
          url: input.report.input.url,
          riskLevel: flagDraft.riskLevel,
          status: flagDraft.status,
          title: flagDraft.title,
          message: flagDraft.message,
          evidence: flagDraft.evidence,
          recommendation: flagDraft.recommendation,
          replacementSuggestion: flagDraft.replacementSuggestion,
          generatedBy: flagDraft.generatedBy,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        complianceFlagCounter += 1;
        complianceFlags.set(flag.id, flag);
        return flag;
      });

      return createdFlags;
    },

    async listComplianceFlags(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...complianceFlags.values()]
        .filter((flag) => flag.siteId === siteId)
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) ||
            a.riskLevel.localeCompare(b.riskLevel) ||
            a.message.localeCompare(b.message),
        );
    },

    async getComplianceFlag(id) {
      return complianceFlags.get(id) ?? null;
    },

    async updateComplianceFlag(id, input) {
      const existing = complianceFlags.get(id);
      if (!existing) {
        return null;
      }

      const updated: ComplianceFlag = {
        ...existing,
        status: input.status ?? existing.status,
        workOrderId: input.workOrderId === undefined ? existing.workOrderId : input.workOrderId,
        updatedAt: nowIso()
      };
      complianceFlags.set(id, updated);
      return updated;
    },

    async createComplianceFlagWorkOrder(flagId, input) {
      const flag = complianceFlags.get(flagId);
      if (!flag) {
        return null;
      }

      const existingWorkOrder =
        flag.workOrderId === null || flag.workOrderId === undefined
          ? null
          : workOrders.get(flag.workOrderId) ?? null;
      const timestamp = nowIso();
      const workOrder: WorkOrder = {
        id: existingWorkOrder?.id ?? createId("wo", workOrderCounter),
        organizationId: flag.organizationId,
        siteId: flag.siteId ?? null,
        seoIssueId: null,
        schemaRecommendationId: null,
        geoVisibilityReportId: null,
        status: existingWorkOrder?.status ?? "open",
        priority: input.draft.priority,
        title: input.draft.title,
        description: null,
        problem: input.draft.problem,
        evidence: input.draft.evidence,
        impact: input.draft.impact,
        instructions: input.draft.instructions,
        ownerType: input.draft.ownerType,
        acceptanceCriteria: input.draft.acceptanceCriteria,
        verificationMethod: input.draft.verificationMethod,
        estimatedEffort: input.draft.estimatedEffort,
        relatedIssues: input.draft.relatedIssues,
        assignedTo: existingWorkOrder?.assignedTo ?? null,
        dueDate: existingWorkOrder?.dueDate ?? null,
        createdAt: existingWorkOrder?.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      if (!existingWorkOrder) {
        workOrderCounter += 1;
      }

      workOrders.set(workOrder.id, workOrder);

      const updatedFlag: ComplianceFlag = {
        ...flag,
        status: flag.status === "approved" || flag.status === "resolved" ? flag.status : "in_review",
        workOrderId: workOrder.id,
        updatedAt: timestamp
      };
      complianceFlags.set(flagId, updatedFlag);

      return {
        complianceFlag: updatedFlag,
        workOrder
      };
    },

    async recheckComplianceFlag(flagId, input) {
      const flag = complianceFlags.get(flagId);
      if (!flag) {
        return null;
      }

      const timestamp = nowIso();
      const matchingFlag = input.matchingFlag;
      const updatedFlag: ComplianceFlag = {
        ...flag,
        ...(matchingFlag === null
          ? {}
          : {
              evidence: matchingFlag.evidence,
              generatedBy: matchingFlag.generatedBy,
              message: matchingFlag.message,
              recommendation: matchingFlag.recommendation,
              replacementSuggestion: matchingFlag.replacementSuggestion,
              riskLevel: matchingFlag.riskLevel,
              ruleId: matchingFlag.ruleId,
              title: matchingFlag.title
            }),
        status: input.resolved ? "resolved" : flag.workOrderId === null ? "open" : "in_review",
        updatedAt: timestamp
      };
      complianceFlags.set(flagId, updatedFlag);

      const workOrder =
        flag.workOrderId === null || flag.workOrderId === undefined
          ? null
          : workOrders.get(flag.workOrderId) ?? null;
      const updatedWorkOrder: WorkOrder | null =
        workOrder === null
          ? null
          : {
              ...workOrder,
              status: input.resolved ? "done" : workOrder.status === "done" ? "in_review" : workOrder.status,
              updatedAt: timestamp
            };
      if (updatedWorkOrder !== null) {
        workOrders.set(updatedWorkOrder.id, updatedWorkOrder);
      }

      return {
        complianceFlag: updatedFlag,
        report: input.report,
        resolved: input.resolved,
        workOrder: updatedWorkOrder
      };
    },

    async createSchemaRecommendations(siteId, input) {
      if (!sites.has(siteId)) {
        return null;
      }

      const savedRecommendations: SchemaRecommendationRecord[] = [];
      for (const set of input.recommendationSets) {
        if (set.siteId !== siteId) {
          return null;
        }

        for (const recommendation of set.recommendations) {
          const existing = [...schemaRecommendations.values()].find(
            (record) =>
              record.siteId === siteId &&
              record.pageUrl === set.pageUrl &&
              record.type === recommendation.type,
          );
          const timestamp = nowIso();
          const record: SchemaRecommendationRecord = {
            id: existing?.id ?? createId("schema_rec", schemaRecommendationCounter),
            siteId,
            pageUrl: set.pageUrl,
            type: recommendation.type,
            priority: recommendation.priority,
            status: existing?.status ?? "open",
            reason: recommendation.reason,
            evidence: recommendation.evidence,
            jsonLd: recommendation.jsonLd,
            instructions: recommendation.instructions,
            requiredFields: recommendation.requiredFields,
            recommendedFields: recommendation.recommendedFields,
            generatedBy: recommendation.generatedBy,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp
          };

          if (!existing) {
            schemaRecommendationCounter += 1;
          }

          schemaRecommendations.set(record.id, record);
          savedRecommendations.push(record);
        }
      }

      return savedRecommendations;
    },

    async listSchemaRecommendations(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...schemaRecommendations.values()]
        .filter((recommendation) => recommendation.siteId === siteId)
        .sort(
          (a, b) =>
            b.updatedAt.localeCompare(a.updatedAt) ||
            a.pageUrl.localeCompare(b.pageUrl) ||
            a.type.localeCompare(b.type),
        );
    },

    async getSchemaRecommendation(id) {
      return schemaRecommendations.get(id) ?? null;
    },

    async createSchemaRecommendationWorkOrder(recommendationId, input) {
      const recommendation = schemaRecommendations.get(recommendationId);
      if (!recommendation) {
        return null;
      }

      const site = sites.get(recommendation.siteId);
      if (!site) {
        return null;
      }

      const existingWorkOrder = [...workOrders.values()].find(
        (workOrder) => workOrder.schemaRecommendationId === recommendationId,
      );
      const timestamp = nowIso();
      const workOrder: WorkOrder = {
        id: existingWorkOrder?.id ?? createId("wo", workOrderCounter),
        organizationId: site.organizationId,
        siteId: site.id,
        seoIssueId: null,
        schemaRecommendationId: recommendationId,
        geoVisibilityReportId: null,
        status: existingWorkOrder?.status ?? "open",
        priority: input.draft.priority,
        title: input.draft.title,
        description: null,
        problem: input.draft.problem,
        evidence: input.draft.evidence,
        impact: input.draft.impact,
        instructions: input.draft.instructions,
        ownerType: input.draft.ownerType,
        acceptanceCriteria: input.draft.acceptanceCriteria,
        verificationMethod: input.draft.verificationMethod,
        estimatedEffort: input.draft.estimatedEffort,
        relatedIssues: input.draft.relatedIssues,
        assignedTo: existingWorkOrder?.assignedTo ?? null,
        dueDate: existingWorkOrder?.dueDate ?? null,
        createdAt: existingWorkOrder?.createdAt ?? timestamp,
        updatedAt: timestamp
      };

      if (!existingWorkOrder) {
        workOrderCounter += 1;
      }

      const convertedRecommendation: SchemaRecommendationRecord = {
        ...recommendation,
        status: "converted",
        updatedAt: timestamp
      };

      workOrders.set(workOrder.id, workOrder);
      schemaRecommendations.set(recommendationId, convertedRecommendation);

      return {
        recommendation: convertedRecommendation,
        workOrder
      };
    },

    async recheckSchemaRecommendation(recommendationId, input) {
      const recommendation = schemaRecommendations.get(recommendationId);
      if (!recommendation) {
        return null;
      }

      const timestamp = nowIso();
      const status = input.resolved
        ? "resolved"
        : recommendation.status === "resolved"
          ? "open"
          : recommendation.status;
      const updatedRecommendation: SchemaRecommendationRecord = {
        ...recommendation,
        evidence: {
          ...recommendation.evidence,
          observedTypes: [...input.observedTypes]
        },
        status,
        updatedAt: timestamp
      };

      const existingWorkOrder = [...workOrders.values()].find(
        (workOrder) => workOrder.schemaRecommendationId === recommendationId,
      );
      const updatedWorkOrder: WorkOrder | null =
        existingWorkOrder === undefined
          ? null
          : {
              ...existingWorkOrder,
              status: input.resolved
                ? "done"
                : existingWorkOrder.status === "done"
                  ? "in_review"
                  : existingWorkOrder.status,
              updatedAt: timestamp
            };

      schemaRecommendations.set(recommendationId, updatedRecommendation);
      if (updatedWorkOrder !== null) {
        workOrders.set(updatedWorkOrder.id, updatedWorkOrder);
      }

      return {
        expectedType: recommendation.type,
        observedTypes: [...input.observedTypes],
        recommendation: updatedRecommendation,
        resolved: input.resolved,
        workOrder: updatedWorkOrder
      };
    },

    async listWorkOrders(siteId) {
      if (!sites.has(siteId)) {
        return null;
      }

      return [...workOrders.values()]
        .filter((workOrder) => workOrder.siteId === siteId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
    },

    async getWorkOrder(id) {
      return workOrders.get(id) ?? null;
    },

    async updateWorkOrder(id, input) {
      const existing = workOrders.get(id);
      if (!existing) {
        return null;
      }

      const updated: WorkOrder = {
        ...existing,
        status: input.status ?? existing.status,
        priority: input.priority ?? existing.priority,
        assignedTo: input.assignedTo === undefined ? existing.assignedTo : input.assignedTo,
        dueDate: input.dueDate === undefined ? existing.dueDate : input.dueDate,
        updatedAt: nowIso()
      };
      workOrders.set(id, updated);
      return updated;
    },

    async resolveWorkOrderIssue(id) {
      const existing = workOrders.get(id);
      if (!existing) {
        return null;
      }

      const updatedWorkOrder: WorkOrder = {
        ...existing,
        status: "done",
        updatedAt: nowIso()
      };
      workOrders.set(id, updatedWorkOrder);

      const existingSeoIssue =
        existing.seoIssueId === null ? null : seoIssues.get(existing.seoIssueId) ?? null;
      const updatedSeoIssue: SeoIssue | null =
        existingSeoIssue === null
          ? null
          : {
              ...existingSeoIssue,
              status: "resolved"
            };

      if (updatedSeoIssue !== null) {
        seoIssues.set(updatedSeoIssue.id, updatedSeoIssue);
      }

      return {
        workOrder: updatedWorkOrder,
        seoIssue: updatedSeoIssue
      };
    }
  };
}
