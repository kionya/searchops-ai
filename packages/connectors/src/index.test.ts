import { describe, expect, it } from "vitest";

import {
  connectorAuthModes,
  connectorProviders,
  connectorsPackage,
  createConnectorRunResult,
  createFixtureConnectorAdapter,
  createLiveBingConnectorAdapter,
  createLiveGa4ConnectorAdapter,
  createLiveGeoAnswerMonitorAdapter,
  createLiveGscConnectorAdapter,
  createLivePageSpeedConnectorAdapter,
  createLiveSchemaRichResultValidatorAdapter,
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
  syncFixtureConnectors,
  syncLiveConnectors
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

  it("wraps injected live rich-result validator clients behind the connector boundary", async () => {
    const calls: unknown[] = [];
    const adapter = createLiveSchemaRichResultValidatorAdapter({
      client: {
        async validate(input) {
          calls.push(input);
          return {
            eligible: true,
            issues: [],
            missingRecommendedFields: [],
            missingRequiredFields: [],
            status: "eligible"
          };
        }
      },
      requestedAt: () => "2026-05-25T04:00:00.000Z"
    });

    const result = await adapter.validate({
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "SEO service",
        provider: {
          "@type": "Organization",
          name: "Example Clinic"
        },
        url: "https://example-clinic.com/service/seo"
      },
      recommendedFields: ["description"],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      type: "Service",
      url: "https://example-clinic.com/service/seo"
    });

    expect(adapter.liveExternalApis).toBe("enabled");
    expect(calls).toEqual([
      {
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Service",
          name: "SEO service",
          provider: {
            "@type": "Organization",
            name: "Example Clinic"
          },
          url: "https://example-clinic.com/service/seo"
        },
        recommendedFields: ["description"],
        requestedAt: "2026-05-25T04:00:00.000Z",
        requiredFields: ["@context", "@type", "name", "provider", "url"],
        type: "Service",
        url: "https://example-clinic.com/service/seo"
      }
    ]);
    expect(result).toEqual({
      eligible: true,
      generatedBy: "connector",
      issues: [],
      liveExternalApis: "enabled",
      missingRecommendedFields: [],
      missingRequiredFields: [],
      recommendedFields: ["description"],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      status: "eligible",
      type: "Service",
      url: "https://example-clinic.com/service/seo"
    });
  });

  it("wraps Google Search Console live OAuth calls behind the connector boundary", async () => {
    const calls: unknown[] = [];
    const adapter = createLiveGscConnectorAdapter({
      credential: {
        accessToken: "gsc_token",
        provider: "gsc",
        status: "connected"
      },
      fetch: (async (url, init) => {
        calls.push({
          body: init?.body,
          headers: init?.headers,
          method: init?.method,
          url: String(url)
        });

        return new Response(
          JSON.stringify({
            rows: [
              {
                keys: [
                  "searchops ai",
                  "https://searchops-ai-web.vercel.app/",
                  "kor",
                  "mobile"
                ],
                clicks: 7,
                impressions: 70,
                ctr: 0.1,
                position: 2.4
              }
            ]
          }),
          { status: 200 }
        );
      }) as typeof fetch,
      siteDomain: "searchops-ai-web.vercel.app"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });

    expect(adapter.liveExternalApis).toBe("enabled");
    expect(result).toMatchObject({
      fixture: false,
      provider: "gsc",
      status: "ok"
    });
    expect(result.records[0]).toMatchObject({
      clicks: 7,
      endDate: "2026-05-26",
      page: "https://searchops-ai-web.vercel.app/",
      provider: "gsc",
      query: "searchops ai",
      startDate: "2026-04-29"
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fsearchops-ai-web.vercel.app%2F/searchAnalytics/query"
    });
  });

  it("wraps GA4 live OAuth calls behind the connector boundary", async () => {
    const calls: unknown[] = [];
    const adapter = createLiveGa4ConnectorAdapter({
      credential: {
        accessToken: "ga4_token",
        provider: "ga4",
        status: "connected"
      },
      fetch: (async (url, init) => {
        calls.push({
          body: init?.body,
          headers: init?.headers,
          method: init?.method,
          url: String(url)
        });

        return new Response(
          JSON.stringify({
            rows: [
              {
                dimensionValues: [{ value: "/" }],
                metricValues: [
                  { value: "31" },
                  { value: "22" },
                  { value: "2" },
                  { value: "27" }
                ]
              }
            ]
          }),
          { status: 200 }
        );
      }) as typeof fetch,
      propertyId: "123456789"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });

    expect(result.records[0]).toMatchObject({
      conversions: 2,
      engagedSessions: 22,
      pagePath: "/",
      propertyId: "properties/123456789",
      provider: "ga4",
      sessions: 31,
      totalUsers: 27
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport"
    });
  });

  it("wraps PageSpeed API key calls behind the connector boundary", async () => {
    const calls: string[] = [];
    const adapter = createLivePageSpeedConnectorAdapter({
      apiKey: "pagespeed_key",
      fetch: (async (url) => {
        calls.push(String(url));

        return new Response(
          JSON.stringify({
            lighthouseResult: {
              categories: {
                accessibility: { score: 0.9 },
                performance: { score: 0.8 },
                seo: { score: 1 }
              },
              audits: {
                "cumulative-layout-shift": { numericValue: 0.02 },
                "interaction-to-next-paint": { numericValue: 150 },
                "largest-contentful-paint": { numericValue: 1800 }
              }
            }
          }),
          { status: 200 }
        );
      }) as typeof fetch,
      siteDomain: "searchops-ai-web.vercel.app"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });

    expect(result.records[0]).toMatchObject({
      accessibilityScore: 90,
      fetchedAt: "2026-05-27T00:00:00.000Z",
      performanceScore: 80,
      provider: "pagespeed",
      seoScore: 100,
      url: "https://searchops-ai-web.vercel.app/"
    });
    expect(calls[0]).toContain("pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(calls[0]).toContain("key=pagespeed_key");
  });

  it("wraps Bing Webmaster API key calls behind the connector boundary", async () => {
    const calls: string[] = [];
    const adapter = createLiveBingConnectorAdapter({
      apiKey: "bing_key",
      fetch: (async (url) => {
        calls.push(String(url));

        return new Response(
          JSON.stringify({
            d: {
              Clicks: 4,
              Impressions: 40,
              IsIndexed: true,
              LastCrawled: "2026-05-26T00:00:00Z"
            }
          }),
          { status: 200 }
        );
      }) as typeof fetch,
      siteDomain: "searchops-ai-web.vercel.app"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });

    expect(result.records[0]).toMatchObject({
      clicks: 4,
      impressions: 40,
      indexed: true,
      lastCrawledAt: "2026-05-26T00:00:00.000Z",
      provider: "bing",
      siteUrl: "https://searchops-ai-web.vercel.app/"
    });
    expect(calls[0]).toContain("ssl.bing.com/webmaster/api.svc/json/GetUrlInfo");
    expect(calls[0]).toContain("apikey=bing_key");
  });

  it("syncs live connectors with OAuth and API key credentials", async () => {
    const result = await syncLiveConnectors({
      bingApiKey: "bing_key",
      fetchedAt: "2026-05-27T00:00:00.000Z",
      fetch: (async (url) => {
        const value = String(url);

        if (value.includes("searchAnalytics")) {
          return new Response(
            JSON.stringify({
              rows: [
                {
                  keys: [
                    "searchops ai",
                    "https://searchops-ai-web.vercel.app/",
                    "kor",
                    "desktop"
                  ],
                  clicks: 1,
                  impressions: 10,
                  ctr: 0.1,
                  position: 1.5
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (value.includes("analyticsdata.googleapis.com")) {
          return new Response(
            JSON.stringify({
              rows: [
                {
                  dimensionValues: [{ value: "/" }],
                  metricValues: [
                    { value: "3" },
                    { value: "2" },
                    { value: "1" },
                    { value: "3" }
                  ]
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (value.includes("pagespeedonline")) {
          return new Response(
            JSON.stringify({
              lighthouseResult: {
                categories: {
                  accessibility: { score: 1 },
                  performance: { score: 1 },
                  seo: { score: 1 }
                },
                audits: {
                  "cumulative-layout-shift": { numericValue: 0 },
                  "interaction-to-next-paint": { numericValue: 100 },
                  "largest-contentful-paint": { numericValue: 1200 }
                }
              }
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            d: {
              IsIndexed: true
            }
          }),
          { status: 200 }
        );
      }) as typeof fetch,
      ga4PropertyId: "123456789",
      googleOAuthCredentials: [
        { accessToken: "gsc_token", provider: "gsc", status: "connected" },
        { accessToken: "ga4_token", provider: "ga4", status: "connected" }
      ],
      pagespeedApiKey: "pagespeed_key",
      providers: ["gsc", "ga4", "pagespeed", "bing"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results.map((item) => item.provider)).toEqual([
      "gsc",
      "ga4",
      "pagespeed",
      "bing"
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 0,
      okProviders: 4,
      totalProviders: 4,
      totalRecords: 4
    });
  });

  it("marks missing live connector credentials as failed without throwing", async () => {
    const result = await syncLiveConnectors({
      fetchedAt: "2026-05-27T00:00:00.000Z",
      providers: ["gsc", "ga4", "pagespeed", "bing"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results.map((item) => [item.provider, item.status])).toEqual([
      ["gsc", "failed"],
      ["ga4", "failed"],
      ["pagespeed", "failed"],
      ["bing", "failed"]
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 4,
      totalProviders: 4,
      totalRecords: 0
    });
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
