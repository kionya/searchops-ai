import { describe, expect, it } from "vitest";

import {
  aeoCoreGenerationMode,
  aeoCorePackage,
  answerSummaryPresentRule,
  calculateAeoReadinessScore,
  classifyKeywordTargetIntent,
  contentDepthRule,
  createContentBriefDraft,
  defaultAeoReadinessRules,
  evaluateAeoReadiness,
  evaluateAeoReadinessRule,
  faqSchemaPresentRule,
  generateAeoFaqGapSet,
  inferKeywordIntent,
  keywordIntentDefinedRule,
  normalizeKeywordPhrase,
  questionCoverageRule,
  scoreKeywordIntent
} from "./index.js";
import type {
  AeoFaqGapSet,
  AeoPageSignal,
  AeoReadinessReport,
  KeywordAeoInput,
  KeywordTarget
} from "@searchops/types";

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

describe("FAQ gap generator", () => {
  it("generates deterministic FAQ gaps from weak readiness signals", () => {
    const candidatePage = {
      ...readyPage,
      answerBlocks: [],
      h2: ["What does SEO clinic include?"],
      questionHeadings: ["What does SEO clinic include?"],
      schemaTypes: [],
      wordCount: 320
    };
    const readinessReport = evaluateAeoReadiness(createInput({}, candidatePage), { evaluatedAt });
    const gapSet = generateAeoFaqGapSet(
      {
        candidatePage,
        keyword: readinessReport.keyword
      },
      { evaluatedAt, readinessReport },
    );

    expect(gapSet).toMatchObject({
      evaluatedAt,
      generatedBy: "deterministic",
      pageUrl: candidatePage.url,
      keyword: {
        intent: "commercial"
      }
    });
    expect(gapSet.gaps.map((gap) => gap.question)).toEqual([
      "What does seo clinic price comparison include?",
      "How much does seo clinic price comparison cost?",
      "How should users compare seo clinic price comparison options?"
    ]);
    expect(gapSet.gaps.map((gap) => gap.intent)).toEqual([
      "definition",
      "pricing",
      "comparison"
    ]);
    expect(gapSet.gaps.every((gap) => gap.priority === "p2")).toBe(true);
  });

  it("returns no FAQ gaps when the candidate page already passes AEO question checks", () => {
    const readinessReport = evaluateAeoReadiness(createInput(), { evaluatedAt });
    const gapSet = generateAeoFaqGapSet(
      {
        candidatePage: readyPage,
        keyword: readinessReport.keyword
      },
      { evaluatedAt, readinessReport },
    );

    expect(gapSet.gaps).toEqual([]);
  });

  it("creates p1 FAQ gaps when no candidate page exists", () => {
    const gapSet = generateAeoFaqGapSet(createInput({}, null), { evaluatedAt });

    expect(gapSet.pageUrl).toBeNull();
    expect(gapSet.gaps[0]).toMatchObject({
      priority: "p1",
      question: "What does seo clinic price comparison include?"
    });
    expect(gapSet.gaps).toHaveLength(3);
  });

  it("is deterministic for the same FAQ gap input", () => {
    const input = createInput({}, null);

    expect(generateAeoFaqGapSet(input, { evaluatedAt })).toEqual(
      generateAeoFaqGapSet(input, { evaluatedAt }),
    );
  });
});

describe("ContentBrief draft mapper", () => {
  function createGapSet(keyword = createInput().keyword): AeoFaqGapSet {
    return {
      evaluatedAt,
      gaps: [
        {
          evidence: {
            expectedValue: ["What does SEO clinic include?"],
            observedValue: [],
            sourceField: "questionHeadings",
            url: readyPage.url
          },
          intent: "definition",
          priority: "p2",
          question: "What does SEO clinic include?",
          suggestedAnswerAngle: "Define the service scope in a short answer block."
        },
        {
          evidence: {
            expectedValue: ["How much does SEO clinic cost?"],
            observedValue: [],
            sourceField: "questionHeadings",
            url: readyPage.url
          },
          intent: "pricing",
          priority: "p2",
          question: "How much does SEO clinic cost?",
          suggestedAnswerAngle: "Explain price factors without making unsupported claims."
        }
      ],
      generatedBy: "deterministic",
      keyword,
      pageUrl: readyPage.url
    };
  }

  it("creates a draft-only content brief from readiness and FAQ gaps", () => {
    const readinessReport = evaluateAeoReadiness(createInput(), { evaluatedAt });
    const draft = createContentBriefDraft({
      candidatePage: readyPage,
      faqGapSet: createGapSet(readinessReport.keyword),
      keyword: createInput().keyword,
      keywordId: "keyword_1",
      readinessReport
    });

    expect(draft).toMatchObject({
      generationMode: "deterministic",
      intent: "commercial",
      keywordId: "keyword_1",
      primaryKeyword: "seo clinic price comparison",
      publishPolicy: "draft_only",
      status: "draft",
      title: "SEO clinic content brief"
    });
    expect(draft.faqQuestions).toEqual([
      "What does SEO clinic include?",
      "How much does SEO clinic cost?",
      "What does seo clinic price comparison include?",
      "How much does seo clinic price comparison cost?",
      "How should users compare seo clinic price comparison options?"
    ]);
    expect(draft.acceptanceCriteria).toContain(
      "Do not auto-publish the brief to any CMS or external channel.",
    );
    expect(draft.outline.map((section) => section.heading)).toEqual([
      "Seo Clinic Price Comparison direct answer",
      "Question coverage",
      "Evidence and page structure",
      "Review checklist"
    ]);
  });

  it("creates a deterministic fallback draft when no candidate page exists", () => {
    const draft = createContentBriefDraft({
      candidatePage: null,
      evaluatedAt,
      keyword: {
        ...baseKeyword,
        intent: null,
        phrase: "what is answer engine optimization"
      }
    });

    expect(draft).toMatchObject({
      generationMode: "deterministic",
      intent: "informational",
      keywordId: null,
      publishPolicy: "draft_only",
      status: "draft",
      title: "What Is Answer Engine Optimization content brief"
    });
    expect(draft.faqQuestions).toEqual([
      "What is answer engine optimization?",
      "How does answer engine optimization work?",
      "What should users know before choosing answer engine optimization?"
    ]);
    expect(draft.acceptanceCriteria).toContain(
      "Add at least one concise answer block near the top of the page.",
    );
    expect(draft.outline[2]?.acceptanceCriteria).toContain(
      "Mark source content as missing and request a candidate page before publishing.",
    );
  });

  it("maps weak readiness checks into acceptance criteria", () => {
    const readinessReport: AeoReadinessReport = evaluateAeoReadiness(
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
    const draft = createContentBriefDraft({
      candidatePage: readyPage,
      keyword: readinessReport.keyword,
      readinessReport
    });

    expect(draft.acceptanceCriteria).toEqual(
      expect.arrayContaining([
        "Add at least one concise answer block near the top of the page.",
        "Structure FAQ candidates so they can later support FAQPage schema.",
        "Use one H1 plan and at least two supporting H2 sections.",
        "Plan enough supporting sections to reach at least 600 words."
      ]),
    );
    expect(draft.summary).toContain("needs_work AEO readiness with score 71");
  });

  it("is deterministic for the same mapper input", () => {
    const readinessReport = evaluateAeoReadiness(createInput(), { evaluatedAt });
    const input = {
      candidatePage: readyPage,
      faqGapSet: createGapSet(readinessReport.keyword),
      keyword: readinessReport.keyword,
      readinessReport
    };

    expect(createContentBriefDraft(input)).toEqual(createContentBriefDraft(input));
  });

  it("rejects ambiguous mapper inputs", () => {
    expect(() =>
      createContentBriefDraft({
        candidatePage: readyPage,
        keyword: createInput().keyword
      }),
    ).toThrow(/evaluatedAt/);

    expect(() =>
      createContentBriefDraft({
        candidatePage: readyPage,
        faqGapSet: createGapSet({ ...baseKeyword, phrase: "different keyword" }),
        keyword: createInput().keyword,
        readinessReport: evaluateAeoReadiness(createInput(), { evaluatedAt })
      }),
    ).toThrow(/faqGapSet/);
  });
});
