import { describe, expect, it } from "vitest";

import {
  connectorAuthModes,
  connectorProviders,
  connectorsPackage,
  createAnthropicGeoAnswerClient,
  createConnectorRunResult,
  createFixtureConnectorAdapter,
  createGeminiGeoAnswerClient,
  createGeoAnswerMonitorBatchRunner,
  createHttpSchemaRichResultValidatorClient,
  createLiveBingConnectorAdapter,
  createLiveGa4ConnectorAdapter,
  createLiveGeoAnswerMonitorAdapter,
  createLiveGeoAnswerMonitorAdaptersFromKeys,
  createLiveGscConnectorAdapter,
  createLivePageSpeedConnectorAdapter,
  createLiveSchemaRichResultValidatorAdapter,
  createOpenAiCompatibleGeoAnswerClient,
  discoverKeywordTargetsFromConnectorResults,
  extractGeoCitedUrls,
  fetchWithResilience,
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

  it("normalizes PageSpeed performance-only API responses without crashing", () => {
    const records = normalizePageSpeed({
      fetchedAt: "2026-05-28T03:50:53.379Z",
      lighthouseResult: {
        audits: {
          "cumulative-layout-shift": { numericValue: 0 },
          "largest-contentful-paint": { numericValue: 926.48 }
        },
        categories: {
          performance: { score: 1 }
        }
      },
      strategy: "mobile",
      url: "https://searchops-ai-web.vercel.app/"
    });

    expect(records).toEqual([
      {
        accessibilityScore: 0,
        cumulativeLayoutShift: 0,
        fetchedAt: "2026-05-28T03:50:53.379Z",
        interactionToNextPaintMs: 0,
        largestContentfulPaintMs: 926.48,
        performanceScore: 100,
        provider: "pagespeed",
        seoScore: 0,
        strategy: "mobile",
        url: "https://searchops-ai-web.vercel.app/"
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
      setupRequiredProviders: 0,
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

  const geoClientInput = {
    observedAt: "2026-06-22T00:00:00.000Z",
    query: "best seo clinic in seoul",
    queryLocale: "ko-KR",
    target: {
      brandName: "Example Clinic",
      domain: "example-clinic.com",
      locale: "ko-KR",
      market: "KR",
      siteId: "site_1"
    }
  } as const;

  it("extracts and dedupes cited URLs from answer text", () => {
    expect(
      extractGeoCitedUrls("See https://a.com/x, https://a.com/x and https://b.com/y."),
    ).toEqual(["https://a.com/x", "https://b.com/y"]);
  });

  it("calls an OpenAI-compatible chat completions endpoint with bearer auth", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createOpenAiCompatibleGeoAnswerClient({
      apiKey: "sk-test",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o",
      provider: "chatgpt",
      fetchImpl: async (url, init) => {
        calls.push({ init, url: String(url) });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Try https://example-clinic.com/seo for details." } }]
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
    });

    const result = await client.ask(geoClientInput);

    expect(result.answerText).toContain("example-clinic.com/seo");
    expect(result.citedUrls).toEqual(["https://example-clinic.com/seo"]);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer sk-test");
    const body = JSON.parse(String(calls[0]?.init?.body)) as { model: string };
    expect(body.model).toBe("gpt-4o");
  });

  it("prefers Perplexity native citations over text extraction", async () => {
    const client = createOpenAiCompatibleGeoAnswerClient({
      apiKey: "pplx-test",
      endpoint: "https://api.perplexity.ai/chat/completions",
      model: "sonar",
      provider: "perplexity",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Mentions https://ignored.com inline." } }],
            citations: ["https://cited-1.com", "https://cited-2.com", "https://cited-1.com"]
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        )
    });

    const result = await client.ask(geoClientInput);

    expect(result.citedUrls).toEqual(["https://cited-1.com", "https://cited-2.com"]);
  });

  it("calls the Gemini generateContent endpoint with the api-key header", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createGeminiGeoAnswerClient({
      apiKey: "gem-test",
      model: "gemini-2.0-flash",
      fetchImpl: async (url, init) => {
        calls.push({ init, url: String(url) });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Visit https://example-clinic.com now." }] } }]
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
    });

    const result = await client.ask(geoClientInput);

    expect(result.answerText).toContain("example-clinic.com");
    expect(result.citedUrls).toEqual(["https://example-clinic.com"]);
    expect(calls[0]?.url).toContain("gemini-2.0-flash:generateContent");
    expect(new Headers(calls[0]?.init?.headers).get("x-goog-api-key")).toBe("gem-test");
  });

  it("calls the Anthropic messages endpoint and concatenates text blocks", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createAnthropicGeoAnswerClient({
      apiKey: "ant-test",
      model: "claude-opus-4-8",
      fetchImpl: async (url, init) => {
        calls.push({ init, url: String(url) });
        return new Response(
          JSON.stringify({
            content: [
              { type: "text", text: "Example Clinic — " },
              { type: "text", text: "see https://example-clinic.com/about." }
            ],
            stop_reason: "end_turn"
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
    });

    const result = await client.ask(geoClientInput);

    expect(result.answerText).toBe("Example Clinic — see https://example-clinic.com/about.");
    expect(result.citedUrls).toEqual(["https://example-clinic.com/about"]);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("x-api-key")).toBe("ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse(String(calls[0]?.init?.body)) as { temperature?: number; max_tokens: number };
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBe(1024);
  });

  it("treats an Anthropic refusal (empty content) as an empty answer, not an error", async () => {
    const client = createAnthropicGeoAnswerClient({
      apiKey: "ant-test",
      model: "claude-opus-4-8",
      fetchImpl: async () =>
        new Response(JSON.stringify({ content: [], stop_reason: "refusal" }), {
          headers: { "content-type": "application/json" },
          status: 200
        })
    });

    const result = await client.ask(geoClientInput);

    expect(result.answerText).toBe("");
    expect(result.citedUrls).toEqual([]);
  });

  it("throws when a GEO answer provider returns a non-2xx response", async () => {
    const client = createOpenAiCompatibleGeoAnswerClient({
      apiKey: "sk-test",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o",
      provider: "chatgpt",
      fetchImpl: async () => new Response("rate limited", { status: 429 })
    });

    await expect(client.ask(geoClientInput)).rejects.toThrow(/HTTP 429/);
  });

  it("builds live GEO adapters only for providers whose API key is present", () => {
    const adapters = createLiveGeoAnswerMonitorAdaptersFromKeys({
      claudeApiKey: "ant-test",
      geminiApiKey: "gem-test"
    });

    expect(Object.keys(adapters).sort()).toEqual(["claude", "gemini"]);
    expect(adapters.chatgpt).toBeUndefined();
  });

  it("falls back to fixture per-provider when a live adapter is missing or throws", async () => {
    const errors: string[] = [];
    const throwingAdapter = createLiveGeoAnswerMonitorAdapter({
      client: {
        provider: "claude",
        async ask() {
          throw new Error("upstream boom");
        }
      }
    });

    const runBatch = createGeoAnswerMonitorBatchRunner(
      { claude: throwingAdapter },
      { onProviderError: (provider) => errors.push(provider) },
    );

    const batch = await runBatch({
      observedAt: "2026-06-22T00:00:00.000Z",
      providers: ["claude", "gemini"],
      queries: [{ query: "best seo clinic" }],
      target: {
        brandName: "Example Clinic",
        domain: "example-clinic.com",
        locale: "ko-KR",
        market: "KR",
        siteId: "site_1"
      }
    });

    // gemini has no adapter, claude's adapter throws → both degrade to fixture.
    expect(errors).toEqual(["claude"]);
    expect(batch.results.map((result) => result.provider)).toEqual(["gemini", "claude"]);
    expect(batch.results.every((result) => result.generatedBy === "fixture")).toBe(true);
    expect(batch.observations).toHaveLength(2);
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

  it("posts JSON-LD validation requests to the configured rich-result validator endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = createHttpSchemaRichResultValidatorClient({
      url: "https://validator.example.com/validate",
      token: "secret-token",
      fetchImpl: async (url, init) => {
        calls.push({ init, url: String(url) });
        return new Response(
          JSON.stringify({
            eligible: true,
            issues: [],
            missingRecommendedFields: ["description"],
            missingRequiredFields: [],
            status: "eligible"
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
    });

    const response = await client.validate({
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "SEO service",
        url: "https://example-clinic.com/service/seo"
      },
      recommendedFields: ["description"],
      requestedAt: "2026-06-22T00:00:00.000Z",
      requiredFields: ["@context", "@type", "name", "url"],
      type: "Service",
      url: "https://example-clinic.com/service/seo"
    });

    expect(response.status).toBe("eligible");
    expect(response.eligible).toBe(true);
    expect(response.missingRecommendedFields).toEqual(["description"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://validator.example.com/validate");
    const sentHeaders = new Headers(calls[0]?.init?.headers);
    expect(sentHeaders.get("authorization")).toBe("Bearer secret-token");
    const sentBody = JSON.parse(String(calls[0]?.init?.body)) as { type: string; url: string };
    expect(sentBody.type).toBe("Service");
    expect(sentBody.url).toBe("https://example-clinic.com/service/seo");
  });

  it("throws when the rich-result validator returns a non-2xx response", async () => {
    const client = createHttpSchemaRichResultValidatorClient({
      url: "https://validator.example.com/validate",
      fetchImpl: async () => new Response("upstream down", { status: 502 })
    });

    await expect(
      client.validate({
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Service",
          name: "SEO service",
          url: "https://example-clinic.com/service/seo"
        },
        requestedAt: "2026-06-22T00:00:00.000Z",
        requiredFields: ["@context"],
        type: "Service",
        url: "https://example-clinic.com/service/seo"
      }),
    ).rejects.toThrow(/HTTP 502/);
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
    expect(calls[0]).toContain("category=performance");
    expect(calls[0]).toContain("category=accessibility");
    expect(calls[0]).toContain("category=seo");
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

  it("marks missing live connector credentials as setup required without throwing", async () => {
    const result = await syncLiveConnectors({
      fetchedAt: "2026-05-27T00:00:00.000Z",
      providers: ["gsc", "ga4", "pagespeed", "bing", "cms"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results.map((item) => [item.provider, item.status])).toEqual([
      ["gsc", "setup_required"],
      ["ga4", "setup_required"],
      ["pagespeed", "setup_required"],
      ["bing", "setup_required"],
      ["cms", "setup_required"]
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 0,
      providerErrors: {
        bing: {
          code: "bing_api_key_missing",
          message: "Bing Webmaster API key is missing in the worker runtime.",
          setupRequired: true
        },
        cms: {
          code: "cms_live_connector_not_configured",
          message:
            "CMS live connector is not configured. Use a CMS webhook or add a provider-specific CMS adapter.",
          setupRequired: true
        },
        ga4: {
          code: "ga4_oauth_missing",
          message: "GA4 OAuth credential is missing for this site.",
          setupRequired: true
        },
        gsc: {
          code: "gsc_oauth_missing",
          message: "GSC OAuth credential is missing for this site.",
          setupRequired: true
        },
        pagespeed: {
          code: "pagespeed_api_key_missing",
          message: "PageSpeed API key is missing in the worker runtime.",
          setupRequired: true
        }
      },
      setupRequiredProviders: 5,
      totalProviders: 5,
      totalRecords: 0
    });
  });

  it("keeps a live provider API failure scoped to that provider result", async () => {
    const result = await syncLiveConnectors({
      fetchedAt: "2026-05-27T00:00:00.000Z",
      fetch: (async () =>
        new Response(JSON.stringify({ error: { message: "Permission denied for property." } }), {
          status: 401
        })) as typeof fetch,
      googleOAuthCredentials: [
        { accessToken: "expired_gsc_token", provider: "gsc", status: "connected" }
      ],
      providers: ["gsc"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results).toEqual([
      {
        fetchedAt: "2026-05-27T00:00:00.000Z",
        fixture: false,
        provider: "gsc",
        records: [],
        status: "failed",
        error: {
          message:
            "Google Search Console request failed with status 401: Permission denied for property.",
          name: "Error"
        }
      }
    ]);
    expect(result.summary).toMatchObject({
      failedProviders: 1,
      providerErrors: {
        gsc: {
          message:
            "Google Search Console request failed with status 401: Permission denied for property."
        }
      },
      totalProviders: 1,
      totalRecords: 0
    });
  });

  it("diagnoses GA4 property id format separately from OAuth permission failures", async () => {
    const invalidPropertyResult = await syncLiveConnectors({
      fetchedAt: "2026-05-27T00:00:00.000Z",
      ga4PropertyId: "G-J4S923Y2Z5",
      googleOAuthCredentials: [
        { accessToken: "ga4_token", provider: "ga4", status: "connected" }
      ],
      providers: ["ga4"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(invalidPropertyResult.results[0]).toMatchObject({
      provider: "ga4",
      status: "failed",
      error: {
        code: "ga4_property_id_invalid",
        operatorMessage:
          "GA4 Property ID가 잘못되었거나 Google Analytics Data API에서 해당 속성을 찾을 수 없습니다."
      }
    });

    const permissionResult = await syncLiveConnectors({
      fetchedAt: "2026-05-27T00:00:00.000Z",
      fetch: (async () =>
        new Response(
          JSON.stringify({
            error: {
              message:
                "User does not have sufficient permissions for this property."
            }
          }),
          { status: 403 }
        )) as typeof fetch,
      ga4PropertyId: "123456789",
      googleOAuthCredentials: [
        { accessToken: "ga4_token", provider: "ga4", status: "connected" }
      ],
      providers: ["ga4"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(permissionResult.results[0]).toMatchObject({
      provider: "ga4",
      status: "failed",
      error: {
        code: "ga4_property_access_denied",
        operatorMessage:
          "OAuth Google 계정이 현재 SEARCHOPS_GA4_PROPERTY_ID 속성에 접근할 권한이 없습니다."
      }
    });
  });

  it("diagnoses Bing InvalidApiKey as a Railway and Bing Webmaster configuration issue", async () => {
    const result = await syncLiveConnectors({
      bingApiKey: "invalid_key",
      fetchedAt: "2026-05-27T00:00:00.000Z",
      fetch: (async () =>
        new Response(
          JSON.stringify({
            ErrorCode: 3,
            Message: "ERROR!!! InvalidApiKey"
          }),
          { status: 400 }
        )) as typeof fetch,
      providers: ["bing"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results[0]).toMatchObject({
      provider: "bing",
      status: "failed",
      error: {
        code: "bing_invalid_api_key",
        operatorMessage: "Bing Webmaster API Key가 유효하지 않습니다."
      }
    });
    expect(result.summary).toMatchObject({
      failedProviders: 1,
      setupRequiredProviders: 0
    });
  });

  it("diagnoses Bing 5xx HTML responses as temporary service availability issues", async () => {
    const result = await syncLiveConnectors({
      bingApiKey: "valid_key",
      fetchedAt: "2026-05-27T00:00:00.000Z",
      fetch: (async () =>
        new Response(
          "<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body>503</body></html>",
          {
            headers: { "content-type": "text/html" },
            status: 503
          }
        )) as typeof fetch,
      providers: ["bing"],
      siteDomain: "searchops-ai-web.vercel.app"
    });

    expect(result.results[0]).toMatchObject({
      provider: "bing",
      status: "failed",
      error: {
        code: "bing_service_unavailable",
        operatorMessage: expect.stringContaining("Bing Webmaster API")
      }
    });
    expect(result.summary).toMatchObject({
      failedProviders: 1,
      setupRequiredProviders: 0
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

  it("fetchWithResilience retries on 429 then returns 200", async () => {
    let attempts = 0;
    const fakeFetch = (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("rate limited", { status: 429 })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;

    const response = await fetchWithResilience(fakeFetch, "https://x.test", {}, { sleep: async () => {} });
    expect(attempts).toBe(2);
    expect(response.status).toBe(200);
  });

  it("fetchWithResilience does not retry non-retryable statuses", async () => {
    let attempts = 0;
    const fakeFetch = (async () => {
      attempts += 1;
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;

    const response = await fetchWithResilience(fakeFetch, "https://x.test", {}, { sleep: async () => {} });
    expect(attempts).toBe(1);
    expect(response.status).toBe(400);
  });

  it("fetchWithResilience retries on a network error then succeeds", async () => {
    let attempts = 0;
    const fakeFetch = (async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("ECONNRESET");
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const response = await fetchWithResilience(fakeFetch, "https://x.test", {}, { sleep: async () => {} });
    expect(attempts).toBe(2);
    expect(response.status).toBe(200);
  });

  it("GSC adapter paginates via startRow until a short page", async () => {
    const startRows: number[] = [];
    const gscRow = (query: string) => ({
      keys: [query, "https://ex.test/", "kor", "mobile"],
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 2
    });
    const adapter = createLiveGscConnectorAdapter({
      credential: { accessToken: "gsc_token", provider: "gsc", status: "connected" },
      rowLimit: 2,
      fetch: (async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { startRow: number };
        startRows.push(body.startRow);
        const rows = body.startRow === 0 ? [gscRow("a"), gscRow("b")] : [gscRow("c")];
        return new Response(JSON.stringify({ rows }), { status: 200 });
      }) as typeof fetch,
      siteDomain: "ex.test"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });
    expect(startRows).toEqual([0, 2]);
    expect(result.records).toHaveLength(3);
  });

  it("GA4 adapter paginates via offset using rowCount", async () => {
    const offsets: number[] = [];
    const ga4Row = (pagePath: string) => ({
      dimensionValues: [{ value: pagePath }],
      metricValues: [{ value: "1" }, { value: "1" }, { value: "0" }, { value: "1" }]
    });
    const adapter = createLiveGa4ConnectorAdapter({
      credential: { accessToken: "ga4_token", provider: "ga4", status: "connected" },
      fetch: (async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { offset: number };
        offsets.push(body.offset);
        const rows =
          body.offset === 0
            ? Array.from({ length: 1000 }, (_value, index) => ga4Row(`/p${index}`))
            : [ga4Row("/last")];
        return new Response(JSON.stringify({ rowCount: 1001, rows }), { status: 200 });
      }) as typeof fetch,
      propertyId: "123456"
    });

    const result = await adapter.sync({ fetchedAt: "2026-05-27T00:00:00.000Z" });
    expect(offsets).toEqual([0, 1000]);
    expect(result.records).toHaveLength(1001);
  });
});
