import { describe, expect, it } from "vitest";

import type { GeoAnswerMonitorJobResult, GeoVisibilityReport } from "@searchops/types";

import {
  buildGeoVisibilityReportCreateArgs,
  createPrismaGeoVisibilityPersistenceClient,
  persistGeoAnswerMonitorJobResult,
  verifyGeoVisibilitySiteOwnership,
  type GeoVisibilityPersistenceClient
} from "./geo-visibility.js";

const visibilityReport: GeoVisibilityReport = {
  target: {
    siteId: "site_geo",
    brandName: "Example Clinic",
    domain: "exampleclinic.com",
    locale: "ko-KR",
    market: "KR"
  },
  status: "strong",
  score: 100,
  mentionRate: 100,
  citationRate: 100,
  competitorCitationRate: 0,
  queryCount: 1,
  providerCount: 1,
  observations: [
    {
      provider: "chatgpt",
      query: "best seo clinic",
      locale: "ko-KR",
      answerText: "Example Clinic is cited for SEO clinic research.",
      citedUrls: ["https://exampleclinic.com/services/seo"],
      observedAt: "2026-05-26T00:00:00.000Z",
      source: "connector"
    }
  ],
  citations: [
    {
      url: "https://exampleclinic.com/services/seo",
      domain: "exampleclinic.com",
      owned: true
    }
  ],
  checks: [
    {
      checkId: "BRAND_MENTIONED",
      status: "pass",
      score: 100,
      evidence: {
        observedValue: 1,
        expectedValue: "At least one brand mention",
        sourceField: "answerText"
      }
    }
  ],
  generatedBy: "deterministic",
  evaluatedAt: "2026-05-26T00:00:00.000Z"
};

describe("geo visibility persistence", () => {
  it("builds Prisma create args from deterministic GEO visibility reports", () => {
    expect(
      buildGeoVisibilityReportCreateArgs("site_geo", visibilityReport, {
        chatgpt: "encrypted",
      }),
    ).toMatchObject({
      brandName: "Example Clinic",
      citationRate: 100,
      credentialSources: { chatgpt: "encrypted" },
      domain: "exampleclinic.com",
      generatedBy: "deterministic",
      mentionRate: 100,
      providerCount: 1,
      queryCount: 1,
      score: 100,
      siteId: "site_geo",
      status: "strong"
    });
  });

  it("persists GEO answer monitor job results through the client boundary", async () => {
    const creates: unknown[] = [];
    const client: GeoVisibilityPersistenceClient = {
      geoVisibilityOwnership: {
        async verify() {
          return true;
        },
        async persist(input) {
          creates.push(
            buildGeoVisibilityReportCreateArgs(
              input.result.siteId,
              input.result.visibilityReport,
              input.result.credentialSources,
            ),
          );
          return true;
        },
      },
      geoVisibilityReport: {
        async create(args) {
          creates.push(args);
          return args;
        }
      }
    };
    const result: GeoAnswerMonitorJobResult = {
      organizationId: "org_geo",
      siteId: "site_geo",
      siteDomain: "exampleclinic.com",
      requestedByUserId: "user_geo",
      observedAt: "2026-05-26T00:00:00.000Z",
      providers: ["chatgpt"],
      credentialSources: { chatgpt: "encrypted" },
      monitorResults: [
        {
          provider: "chatgpt",
          status: "ok",
          observations: visibilityReport.observations,
          generatedBy: "connector",
          liveExternalApis: "enabled"
        }
      ],
      visibilityReport
    };

    await expect(persistGeoAnswerMonitorJobResult(client, result)).resolves.toEqual({
      reportCreated: true,
      siteId: "site_geo"
    });
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      brandName: "Example Clinic",
      credentialSources: { chatgpt: "encrypted" },
      siteId: "site_geo",
      status: "strong"
    });
  });

  it("uses organization-scoped site selectors before and inside the create transaction", async () => {
    const calls: unknown[] = [];
    const transaction = {
      site: {
        async findFirst(args: unknown) {
          calls.push(["transaction-site", args]);
          return { id: "site_geo" };
        },
      },
      geoVisibilityReport: {
        async create(args: unknown) {
          calls.push(["transaction-create", args]);
          return args;
        },
      },
    };
    const prisma = {
      async $transaction(operation: (client: typeof transaction) => Promise<unknown>) {
        calls.push(["transaction"]);
        return operation(transaction);
      },
      geoVisibilityReport: {},
      site: {
        async findFirst(args: unknown) {
          calls.push(["site", args]);
          return { id: "site_geo" };
        },
      },
    } as never;
    const client = createPrismaGeoVisibilityPersistenceClient(prisma);
    const result: GeoAnswerMonitorJobResult = {
      organizationId: "org_geo",
      siteId: "site_geo",
      siteDomain: "exampleclinic.com",
      requestedByUserId: "user_geo",
      observedAt: "2026-05-26T00:00:00.000Z",
      providers: ["chatgpt"],
      credentialSources: { chatgpt: "platform" },
      monitorResults: [
        {
          provider: "chatgpt",
          status: "ok",
          observations: visibilityReport.observations,
          generatedBy: "connector",
          liveExternalApis: "enabled",
        },
      ],
      visibilityReport,
    };

    await expect(
      verifyGeoVisibilitySiteOwnership(client, {
        organizationId: "org_geo",
        siteId: "site_geo",
      }),
    ).resolves.toBe(true);
    await expect(persistGeoAnswerMonitorJobResult(client, result)).resolves.toMatchObject({
      reportCreated: true,
    });

    const ownershipSelector = {
      select: { id: true },
      where: { id: "site_geo", organizationId: "org_geo" },
    };
    expect(calls).toEqual([
      ["site", ownershipSelector],
      ["transaction"],
      ["transaction-site", ownershipSelector],
      [
        "transaction-create",
        expect.objectContaining({
          data: expect.objectContaining({
            credentialSources: { chatgpt: "platform" },
            siteId: "site_geo",
          }),
        }),
      ],
    ]);
  });

  it("performs no GEO report write when transactional ownership recheck fails", async () => {
    let creates = 0;
    const transaction = {
      site: { async findFirst() { return null; } },
      geoVisibilityReport: { async create() { creates += 1; } },
    };
    const prisma = {
      async $transaction(operation: (client: typeof transaction) => Promise<unknown>) {
        return operation(transaction);
      },
      geoVisibilityReport: {},
      site: { async findFirst() { return { id: "site_geo" }; } },
    } as never;
    const client = createPrismaGeoVisibilityPersistenceClient(prisma);
    const result = {
      organizationId: "org_foreign",
      siteId: "site_geo",
      siteDomain: "exampleclinic.com",
      requestedByUserId: "user_geo",
      observedAt: "2026-05-26T00:00:00.000Z",
      providers: ["chatgpt"],
      credentialSources: {},
      monitorResults: [
        {
          provider: "chatgpt",
          status: "setup_required",
          observations: [],
          generatedBy: "connector",
          liveExternalApis: "enabled",
          error: {
            code: "account_missing",
            message: "GEO provider credential is not configured.",
          },
        },
      ],
      visibilityReport: { ...visibilityReport, observations: [] },
    } as GeoAnswerMonitorJobResult;

    await expect(persistGeoAnswerMonitorJobResult(client, result)).rejects.toThrow(
      "geo_site_ownership_mismatch",
    );
    expect(creates).toBe(0);
  });
});
