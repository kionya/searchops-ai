import { describe, expect, it } from "vitest";

import {
  aeoCoreGenerationMode,
  aeoCorePackage,
  aeoReadinessRulesVersion,
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
  haystackCoversAllTokens,
  inferKeywordIntent,
  normalizeKeywordPhrase,
  pageAnswersQuestionRule,
  questionCoverageRule,
  scoreKeywordIntent,
  tokenizeKeywordPhrase
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
      "PAGE_ANSWERS_QUESTION",
      "ANSWER_SUMMARY_PRESENT",
      "QUESTION_COVERAGE",
      "FAQ_SCHEMA_PRESENT",
      "STRUCTURED_HEADINGS",
      "CITABLE_SOURCE_PRESENT",
      "CONTENT_DEPTH"
    ]);
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
  // "완전히 준비된" 은 적합성까지 포함한다 — readyPage 의 질문형 헤딩이 이 키워드를 덮는다.
  // baseKeyword("seo clinic price comparison")는 이 페이지가 답하지 않는 질문이라 100 이 아니다.
  it("returns a ready report for a fully prepared page", () => {
    const report = evaluateAeoReadiness(createInput({ phrase: "seo clinic cost" }), { evaluatedAt });

    expect(report).toMatchObject({
      evaluatedAt,
      generatedBy: "deterministic",
      pageUrl: "https://example.com/service/seo",
      score: 100,
      status: "ready",
      keyword: {
        // "seo clinic cost" 의 결정적 추론 결과다. intent 분류 자체는 위 classifyKeywordTargetIntent 테스트가 덮는다.
        intent: "mixed"
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
      score: 56,
      status: "needs_work"
    });
    // 첫 체크가 pass(동어반복 100) → fail(이 페이지는 이 질문에 답하지 않는다)로 바뀌었다.
    expect(report.checks.map((check) => check.status)).toEqual([
      "fail",
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

    // 공짜 100점이 사라져 7룰 전부 fail 이다(이전엔 KEYWORD_INTENT_DEFINED 만 pass 라 14점).
    expect(report).toMatchObject({
      pageUrl: null,
      score: 0,
      status: "not_ready"
    });
    expect(report.checks.filter((check) => check.status === "fail")).toHaveLength(7);
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
    expect(draft.summary).toContain("needs_work AEO readiness with score 56");
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

describe("키워드 토큰화 정본", () => {
  it("공백·기호 경계로 쪼개고 소문자화한다", () => {
    expect(tokenizeKeywordPhrase("보톡스 가격?")).toEqual(["보톡스", "가격"]);
    expect(tokenizeKeywordPhrase("리프팅·보톡스")).toEqual(["리프팅", "보톡스"]);
    expect(tokenizeKeywordPhrase("Botox  PRICE")).toEqual(["botox", "price"]);
  });

  // 1글자 토큰은 부분일치 오탐이 심하다 — "시" 가 "시술"·"시간"에 전부 걸린다.
  it("1글자 토큰을 버리고 중복을 지운다", () => {
    expect(tokenizeKeywordPhrase("코 보톡스 보톡스")).toEqual(["보톡스"]);
    expect(tokenizeKeywordPhrase("코 턱")).toEqual([]);
    expect(tokenizeKeywordPhrase("   ")).toEqual([]);
  });

  it("모든 토큰이 있어야 덮은 것이다 — 토큰 순서는 보지 않는다", () => {
    const tokens = tokenizeKeywordPhrase("보톡스 가격");
    expect(haystackCoversAllTokens("보톡스 가격은 얼마인가요?", tokens)).toBe(true);
    expect(haystackCoversAllTokens("가격 안내 — 보톡스 포함", tokens)).toBe(true);
    expect(haystackCoversAllTokens("보톡스 시술 안내", tokens)).toBe(false);
  });

  it("토큰이 없으면 아무것도 덮지 못한다", () => {
    expect(haystackCoversAllTokens("보톡스 가격", [])).toBe(false);
  });

  it("룰 버전 상수를 노출한다", () => {
    expect(aeoReadinessRulesVersion).toBe("2");
  });
});

const topicalOnlyPage: AeoPageSignal = {
  url: "https://example-clinic.com/botox",
  title: "보톡스 가격 안내",
  metaDescription: null,
  h1: "보톡스 가격",
  h2: ["진료 시간", "오시는 길"],
  wordCount: 400,
  schemaTypes: [],
  questionHeadings: [],
  answerBlocks: []
};

const unrelatedPage: AeoPageSignal = {
  ...topicalOnlyPage,
  title: "주차 안내",
  h1: "주차 안내",
  h2: ["지하 2층"]
};

function runRule(phrase: string, candidatePage: AeoPageSignal | null) {
  return evaluateAeoReadinessRule(pageAnswersQuestionRule, {
    candidatePage,
    keyword: { ...baseKeyword, phrase }
  });
}

describe("PAGE_ANSWERS_QUESTION — 질문↔페이지 적합성", () => {
  it("질문형 헤딩이 키워드를 덮으면 pass 100", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      questionHeadings: ["보톡스 가격은 얼마인가요?"]
    };
    expect(runRule("보톡스 가격", page)).toMatchObject({
      checkId: "PAGE_ANSWERS_QUESTION",
      score: 100,
      status: "pass",
      evidence: {
        observedValue: "보톡스 가격은 얼마인가요?",
        sourceField: "questionHeadings,answerBlocks"
      }
    });
  });

  it("답변 블록이 덮어도 pass 100", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      answerBlocks: [
        { question: "보톡스 가격이 궁금합니다", answer: "상담 후 안내합니다.", sourceField: "body" }
      ]
    };
    expect(runRule("보톡스 가격", page)).toMatchObject({ score: 100, status: "pass" });
  });

  it("주제만 다루면 warning 60", () => {
    expect(runRule("보톡스 가격", topicalOnlyPage)).toMatchObject({
      score: 60,
      status: "warning",
      evidence: { sourceField: "title,h1,h2" }
    });
    // 제목이 아니라 h2 에만 있어도 주제는 다룬 것이다.
    expect(runRule("진료 시간", topicalOnlyPage)).toMatchObject({ score: 60, status: "warning" });
  });

  it("무관한 페이지는 fail 0", () => {
    expect(runRule("보톡스 가격", unrelatedPage)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { observedValue: [], sourceField: "questionHeadings" }
    });
    expect(runRule("임플란트 비용", unrelatedPage)).toMatchObject({ score: 0, status: "fail" });
  });

  it("후보 페이지가 없으면 fail — 기존 6룰과 같은 처리", () => {
    expect(runRule("보톡스 가격", null)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { observedValue: null, url: null }
    });
  });

  /**
   * 판정 불가(대조할 토큰이 없다)와 콘텐츠 공백(페이지가 답하지 않는다)은 둘 다 fail 이다.
   * 구별되지 않으면 리포트는 "콘텐츠 공백" 으로 찍고 워크오더는 제외해 서로 어긋난다 —
   * 고객은 고칠 방법이 없는 항목을 영구히 보게 된다.
   */
  it("대조할 토큰이 없으면 판정 불가로 구별되게 낸다", () => {
    expect(runRule("???", readyPage)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { sourceField: "keyword.phrase" }
    });
  });

  it("1글자 조합 키워드는 판정 불가가 아니라 그냥 공백이다", () => {
    expect(runRule("코 턱", readyPage)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { sourceField: "questionHeadings" }
    });
  });

  // Review Focus 5: 기호·1글자만인 헤딩이 observedValue 에 쓰레기로 찍히지 않아야 한다.
  it("기호만인 질문형 헤딩은 매칭 후보에서 빠진다", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      questionHeadings: ["???", "보톡스 가격은 얼마인가요?"]
    };
    expect(runRule("보톡스 가격", page).evidence.observedValue).toBe("보톡스 가격은 얼마인가요?");
  });

  /**
   * 성형외과·피부과 키워드의 식별자는 거의 항상 1글자다(코·턱·눈·입·볼·목·귀).
   * 그 토큰을 버리면 "모든 토큰 요구" 가 성립하지 않아 다른 부위 헤딩에 pass 가 난다 —
   * 없는 커버리지를 있다고 말하는 바로 그 거짓이다.
   */
  it("1글자 식별 토큰을 무시하지 않는다 — 다른 부위 헤딩에 pass 를 주면 안 된다", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      title: "보톡스 가격 안내",
      h1: "보톡스 가격",
      questionHeadings: ["눈 보톡스 가격은 얼마인가요?"]
    };

    expect(runRule("턱 보톡스 가격", page)).toMatchObject({ status: "fail", score: 0 });
    expect(runRule("눈 보톡스 가격", page)).toMatchObject({ status: "pass", score: 100 });
  });

  it("룰 배열에서 동어반복 룰이 빠지고 7개를 유지한다", () => {
    expect(defaultAeoReadinessRules).toHaveLength(7);
    expect(defaultAeoReadinessRules.map((rule) => rule.id)).not.toContain(
      "KEYWORD_INTENT_DEFINED",
    );
  });

  it("리포트에 룰 버전을 담는다", () => {
    expect(evaluateAeoReadiness(createInput(), { evaluatedAt }).rulesVersion).toBe("2");
  });

  // 공짜 100점이 사라져 점수가 내려간다. 숫자를 고정해 두면 조용한 회귀를 막는다.
  it("적합성 단계에 따라 점수가 갈린다", () => {
    const covered: AeoPageSignal = {
      ...topicalOnlyPage,
      questionHeadings: ["보톡스 가격은 얼마인가요?"]
    };
    const score = (page: AeoPageSignal) =>
      evaluateAeoReadiness(
        { candidatePage: page, keyword: { ...baseKeyword, phrase: "보톡스 가격" } },
        { evaluatedAt },
      );

    expect(score(covered).score).toBeGreaterThan(score(topicalOnlyPage).score);
    expect(score(topicalOnlyPage).score).toBeGreaterThan(score(unrelatedPage).score);
    // 50점 경계를 넘어 not_ready 로 떨어지는 것이 의도된 결과다(임계값은 바꾸지 않는다).
    expect(score(unrelatedPage).status).toBe("not_ready");
  });
});
