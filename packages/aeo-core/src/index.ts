import {
  AeoReadinessCheckSchema,
  AeoReadinessReportSchema,
  KeywordAeoInputSchema,
  KeywordTargetSchema
} from "@searchops/types";
import type {
  AeoEvidenceValue,
  AeoPageSignal,
  AeoReadinessCheck,
  AeoReadinessCheckId,
  AeoReadinessCheckStatus,
  AeoReadinessReport,
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

export const keywordIntentDefinedRule: AeoReadinessRule = {
  id: "KEYWORD_INTENT_DEFINED",
  evaluate(context) {
    const keyword = classifyKeywordTargetIntent(context.keyword);

    return createAeoReadinessCheck({
      checkId: "KEYWORD_INTENT_DEFINED",
      expectedValue: "Non-null deterministic keyword intent",
      observedValue: keyword.intent,
      score: 100,
      sourceField: "keyword.intent",
      status: "pass",
      url: context.candidatePage?.url ?? null
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
  keywordIntentDefinedRule,
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
    score,
    status: getAeoReadinessStatus(score)
  });
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
