import {
  CrawlRunSchema,
  OrganizationSchema,
  SiteSchema,
  type CrawlRun,
  type Organization,
  type Site
} from "@searchops/types";
import type { SearchOpsPrismaClient } from "@searchops/db";

import type { SearchOpsRepository } from "./repository.js";

type OrganizationRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["organization"]["findFirst"]>
>;
type SiteRecord = Awaited<ReturnType<SearchOpsPrismaClient["site"]["findFirst"]>>;
type CrawlRunRecord = Awaited<ReturnType<SearchOpsPrismaClient["crawlRun"]["findFirst"]>>;

export function createPrismaRepository(prisma: SearchOpsPrismaClient): SearchOpsRepository {
  return {
    async listOrganizations() {
      const organizations = await prisma.organization.findMany({
        orderBy: {
          name: "asc"
        }
      });
      return organizations.map(toOrganization);
    },

    async createOrganization(input) {
      return toOrganization(
        await prisma.organization.create({
          data: {
            name: input.name
          }
        }),
      );
    },

    async getOrganization(id) {
      return toNullableOrganization(
        await prisma.organization.findUnique({
          where: { id }
        }),
      );
    },

    async listSites(organizationId) {
      const sites = await prisma.site.findMany({
        orderBy: {
          domain: "asc"
        },
        where: {
          organizationId
        }
      });
      return sites.map(toSite);
    },

    async createSite(organizationId, input) {
      const organization = await prisma.organization.findUnique({
        select: { id: true },
        where: { id: organizationId }
      });
      if (organization === null) {
        return null;
      }

      return toSite(
        await prisma.site.create({
          data: {
            country: input.country,
            domain: input.domain,
            industry: input.industry ?? null,
            language: input.language,
            name: input.name ?? null,
            organizationId
          }
        }),
      );
    },

    async getSite(id) {
      return toNullableSite(
        await prisma.site.findUnique({
          where: { id }
        }),
      );
    },

    async updateSite(id, input) {
      const existing = await prisma.site.findUnique({
        select: { id: true },
        where: { id }
      });
      if (existing === null) {
        return null;
      }

      return toSite(
        await prisma.site.update({
          data: {
            ...(input.country === undefined ? {} : { country: input.country }),
            ...(input.domain === undefined ? {} : { domain: input.domain }),
            ...(input.industry === undefined ? {} : { industry: input.industry }),
            ...(input.language === undefined ? {} : { language: input.language }),
            ...(input.name === undefined ? {} : { name: input.name })
          },
          where: { id }
        }),
      );
    },

    async deleteSite(id) {
      const existing = await prisma.site.findUnique({
        select: { id: true },
        where: { id }
      });
      if (existing === null) {
        return false;
      }

      await prisma.site.delete({
        where: { id }
      });
      return true;
    },

    async createCrawlRun(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      return toCrawlRun(
        await prisma.crawlRun.create({
          data: {
            siteId,
            status: "queued",
            summary: {
              maxPages: input.maxPages,
              startUrl: input.startUrl ?? null
            }
          }
        }),
      );
    },

    async getCrawlRun(id) {
      return toNullableCrawlRun(
        await prisma.crawlRun.findUnique({
          where: { id }
        }),
      );
    },

    async listCrawlRuns(siteId) {
      const crawlRuns = await prisma.crawlRun.findMany({
        orderBy: {
          startedAt: "asc"
        },
        where: {
          siteId
        }
      });
      return crawlRuns.map(toCrawlRun);
    }
  };
}

function toOrganization(record: NonNullable<OrganizationRecord>): Organization {
  return OrganizationSchema.parse({
    id: record.id,
    name: record.name,
    createdAt: record.createdAt.toISOString()
  });
}

function toNullableOrganization(record: OrganizationRecord): Organization | null {
  return record === null ? null : toOrganization(record);
}

function toSite(record: NonNullable<SiteRecord>): Site {
  return SiteSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    domain: record.domain,
    name: record.name,
    industry: record.industry,
    language: record.language,
    country: record.country,
    createdAt: record.createdAt.toISOString()
  });
}

function toNullableSite(record: SiteRecord): Site | null {
  return record === null ? null : toSite(record);
}

function toCrawlRun(record: NonNullable<CrawlRunRecord>): CrawlRun {
  return CrawlRunSchema.parse({
    id: record.id,
    siteId: record.siteId,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    summary: record.summary
  });
}

function toNullableCrawlRun(record: CrawlRunRecord): CrawlRun | null {
  return record === null ? null : toCrawlRun(record);
}
