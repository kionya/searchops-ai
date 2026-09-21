import { describe, expect, it } from "vitest";

import type { GeoAnswerObservation } from "@searchops/types";

import {
  answerMentionsBrand,
  calculateBrandMentionRate,
  calculateOwnedCitationRate,
  classifyGeoVisibilityStatus,
  evaluateGeoVisibility,
  extractGeoCitations,
  geoCoreGenerationMode,
  geoCorePackage,
  calculateShareOfVoice,
  computeGeoTrend,
  countCompetitorMentions,
  isOwnedUrl,
  normalizeBrandName,
  summarizeGeoCitationsByKind,
  summarizeGeoObservationSources
} from "./index.js";

const target = {
  siteId: "site_1",
  brandName: "Example Clinic",
  domain: "example.com",
  locale: "ko-KR",
  market: "KR"
} as const;

const observedAt = "2026-05-24T00:00:00.000Z";

describe("geo-core", () => {
  it("identifies the package and deterministic generation mode", () => {
    expect(geoCorePackage).toBe("geo-core");
    expect(geoCoreGenerationMode).toBe("deterministic");
  });

  it("re-classifies citations without kind when summarizing (T1 back-compat)", () => {
    expect(
      summarizeGeoCitationsByKind(
        [
          { domain: "blog.naver.com", owned: false, url: "https://blog.naver.com/x" },
          { domain: "example.com", owned: true, url: "https://example.com/" },
          { domain: "goodoc.co.kr", kind: "platform", owned: false, url: "https://goodoc.co.kr/c" }
        ],
        "example.com"
      )
    ).toEqual({ owned: 1, platform: 1, competitor: 0, community: 1, other: 0 });
  });

  it("summarizes live share and flags partial fixture (T0)", () => {
    const fixture = { source: "fixture" } as const;
    const live = { source: "connector" } as const;
    expect(summarizeGeoObservationSources([])).toEqual({ liveShare: 0, warnings: ["no-observations"] });
    expect(summarizeGeoObservationSources([fixture, fixture])).toEqual({ liveShare: 0, warnings: ["partial-fixture"] });
    expect(summarizeGeoObservationSources([live, fixture])).toEqual({ liveShare: 0.5, warnings: ["partial-fixture"] });
    expect(summarizeGeoObservationSources([live, { source: "manual" }])).toEqual({ liveShare: 0.5, warnings: ["partial-fixture"] });
    expect(summarizeGeoObservationSources([live, live])).toEqual({ liveShare: 1, warnings: [] });
  });

  it("detects brand mentions by brand name or domain", () => {
    expect(answerMentionsBrand(target, "Example Clinic is cited for SEO services.")).toBe(true);
    expect(answerMentionsBrand(target, "See example.com for details.")).toBe(true);
    expect(answerMentionsBrand(target, "A competitor is cited instead.")).toBe(false);
  });

  it("classifies owned URLs by domain and subdomain", () => {
    expect(isOwnedUrl("https://example.com/service/seo", "example.com")).toBe(true);
    expect(isOwnedUrl("https://blog.example.com/guide", "example.com")).toBe(true);
    expect(isOwnedUrl("https://example.net/service/seo", "example.com")).toBe(false);
  });

  it("extracts deterministic citations", () => {
    const citations = extractGeoCitations(target, [
      {
        provider: "chatgpt",
        query: "seo clinic",
        locale: target.locale,
        answerText: "Example Clinic is mentioned.",
        citedUrls: ["https://example.com/service/seo", "https://competitor.com/seo"],
        observedAt,
        source: "fixture"
      },
      {
        provider: "perplexity",
        query: "seo clinic",
        locale: target.locale,
        answerText: "Example Clinic is mentioned.",
        citedUrls: ["https://example.com/service/seo"],
        observedAt,
        source: "fixture"
      }
    ]);

    expect(citations).toEqual([
      {
        domain: "competitor.com",
        kind: "other",
        owned: false,
        url: "https://competitor.com/seo"
      },
      {
        domain: "example.com",
        kind: "owned",
        owned: true,
        url: "https://example.com/service/seo"
      }
    ]);
  });

  it("calculates mention and citation rates", () => {
    const observations: GeoAnswerObservation[] = [
      {
        provider: "chatgpt",
        query: "seo clinic",
        locale: target.locale,
        answerText: "Example Clinic is mentioned.",
        citedUrls: ["https://example.com/service/seo"],
        observedAt,
        source: "fixture"
      },
      {
        provider: "gemini",
        query: "medical seo",
        locale: target.locale,
        answerText: "No brand mention.",
        citedUrls: ["https://competitor.com/seo"],
        observedAt,
        source: "fixture"
      }
    ];

    expect(calculateBrandMentionRate(target, observations)).toBe(50);
    expect(calculateOwnedCitationRate(target, observations)).toBe(50);
  });

  it("evaluates a strong GEO visibility report", () => {
    const report = evaluateGeoVisibility({
      target,
      observations: [
        {
          provider: "chatgpt",
          query: "best seo clinic",
          locale: target.locale,
          answerText: "Example Clinic appears as a relevant SEO clinic.",
          citedUrls: ["https://example.com/service/seo"],
          observedAt,
          source: "fixture"
        },
        {
          provider: "perplexity",
          query: "medical seo checklist",
          locale: target.locale,
          answerText: "Example Clinic is referenced for medical SEO planning.",
          citedUrls: ["https://blog.example.com/medical-seo"],
          observedAt,
          source: "fixture"
        },
        {
          provider: "gemini",
          query: "seo clinic near gangnam",
          locale: target.locale,
          answerText: "Example Clinic is visible for local SEO clinic research.",
          citedUrls: ["https://example.com/locations/gangnam"],
          observedAt,
          source: "fixture"
        }
      ],
      evaluatedAt: observedAt
    });

    expect(report).toMatchObject({
      citationRate: 100,
      citationsByKind: { owned: 3, platform: 0, competitor: 0, community: 0, other: 0 },
      competitorCitationRate: 0,
      generatedBy: "deterministic",
      liveShare: 0,
      warnings: ["partial-fixture"],
      mentionRate: 100,
      providerCount: 3,
      queryCount: 3,
      score: 100,
      status: "strong"
    });
    expect(report.checks.map((check) => check.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass"
    ]);
  });

  it("evaluates a weak GEO visibility report", () => {
    const report = evaluateGeoVisibility({
      target,
      observations: [
        {
          provider: "manual",
          query: "best seo clinic",
          locale: target.locale,
          answerText: "A competitor is mentioned.",
          citedUrls: ["https://competitor.com/seo"],
          observedAt,
          source: "fixture"
        }
      ],
      evaluatedAt: observedAt
    });

    expect(report).toMatchObject({
      citationRate: 0,
      competitorCitationRate: 100,
      mentionRate: 0,
      providerCount: 1,
      queryCount: 1,
      score: 15,
      status: "not_visible"
    });
    expect(report.checks.map((check) => check.status)).toEqual([
      "fail",
      "fail",
      "warning",
      "warning",
      "fail"
    ]);
  });

  it("counts competitor mentions with suffix normalization and computes SOV (T2)", () => {
    const observation = (query: string, answerText: string): GeoAnswerObservation => ({
      provider: "chatgpt", query, locale: target.locale, answerText, citedUrls: [], observedAt, source: "fixture"
    });
    const withCompetitors = { ...target, brandAliases: ["예시클리닉"], competitors: ["고운몸의원", "rival-clinic.com"] };
    const observations = [
      observation("q1", "고운몸 이 추천됩니다."),
      observation("q2", "고운몸의원과 Example Clinic 둘 다 언급."),
      observation("q3", "예시 클리닉 이 좋습니다."),
      observation("q4", "무관한 답변.")
    ];
    const mentions = countCompetitorMentions(withCompetitors, observations);
    expect(mentions).toEqual([
      { count: 2, name: "고운몸의원", questions: ["q1", "q2"] },
      { count: 0, name: "rival-clinic.com", questions: [] }
    ]);
    // 자사 2(q2 브랜드명, q3 별칭) / (2 + 2)
    expect(calculateShareOfVoice(withCompetitors, observations, mentions)).toBe(50);
    expect(calculateShareOfVoice(target, [])).toBe(0);
    expect(normalizeBrandName("고운몸 의원")).toBe("고운몸");
    expect(normalizeBrandName("Rival Clinic")).toBe("rival");
    const report = evaluateGeoVisibility({ target: withCompetitors, observations });
    expect(report).toMatchObject({ sov: 50, competitorMentions: mentions });
  });

  it("classifies competitor domains from target.competitors (T2)", () => {
    const citations = extractGeoCitations(
      { ...target, competitors: ["고운몸의원", "rival-clinic.com"] },
      [{ provider: "chatgpt", query: "q", locale: target.locale, answerText: "", citedUrls: ["https://www.rival-clinic.com/a"], observedAt, source: "fixture" }]
    );
    expect(citations[0]).toMatchObject({ kind: "competitor", owned: false });
  });

  it("computes weekly trend deltas over batch runs and exposes missing runs (T3)", () => {
    const base = { citationRate: 10, evaluatedAt: observedAt, liveShare: 1 };
    const points = computeGeoTrend([
      { ...base, id: "manual", mentionRate: 99 },
      { ...base, id: "r4", mentionRate: 30, runSeq: 4, sov: 20 },
      { ...base, id: "r1", mentionRate: 50, runSeq: 1, sov: 60 },
      { ...base, id: "r2", mentionRate: 40, runSeq: 2 }
    ]);
    expect(points.map((point) => point.reportId)).toEqual(["r1", "r2", "r4"]);
    expect(points[0]).toMatchObject({ delta: { citationRate: null, mentionRate: null, sov: null }, gapFromPrevious: null });
    expect(points[1]).toMatchObject({ delta: { mentionRate: -10, sov: null }, gapFromPrevious: 1, sov: null });
    expect(points[2]).toMatchObject({ delta: { citationRate: 0, mentionRate: -10, sov: null }, gapFromPrevious: 2 });
    expect(computeGeoTrend([{ ...base, id: "r1", mentionRate: 1, runSeq: 1 }, { ...base, id: "r2", mentionRate: 2, runSeq: 2 }], 1))
      .toHaveLength(1);
  });

  it("classifies score thresholds", () => {
    expect(classifyGeoVisibilityStatus(75)).toBe("strong");
    expect(classifyGeoVisibilityStatus(50)).toBe("visible");
    expect(classifyGeoVisibilityStatus(25)).toBe("weak");
    expect(classifyGeoVisibilityStatus(24)).toBe("not_visible");
  });
});
