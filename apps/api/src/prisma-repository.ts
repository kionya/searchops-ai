import {
  randomUUID
} from "node:crypto";

import {
  AeoReadinessReportRecordSchema,
  ClosedLoopAuditEventSchema,
  ComplianceFlagSchema,
  ConnectorOAuthCredentialSchema,
  ConnectorSyncResultSchema,
  ConnectorSyncRunSchema,
  ContentBriefSchema,
  CrawlRunSchema,
  GeoVisibilityReportRecordSchema,
  KeywordDiscoveryCandidateRecordSchema,
  OrganizationSchema,
  SchemaRecommendationRecordSchema,
  SeoIssueSchema,
  SiteSchema,
  WorkOrderSchema,
  type AeoReadinessReport,
  type AeoReadinessReportRecord,
  type ClosedLoopAuditEvent,
  type ComplianceFlag,
  type ComplianceReviewReport,
  type ConnectorOAuthCredential,
  type ContentBrief,
  type ConnectorSyncResult,
  type ConnectorSyncRun,
  type CrawlRun,
  type GeoVisibilityReport,
  type GeoVisibilityReportRecord,
  type JsonLdRecommendation,
  type JsonLdRecommendationSet,
  type KeywordDiscoveryCandidateRecord,
  type Organization,
  type SchemaRecommendationRecord,
  type SeoIssue,
  type Site,
  type WorkOrder,
  type WorkOrderDraft
} from "@searchops/types";
import type { Prisma, SearchOpsPrismaClient } from "@searchops/db";

import type { SearchOpsRepository } from "./repository.js";
import type { ContentBriefDraft } from "@searchops/types";

type OrganizationRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["organization"]["findFirst"]>
>;
type SiteRecord = Awaited<ReturnType<SearchOpsPrismaClient["site"]["findFirst"]>>;
type CrawlRunRecord = Awaited<ReturnType<SearchOpsPrismaClient["crawlRun"]["findFirst"]>>;
type ConnectorSyncRunRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["connectorSyncRun"]["findFirst"]>
>;
type ConnectorSyncResultRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["connectorSyncResult"]["findFirst"]>
>;
interface ConnectorOAuthCredentialRecord {
  readonly connectedAt: Date;
  readonly connectedByUserId: string;
  readonly externalAccountEmail: string | null;
  readonly id: string;
  readonly organizationId: string;
  readonly provider: string;
  readonly scopes: Prisma.JsonValue;
  readonly siteId: string;
  readonly status: string;
  readonly tokenExpiresAt: Date | null;
  readonly updatedAt: Date;
}
type ClosedLoopAuditEventRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["closedLoopAuditEvent"]["findFirst"]>
>;
type ContentBriefRecord = Awaited<ReturnType<SearchOpsPrismaClient["contentBrief"]["findFirst"]>>;
type AeoReadinessReportRecordResult = Awaited<
  ReturnType<SearchOpsPrismaClient["aeoReadinessReport"]["findFirst"]>
>;
type KeywordDiscoveryCandidateRecordResult = Awaited<
  ReturnType<SearchOpsPrismaClient["keywordDiscoveryCandidate"]["findFirst"]>
>;
type GeoVisibilityReportRecordResult = Awaited<
  ReturnType<SearchOpsPrismaClient["geoVisibilityReport"]["findFirst"]>
>;
type ComplianceFlagRecord = Awaited<
  ReturnType<SearchOpsPrismaClient["complianceFlag"]["findFirst"]>
>;
type SchemaRecommendationRecordResult = Awaited<
  ReturnType<SearchOpsPrismaClient["schemaRecommendation"]["findFirst"]>
>;
type SeoIssueRecord = Awaited<ReturnType<SearchOpsPrismaClient["seoIssue"]["findFirst"]>>;
type WorkOrderRecord = Awaited<ReturnType<SearchOpsPrismaClient["workOrder"]["findFirst"]>>;
type ComplianceFlagWithWorkOrder = NonNullable<ComplianceFlagRecord> & {
  workOrder: NonNullable<WorkOrderRecord> | null;
};

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
    },

    async createConnectorSyncRun(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true, organizationId: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      return toConnectorSyncRun(
        await prisma.connectorSyncRun.create({
          data: {
            fixture: true,
            organizationId: site.organizationId,
            providers: input.providers,
            requestedByUserId: input.requestedByUserId,
            siteId,
            status: "queued"
          }
        }),
      );
    },

    async listConnectorSyncRuns(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const connectorSyncRuns = await prisma.connectorSyncRun.findMany({
        orderBy: {
          startedAt: "desc"
        },
        where: {
          siteId
        }
      });
      return connectorSyncRuns.map(toConnectorSyncRun);
    },

    async markConnectorSyncRunFailed(id, input) {
      const connectorSyncRun = await prisma.connectorSyncRun.findUnique({
        select: { id: true },
        where: { id }
      });
      if (connectorSyncRun === null) {
        return null;
      }

      return toConnectorSyncRun(
        await prisma.connectorSyncRun.update({
          data: {
            endedAt: new Date(),
            status: "failed",
            summary: toJson({
              error: {
                message: input.message,
                name: input.name ?? "Error"
              }
            })
          },
          where: { id }
        }),
      );
    },

    async getConnectorSyncRun(id) {
      const connectorSyncRun = await prisma.connectorSyncRun.findUnique({
        where: { id }
      });
      if (connectorSyncRun === null) {
        return null;
      }

      const results = await prisma.connectorSyncResult.findMany({
        orderBy: {
          provider: "asc"
        },
        where: {
          syncRunId: id
        }
      });

      return {
        connectorSyncRun: toConnectorSyncRun(connectorSyncRun),
        results: results.map(toConnectorSyncResult)
      };
    },

    async upsertConnectorOAuthCredentials(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true, organizationId: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const credentials: ConnectorOAuthCredential[] = [];
      for (const credential of input) {
        const rows = await prisma.$queryRaw<ConnectorOAuthCredentialRecord[]>`
          INSERT INTO "ConnectorOAuthCredential" (
            "id",
            "organizationId",
            "siteId",
            "provider",
            "status",
            "scopes",
            "accessToken",
            "refreshToken",
            "tokenType",
            "tokenExpiresAt",
            "externalAccountEmail",
            "connectedByUserId",
            "connectedAt",
            "updatedAt"
          )
          VALUES (
            ${`oauth_${randomUUID()}`},
            ${site.organizationId},
            ${siteId},
            ${credential.provider},
            'connected',
            ${JSON.stringify(credential.scopes)}::jsonb,
            ${credential.accessToken},
            ${credential.refreshToken ?? null},
            ${credential.tokenType ?? null},
            ${credential.tokenExpiresAt === null || credential.tokenExpiresAt === undefined
              ? null
              : new Date(credential.tokenExpiresAt)},
            ${credential.externalAccountEmail ?? null},
            ${credential.connectedByUserId},
            ${new Date(credential.connectedAt)},
            ${new Date(credential.connectedAt)}
          )
          ON CONFLICT ("siteId", "provider") DO UPDATE SET
            "status" = 'connected',
            "scopes" = EXCLUDED."scopes",
            "accessToken" = EXCLUDED."accessToken",
            "refreshToken" = COALESCE(EXCLUDED."refreshToken", "ConnectorOAuthCredential"."refreshToken"),
            "tokenType" = EXCLUDED."tokenType",
            "tokenExpiresAt" = EXCLUDED."tokenExpiresAt",
            "externalAccountEmail" = EXCLUDED."externalAccountEmail",
            "connectedByUserId" = EXCLUDED."connectedByUserId",
            "connectedAt" = EXCLUDED."connectedAt",
            "updatedAt" = EXCLUDED."updatedAt"
          RETURNING
            "id",
            "organizationId",
            "siteId",
            "provider",
            "status",
            "scopes",
            "connectedByUserId",
            "connectedAt",
            "tokenExpiresAt",
            "externalAccountEmail",
            "updatedAt"
        `;
        const row = rows[0];
        if (row !== undefined) {
          credentials.push(toConnectorOAuthCredential(row));
        }
      }

      return credentials.sort((a, b) => a.provider.localeCompare(b.provider));
    },

    async listConnectorOAuthCredentials(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const rows = await prisma.$queryRaw<ConnectorOAuthCredentialRecord[]>`
        SELECT
          "id",
          "organizationId",
          "siteId",
          "provider",
          "status",
          "scopes",
          "connectedByUserId",
          "connectedAt",
          "tokenExpiresAt",
          "externalAccountEmail",
          "updatedAt"
        FROM "ConnectorOAuthCredential"
        WHERE "siteId" = ${siteId}
        ORDER BY "provider" ASC
      `;

      return rows.map(toConnectorOAuthCredential);
    },

    async createClosedLoopAuditEvent(input) {
      const organization = await prisma.organization.findUnique({
        select: { id: true },
        where: { id: input.organizationId }
      });
      if (organization === null) {
        return null;
      }

      if (input.siteId !== null) {
        const site = await prisma.site.findUnique({
          select: { id: true },
          where: { id: input.siteId }
        });
        if (site === null) {
          return null;
        }
      }

      return toClosedLoopAuditEvent(
        await prisma.closedLoopAuditEvent.create({
          data: {
            cmsType: input.cmsType ?? null,
            complianceFlagId: input.complianceFlagId ?? null,
            eventType: input.eventType,
            externalId: input.externalId ?? null,
            message: input.message,
            ...(input.metadata == null ? {} : { metadata: toJson(input.metadata) }),
            organizationId: input.organizationId,
            siteId: input.siteId,
            source: input.source,
            status: input.status,
            subjectId: input.subjectId ?? null,
            subjectType: input.subjectType ?? null,
            workOrderId: input.workOrderId ?? null
          }
        }),
      );
    },

    async listClosedLoopAuditEvents(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const events = await prisma.closedLoopAuditEvent.findMany({
        orderBy: [{ createdAt: "desc" }, { eventType: "asc" }, { id: "asc" }],
        where: { siteId }
      });
      return events.map(toClosedLoopAuditEvent);
    },

    async createContentBriefDraft(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null || input.draft.siteId !== siteId) {
        return null;
      }

      const keyword = await resolveContentBriefKeyword(prisma, siteId, input.draft);
      if (keyword === null) {
        return null;
      }

      return toContentBrief(
        await prisma.contentBrief.create({
          data: {
            acceptanceCriteria: input.draft.acceptanceCriteria,
            faqQuestions: input.draft.faqQuestions,
            generationMode: input.draft.generationMode,
            intent: input.draft.intent,
            keywordId: keyword.id,
            locale: input.draft.locale,
            outline: input.draft.outline,
            primaryKeyword: input.draft.primaryKeyword,
            publishPolicy: input.draft.publishPolicy,
            siteId,
            status: input.draft.status,
            summary: input.draft.summary,
            title: input.draft.title
          }
        }),
      );
    },

    async listContentBriefs(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const contentBriefs = await prisma.contentBrief.findMany({
        orderBy: [{ createdAt: "desc" }, { title: "asc" }],
        where: { siteId }
      });
      return contentBriefs.map(toContentBrief);
    },

    async getContentBrief(id) {
      return toNullableContentBrief(
        await prisma.contentBrief.findUnique({
          where: { id }
        }),
      );
    },

    async createAeoReadinessReport(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null || input.readinessReport.keyword.siteId !== siteId) {
        return null;
      }

      const keyword = await resolveAeoReadinessKeyword(
        prisma,
        siteId,
        input.keywordId ?? null,
        input.readinessReport,
      );
      if (keyword === null) {
        return null;
      }

      return toAeoReadinessReportRecord(
        await prisma.aeoReadinessReport.create({
          data: {
            checks: input.readinessReport.checks,
            evaluatedAt: new Date(input.readinessReport.evaluatedAt),
            generatedBy: input.readinessReport.generatedBy,
            intent: input.readinessReport.keyword.intent,
            keywordId: keyword.id,
            locale: input.readinessReport.keyword.locale,
            pageUrl: input.readinessReport.pageUrl,
            phrase: input.readinessReport.keyword.phrase,
            score: input.readinessReport.score,
            siteId,
            status: input.readinessReport.status
          }
        }),
      );
    },

    async listAeoReadinessReports(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const reports = await prisma.aeoReadinessReport.findMany({
        orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }, { phrase: "asc" }],
        where: { siteId }
      });
      return reports.map(toAeoReadinessReportRecord);
    },

    async createKeywordDiscoveryCandidates(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null || input.discoverySet.siteId !== siteId) {
        return null;
      }

      const records = await prisma.$transaction(async (transaction) => {
        const persisted: NonNullable<KeywordDiscoveryCandidateRecordResult>[] = [];

        for (const candidate of input.discoverySet.candidates) {
          const keyword = await transaction.keyword.upsert({
            create: {
              intent: candidate.keyword.intent,
              locale: candidate.keyword.locale,
              phrase: candidate.keyword.phrase,
              siteId
            },
            select: { id: true },
            update: {
              intent: candidate.keyword.intent
            },
            where: {
              siteId_phrase_locale: {
                locale: candidate.keyword.locale,
                phrase: candidate.keyword.phrase,
                siteId
              }
            }
          });

          persisted.push(
            await transaction.keywordDiscoveryCandidate.upsert({
              create: {
                country: candidate.keyword.country,
                discoveredAt: new Date(input.discoverySet.discoveredAt),
                evidence: candidate.evidence,
                generatedBy: input.discoverySet.generatedBy,
                intent: candidate.keyword.intent,
                keywordId: keyword.id,
                language: candidate.keyword.language,
                locale: candidate.keyword.locale,
                pageUrl: candidate.pageUrl,
                phrase: candidate.keyword.phrase,
                score: candidate.score,
                siteId,
                source: candidate.keyword.source
              },
              update: {
                country: candidate.keyword.country,
                discoveredAt: new Date(input.discoverySet.discoveredAt),
                evidence: candidate.evidence,
                generatedBy: input.discoverySet.generatedBy,
                intent: candidate.keyword.intent,
                keywordId: keyword.id,
                language: candidate.keyword.language,
                pageUrl: candidate.pageUrl,
                score: candidate.score
              },
              where: {
                siteId_phrase_locale_source: {
                  locale: candidate.keyword.locale,
                  phrase: candidate.keyword.phrase,
                  siteId,
                  source: candidate.keyword.source
                }
              }
            }),
          );
        }

        return persisted;
      });

      return records.map(toKeywordDiscoveryCandidateRecord).sort(orderKeywordDiscoveryCandidates);
    },

    async listKeywordDiscoveryCandidates(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const candidates = await prisma.keywordDiscoveryCandidate.findMany({
        orderBy: [{ score: "desc" }, { discoveredAt: "desc" }, { phrase: "asc" }],
        where: { siteId }
      });
      return candidates.map(toKeywordDiscoveryCandidateRecord);
    },

    async createGeoVisibilityReport(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null || input.visibilityReport.target.siteId !== siteId) {
        return null;
      }

      return toGeoVisibilityReportRecord(
        await prisma.geoVisibilityReport.create({
          data: buildGeoVisibilityReportCreateArgs(siteId, input.visibilityReport)
        }),
      );
    },

    async listGeoVisibilityReports(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const reports = await prisma.geoVisibilityReport.findMany({
        orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }, { brandName: "asc" }],
        where: { siteId }
      });
      return reports.map(toGeoVisibilityReportRecord);
    },

    async getGeoVisibilityReport(id) {
      return toNullableGeoVisibilityReportRecord(
        await prisma.geoVisibilityReport.findUnique({
          where: { id }
        }),
      );
    },

    async createGeoVisibilityReportWorkOrder(reportId, input) {
      return prisma.$transaction(async (transaction) => {
        const report = await transaction.geoVisibilityReport.findUnique({
          include: {
            site: {
              select: {
                organizationId: true
              }
            }
          },
          where: { id: reportId }
        });
        if (report === null) {
          return null;
        }

        const workOrder = await transaction.workOrder.upsert(
          buildGeoVisibilityReportWorkOrderUpsertArgs(
            reportId,
            report.site.organizationId,
            report.siteId,
            input.draft,
          ),
        );

        return {
          report: toGeoVisibilityReportRecord(report),
          workOrder: toWorkOrder(workOrder)
        };
      });
    },

    async createComplianceReview(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true, organizationId: true },
        where: { id: siteId }
      });
      if (site === null || input.report.input.siteId !== siteId) {
        return null;
      }

      const flags = await prisma.$transaction(
        input.report.flags.map((flag) =>
          prisma.complianceFlag.create({
            data: buildComplianceFlagCreateArgs(site.organizationId, siteId, input.report, flag)
          }),
        ),
      );

      return flags.map(toComplianceFlag);
    },

    async listComplianceFlags(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const flags = await prisma.complianceFlag.findMany({
        orderBy: [{ createdAt: "desc" }, { riskLevel: "asc" }, { message: "asc" }],
        where: { siteId }
      });
      return flags.map(toComplianceFlag);
    },

    async getComplianceFlag(id) {
      return toNullableComplianceFlag(
        await prisma.complianceFlag.findUnique({
          where: { id }
        }),
      );
    },

    async updateComplianceFlag(id, input) {
      const existing = await prisma.complianceFlag.findUnique({
        select: { id: true },
        where: { id }
      });
      if (existing === null) {
        return null;
      }

      return toComplianceFlag(
        await prisma.complianceFlag.update({
          data: {
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.workOrderId === undefined ? {} : { workOrderId: input.workOrderId })
          },
          where: { id }
        }),
      );
    },

    async createComplianceFlagWorkOrder(flagId, input) {
      return prisma.$transaction(async (transaction) => {
        const flag = await transaction.complianceFlag.findUnique({
          include: {
            workOrder: true
          },
          where: { id: flagId }
        });
        if (flag === null) {
          return null;
        }

        const workOrder =
          flag.workOrder === null
            ? await transaction.workOrder.create({
                data: buildComplianceFlagWorkOrderCreateArgs(flag, input.draft)
              })
            : await transaction.workOrder.update({
                data: buildComplianceFlagWorkOrderUpdateArgs(input.draft),
                where: { id: flag.workOrder.id }
              });
        const complianceFlag = await transaction.complianceFlag.update({
          data: {
            status:
              flag.status === "approved" || flag.status === "resolved" ? flag.status : "in_review",
            workOrderId: workOrder.id
          },
          where: { id: flagId }
        });

        return {
          complianceFlag: toComplianceFlag(complianceFlag),
          workOrder: toWorkOrder(workOrder)
        };
      });
    },

    async recheckComplianceFlag(flagId, input) {
      return prisma.$transaction(async (transaction) => {
        const flag = await transaction.complianceFlag.findUnique({
          include: {
            workOrder: true
          },
          where: { id: flagId }
        });
        if (flag === null) {
          return null;
        }

        const complianceFlag = await transaction.complianceFlag.update({
          data: buildComplianceFlagRecheckUpdateArgs(flag, input.matchingFlag, input.resolved),
          where: { id: flagId }
        });
        const workOrder =
          flag.workOrder === null
            ? null
            : toWorkOrder(
                input.resolved || flag.workOrder.status === "done"
                  ? await transaction.workOrder.update({
                      data: {
                        status: input.resolved ? "done" : "in_review"
                      },
                      where: {
                        id: flag.workOrder.id
                      }
                    })
                  : flag.workOrder,
              );

        return {
          complianceFlag: toComplianceFlag(complianceFlag),
          report: input.report,
          resolved: input.resolved,
          workOrder
        };
      });
    },

    async createSchemaRecommendations(siteId, input) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null || input.recommendationSets.some((set) => set.siteId !== siteId)) {
        return null;
      }

      const savedRecommendations: SchemaRecommendationRecord[] = [];
      for (const set of input.recommendationSets) {
        for (const recommendation of set.recommendations) {
          savedRecommendations.push(
            toSchemaRecommendationRecord(
              await prisma.schemaRecommendation.upsert(
                buildSchemaRecommendationUpsertArgs(siteId, set, recommendation),
              ),
            ),
          );
        }
      }

      return savedRecommendations;
    },

    async listSchemaRecommendations(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const recommendations = await prisma.schemaRecommendation.findMany({
        orderBy: [{ updatedAt: "desc" }, { pageUrl: "asc" }, { type: "asc" }],
        where: { siteId }
      });
      return recommendations.map(toSchemaRecommendationRecord);
    },

    async getSchemaRecommendation(id) {
      return toNullableSchemaRecommendationRecord(
        await prisma.schemaRecommendation.findUnique({
          where: { id }
        }),
      );
    },

    async createSchemaRecommendationWorkOrder(recommendationId, input) {
      return prisma.$transaction(async (transaction) => {
        const recommendation = await transaction.schemaRecommendation.findUnique({
          include: {
            site: {
              select: {
                organizationId: true
              }
            }
          },
          where: { id: recommendationId }
        });
        if (recommendation === null) {
          return null;
        }

        const workOrder = await transaction.workOrder.upsert(
          buildSchemaRecommendationWorkOrderUpsertArgs(
            recommendationId,
            recommendation.site.organizationId,
            recommendation.siteId,
            input.draft,
          ),
        );
        const convertedRecommendation = await transaction.schemaRecommendation.update({
          data: {
            status: "converted"
          },
          where: {
            id: recommendationId
          }
        });

        return {
          recommendation: toSchemaRecommendationRecord(convertedRecommendation),
          workOrder: toWorkOrder(workOrder)
        };
      });
    },

    async recheckSchemaRecommendation(recommendationId, input) {
      return prisma.$transaction(async (transaction) => {
        const recommendation = await transaction.schemaRecommendation.findUnique({
          include: {
            workOrder: true
          },
          where: { id: recommendationId }
        });
        if (recommendation === null) {
          return null;
        }

        const currentRecommendation = toSchemaRecommendationRecord(recommendation);
        const status = input.resolved
          ? "resolved"
          : currentRecommendation.status === "resolved"
            ? "open"
            : currentRecommendation.status;
        const updatedRecommendation = await transaction.schemaRecommendation.update({
          data: {
            evidence: toJson({
              ...currentRecommendation.evidence,
              observedTypes: [...input.observedTypes]
            }),
            status
          },
          where: {
            id: recommendationId
          }
        });

        const workOrder =
          recommendation.workOrder === null
            ? null
            : toWorkOrder(
                input.resolved || recommendation.workOrder.status === "done"
                  ? await transaction.workOrder.update({
                      data: {
                        status: input.resolved ? "done" : "in_review"
                      },
                      where: {
                        id: recommendation.workOrder.id
                      }
                    })
                  : recommendation.workOrder,
              );

        return {
          expectedType: currentRecommendation.type,
          observedTypes: [...input.observedTypes],
          recommendation: toSchemaRecommendationRecord(updatedRecommendation),
          resolved: input.resolved,
          workOrder
        };
      });
    },

    async listWorkOrders(siteId) {
      const site = await prisma.site.findUnique({
        select: { id: true },
        where: { id: siteId }
      });
      if (site === null) {
        return null;
      }

      const workOrders = await prisma.workOrder.findMany({
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        where: {
          siteId
        }
      });
      return workOrders.map(toWorkOrder);
    },

    async getWorkOrder(id) {
      return toNullableWorkOrder(
        await prisma.workOrder.findUnique({
          where: { id }
        }),
      );
    },

    async updateWorkOrder(id, input) {
      const existing = await prisma.workOrder.findUnique({
        select: { id: true },
        where: { id }
      });
      if (existing === null) {
        return null;
      }

      return toWorkOrder(
        await prisma.workOrder.update({
          data: {
            ...(input.assignedTo === undefined ? {} : { assignedTo: input.assignedTo }),
            ...(input.dueDate === undefined
              ? {}
              : { dueDate: input.dueDate === null ? null : new Date(input.dueDate) }),
            ...(input.priority === undefined ? {} : { priority: input.priority }),
            ...(input.status === undefined ? {} : { status: input.status })
          },
          where: { id }
        }),
      );
    },

    async resolveWorkOrderIssue(id) {
      const existing = await prisma.workOrder.findUnique({
        select: { id: true, seoIssueId: true },
        where: { id }
      });
      if (existing === null) {
        return null;
      }

      const workOrder = await prisma.workOrder.update({
        data: {
          status: "done"
        },
        where: { id }
      });
      const seoIssue =
        existing.seoIssueId === null
          ? null
          : await prisma.seoIssue.update({
              data: {
                status: "resolved"
              },
              where: {
                id: existing.seoIssueId
              }
            });

      return {
        workOrder: toWorkOrder(workOrder),
        seoIssue: toNullableSeoIssue(seoIssue)
      };
    }
  };
}

function buildSchemaRecommendationUpsertArgs(
  siteId: string,
  set: JsonLdRecommendationSet,
  recommendation: JsonLdRecommendation,
) {
  return {
    create: {
      evidence: toJson(recommendation.evidence),
      generatedBy: recommendation.generatedBy,
      instructions: toJson(recommendation.instructions),
      jsonLd: toJson(recommendation.jsonLd),
      pageUrl: set.pageUrl,
      priority: recommendation.priority,
      reason: recommendation.reason,
      recommendedFields: toJson(recommendation.recommendedFields),
      requiredFields: toJson(recommendation.requiredFields),
      siteId,
      status: "open",
      type: recommendation.type
    },
    update: {
      evidence: toJson(recommendation.evidence),
      generatedBy: recommendation.generatedBy,
      instructions: toJson(recommendation.instructions),
      jsonLd: toJson(recommendation.jsonLd),
      priority: recommendation.priority,
      reason: recommendation.reason,
      recommendedFields: toJson(recommendation.recommendedFields),
      requiredFields: toJson(recommendation.requiredFields)
    },
    where: {
      siteId_pageUrl_type: {
        pageUrl: set.pageUrl,
        siteId,
        type: recommendation.type
      }
    }
  };
}

function buildGeoVisibilityReportCreateArgs(
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

function buildComplianceFlagCreateArgs(
  organizationId: string,
  siteId: string,
  report: ComplianceReviewReport,
  flag: ComplianceReviewReport["flags"][number],
): Prisma.ComplianceFlagUncheckedCreateInput {
  return {
    evidence: toJson(flag.evidence),
    generatedBy: flag.generatedBy,
    message: flag.message,
    organizationId,
    recommendation: flag.recommendation,
    replacementSuggestion: flag.replacementSuggestion,
    riskLevel: flag.riskLevel,
    ruleId: flag.ruleId,
    siteId,
    status: flag.status,
    subjectId: report.input.subjectId,
    subjectType: report.input.subjectType,
    title: flag.title,
    url: report.input.url,
    workOrderId: null
  };
}

function buildComplianceFlagWorkOrderCreateArgs(
  flag: ComplianceFlagWithWorkOrder,
  draft: WorkOrderDraft,
): Prisma.WorkOrderUncheckedCreateInput {
  return {
    ...buildComplianceFlagWorkOrderData(draft),
    description: null,
    geoVisibilityReportId: null,
    organizationId: flag.organizationId,
    schemaRecommendationId: null,
    seoIssueId: null,
    siteId: flag.siteId,
    status: "open"
  };
}

function buildComplianceFlagWorkOrderUpdateArgs(
  draft: WorkOrderDraft,
): Prisma.WorkOrderUncheckedUpdateInput {
  return buildComplianceFlagWorkOrderData(draft);
}

function buildComplianceFlagWorkOrderData(draft: WorkOrderDraft) {
  return {
    acceptanceCriteria: toJson(draft.acceptanceCriteria),
    estimatedEffort: draft.estimatedEffort,
    evidence: toJson(draft.evidence),
    impact: draft.impact,
    instructions: toJson(draft.instructions),
    ownerType: draft.ownerType,
    priority: draft.priority,
    problem: draft.problem,
    relatedIssues: toJson(draft.relatedIssues),
    title: draft.title,
    verificationMethod: draft.verificationMethod
  };
}

function buildComplianceFlagRecheckUpdateArgs(
  flag: ComplianceFlagWithWorkOrder,
  matchingFlag: ComplianceReviewReport["flags"][number] | null,
  resolved: boolean,
): Prisma.ComplianceFlagUncheckedUpdateInput {
  const status = resolved ? "resolved" : flag.workOrderId === null ? "open" : "in_review";
  if (matchingFlag === null) {
    return { status };
  }

  return {
    evidence: toJson(matchingFlag.evidence),
    generatedBy: matchingFlag.generatedBy,
    message: matchingFlag.message,
    recommendation: matchingFlag.recommendation,
    replacementSuggestion: matchingFlag.replacementSuggestion,
    riskLevel: matchingFlag.riskLevel,
    ruleId: matchingFlag.ruleId,
    status,
    title: matchingFlag.title
  };
}

function buildSchemaRecommendationWorkOrderUpsertArgs(
  recommendationId: string,
  organizationId: string,
  siteId: string,
  draft: WorkOrderDraft,
) {
  const data = {
    acceptanceCriteria: toJson(draft.acceptanceCriteria),
    estimatedEffort: draft.estimatedEffort,
    evidence: toJson(draft.evidence),
    impact: draft.impact,
    instructions: toJson(draft.instructions),
    ownerType: draft.ownerType,
    priority: draft.priority,
    problem: draft.problem,
    relatedIssues: toJson(draft.relatedIssues),
    title: draft.title,
    verificationMethod: draft.verificationMethod
  };

  return {
    create: {
      ...data,
      description: null,
      geoVisibilityReportId: null,
      organizationId,
      schemaRecommendationId: recommendationId,
      seoIssueId: null,
      siteId,
      status: "open"
    },
    update: data,
    where: {
      schemaRecommendationId: recommendationId
    }
  };
}

function buildGeoVisibilityReportWorkOrderUpsertArgs(
  reportId: string,
  organizationId: string,
  siteId: string,
  draft: WorkOrderDraft,
) {
  const data = {
    acceptanceCriteria: toJson(draft.acceptanceCriteria),
    estimatedEffort: draft.estimatedEffort,
    evidence: toJson(draft.evidence),
    impact: draft.impact,
    instructions: toJson(draft.instructions),
    ownerType: draft.ownerType,
    priority: draft.priority,
    problem: draft.problem,
    relatedIssues: toJson(draft.relatedIssues),
    title: draft.title,
    verificationMethod: draft.verificationMethod
  };

  return {
    create: {
      ...data,
      description: null,
      geoVisibilityReportId: reportId,
      organizationId,
      schemaRecommendationId: null,
      seoIssueId: null,
      siteId,
      status: "open"
    },
    update: data,
    where: {
      geoVisibilityReportId: reportId
    }
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function resolveContentBriefKeyword(
  prisma: SearchOpsPrismaClient,
  siteId: string,
  draft: ContentBriefDraft,
) {
  if (draft.keywordId !== null) {
    return prisma.keyword.findFirst({
      select: { id: true },
      where: {
        id: draft.keywordId,
        siteId
      }
    });
  }

  return prisma.keyword.upsert({
    create: {
      intent: draft.intent,
      locale: draft.locale,
      phrase: draft.primaryKeyword,
      siteId
    },
    select: { id: true },
    update: {
      intent: draft.intent
    },
    where: {
      siteId_phrase_locale: {
        locale: draft.locale,
        phrase: draft.primaryKeyword,
        siteId
      }
    }
  });
}

async function resolveAeoReadinessKeyword(
  prisma: SearchOpsPrismaClient,
  siteId: string,
  keywordId: string | null,
  report: AeoReadinessReport,
) {
  if (keywordId !== null) {
    return prisma.keyword.findFirst({
      select: { id: true },
      where: {
        id: keywordId,
        siteId
      }
    });
  }

  return prisma.keyword.upsert({
    create: {
      intent: report.keyword.intent,
      locale: report.keyword.locale,
      phrase: report.keyword.phrase,
      siteId
    },
    select: { id: true },
    update: {
      intent: report.keyword.intent
    },
    where: {
      siteId_phrase_locale: {
        locale: report.keyword.locale,
        phrase: report.keyword.phrase,
        siteId
      }
    }
  });
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

function toConnectorSyncRun(record: NonNullable<ConnectorSyncRunRecord>): ConnectorSyncRun {
  return ConnectorSyncRunSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    status: record.status,
    providers: record.providers,
    requestedByUserId: record.requestedByUserId,
    fixture: record.fixture,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    summary: record.summary
  });
}

function toConnectorSyncResult(
  record: NonNullable<ConnectorSyncResultRecord>,
): ConnectorSyncResult {
  return ConnectorSyncResultSchema.parse({
    id: record.id,
    syncRunId: record.syncRunId,
    provider: record.provider,
    status: record.status,
    fetchedAt: record.fetchedAt.toISOString(),
    fixture: record.fixture,
    recordCount: record.recordCount,
    records: record.records,
    createdAt: record.createdAt.toISOString()
  });
}

function toConnectorOAuthCredential(
  record: ConnectorOAuthCredentialRecord,
): ConnectorOAuthCredential {
  return ConnectorOAuthCredentialSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    provider: record.provider,
    status: record.status,
    scopes: record.scopes,
    connectedByUserId: record.connectedByUserId,
    connectedAt: record.connectedAt.toISOString(),
    tokenExpiresAt: record.tokenExpiresAt?.toISOString() ?? null,
    externalAccountEmail: record.externalAccountEmail,
    updatedAt: record.updatedAt.toISOString()
  });
}

function toClosedLoopAuditEvent(
  record: NonNullable<ClosedLoopAuditEventRecord>,
): ClosedLoopAuditEvent {
  return ClosedLoopAuditEventSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    eventType: record.eventType,
    status: record.status,
    source: record.source,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    cmsType: record.cmsType,
    externalId: record.externalId,
    complianceFlagId: record.complianceFlagId,
    workOrderId: record.workOrderId,
    message: record.message,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString()
  });
}

function toContentBrief(record: NonNullable<ContentBriefRecord>): ContentBrief {
  return ContentBriefSchema.parse({
    id: record.id,
    siteId: record.siteId,
    keywordId: record.keywordId,
    primaryKeyword: record.primaryKeyword,
    locale: record.locale,
    intent: record.intent,
    title: record.title,
    status: record.status,
    summary: record.summary,
    outline: record.outline,
    faqQuestions: record.faqQuestions,
    acceptanceCriteria: record.acceptanceCriteria,
    generationMode: record.generationMode,
    publishPolicy: record.publishPolicy,
    createdAt: record.createdAt.toISOString()
  });
}

function toNullableContentBrief(record: ContentBriefRecord): ContentBrief | null {
  return record === null ? null : toContentBrief(record);
}

function toAeoReadinessReportRecord(
  record: NonNullable<AeoReadinessReportRecordResult>,
): AeoReadinessReportRecord {
  return AeoReadinessReportRecordSchema.parse({
    id: record.id,
    siteId: record.siteId,
    keywordId: record.keywordId,
    phrase: record.phrase,
    locale: record.locale,
    intent: record.intent,
    pageUrl: record.pageUrl,
    status: record.status,
    score: record.score,
    checks: record.checks,
    generatedBy: record.generatedBy,
    evaluatedAt: record.evaluatedAt.toISOString(),
    createdAt: record.createdAt.toISOString()
  });
}

function toKeywordDiscoveryCandidateRecord(
  record: NonNullable<KeywordDiscoveryCandidateRecordResult>,
): KeywordDiscoveryCandidateRecord {
  return KeywordDiscoveryCandidateRecordSchema.parse({
    id: record.id,
    siteId: record.siteId,
    keywordId: record.keywordId,
    phrase: record.phrase,
    locale: record.locale,
    language: record.language,
    country: record.country,
    intent: record.intent,
    source: record.source,
    pageUrl: record.pageUrl,
    score: record.score,
    evidence: record.evidence,
    generatedBy: record.generatedBy,
    discoveredAt: record.discoveredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  });
}

function orderKeywordDiscoveryCandidates(
  left: KeywordDiscoveryCandidateRecord,
  right: KeywordDiscoveryCandidateRecord,
) {
  return (
    right.score - left.score ||
    right.discoveredAt.localeCompare(left.discoveredAt) ||
    left.phrase.localeCompare(right.phrase)
  );
}

function toGeoVisibilityReportRecord(
  record: NonNullable<GeoVisibilityReportRecordResult>,
): GeoVisibilityReportRecord {
  return GeoVisibilityReportRecordSchema.parse({
    id: record.id,
    siteId: record.siteId,
    brandName: record.brandName,
    domain: record.domain,
    locale: record.locale,
    market: record.market,
    status: record.status,
    score: record.score,
    mentionRate: record.mentionRate,
    citationRate: record.citationRate,
    competitorCitationRate: record.competitorCitationRate,
    queryCount: record.queryCount,
    providerCount: record.providerCount,
    observations: record.observations,
    citations: record.citations,
    checks: record.checks,
    generatedBy: record.generatedBy,
    evaluatedAt: record.evaluatedAt.toISOString(),
    createdAt: record.createdAt.toISOString()
  });
}

function toSchemaRecommendationRecord(
  record: NonNullable<SchemaRecommendationRecordResult>,
): SchemaRecommendationRecord {
  return SchemaRecommendationRecordSchema.parse({
    id: record.id,
    siteId: record.siteId,
    pageUrl: record.pageUrl,
    type: record.type,
    priority: record.priority,
    status: record.status,
    reason: record.reason,
    evidence: record.evidence,
    jsonLd: record.jsonLd,
    instructions: record.instructions,
    requiredFields: record.requiredFields,
    recommendedFields: record.recommendedFields,
    generatedBy: record.generatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  });
}

function toNullableSchemaRecommendationRecord(
  record: SchemaRecommendationRecordResult,
): SchemaRecommendationRecord | null {
  return record === null ? null : toSchemaRecommendationRecord(record);
}

function toNullableGeoVisibilityReportRecord(
  record: GeoVisibilityReportRecordResult,
): GeoVisibilityReportRecord | null {
  return record === null ? null : toGeoVisibilityReportRecord(record);
}

function toComplianceFlag(record: NonNullable<ComplianceFlagRecord>): ComplianceFlag {
  return ComplianceFlagSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    workOrderId: record.workOrderId,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    ruleId: record.ruleId,
    url: record.url,
    riskLevel: record.riskLevel,
    status: record.status,
    title: record.title,
    message: record.message,
    evidence: record.evidence,
    recommendation: record.recommendation,
    replacementSuggestion: record.replacementSuggestion,
    generatedBy: record.generatedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  });
}

function toNullableComplianceFlag(record: ComplianceFlagRecord): ComplianceFlag | null {
  return record === null ? null : toComplianceFlag(record);
}

function toWorkOrder(record: NonNullable<WorkOrderRecord>): WorkOrder {
  return WorkOrderSchema.parse({
    id: record.id,
    organizationId: record.organizationId,
    siteId: record.siteId,
    seoIssueId: record.seoIssueId,
    schemaRecommendationId: record.schemaRecommendationId,
    geoVisibilityReportId: record.geoVisibilityReportId,
    status: record.status,
    priority: record.priority,
    title: record.title,
    description: record.description,
    problem: record.problem,
    evidence: record.evidence,
    impact: record.impact,
    instructions: record.instructions,
    ownerType: record.ownerType,
    acceptanceCriteria: record.acceptanceCriteria,
    verificationMethod: record.verificationMethod,
    estimatedEffort: record.estimatedEffort,
    relatedIssues: record.relatedIssues,
    assignedTo: record.assignedTo,
    dueDate: record.dueDate?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  });
}

function toNullableWorkOrder(record: WorkOrderRecord): WorkOrder | null {
  return record === null ? null : toWorkOrder(record);
}

function toSeoIssue(record: NonNullable<SeoIssueRecord>): SeoIssue {
  return SeoIssueSchema.parse({
    id: record.id,
    crawlRunId: record.crawlRunId,
    urlRecordId: record.urlRecordId,
    ruleId: record.ruleId,
    severity: record.severity,
    status: record.status,
    title: record.title,
    evidence: record.evidence,
    createdAt: record.createdAt.toISOString()
  });
}

function toNullableSeoIssue(record: SeoIssueRecord): SeoIssue | null {
  return record === null ? null : toSeoIssue(record);
}
