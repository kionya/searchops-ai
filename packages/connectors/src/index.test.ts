import { describe, expect, it } from "vitest";

import {
  connectorAuthModes,
  connectorProviders,
  connectorsPackage,
  createConnectorRunResult,
  liveExternalApisDefault,
  mockBingUrlInspectionFixture,
  mockCmsPagesFixture,
  mockGa4ReportFixture,
  mockGscSearchAnalyticsFixture,
  mockPageSpeedFixture,
  normalizeBingUrlInspection,
  normalizeCmsPages,
  normalizeConnectorFixture,
  normalizeGa4Report,
  normalizeGscSearchAnalytics,
  normalizePageSpeed
} from "./index.js";

describe("connectors foundation", () => {
  it("keeps live external APIs disabled by default", () => {
    expect(liveExternalApisDefault).toBe("disabled");
  });

  it("identifies the package", () => {
    expect(connectorsPackage).toBe("connectors");
  });

  it("defines supported connector providers and auth boundaries", () => {
    expect(connectorProviders).toEqual(["gsc", "ga4", "pagespeed", "bing", "cms"]);
    expect(connectorAuthModes).toEqual({
      bing: "api_key",
      cms: "api_key",
      ga4: "oauth",
      gsc: "oauth",
      pagespeed: "api_key"
    });
  });

  it("normalizes Google Search Console fixtures deterministically", () => {
    const records = normalizeGscSearchAnalytics(mockGscSearchAnalyticsFixture);

    expect(records.map((record) => record.provider)).toEqual(["gsc", "gsc"]);
    expect(records.map((record) => record.page)).toEqual([
      "https://example-clinic.com/blog/seo-basics",
      "https://example-clinic.com/service/seo"
    ]);
    expect(records[1]).toMatchObject({ clicks: 12, country: "KR", query: "seo clinic" });
  });

  it("normalizes GA4 fixtures from string metrics", () => {
    const records = normalizeGa4Report(mockGa4ReportFixture);

    expect(records.map((record) => record.pagePath)).toEqual(["/", "/service/seo"]);
    expect(records[1]).toMatchObject({
      conversions: 4,
      engagedSessions: 31,
      provider: "ga4",
      sessions: 42,
      totalUsers: 36
    });
  });

  it("normalizes PageSpeed fixtures into percent scores", () => {
    const records = normalizePageSpeed(mockPageSpeedFixture);

    expect(records).toEqual([
      {
        provider: "pagespeed",
        url: "https://example-clinic.com/service/seo",
        strategy: "mobile",
        performanceScore: 91,
        accessibilityScore: 88,
        seoScore: 95,
        largestContentfulPaintMs: 2120,
        cumulativeLayoutShift: 0.03,
        interactionToNextPaintMs: 180,
        fetchedAt: "2026-05-22T00:00:00.000Z"
      }
    ]);
  });

  it("normalizes Bing URL inspection fixtures", () => {
    const records = normalizeBingUrlInspection(mockBingUrlInspectionFixture);

    expect(records.map((record) => record.url)).toEqual([
      "https://example-clinic.com/draft",
      "https://example-clinic.com/service/seo"
    ]);
    expect(records[0]).toMatchObject({ clicks: 0, indexed: false, provider: "bing" });
  });

  it("normalizes CMS page fixtures", () => {
    const records = normalizeCmsPages(mockCmsPagesFixture);

    expect(records.map((record) => record.externalId)).toEqual(["wp_102", "wp_101"]);
    expect(records[1]).toMatchObject({
      cmsType: "wordpress",
      provider: "cms",
      status: "published",
      title: "SEO service"
    });
  });

  it("normalizes fixtures through the common connector boundary", () => {
    expect(normalizeConnectorFixture("gsc", mockGscSearchAnalyticsFixture)).toHaveLength(2);
    expect(normalizeConnectorFixture("ga4", mockGa4ReportFixture)).toHaveLength(2);
    expect(normalizeConnectorFixture("pagespeed", mockPageSpeedFixture)).toHaveLength(1);
    expect(normalizeConnectorFixture("bing", mockBingUrlInspectionFixture)).toHaveLength(2);
    expect(normalizeConnectorFixture("cms", mockCmsPagesFixture)).toHaveLength(2);
  });

  it("wraps normalized records in a connector run result", () => {
    const records = normalizeConnectorFixture("pagespeed", mockPageSpeedFixture);
    const result = createConnectorRunResult({
      fetchedAt: "2026-05-22T00:00:00.000Z",
      provider: "pagespeed",
      records
    });

    expect(result).toMatchObject({
      fixture: true,
      provider: "pagespeed",
      status: "ok"
    });
    expect(result.records).toHaveLength(1);
  });
});
