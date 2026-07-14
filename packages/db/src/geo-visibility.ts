import {
  GeoAnswerMonitorJobResultSchema,
  type GeoAnswerMonitorJobResult,
  type GeoCredentialSources,
  type GeoVisibilityReport
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

export interface GeoVisibilityReportCreateArgs {
  data: Prisma.GeoVisibilityReportUncheckedCreateInput;
}

export interface GeoVisibilityPersistenceClient {
  geoVisibilityOwnership: GeoVisibilityOwnershipPort;
  geoVisibilityReport: {
    create(args: GeoVisibilityReportCreateArgs): Promise<unknown>;
  };
}

export interface GeoVisibilityOwnershipInput {
  readonly organizationId: string;
  readonly siteId: string;
}

export interface GeoVisibilityOwnershipPort {
  verify(input: GeoVisibilityOwnershipInput): Promise<boolean>;
  persist(input: { readonly result: GeoAnswerMonitorJobResult }): Promise<boolean>;
}

export interface PersistGeoAnswerMonitorJobResultOutput {
  reportCreated: boolean;
  siteId: string;
}

export function createPrismaGeoVisibilityPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "$transaction" | "geoVisibilityReport" | "site">,
): GeoVisibilityPersistenceClient {
  return {
    geoVisibilityOwnership: {
      async verify(input) {
        const site = await prisma.site.findFirst({
          select: { id: true },
          where: geoVisibilityOwnershipWhere(input),
        });
        return site !== null;
      },
      async persist(input) {
        return prisma.$transaction(async (transaction) => {
          const ownership = geoVisibilityOwnershipFromResult(input.result);
          const site = await transaction.site.findFirst({
            select: { id: true },
            where: geoVisibilityOwnershipWhere(ownership),
          });
          if (site === null) {
            return false;
          }
          await transaction.geoVisibilityReport.create({
            data: buildGeoVisibilityReportCreateArgs(
              input.result.siteId,
              input.result.visibilityReport,
              input.result.credentialSources,
            ),
          });
          return true;
        });
      },
    },
    geoVisibilityReport: {
      async create(args) {
        return prisma.geoVisibilityReport.create(args);
      }
    }
  };
}

export async function persistGeoAnswerMonitorJobResult(
  client: GeoVisibilityPersistenceClient,
  input: GeoAnswerMonitorJobResult,
): Promise<PersistGeoAnswerMonitorJobResultOutput> {
  const result = GeoAnswerMonitorJobResultSchema.parse(input);

  const persisted = await client.geoVisibilityOwnership.persist({
    result,
  });
  if (!persisted) {
    throw new Error("geo_site_ownership_mismatch");
  }

  return {
    reportCreated: true,
    siteId: result.siteId
  };
}

export function buildGeoVisibilityReportCreateArgs(
  siteId: string,
  report: GeoVisibilityReport,
  credentialSources: GeoCredentialSources = {},
): Prisma.GeoVisibilityReportUncheckedCreateInput {
  return {
    brandName: report.target.brandName,
    checks: toJson(report.checks),
    citationRate: report.citationRate,
    citations: toJson(report.citations),
    competitorCitationRate: report.competitorCitationRate,
    credentialSources: toJson(credentialSources),
    domain: report.target.domain,
    evaluatedAt: new Date(report.evaluatedAt),
    generatedBy: report.generatedBy,
    locale: report.target.locale,
    market: report.target.market,
    mentionRate: report.mentionRate,
    observations: toJson(report.observations),
    providerCount: report.providerCount,
    queryCount: report.queryCount,
    score: report.score,
    siteId,
    status: report.status
  };
}

export async function verifyGeoVisibilitySiteOwnership(
  client: GeoVisibilityPersistenceClient,
  input: GeoVisibilityOwnershipInput,
): Promise<boolean> {
  return client.geoVisibilityOwnership.verify(input);
}

function geoVisibilityOwnershipFromResult(
  result: GeoAnswerMonitorJobResult,
): GeoVisibilityOwnershipInput {
  return {
    organizationId: result.organizationId,
    siteId: result.siteId,
  };
}

function geoVisibilityOwnershipWhere(input: GeoVisibilityOwnershipInput) {
  return {
    id: input.siteId,
    organizationId: input.organizationId,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
