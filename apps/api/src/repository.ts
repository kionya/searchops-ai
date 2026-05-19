import type {
  CreateOrganizationRequest,
  CreateSiteRequest,
  Organization,
  Site,
  UpdateSiteRequest
} from "@searchops/types";

export interface SearchOpsRepository {
  listOrganizations(): Promise<Organization[]>;
  createOrganization(input: CreateOrganizationRequest): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;
  listSites(organizationId: string): Promise<Site[]>;
  createSite(organizationId: string, input: CreateSiteRequest): Promise<Site | null>;
  getSite(id: string): Promise<Site | null>;
  updateSite(id: string, input: UpdateSiteRequest): Promise<Site | null>;
  deleteSite(id: string): Promise<boolean>;
}

export interface MemoryRepositorySeed {
  readonly organizations?: readonly Organization[];
  readonly sites?: readonly Site[];
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
  let organizationCounter = 1;
  let siteCounter = 1;

  for (const organization of seed.organizations ?? []) {
    organizations.set(organization.id, organization);
    organizationCounter += 1;
  }

  for (const site of seed.sites ?? []) {
    sites.set(site.id, site);
    siteCounter += 1;
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
    }
  };
}