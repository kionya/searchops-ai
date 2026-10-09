import {
  AeoFaqGapSetSchema,
  AeoReadinessCheckSchema,
  AeoReadinessReportSchema,
  ContentBriefDraftSchema,
  KeywordAeoInputSchema,
  KeywordTargetSchema
} from "@searchops/types";
import type {
  AeoEvidenceValue,
  AeoFaqGap,
  AeoFaqGapSet,
  AeoPageSignal,
  AeoReadinessCheck,
  AeoReadinessCheckId,
  AeoReadinessCheckStatus,
  AeoReadinessReport,
  ContentBriefDraft,
  ContentBriefSection,
  KeywordAeoInput,
  KeywordIntent,
  KeywordTarget
} from "@searchops/types";

export const aeoCorePackage = "aeo-core" as const;
export const aeoCoreGenerationMode = "deterministic" as const;

type ScorableKeywordIntent = Exclude<KeywordIntent, "mixed">;

export interface KeywordIntentScore {
  readonly intent: ScorableKeywordIntent;
  readonly matchedTerms: readonly string[];
  readonly score: number;
}

export interface AeoReadinessRuleContext {
  readonly candidatePage: AeoPageSignal | null;
  readonly keyword: KeywordTarget;
}

export interface AeoReadinessRule {
  readonly id: AeoReadinessCheckId;
  readonly evaluate: (context: AeoReadinessRuleContext) => AeoReadinessCheck;
}

export interface AeoReadinessEvaluationOptions {
  readonly evaluatedAt: string;
  readonly rules?: readonly AeoReadinessRule[];
}

export interface AeoFaqGapGenerationOptions {
  readonly evaluatedAt: string;
  readonly maxGaps?: number;
  readonly readinessReport?: AeoReadinessReport;
}

export interface ContentBriefDraftMapperInput {
  readonly candidatePage?: AeoPageSignal | null;
  readonly evaluatedAt?: string;
  readonly faqGapSet?: AeoFaqGapSet;
  readonly keyword: KeywordTarget;
  readonly keywordId?: string | null;
  readonly readinessReport?: AeoReadinessReport;
}

const scorableKeywordIntents = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
  "local"
] as const satisfies readonly ScorableKeywordIntent[];

const keywordIntentLexicon = {
  commercial: [
    "best",
    "compare",
    "comparison",
    "cost",
    "price",
    "pricing",
    "review",
    "service"
  ],
  informational: [
    "benefits",
    "definition",
    "guide",
    "how",
    "meaning",
    "risks",
    "side effects",
    "what",
    "why"
  ],
  local: [
    "clinic",
    "directions",
    "gangnam",
    "hospital",
    "map",
    "near me",
    "nearby",
    "seoul"
  ],
  navigational: [
    "homepage",
    "login",
    "official",
    "portal",
    "support",
    "website"
  ],
  transactional: [
    "appointment",
    "book",
    "buy",
    "order",
    "reserve",
    "subscribe"
  ]
} as const satisfies Record<ScorableKeywordIntent, readonly string[]>;

export function normalizeKeywordPhrase(phrase: string) {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 룰 세트 버전. 점수의 의미가 바뀔 때만 올린다. null 로 저장된 과거 행은 버전 1 이다. */
export const aeoReadinessRulesVersion = "2" as const;

/**
 * 키워드 대조 토큰. 정본은 여기 하나다 — 워커의 페이지 선택과 룰 판정이 같은 토큰을 써야
 * "선택은 했는데 판정은 못 하는" 구간이 생기지 않는다(CLAUDE.md: 사본은 반드시 어긋난다).
 *
 * 글자·숫자가 아닌 것을 경계로 쪼갠다. 구두점을 떼지 않으면 "보톡스 가격?" 의 토큰이
 * "가격?" 이 되어 "가격은 얼마인가요" 를 못 덮는다. 1글자 토큰은 버린다 —
 * 부분일치라 "시" 가 "시술"·"시간"에 전부 걸려 판정이 무의미해진다.
 * 결과가 비면 호출자가 "판정 불가"로 다룬다(룰은 fail, 워커는 대표 페이지 폴백).
 */
export function tokenizeKeywordPhrase(phrase: string): readonly string[] {
  return [
    ...new Set(
      normalizeKeywordPhrase(phrase)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length > 1)
    )
  ];
}

/** 모든 토큰이 haystack 에 있어야 덮은 것이다. 토큰 순서는 보지 않는다. */
export function haystackCoversAllTokens(haystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) {
    return false;
  }

  const normalized = normalizeKeywordPhrase(haystack);

  return tokens.every((token) => normalized.includes(token));
}

export function scoreKeywordIntent(input: KeywordTarget | string): readonly KeywordIntentScore[] {
  const phrase = typeof input === "string" ? input : input.phrase;
  const normalizedPhrase = normalizeKeywordPhrase(phrase);

  return scorableKeywordIntents
    .map((intent) => {
      const matchedTerms = keywordIntentLexicon[intent].filter((term) =>
        phraseMatchesTerm(normalizedPhrase, term),
      );

      return {
        intent,
        matchedTerms,
        score: matchedTerms.length
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        scorableKeywordIntents.indexOf(left.intent) - scorableKeywordIntents.indexOf(right.intent),
    );
}

export function inferKeywordIntent(input: KeywordTarget | string): KeywordIntent {
  const [topScore, secondScore] = scoreKeywordIntent(input);

  if (!topScore || topScore.score === 0) {
    return "informational";
  }

  if (secondScore && secondScore.score === topScore.score) {
    return "mixed";
  }

  return topScore.intent;
}

export function classifyKeywordTargetIntent(keyword: KeywordTarget): KeywordTarget {
  const parsedKeyword = KeywordTargetSchema.parse(keyword);

  return KeywordTargetSchema.parse({
    ...parsedKeyword,
    intent: parsedKeyword.intent ?? inferKeywordIntent(parsedKeyword)
  });
}

/**
 * 이 페이지가 이 질문에 답하는가. F 절이 커버리지를 말할 수 있게 하는 유일한 룰이다.
 *
 * 앞선 KEYWORD_INTENT_DEFINED 는 intent 를 스스로 계산한 뒤 non-null 이라 단정해 항상
 * pass·100 이었다 — 7룰 단순평균에 약 14점을 공짜로 얹고, 질문과 페이지의 관계는 한 번도
 * 보지 않았다. 그래서 콘텐츠가 아예 없는 질문과 있는 질문이 같은 점수를 받았다.
 *
 * 등식으로 비교하지 않는다 — normalizeKeywordPhrase 는 구두점을 떼지 않아
 * "보톡스 가격" 과 "보톡스 가격은 얼마인가요?" 가 다른 문자열이다. 토큰 포함으로 본다.
 *
 * 알려진 한계(⚠️ 검증필요): 워커의 toAeoPageSignal 은 answerBlocks 를 [] 로 고정하므로
 * 크롤 경로에서 pass 는 질문형 헤딩이 있을 때만 난다. answerBlocks 추출기가 생기면 올라간다.
 */
export const pageAnswersQuestionRule: AeoReadinessRule = {
  id: "PAGE_ANSWERS_QUESTION",
  evaluate(context) {
    const page = context.candidatePage;
    const tokens = tokenizeKeywordPhrase(context.keyword.phrase);
    const expectedValue = "Question-form heading or answer block covering the keyword";

    // 토큰이 비는 경우: 키워드가 1글자 토큰뿐이다. 판정할 근거가 없으므로 fail 로 둔다 —
    // 억지로 pass 를 주면 F 절이 없는 커버리지를 있다고 말한다.
    if (page === null || tokens.length === 0) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: page === null ? null : [],
        score: 0,
        sourceField: "questionHeadings",
        status: "fail",
        url: page?.url ?? null
      });
    }

    const questions = uniqueNonBlankStrings([
      ...page.questionHeadings,
      ...page.answerBlocks.map((block) => block.question)
    ]).filter((question) => tokenizeKeywordPhrase(question).length > 0);

    const covering = questions.find((question) => haystackCoversAllTokens(question, tokens));
    if (covering !== undefined) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: covering,
        score: 100,
        sourceField: "questionHeadings,answerBlocks",
        status: "pass",
        url: page.url
      });
    }

    const topical = [page.title ?? "", page.h1 ?? "", page.h2.join(" ")].join(" ");
    if (haystackCoversAllTokens(topical, tokens)) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: normalizeKeywordPhrase(topical),
        score: 60,
        sourceField: "title,h1,h2",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "PAGE_ANSWERS_QUESTION",
      expectedValue,
      observedValue: questions,
      score: 0,
      sourceField: "questionHeadings",
      status: "fail",
      url: page.url
    });
  }
};

export const answerSummaryPresentRule: AeoReadinessRule = {
  id: "ANSWER_SUMMARY_PRESENT",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "ANSWER_SUMMARY_PRESENT",
        expectedValue: "At least one direct answer block",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    if (page.answerBlocks.length > 0) {
      return createAeoReadinessCheck({
        checkId: "ANSWER_SUMMARY_PRESENT",
        expectedValue: "At least one direct answer block",
        observedValue: page.answerBlocks.length,
        score: 100,
        sourceField: "answerBlocks",
        status: "pass",
        url: page.url
      });
    }

    if (isNonBlank(page.metaDescription)) {
      return createAeoReadinessCheck({
        checkId: "ANSWER_SUMMARY_PRESENT",
        expectedValue: "At least one direct answer block",
        observedValue: "Meta description only",
        score: 60,
        sourceField: "metaDescription",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "ANSWER_SUMMARY_PRESENT",
      expectedValue: "At least one direct answer block",
      observedValue: 0,
      score: 0,
      sourceField: "answerBlocks",
      status: "fail",
      url: page.url
    });
  }
};

export const questionCoverageRule: AeoReadinessRule = {
  id: "QUESTION_COVERAGE",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "QUESTION_COVERAGE",
        expectedValue: "At least two question-oriented headings or answer blocks",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    const questionCount = countUniqueQuestions(page);

    if (questionCount >= 2) {
      return createAeoReadinessCheck({
        checkId: "QUESTION_COVERAGE",
        expectedValue: "At least two question-oriented headings or answer blocks",
        observedValue: questionCount,
        score: 100,
        sourceField: "questionHeadings",
        status: "pass",
        url: page.url
      });
    }

    if (questionCount === 1) {
      return createAeoReadinessCheck({
        checkId: "QUESTION_COVERAGE",
        expectedValue: "At least two question-oriented headings or answer blocks",
        observedValue: questionCount,
        score: 60,
        sourceField: "questionHeadings",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "QUESTION_COVERAGE",
      expectedValue: "At least two question-oriented headings or answer blocks",
      observedValue: 0,
      score: 0,
      sourceField: "questionHeadings",
      status: "fail",
      url: page.url
    });
  }
};

export const faqSchemaPresentRule: AeoReadinessRule = {
  id: "FAQ_SCHEMA_PRESENT",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "FAQ_SCHEMA_PRESENT",
        expectedValue: "FAQPage schema when FAQ content exists",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    if (hasSchemaType(page, "FAQPage")) {
      return createAeoReadinessCheck({
        checkId: "FAQ_SCHEMA_PRESENT",
        expectedValue: "FAQPage schema when FAQ content exists",
        observedValue: page.schemaTypes,
        score: 100,
        sourceField: "schemaTypes",
        status: "pass",
        url: page.url
      });
    }

    if (countUniqueQuestions(page) > 0) {
      return createAeoReadinessCheck({
        checkId: "FAQ_SCHEMA_PRESENT",
        expectedValue: "FAQPage schema when FAQ content exists",
        observedValue: page.schemaTypes,
        score: 50,
        sourceField: "schemaTypes",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "FAQ_SCHEMA_PRESENT",
      expectedValue: "FAQPage schema when FAQ content exists",
      observedValue: page.schemaTypes,
      score: 0,
      sourceField: "schemaTypes",
      status: "fail",
      url: page.url
    });
  }
};

export const structuredHeadingsRule: AeoReadinessRule = {
  id: "STRUCTURED_HEADINGS",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "STRUCTURED_HEADINGS",
        expectedValue: "One H1 and at least two supporting H2 headings",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    const hasH1 = isNonBlank(page.h1);

    if (hasH1 && page.h2.length >= 2) {
      return createAeoReadinessCheck({
        checkId: "STRUCTURED_HEADINGS",
        expectedValue: "One H1 and at least two supporting H2 headings",
        observedValue: `h1:${hasH1 ? 1 : 0},h2:${page.h2.length}`,
        score: 100,
        sourceField: "h1,h2",
        status: "pass",
        url: page.url
      });
    }

    if (hasH1 || page.h2.length > 0) {
      return createAeoReadinessCheck({
        checkId: "STRUCTURED_HEADINGS",
        expectedValue: "One H1 and at least two supporting H2 headings",
        observedValue: `h1:${hasH1 ? 1 : 0},h2:${page.h2.length}`,
        score: 65,
        sourceField: "h1,h2",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "STRUCTURED_HEADINGS",
      expectedValue: "One H1 and at least two supporting H2 headings",
      observedValue: "h1:0,h2:0",
      score: 0,
      sourceField: "h1,h2",
      status: "fail",
      url: page.url
    });
  }
};

export const citableSourcePresentRule: AeoReadinessRule = {
  id: "CITABLE_SOURCE_PRESENT",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "CITABLE_SOURCE_PRESENT",
        expectedValue: "Citable URL with title and primary heading",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    const hasTitle = isNonBlank(page.title);
    const hasH1 = isNonBlank(page.h1);

    if (hasTitle && hasH1) {
      return createAeoReadinessCheck({
        checkId: "CITABLE_SOURCE_PRESENT",
        expectedValue: "Citable URL with title and primary heading",
        observedValue: page.url,
        score: 100,
        sourceField: "url,title,h1",
        status: "pass",
        url: page.url
      });
    }

    if (hasTitle || hasH1) {
      return createAeoReadinessCheck({
        checkId: "CITABLE_SOURCE_PRESENT",
        expectedValue: "Citable URL with title and primary heading",
        observedValue: `title:${hasTitle ? 1 : 0},h1:${hasH1 ? 1 : 0}`,
        score: 60,
        sourceField: "title,h1",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "CITABLE_SOURCE_PRESENT",
      expectedValue: "Citable URL with title and primary heading",
      observedValue: "title:0,h1:0",
      score: 0,
      sourceField: "title,h1",
      status: "fail",
      url: page.url
    });
  }
};

export const contentDepthRule: AeoReadinessRule = {
  id: "CONTENT_DEPTH",
  evaluate(context) {
    const page = context.candidatePage;

    if (!page) {
      return createAeoReadinessCheck({
        checkId: "CONTENT_DEPTH",
        expectedValue: "At least 600 words",
        observedValue: null,
        score: 0,
        sourceField: "candidatePage",
        status: "fail",
        url: null
      });
    }

    if (page.wordCount >= 600) {
      return createAeoReadinessCheck({
        checkId: "CONTENT_DEPTH",
        expectedValue: "At least 600 words",
        observedValue: page.wordCount,
        score: 100,
        sourceField: "wordCount",
        status: "pass",
        url: page.url
      });
    }

    if (page.wordCount >= 300) {
      return createAeoReadinessCheck({
        checkId: "CONTENT_DEPTH",
        expectedValue: "At least 600 words",
        observedValue: page.wordCount,
        score: 60,
        sourceField: "wordCount",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "CONTENT_DEPTH",
      expectedValue: "At least 600 words",
      observedValue: page.wordCount,
      score: 0,
      sourceField: "wordCount",
      status: "fail",
      url: page.url
    });
  }
};

export const defaultAeoReadinessRules = [
  pageAnswersQuestionRule,
  answerSummaryPresentRule,
  questionCoverageRule,
  faqSchemaPresentRule,
  structuredHeadingsRule,
  citableSourcePresentRule,
  contentDepthRule
] as const satisfies readonly AeoReadinessRule[];

export function evaluateAeoReadinessRule(
  rule: AeoReadinessRule,
  context: AeoReadinessRuleContext,
) {
  return rule.evaluate({
    ...context,
    keyword: classifyKeywordTargetIntent(context.keyword)
  });
}

export function evaluateAeoReadiness(
  input: KeywordAeoInput,
  options: AeoReadinessEvaluationOptions,
): AeoReadinessReport {
  const parsedInput = KeywordAeoInputSchema.parse(input);
  const keyword = classifyKeywordTargetIntent(parsedInput.keyword);
  const context = {
    candidatePage: parsedInput.candidatePage,
    keyword
  } satisfies AeoReadinessRuleContext;
  const rules = options.rules ?? defaultAeoReadinessRules;
  const checks = rules.map((rule) => evaluateAeoReadinessRule(rule, context));
  const score = calculateAeoReadinessScore(checks);

  return AeoReadinessReportSchema.parse({
    checks,
    evaluatedAt: options.evaluatedAt,
    generatedBy: aeoCoreGenerationMode,
    keyword,
    pageUrl: parsedInput.candidatePage?.url ?? null,
    rulesVersion: aeoReadinessRulesVersion,
    score,
    status: getAeoReadinessStatus(score)
  });
}

export function generateAeoFaqGapSet(
  input: KeywordAeoInput,
  options: AeoFaqGapGenerationOptions,
): AeoFaqGapSet {
  const parsedInput = KeywordAeoInputSchema.parse(input);
  const keyword = classifyKeywordTargetIntent(parsedInput.keyword);
  const candidatePage = parsedInput.candidatePage;
  const readinessReport =
    options.readinessReport ??
    evaluateAeoReadiness(
      {
        candidatePage,
        keyword
      },
      { evaluatedAt: options.evaluatedAt },
    );

  assertKeywordAlignment(keyword, readinessReport.keyword, "readinessReport.keyword");

  const observedQuestions = collectObservedQuestions(candidatePage);
  const priority = getFaqGapPriority(candidatePage, readinessReport);
  const gaps = createFaqGapQuestions(keyword, candidatePage, readinessReport)
    .filter((question) => !observedQuestions.normalized.has(normalizeKeywordPhrase(question)))
    .slice(0, options.maxGaps ?? 6)
    .map<AeoFaqGap>((question) => ({
      evidence: {
        expectedValue: question,
        observedValue: observedQuestions.values,
        sourceField: "questionHeadings,answerBlocks",
        url: candidatePage?.url ?? null
      },
      intent: classifyQuestionIntent(question),
      priority,
      question,
      suggestedAnswerAngle: createSuggestedAnswerAngle(question)
    }));

  return AeoFaqGapSetSchema.parse({
    evaluatedAt: options.evaluatedAt,
    gaps,
    generatedBy: aeoCoreGenerationMode,
    keyword,
    pageUrl: candidatePage?.url ?? null
  });
}

export function createContentBriefDraft(
  input: ContentBriefDraftMapperInput,
): ContentBriefDraft {
  const keyword = classifyKeywordTargetIntent(input.keyword);
  const candidatePage = input.candidatePage ?? null;
  const readinessReport = resolveReadinessReport(input, keyword, candidatePage);
  const faqGapSet = input.faqGapSet
    ? AeoFaqGapSetSchema.parse(input.faqGapSet)
    : generateAeoFaqGapSet(
        {
          candidatePage,
          keyword
        },
        { evaluatedAt: readinessReport.evaluatedAt, readinessReport },
      );

  assertKeywordAlignment(keyword, readinessReport.keyword, "readinessReport.keyword");

  assertKeywordAlignment(keyword, faqGapSet.keyword, "faqGapSet.keyword");

  const faqQuestions = collectContentBriefQuestions(keyword, candidatePage, faqGapSet);
  const acceptanceCriteria = createContentBriefAcceptanceCriteria(readinessReport);
  const outline = createContentBriefOutline({
    acceptanceCriteria,
    candidatePage,
    faqQuestions,
    keyword,
    readinessReport
  });
  const intent = keyword.intent ?? "informational";

  return ContentBriefDraftSchema.parse({
    acceptanceCriteria,
    faqQuestions,
    generationMode: aeoCoreGenerationMode,
    intent,
    keywordId: input.keywordId ?? null,
    locale: keyword.locale,
    outline,
    primaryKeyword: keyword.phrase,
    publishPolicy: "draft_only",
    siteId: keyword.siteId,
    status: "draft",
    summary: createContentBriefSummary(keyword, readinessReport),
    title: createContentBriefTitle(keyword, candidatePage)
  });
}

export function createContentBriefOutline({
  acceptanceCriteria,
  candidatePage,
  faqQuestions,
  keyword,
  readinessReport
}: {
  readonly acceptanceCriteria: readonly string[];
  readonly candidatePage: AeoPageSignal | null;
  readonly faqQuestions: readonly string[];
  readonly keyword: KeywordTarget;
  readonly readinessReport: AeoReadinessReport;
}): ContentBriefSection[] {
  const intent = keyword.intent ?? "informational";
  const firstQuestion = faqQuestions.slice(0, 1);
  const remainingQuestions = faqQuestions.slice(1);
  const weakChecks = readinessReport.checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.checkId);

  return [
    {
      acceptanceCriteria: [
        "Open with a concise answer block before long supporting copy.",
        `Match ${intent} search intent for the primary keyword.`
      ],
      heading: `${toTitleCase(keyword.phrase)} direct answer`,
      purpose: createIntentPurpose(intent),
      targetQuestions: firstQuestion
    },
    {
      acceptanceCriteria: [
        "Cover each planned question with a direct answer and supporting detail.",
        "Keep question headings clear enough to become future FAQ candidates."
      ],
      heading: "Question coverage",
      purpose: "Close answer gaps that search engines and answer engines can extract.",
      targetQuestions: remainingQuestions.length > 0 ? remainingQuestions : firstQuestion
    },
    {
      acceptanceCriteria: [
        candidatePage
          ? "Use the existing page topic as source context, but keep the brief in draft state."
          : "Mark source content as missing and request a candidate page before publishing.",
        "Use one H1 plan, supporting H2 sections, and enough depth for a complete answer."
      ],
      heading: "Evidence and page structure",
      purpose: "Turn readiness signals into concrete page structure requirements.",
      targetQuestions: []
    },
    {
      acceptanceCriteria: [...acceptanceCriteria],
      heading: "Review checklist",
      purpose:
        weakChecks.length > 0
          ? `Resolve weak readiness checks: ${weakChecks.join(", ")}.`
          : "Confirm the page remains ready after human review.",
      targetQuestions: []
    }
  ];
}

export function calculateAeoReadinessScore(checks: readonly AeoReadinessCheck[]) {
  if (checks.length === 0) {
    throw new Error("AEO readiness scoring requires at least one check");
  }

  return Math.round(checks.reduce((total, check) => total + check.score, 0) / checks.length);
}

export function getAeoReadinessStatus(score: number) {
  if (score >= 80) {
    return "ready";
  }

  if (score >= 50) {
    return "needs_work";
  }

  return "not_ready";
}

function createAeoReadinessCheck({
  checkId,
  expectedValue,
  observedValue,
  score,
  sourceField,
  status,
  url
}: {
  readonly checkId: AeoReadinessCheckId;
  readonly expectedValue: AeoEvidenceValue;
  readonly observedValue: AeoEvidenceValue;
  readonly score: number;
  readonly sourceField: string;
  readonly status: AeoReadinessCheckStatus;
  readonly url: string | null;
}) {
  return AeoReadinessCheckSchema.parse({
    checkId,
    evidence: {
      expectedValue,
      observedValue,
      sourceField,
      url
    },
    score,
    status
  });
}

function resolveReadinessReport(
  input: ContentBriefDraftMapperInput,
  keyword: KeywordTarget,
  candidatePage: AeoPageSignal | null,
) {
  if (input.readinessReport) {
    return AeoReadinessReportSchema.parse(input.readinessReport);
  }

  if (!input.evaluatedAt) {
    throw new Error("Content brief draft mapping requires evaluatedAt when readinessReport is absent");
  }

  return evaluateAeoReadiness(
    {
      candidatePage,
      keyword
    },
    { evaluatedAt: input.evaluatedAt },
  );
}

function assertKeywordAlignment(
  expectedKeyword: KeywordTarget,
  observedKeyword: KeywordTarget,
  sourceField: string,
) {
  if (
    expectedKeyword.siteId !== observedKeyword.siteId ||
    normalizeKeywordPhrase(expectedKeyword.phrase) !== normalizeKeywordPhrase(observedKeyword.phrase)
  ) {
    throw new Error(`Content brief ${sourceField} must match the mapper keyword`);
  }
}

function collectContentBriefQuestions(
  keyword: KeywordTarget,
  candidatePage: AeoPageSignal | null,
  faqGapSet: AeoFaqGapSet | null,
) {
  return uniqueNonBlankStrings([
    ...(faqGapSet?.gaps.map((gap) => gap.question) ?? []),
    ...(candidatePage?.questionHeadings ?? []),
    ...(candidatePage?.answerBlocks.map((block) => block.question) ?? []),
    ...createDefaultQuestions(keyword)
  ]).slice(0, 6);
}

function createFaqGapQuestions(
  keyword: KeywordTarget,
  candidatePage: AeoPageSignal | null,
  readinessReport: AeoReadinessReport,
) {
  if (!candidatePage) {
    return createDefaultQuestions(keyword);
  }

  const weakCheckIds = new Set(
    readinessReport.checks
      .filter((check) => check.status !== "pass")
      .map((check) => check.checkId),
  );

  if (
    !weakCheckIds.has("ANSWER_SUMMARY_PRESENT") &&
    !weakCheckIds.has("QUESTION_COVERAGE") &&
    !weakCheckIds.has("CONTENT_DEPTH")
  ) {
    return [];
  }

  return createDefaultQuestions(keyword);
}

function collectObservedQuestions(candidatePage: AeoPageSignal | null) {
  const values = uniqueNonBlankStrings([
    ...(candidatePage?.questionHeadings ?? []),
    ...(candidatePage?.answerBlocks.map((block) => block.question) ?? [])
  ]);

  return {
    normalized: new Set(values.map(normalizeKeywordPhrase)),
    values
  };
}

function getFaqGapPriority(
  candidatePage: AeoPageSignal | null,
  readinessReport: AeoReadinessReport,
): AeoFaqGap["priority"] {
  if (!candidatePage || readinessReport.status === "not_ready") {
    return "p1";
  }

  if (
    readinessReport.checks.some(
      (check) =>
        check.status === "fail" &&
        ["ANSWER_SUMMARY_PRESENT", "QUESTION_COVERAGE", "CONTENT_DEPTH"].includes(check.checkId),
    )
  ) {
    return "p1";
  }

  if (
    readinessReport.checks.some(
      (check) =>
        check.status === "warning" &&
        ["ANSWER_SUMMARY_PRESENT", "QUESTION_COVERAGE", "CONTENT_DEPTH"].includes(check.checkId),
    )
  ) {
    return "p2";
  }

  return "p3";
}

function classifyQuestionIntent(question: string): AeoFaqGap["intent"] {
  const normalizedQuestion = normalizeKeywordPhrase(question);

  if (/^(what is|what are|what does)\b/u.test(normalizedQuestion)) {
    return "definition";
  }

  if (/^how much\b/u.test(normalizedQuestion)) {
    return "pricing";
  }

  if (/\b(compare|comparison|best|option|options)\b/u.test(normalizedQuestion)) {
    return "comparison";
  }

  if (/\b(cost|price|pricing|fee|fees)\b/u.test(normalizedQuestion)) {
    return "pricing";
  }

  if (/^(how|how can|how does|what happens)/u.test(normalizedQuestion)) {
    return "how_to";
  }

  if (/\b(where|near me|nearby|local|location|directions)\b/u.test(normalizedQuestion)) {
    return "local";
  }

  if (/\b(risk|risks|side effect|side effects|safe|safety)\b/u.test(normalizedQuestion)) {
    return "risk";
  }

  if (/\b(eligible|eligibility|candidate|right for them)\b/u.test(normalizedQuestion)) {
    return "eligibility";
  }

  if (/\b(after|aftercare|recovery|follow up)\b/u.test(normalizedQuestion)) {
    return "aftercare";
  }

  return "other";
}

function createSuggestedAnswerAngle(question: string) {
  switch (classifyQuestionIntent(question)) {
    case "aftercare":
      return "Explain the follow-up or aftercare steps without promising outcomes.";
    case "comparison":
      return "Compare decision criteria objectively and avoid unsupported superiority claims.";
    case "definition":
      return "Define the topic in a short answer block before adding supporting detail.";
    case "eligibility":
      return "Describe who the topic may fit and what should be checked before deciding.";
    case "how_to":
      return "Answer the process step-by-step with clear prerequisites and next actions.";
    case "local":
      return "Answer location-sensitive intent and make the local next step clear.";
    case "pricing":
      return "Explain price factors and scope without unsupported discount or guarantee claims.";
    case "risk":
      return "Explain risks, limits, and review needs in balanced language.";
    case "other":
      return "Answer the question directly, then add evidence and next-step guidance.";
  }
}

function createDefaultQuestions(keyword: KeywordTarget) {
  const phrase = createQuestionTopic(keyword.phrase);
  const intent = keyword.intent ?? "informational";

  switch (intent) {
    case "commercial":
      return [
        `What does ${phrase} include?`,
        `How much does ${phrase} cost?`,
        `How should users compare ${phrase} options?`
      ];
    case "local":
      return [
        `Where is ${phrase} available?`,
        `How can users choose a local provider for ${phrase}?`,
        `What should users check before visiting for ${phrase}?`
      ];
    case "mixed":
      return [
        `What is ${phrase}?`,
        `What does ${phrase} include?`,
        `How should users decide if ${phrase} is right for them?`
      ];
    case "navigational":
      return [
        `Where can users find ${phrase}?`,
        `What is the official page for ${phrase}?`,
        `How can users get support for ${phrase}?`
      ];
    case "transactional":
      return [
        `How can users book ${phrase}?`,
        `What information is needed before ${phrase}?`,
        `What happens after requesting ${phrase}?`
      ];
    case "informational":
      return [
        `What is ${phrase}?`,
        `How does ${phrase} work?`,
        `What should users know before choosing ${phrase}?`
      ];
  }
}

function createQuestionTopic(phrase: string) {
  return normalizeKeywordPhrase(phrase).replace(/^(what is|what are|how to|how does)\s+/u, "");
}

function createContentBriefAcceptanceCriteria(readinessReport: AeoReadinessReport) {
  const criteria = [
    "Keep the content brief in draft status until human review is complete.",
    "Do not auto-publish the brief to any CMS or external channel.",
    "Use the primary keyword naturally in the title, H1 plan, and direct answer."
  ];

  for (const check of readinessReport.checks) {
    if (check.status === "pass") {
      continue;
    }

    criteria.push(acceptanceCriterionByCheckId[check.checkId]);
  }

  return uniqueNonBlankStrings(criteria);
}

const acceptanceCriterionByCheckId = {
  ANSWER_SUMMARY_PRESENT: "Add at least one concise answer block near the top of the page.",
  CITABLE_SOURCE_PRESENT: "Plan a citable page title and primary heading.",
  CONTENT_DEPTH: "Plan enough supporting sections to reach at least 600 words.",
  FAQ_SCHEMA_PRESENT: "Structure FAQ candidates so they can later support FAQPage schema.",
  KEYWORD_INTENT_DEFINED: "State the deterministic keyword intent in the brief.",
  PAGE_ANSWERS_QUESTION:
    "Answer the keyword's question directly in a question-form heading or answer block.",
  QUESTION_COVERAGE: "Include at least two question-led subsections.",
  STRUCTURED_HEADINGS: "Use one H1 plan and at least two supporting H2 sections."
} as const satisfies Record<AeoReadinessCheckId, string>;

function createContentBriefSummary(
  keyword: KeywordTarget,
  readinessReport: AeoReadinessReport,
) {
  const intent = keyword.intent ?? "informational";

  return `${keyword.phrase} has ${readinessReport.status} AEO readiness with score ${String(
    readinessReport.score,
  )}. Create a draft-only ${intent} brief that closes readiness gaps before human review.`;
}

function createContentBriefTitle(keyword: KeywordTarget, candidatePage: AeoPageSignal | null) {
  const topic = isNonBlank(candidatePage?.h1 ?? null)
    ? candidatePage?.h1 ?? keyword.phrase
    : toTitleCase(keyword.phrase);

  return `${topic} content brief`;
}

function createIntentPurpose(intent: KeywordIntent) {
  switch (intent) {
    case "commercial":
      return "Help users compare options and understand value before they choose a provider.";
    case "local":
      return "Answer location-sensitive questions and make the local next step clear.";
    case "mixed":
      return "Cover definition, comparison, and decision criteria in one structured draft.";
    case "navigational":
      return "Help users reach the official destination and understand what to do there.";
    case "transactional":
      return "Help users understand the action, requirements, and next step.";
    case "informational":
      return "Explain the topic clearly with a direct answer and supporting context.";
  }
}

function uniqueNonBlankStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function countUniqueQuestions(page: AeoPageSignal) {
  return new Set([
    ...page.questionHeadings.map(normalizeKeywordPhrase),
    ...page.answerBlocks.map((block) => normalizeKeywordPhrase(block.question))
  ]).size;
}

function hasSchemaType(page: AeoPageSignal, schemaType: string) {
  const expected = schemaType.toLowerCase();

  return page.schemaTypes.some((type) => type.toLowerCase() === expected);
}

function isNonBlank(value: string | null) {
  return value !== null && value.trim().length > 0;
}

function phraseMatchesTerm(normalizedPhrase: string, term: string) {
  const normalizedTerm = normalizeKeywordPhrase(term);

  if (/^[a-z0-9 ]+$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "u").test(
      normalizedPhrase,
    );
  }

  return normalizedPhrase.includes(normalizedTerm);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitleCase(value: string) {
  return normalizeKeywordPhrase(value)
    .split(" ")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
