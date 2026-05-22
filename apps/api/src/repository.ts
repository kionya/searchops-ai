import type {
  ConnectorProviderList,
  ConnectorSyncRun,
  CrawlRun,
  CreateOrganizationRequest,
  CreateCrawlRunRequest,
  CreateSiteRequest,
  Organization,
  ResolveWorkOrderIssueResponse,
  SeoIssue,
  Site,
  UpdateSiteRequest,
  UpdateWorkOrderRequest,
  WorkOrder
} from "@searchops/types";

export interface CreateConnectorSyncRunInput {
  providers: ConnectorProviderList;
  requestedByUserId: string;
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
  readonly seoIssues?: readonly SeoIssue[];
  readonly workOrders?: readonly WorkOrder[];
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string, index: number) {
  return `${prefix}_${index.toString().padStart(4, "0")}`;
}

export function createMemoryRepository(seed: MemoryRepositorySeed = {}): SearchOpsRepository {
  const organizations = new Map<string, Organization>();
  const sites = new Map<string, Site>();
  const crawlRuns = new Map<string, CrawlRun>();
  const connectorSyncRuns = new Map<string, ConnectorSyncRun>();
  const seoIssues = new Map<string, SeoIssue>();
  const workOrders = new Map<string, WorkOrder>();
  let organizationCounter = 1;
  let siteCounter = 1;
  let crawlRunCounter = 1;
  let connectorSyncRunCounter = 1;

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

  for (const seoIssue of seed.seoIssues ?? []) {
    seoIssues.set(seoIssue.id, seoIssue);
  }

  for (const workOrder of seed.workOrders ?? []) {
    workOrders.set(workOrder.id, workOrder);
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
