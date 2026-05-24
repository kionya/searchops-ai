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
  isOwnedUrl
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
        owned: false,
        url: "https://competitor.com/seo"
      },
      {
        domain: "example.com",
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
      competitorCitationRate: 0,
      generatedBy: "deterministic",
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

  it("classifies score thresholds", () => {
    expect(classifyGeoVisibilityStatus(75)).toBe("strong");
    expect(classifyGeoVisibilityStatus(50)).toBe("visible");
    expect(classifyGeoVisibilityStatus(25)).toBe("weak");
    expect(classifyGeoVisibilityStatus(24)).toBe("not_visible");
  });
});
