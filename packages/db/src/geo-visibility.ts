import {
  GeoAnswerMonitorJobResultSchema,
  type GeoAnswerMonitorJobResult,
  type GeoVisibilityReport
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import type { Prisma } from "./generated/prisma/index.js";

export interface GeoVisibilityReportCreateArgs {
  data: Prisma.GeoVisibilityReportUncheckedCreateInput;
}

export interface GeoVisibilityPersistenceClient {
  geoVisibilityReport: {
    create(args: GeoVisibilityReportCreateArgs): Promise<unknown>;
  };
}

export interface PersistGeoAnswerMonitorJobResultOutput {
  reportCreated: boolean;
  siteId: string;
}

export function createPrismaGeoVisibilityPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "geoVisibilityReport">,
): GeoVisibilityPersistenceClient {
  return {
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

  await client.geoVisibilityReport.create({
    data: buildGeoVisibilityReportCreateArgs(result.siteId, result.visibilityReport)
  });

  return {
    reportCreated: true,
    siteId: result.siteId
  };
}

export function buildGeoVisibilityReportCreateArgs(
  siteId: string,
  report: GeoVisibilityReport,
): Prisma.GeoVisibilityReportUncheckedCreateInput {
  return {
    brandName: report.target.brandName,
    checks: toJson(report.checks),
    citationRate: report.citationRate,
    citations: toJson(report.citations),
    competitorCitationRate: report.competitorCitationRate,
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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
