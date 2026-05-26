import { describe, expect, it } from "vitest";

import type { GeoAnswerMonitorJobResult, GeoVisibilityReport } from "@searchops/types";

import {
  buildGeoVisibilityReportCreateArgs,
  persistGeoAnswerMonitorJobResult,
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
    expect(buildGeoVisibilityReportCreateArgs("site_geo", visibilityReport)).toMatchObject({
      brandName: "Example Clinic",
      citationRate: 100,
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
      monitorResults: [
        {
          provider: "chatgpt",
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
      data: {
        brandName: "Example Clinic",
        siteId: "site_geo",
        status: "strong"
      }
    });
  });
});
