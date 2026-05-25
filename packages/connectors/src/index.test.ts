import { describe, expect, it } from "vitest";

import {
  connectorAuthModes,
  connectorProviders,
  connectorsPackage,
  createConnectorRunResult,
  createFixtureConnectorAdapter,
  createLiveGeoAnswerMonitorAdapter,
  discoverKeywordTargetsFromConnectorResults,
  fixtureConnectorAdapters,
  fixtureGeoAnswerMonitorAdapters,
  getFixtureConnectorAdapter,
  getFixtureGeoAnswerMonitorAdapter,
  geoAnswerMonitorProviders,
  liveExternalApisDefault,
  liveExternalApisEnabled,
  mockBingUrlInspectionFixture,
  mockCmsPagesFixture,
  mockChatGptGeoAnswerFixture,
  mockGa4ReportFixture,
  mockGscSearchAnalyticsFixture,
  mockPageSpeedFixture,
  mockPerplexityGeoAnswerFixture,
  monitorFixtureGeoAnswers,
  monitorFixtureGeoAnswersBatch,
  normalizeBingUrlInspection,
  normalizeCmsPages,
  normalizeConnectorFixture,
  normalizeGeoAnswerMonitoringFixture,
  normalizeGa4Report,
  normalizeGscSearchAnalytics,
  normalizePageSpeed,
  summarizeConnectorRunResults,
  syncFixtureConnector,
  syncFixtureConnectors
} from "./index.js";

describe("connectors foundation", () => {
  it("keeps live external APIs disabled by default", () => {
    expect(liveExternalApisDefault).toBe("disabled");
    expect(liveExternalApisEnabled).toBe("enabled");
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

  it("registers fixture adapters for every supported provider", () => {
    expect(Object.keys(fixtureConnectorAdapters).sort()).toEqual([...connectorProviders].sort());
    expect(getFixtureConnectorAdapter("gsc")).toMatchObject({
      authMode: "oauth",
      liveExternalApis: "disabled",
      provider: "gsc"
    });
  });

  it("syncs fixture adapters through a common async port", async () => {
    const result = await syncFixtureConnector("pagespeed", {
      fetchedAt: "2026-05-22T01:00:00.000Z"
    });

    expect(result).toMatchObject({
      fetchedAt: "2026-05-22T01:00:00.000Z",
      fixture: true,
      provider: "pagespeed",
      status: "ok"
    });
    expect(result.records).toHaveLength(1);
  });

  it("builds custom fixture adapters without enabling live APIs", async () => {
    const adapter = createFixtureConnectorAdapter({
      fixture: mockCmsPagesFixture,
      provider: "cms"
    });
    const result = await adapter.sync({ fetchedAt: "2026-05-22T02:00:00.000Z" });

    expect(adapter.liveExternalApis).toBe("disabled");
    expect(result.records.map((record) => record.provider)).toEqual(["cms", "cms"]);
  });

  it("syncs all fixture adapters as a deterministic batch", async () => {
    const batch = await syncFixtureConnectors({
      fetchedAt: "2026-05-22T03:00:00.000Z"
    });

    expect(batch.results.map((result) => result.provider)).toEqual([
      "gsc",
      "ga4",
      "pagespeed",
      "bing",
      "cms"
    ]);
    expect(batch.summary).toEqual({
      failedProviders: 0,
      okProviders: 5,
      partialProviders: 0,
      recordCountsByProvider: {
        bing: 2,
        cms: 2,
        ga4: 2,
        gsc: 2,
        pagespeed: 1
      },
      totalProviders: 5,
      totalRecords: 9
    });
  });

  it("syncs selected fixture providers in canonical provider order", async () => {
    const batch = await syncFixtureConnectors({
      fetchedAt: "2026-05-22T04:00:00.000Z",
      providers: ["cms", "gsc"]
    });

    expect(batch.results.map((result) => result.provider)).toEqual(["gsc", "cms"]);
    expect(batch.summary.recordCountsByProvider).toMatchObject({ cms: 2, gsc: 2 });
    expect(batch.summary.totalRecords).toBe(4);
  });

  it("summarizes mixed connector run statuses", () => {
    const pagespeedRecords = normalizeConnectorFixture("pagespeed", mockPageSpeedFixture);
    const summary = summarizeConnectorRunResults([
      createConnectorRunResult({
        fetchedAt: "2026-05-22T05:00:00.000Z",
        provider: "pagespeed",
        records: pagespeedRecords
      }),
      createConnectorRunResult({
        fetchedAt: "2026-05-22T05:00:00.000Z",
        provider: "cms",
        records: normalizeConnectorFixture("cms", mockCmsPagesFixture),
        status: "partial"
      })
    ]);

    expect(summary).toMatchObject({
      failedProviders: 0,
      okProviders: 1,
      partialProviders: 1,
      totalProviders: 2,
      totalRecords: 3
    });
  });

  it("normalizes GEO answer monitor fixtures into typed observations", () => {
    const observations = normalizeGeoAnswerMonitoringFixture(mockChatGptGeoAnswerFixture, {
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      },
      queries: [
        { query: "best seo clinic" },
        { locale: "en-US", query: "missing query" }
      ],
      observedAt: "2026-05-25T01:00:00.000Z"
    });

    expect(observations).toEqual([
      {
        answerText:
          "Example Clinic is a relevant option for medical SEO planning and cites its service page.",
        citedUrls: ["https://example-clinic.com/service/seo"],
        locale: "ko-KR",
        observedAt: "2026-05-25T01:00:00.000Z",
        provider: "chatgpt",
        query: "best seo clinic",
        source: "fixture"
      },
      {
        answerText: "",
        citedUrls: [],
        locale: "en-US",
        observedAt: "2026-05-25T01:00:00.000Z",
        provider: "chatgpt",
        query: "missing query",
        source: "fixture"
      }
    ]);
  });

  it("registers GEO answer fixture adapters without enabling live AI APIs", async () => {
    expect(geoAnswerMonitorProviders).toEqual([
      "chatgpt",
      "perplexity",
      "gemini",
      "copilot",
      "claude"
    ]);
    expect(Object.keys(fixtureGeoAnswerMonitorAdapters).sort()).toEqual([
      "chatgpt",
      "claude",
      "copilot",
      "gemini",
      "perplexity"
    ]);

    const adapter = getFixtureGeoAnswerMonitorAdapter("perplexity");
    const result = await adapter.monitor({
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      },
      queries: [{ query: "best seo clinic" }]
    });

    expect(adapter.liveExternalApis).toBe("disabled");
    expect(result).toMatchObject({
      generatedBy: "fixture",
      liveExternalApis: "disabled",
      provider: "perplexity"
    });
    expect(result.observations[0]).toMatchObject({
      answerText:
        "For best SEO clinic research, Example Clinic and another agency are both mentioned.",
      provider: "perplexity",
      source: "fixture"
    });
  });

  it("monitors fixture GEO answers in canonical provider order", async () => {
    const batch = await monitorFixtureGeoAnswersBatch({
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      },
      providers: ["perplexity", "chatgpt"],
      queries: [{ query: "best seo clinic" }]
    });

    expect(batch.results.map((result) => result.provider)).toEqual(["chatgpt", "perplexity"]);
    expect(batch.observations).toHaveLength(2);
    expect(batch.observations.map((observation) => observation.provider)).toEqual([
      "chatgpt",
      "perplexity"
    ]);
  });

  it("keeps direct GEO answer fixture monitors deterministic", async () => {
    const request = {
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      },
      queries: [{ query: "clinic content marketing" }],
      observedAt: "2026-05-25T02:00:00.000Z"
    };
    const first = await monitorFixtureGeoAnswers("perplexity", request);
    const second = await monitorFixtureGeoAnswers("perplexity", request);

    expect(second).toEqual(first);
    expect(mockPerplexityGeoAnswerFixture.provider).toBe("perplexity");
  });

  it("wraps injected live GEO answer clients behind the connector boundary", async () => {
    const calls: unknown[] = [];
    const adapter = createLiveGeoAnswerMonitorAdapter({
      client: {
        provider: "chatgpt",
        async ask(input) {
          calls.push(input);
          return {
            answerText: `${input.target.brandName} is cited for ${input.query}.`,
            citedUrls: [`https://${input.target.domain}/service/seo`]
          };
        }
      },
      observedAt: () => "2026-05-25T03:00:00.000Z"
    });

    const result = await adapter.monitor({
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      },
      queries: [{ query: "best seo clinic" }]
    });

    expect(adapter.liveExternalApis).toBe("enabled");
    expect(calls).toEqual([
      {
        observedAt: "2026-05-25T03:00:00.000Z",
        query: "best seo clinic",
        queryLocale: "ko-KR",
        target: {
          brandName: "Example Clinic",
          domain: "example-clinic.com",
          locale: "ko-KR",
          market: "KR",
          siteId: "site_1"
        }
      }
    ]);
    expect(result).toEqual({
      generatedBy: "connector",
      liveExternalApis: "enabled",
      observations: [
        {
          answerText: "Example Clinic is cited for best seo clinic.",
          citedUrls: ["https://example-clinic.com/service/seo"],
          locale: "ko-KR",
          observedAt: "2026-05-25T03:00:00.000Z",
          provider: "chatgpt",
          query: "best seo clinic",
          source: "connector"
        }
      ],
      provider: "chatgpt"
    });
  });

  it("rejects live GEO answer adapter provider mismatches", () => {
    expect(() =>
      createLiveGeoAnswerMonitorAdapter({
        client: {
          provider: "chatgpt",
          async ask() {
            return {
              answerText: "",
              citedUrls: []
            };
          }
        },
        provider: "perplexity"
      }),
    ).toThrow(/provider mismatch/);
  });

  it("discovers keyword targets from connector run results deterministically", async () => {
    const batch = await syncFixtureConnectors({
      fetchedAt: "2026-05-25T00:00:00.000Z",
      providers: ["gsc", "cms"]
    });
    const discoverySet = discoverKeywordTargetsFromConnectorResults(batch.results, {
      discoveredAt: "2026-05-25T00:00:00.000Z",
      siteId: "site_1"
    });

    expect(discoverySet).toMatchObject({
      generatedBy: "deterministic",
      siteId: "site_1"
    });
    expect(discoverySet.candidates.map((candidate) => candidate.keyword.phrase)).toEqual([
      "seo clinic",
      "clinic content marketing",
      "seo service"
    ]);
    expect(discoverySet.candidates.map((candidate) => candidate.keyword.source)).toEqual([
      "gsc",
      "gsc",
      "cms"
    ]);
    expect(discoverySet.candidates[0]).toMatchObject({
      pageUrl: "https://example-clinic.com/service/seo",
      score: 308,
      evidence: {
        clicks: 12,
        impressions: 120,
        provider: "gsc",
        sourceField: "query"
      }
    });
  });

  it("filters and limits discovered keyword targets without live APIs", async () => {
    const batch = await syncFixtureConnectors({
      fetchedAt: "2026-05-25T00:00:00.000Z",
      providers: ["gsc", "cms"]
    });
    const discoverySet = discoverKeywordTargetsFromConnectorResults(batch.results, {
      discoveredAt: "2026-05-25T00:00:00.000Z",
      maxCandidates: 1,
      minImpressions: 100,
      siteId: "site_1"
    });

    expect(discoverySet.candidates.map((candidate) => candidate.keyword.phrase)).toEqual([
      "seo clinic"
    ]);
  });
});
