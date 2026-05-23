import { describe, expect, it } from "vitest";

import {
  aeoCoreGenerationMode,
  aeoCorePackage,
  answerSummaryPresentRule,
  calculateAeoReadinessScore,
  classifyKeywordTargetIntent,
  contentDepthRule,
  defaultAeoReadinessRules,
  evaluateAeoReadiness,
  evaluateAeoReadinessRule,
  faqSchemaPresentRule,
  inferKeywordIntent,
  keywordIntentDefinedRule,
  normalizeKeywordPhrase,
  questionCoverageRule,
  scoreKeywordIntent
} from "./index.js";
import type { AeoPageSignal, KeywordAeoInput, KeywordTarget } from "@searchops/types";

const evaluatedAt = "2026-05-23T00:00:00.000Z";

const baseKeyword: KeywordTarget = {
  country: "KR",
  intent: null,
  language: "ko",
  locale: "ko-KR",
  phrase: "seo clinic price comparison",
  siteId: "site_1",
  source: "manual"
};

const readyPage: AeoPageSignal = {
  url: "https://example.com/service/seo",
  title: "SEO clinic service",
  metaDescription: "SEO clinic service page",
  h1: "SEO clinic",
  h2: ["What does SEO clinic include?", "How much does SEO clinic cost?"],
  wordCount: 720,
  schemaTypes: ["FAQPage"],
  questionHeadings: ["What does SEO clinic include?", "How much does SEO clinic cost?"],
  answerBlocks: [
    {
      question: "What does SEO clinic include?",
      answer: "It includes technical SEO, content planning, and search performance review.",
      sourceField: "body"
    },
    {
      question: "How much does SEO clinic cost?",
      answer: "Pricing depends on scope and site size.",
      sourceField: "body"
    }
  ]
};

function createInput(
  keyword: Partial<KeywordTarget> = {},
  candidatePage: AeoPageSignal | null = readyPage,
): KeywordAeoInput {
  return {
    candidatePage,
    keyword: {
      ...baseKeyword,
      ...keyword
    }
  };
}

describe("aeo-core foundation", () => {
  it("identifies the package and deterministic generation mode", () => {
    expect(aeoCorePackage).toBe("aeo-core");
    expect(aeoCoreGenerationMode).toBe("deterministic");
  });

  it("normalizes keyword phrases deterministically", () => {
    expect(normalizeKeywordPhrase("  SEO   Clinic  ")).toBe("seo clinic");
  });
});

describe("keyword intent rules", () => {
  it("infers keyword intent from deterministic term scores", () => {
    expect(inferKeywordIntent("what is seo")).toBe("informational");
    expect(inferKeywordIntent("seo clinic price comparison")).toBe("commercial");
    expect(inferKeywordIntent("book botox appointment")).toBe("transactional");
    expect(inferKeywordIntent("searchops login")).toBe("navigational");
    expect(inferKeywordIntent("gangnam clinic")).toBe("local");
    expect(inferKeywordIntent("what is seo clinic price")).toBe("mixed");
  });

  it("returns stable scored terms for debugging and tests", () => {
    expect(scoreKeywordIntent("seo clinic price comparison").slice(0, 2)).toEqual([
      {
        intent: "commercial",
        matchedTerms: ["comparison", "price"],
        score: 2
      },
      {
        intent: "local",
        matchedTerms: ["clinic"],
        score: 1
      }
    ]);
  });

  it("preserves an explicit keyword intent when one exists", () => {
    expect(
      classifyKeywordTargetIntent({
        ...baseKeyword,
        phrase: "what is seo",
        intent: "local"
      }).intent,
    ).toBe("local");
  });

  it("fills missing keyword intent without LLM input", () => {
    expect(
      classifyKeywordTargetIntent({
        ...baseKeyword,
        phrase: "how to improve answer engine visibility"
      }).intent,
    ).toBe("informational");
  });
});

describe("AEO readiness rules", () => {
  it("exports readiness rules in deterministic order", () => {
    expect(defaultAeoReadinessRules.map((rule) => rule.id)).toEqual([
      "KEYWORD_INTENT_DEFINED",
      "ANSWER_SUMMARY_PRESENT",
      "QUESTION_COVERAGE",
      "FAQ_SCHEMA_PRESENT",
      "STRUCTURED_HEADINGS",
      "CITABLE_SOURCE_PRESENT",
      "CONTENT_DEPTH"
    ]);
  });

  it("evaluates keyword intent as an independent readiness rule", () => {
    expect(
      evaluateAeoReadinessRule(keywordIntentDefinedRule, {
        candidatePage: readyPage,
        keyword: createInput().keyword
      }),
    ).toMatchObject({
      checkId: "KEYWORD_INTENT_DEFINED",
      score: 100,
      status: "pass",
      evidence: {
        observedValue: "commercial",
        sourceField: "keyword.intent"
      }
    });
  });

  it("evaluates answer summary presence independently", () => {
    expect(
      evaluateAeoReadinessRule(answerSummaryPresentRule, {
        candidatePage: readyPage,
        keyword: createInput().keyword
      }),
    ).toMatchObject({
      checkId: "ANSWER_SUMMARY_PRESENT",
      score: 100,
      status: "pass"
    });

    expect(
      evaluateAeoReadinessRule(answerSummaryPresentRule, {
        candidatePage: {
          ...readyPage,
          answerBlocks: [],
          metaDescription: "Fallback summary"
        },
        keyword: createInput().keyword
      }),
    ).toMatchObject({
      score: 60,
      status: "warning",
      evidence: {
        sourceField: "metaDescription"
      }
    });
  });

  it("evaluates question and schema readiness independently", () => {
    const sparsePage = {
      ...readyPage,
      answerBlocks: [],
      questionHeadings: ["What does SEO clinic include?"],
      schemaTypes: []
    };

    expect(
      evaluateAeoReadinessRule(questionCoverageRule, {
        candidatePage: sparsePage,
        keyword: createInput().keyword
      }),
    ).toMatchObject({ score: 60, status: "warning" });
    expect(
      evaluateAeoReadinessRule(faqSchemaPresentRule, {
        candidatePage: sparsePage,
        keyword: createInput().keyword
      }),
    ).toMatchObject({ score: 50, status: "warning" });
  });

  it("evaluates content depth independently", () => {
    expect(
      evaluateAeoReadinessRule(contentDepthRule, {
        candidatePage: { ...readyPage, wordCount: 120 },
        keyword: createInput().keyword
      }),
    ).toMatchObject({
      checkId: "CONTENT_DEPTH",
      score: 0,
      status: "fail",
      evidence: {
        observedValue: 120,
        expectedValue: "At least 600 words",
        sourceField: "wordCount"
      }
    });
  });
});

describe("AEO readiness engine", () => {
  it("returns a ready report for a fully prepared page", () => {
    const report = evaluateAeoReadiness(createInput(), { evaluatedAt });

    expect(report).toMatchObject({
      evaluatedAt,
      generatedBy: "deterministic",
      pageUrl: "https://example.com/service/seo",
      score: 100,
      status: "ready",
      keyword: {
        intent: "commercial"
      }
    });
    expect(report.checks).toHaveLength(7);
  });

  it("returns needs_work for partial AEO coverage", () => {
    const report = evaluateAeoReadiness(
      createInput({}, {
        ...readyPage,
        answerBlocks: [],
        h2: ["What does SEO clinic include?"],
        questionHeadings: ["What does SEO clinic include?"],
        schemaTypes: [],
        wordCount: 320
      }),
      { evaluatedAt },
    );

    expect(report).toMatchObject({
      score: 71,
      status: "needs_work"
    });
    expect(report.checks.map((check) => check.status)).toEqual([
      "pass",
      "warning",
      "warning",
      "warning",
      "warning",
      "pass",
      "warning"
    ]);
  });

  it("returns not_ready when no candidate page is available", () => {
    const report = evaluateAeoReadiness(createInput({}, null), { evaluatedAt });

    expect(report).toMatchObject({
      pageUrl: null,
      score: 14,
      status: "not_ready"
    });
    expect(report.checks.filter((check) => check.status === "fail")).toHaveLength(6);
  });

  it("is deterministic for the same input and evaluatedAt", () => {
    const first = evaluateAeoReadiness(createInput(), { evaluatedAt });
    const second = evaluateAeoReadiness(createInput(), { evaluatedAt });

    expect(second).toEqual(first);
  });

  it("rejects empty custom rule sets through report validation", () => {
    expect(() => evaluateAeoReadiness(createInput(), { evaluatedAt, rules: [] })).toThrow();
  });

  it("calculates readiness score boundaries", () => {
    expect(calculateAeoReadinessScore([{ ...contentDepthRule.evaluate({ candidatePage: readyPage, keyword: createInput().keyword }), score: 80 }])).toBe(80);
    expect(() => calculateAeoReadinessScore([])).toThrow(/at least one check/);
  });
});
