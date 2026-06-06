import {
  ComplianceFlagDraftSchema,
  ComplianceReviewInputSchema,
  ComplianceReviewReportSchema
} from "@searchops/types";
import type {
  ComplianceFlagDraft,
  ComplianceReviewInput,
  ComplianceReviewReport,
  ComplianceRiskLevel,
  ComplianceRuleId,
  ComplianceRulePackId
} from "@searchops/types";

export const compliancePackage = "compliance" as const;
export const complianceGenerationMode = "deterministic" as const;
export const medicalContentPublishPolicy = "draft-with-compliance-flags-only" as const;

export interface ComplianceEvaluationOptions {
  readonly evaluatedAt?: string;
  readonly rulePackId?: ComplianceRulePackId;
  readonly rules?: readonly ComplianceRule[];
}

export interface ComplianceRule {
  readonly id: ComplianceRuleId;
  readonly evaluate: (input: ComplianceReviewInput) => readonly ComplianceFlagDraft[];
}

export interface ComplianceRulePack {
  readonly id: ComplianceRulePackId;
  readonly localePattern: RegExp;
  readonly rules: readonly ComplianceRule[];
}

export type ComplianceRulePackRefinementStageStatus = "blocked" | "needs_owner" | "ready";

export interface ComplianceRulePackRefinementStage {
  readonly evidence: string;
  readonly id: string;
  readonly nextAction: string;
  readonly status: ComplianceRulePackRefinementStageStatus;
  readonly title: string;
}

export interface ComplianceRulePackRefinementPlan {
  readonly autoPublishAllowed: false;
  readonly generatedBy: typeof complianceGenerationMode;
  readonly legalOwnerRequired: boolean;
  readonly publishPolicy: "draft_only";
  readonly ruleCount: number;
  readonly rulePackId: ComplianceRulePackId;
  readonly stages: readonly ComplianceRulePackRefinementStage[];
  readonly supportedRuleIds: readonly ComplianceRuleId[];
}

interface CompliancePatternRuleConfig {
  readonly id: ComplianceRuleId;
  readonly riskLevel: ComplianceRiskLevel;
  readonly title: string;
  readonly message: string;
  readonly expectedValue: string;
  readonly recommendation: string;
  readonly replacementSuggestion: string;
  readonly patterns: readonly RegExp[];
}

interface ComplianceMatch {
  readonly match: string;
  readonly index: number;
}

export const supportedComplianceRuleIds = [
  "GUARANTEED_RESULT_CLAIM",
  "ABSOLUTE_SAFETY_CLAIM",
  "SUPERLATIVE_CLAIM",
  "BEFORE_AFTER_REFERENCE",
  "PATIENT_TESTIMONIAL_REFERENCE",
  "PRICE_DISCOUNT_PROMOTION",
  "UNREVIEWED_MEDICAL_PUBLISH"
] as const satisfies readonly ComplianceRuleId[];

const guaranteedResultClaimRuleConfig = {
  id: "GUARANTEED_RESULT_CLAIM",
  riskLevel: "critical",
  title: "Guaranteed medical result claim",
  message: "The content appears to promise a guaranteed or permanent medical outcome.",
  expectedValue: "Medical content must not guarantee results or permanent cures.",
  recommendation:
    "Rewrite the claim as factual service information and route the draft to legal review.",
  replacementSuggestion:
    "Describe available services, expected consultation steps, and individual variation without promising an outcome.",
  patterns: [
    /\bguaranteed\b/iu,
    /\bresults?\s+guaranteed\b/iu,
    /\b100%\s*(effective|success|guaranteed)\b/iu,
    /\bpermanent\s+cure\b/iu,
    /\bcure\s+permanently\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const absoluteSafetyClaimRuleConfig = {
  id: "ABSOLUTE_SAFETY_CLAIM",
  riskLevel: "high",
  title: "Absolute safety claim",
  message: "The content uses absolute safety language for a medical service or treatment.",
  expectedValue: "Medical content should avoid absolute safety, pain, or risk claims.",
  recommendation:
    "Replace absolute safety language with balanced, reviewable wording and include consultation context.",
  replacementSuggestion:
    "Explain that risks, discomfort, and recovery can vary by individual and require professional consultation.",
  patterns: [
    /\bcompletely\s+safe\b/iu,
    /\brisk[-\s]?free\b/iu,
    /\bno\s+side\s+effects?\b/iu,
    /\bside[-\s]?effect\s+free\b/iu,
    /\bpainless\b/iu,
    /\bzero\s+risk\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const superlativeClaimRuleConfig = {
  id: "SUPERLATIVE_CLAIM",
  riskLevel: "medium",
  title: "Unqualified superlative claim",
  message: "The content uses ranking or superiority language that needs substantiation.",
  expectedValue: "Superlative claims need substantiation or should be removed.",
  recommendation:
    "Remove ranking language unless approved evidence and required disclosures are available.",
  replacementSuggestion:
    "Use specific, verifiable attributes such as service scope, location, or clinician credentials.",
  patterns: [
    /\bbest\b/iu,
    /\bnumber\s*1\b/iu,
    /\bno\.\s*1\b/iu,
    /\btop[-\s]?rated\b/iu,
    /\bmost\s+effective\b/iu,
    /\bworld[-\s]?class\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const beforeAfterReferenceRuleConfig = {
  id: "BEFORE_AFTER_REFERENCE",
  riskLevel: "medium",
  title: "Before-and-after reference",
  message: "The content references before-and-after material that may need review.",
  expectedValue: "Before-and-after references must be reviewed before publication.",
  recommendation:
    "Confirm whether the material is allowed, consented, representative, and properly disclosed.",
  replacementSuggestion:
    "Keep outcome examples out of public drafts until legal review confirms they are permitted.",
  patterns: [
    /\bbefore\s*(and|\/|&)?\s*after\b/iu,
    /\bcase\s+photos?\b/iu,
    /\btreatment\s+results?\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const patientTestimonialReferenceRuleConfig = {
  id: "PATIENT_TESTIMONIAL_REFERENCE",
  riskLevel: "medium",
  title: "Patient testimonial reference",
  message: "The content references testimonials or patient reviews.",
  expectedValue: "Patient testimonial usage must be reviewed for consent, accuracy, and ad rules.",
  recommendation:
    "Route testimonial language to legal review and avoid implying typical medical outcomes.",
  replacementSuggestion:
    "Summarize clinic process or service information without relying on patient endorsement.",
  patterns: [
    /\btestimonial\b/iu,
    /\bpatient\s+reviews?\b/iu,
    /\breal\s+patients?\b/iu,
    /\bcustomer\s+stor(?:y|ies)\b/iu,
    /\breview\s+says\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const priceDiscountPromotionRuleConfig = {
  id: "PRICE_DISCOUNT_PROMOTION",
  riskLevel: "medium",
  title: "Price or discount promotion",
  message: "The content uses price promotion language that may require review.",
  expectedValue: "Medical price promotions should be reviewed for required conditions and limits.",
  recommendation:
    "Confirm promotion eligibility, dates, exclusions, and required disclosures before publishing.",
  replacementSuggestion:
    "Move promotional details into a reviewed campaign asset with clear conditions.",
  patterns: [
    /\bdiscount\b/iu,
    /\blimited[-\s]?time\b/iu,
    /\bevent\s+price\b/iu,
    /\bspecial\s+offer\b/iu,
    /\b\d{1,2}%\s*off\b/iu,
    /\bfree\s+consultation\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

export const guaranteedResultClaimRule = createPatternRule(guaranteedResultClaimRuleConfig);
export const absoluteSafetyClaimRule = createPatternRule(absoluteSafetyClaimRuleConfig);
export const superlativeClaimRule = createPatternRule(superlativeClaimRuleConfig);
export const beforeAfterReferenceRule = createPatternRule(beforeAfterReferenceRuleConfig);
export const patientTestimonialReferenceRule = createPatternRule(
  patientTestimonialReferenceRuleConfig,
);
export const priceDiscountPromotionRule = createPatternRule(priceDiscountPromotionRuleConfig);

export const krGuaranteedResultClaimRule = createPatternRule({
  ...guaranteedResultClaimRuleConfig,
  patterns: [
    ...guaranteedResultClaimRuleConfig.patterns,
    /100\s*%\s*(효과|성공|보장)/iu,
    /효과\s*(보장|확실)/iu,
    /완치/iu,
    /영구(적)?\s*(개선|효과|해결)/iu,
    /재발\s*(없|방지)/iu
  ]
});

export const krAbsoluteSafetyClaimRule = createPatternRule({
  ...absoluteSafetyClaimRuleConfig,
  patterns: [
    ...absoluteSafetyClaimRuleConfig.patterns,
    /부작용\s*(없|없는|제로|0)/iu,
    /통증\s*(없|없는|제로|0)/iu,
    /무통\s*(시술|치료)?/iu,
    /위험\s*(없|없는|제로|0)/iu,
    /안전\s*보장/iu
  ]
});

export const krSuperlativeClaimRule = createPatternRule({
  ...superlativeClaimRuleConfig,
  patterns: [
    ...superlativeClaimRuleConfig.patterns,
    /국내\s*최고/iu,
    /최고의\s*(시술|치료|병원|의원|클리닉)/iu,
    /\b1\s*위\b/iu,
    /유일(한)?\s*(시술|치료|병원|의원|클리닉)/iu,
    /최상위\s*(실력|의료진|클리닉)/iu
  ]
});

export const krBeforeAfterReferenceRule = createPatternRule({
  ...beforeAfterReferenceRuleConfig,
  patterns: [
    ...beforeAfterReferenceRuleConfig.patterns,
    /전후\s*(사진|비교|사례)/iu,
    /비포\s*애프터/iu,
    /시술\s*결과\s*(사진|사례)/iu,
    /치료\s*결과\s*(사진|사례)/iu
  ]
});

export const krPatientTestimonialReferenceRule = createPatternRule({
  ...patientTestimonialReferenceRuleConfig,
  patterns: [
    ...patientTestimonialReferenceRuleConfig.patterns,
    /환자\s*후기/iu,
    /치료\s*후기/iu,
    /시술\s*후기/iu,
    /리얼\s*후기/iu,
    /고객\s*후기/iu
  ]
});

export const krPriceDiscountPromotionRule = createPatternRule({
  ...priceDiscountPromotionRuleConfig,
  patterns: [
    ...priceDiscountPromotionRuleConfig.patterns,
    /할인/iu,
    /특가/iu,
    /이벤트\s*(가격|가|중)/iu,
    /무료\s*상담/iu,
    /선착순\s*(이벤트|할인|혜택)/iu
  ]
});

export const unreviewedMedicalPublishRule = {
  id: "UNREVIEWED_MEDICAL_PUBLISH",
  evaluate(input) {
    const parsedInput = ComplianceReviewInputSchema.parse(input);

    if (parsedInput.publishState === "draft" || !isMedicalContext(parsedInput)) {
      return [];
    }

    return [
      createComplianceFlagDraft({
        input: parsedInput,
        match: {
          index: 0,
          match: parsedInput.publishState
        },
        ruleId: "UNREVIEWED_MEDICAL_PUBLISH",
        riskLevel: "critical",
        title: "Medical content is not draft-only",
        message: "Medical content is scheduled or published without an explicit compliance pass.",
        observedValue: parsedInput.publishState,
        expectedValue: "draft",
        sourceField: "publishState",
        recommendation:
          "Move the content back to draft or keep it unpublished until legal review approves it.",
        replacementSuggestion: "Keep medical content in draft_only workflow until review is complete."
      })
    ];
  }
} satisfies ComplianceRule;

export const defaultComplianceRules = [
  guaranteedResultClaimRule,
  absoluteSafetyClaimRule,
  superlativeClaimRule,
  beforeAfterReferenceRule,
  patientTestimonialReferenceRule,
  priceDiscountPromotionRule,
  unreviewedMedicalPublishRule
] as const satisfies readonly ComplianceRule[];

export const krMedicalComplianceRules = [
  krGuaranteedResultClaimRule,
  krAbsoluteSafetyClaimRule,
  krSuperlativeClaimRule,
  krBeforeAfterReferenceRule,
  krPatientTestimonialReferenceRule,
  krPriceDiscountPromotionRule,
  unreviewedMedicalPublishRule
] as const satisfies readonly ComplianceRule[];

export const complianceRulePacks = {
  global: {
    id: "global",
    localePattern: /.*/u,
    rules: defaultComplianceRules
  },
  "kr-medical": {
    id: "kr-medical",
    localePattern: /(^ko\b|-kr$)/iu,
    rules: krMedicalComplianceRules
  }
} as const satisfies Record<ComplianceRulePackId, ComplianceRulePack>;

export function evaluateCompliance(
  input: ComplianceReviewInput,
  options: ComplianceEvaluationOptions = {},
): ComplianceReviewReport {
  const parsedInput = ComplianceReviewInputSchema.parse(input);
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const rulePackId = options.rulePackId ?? selectComplianceRulePackId(parsedInput);
  const rules = options.rules ?? complianceRulePacks[rulePackId].rules;
  const flags = rules.flatMap((rule) => rule.evaluate(parsedInput));
  const overallRiskLevel = getHighestRiskLevel(flags);

  return ComplianceReviewReportSchema.parse({
    input: parsedInput,
    flags,
    rulePackId,
    status: getReviewStatus(overallRiskLevel),
    overallRiskLevel,
    publishPolicy: "draft_only",
    generatedBy: complianceGenerationMode,
    evaluatedAt
  });
}

export function selectComplianceRulePackId(input: ComplianceReviewInput): ComplianceRulePackId {
  const parsedInput = ComplianceReviewInputSchema.parse(input);

  if (isKrMarketContext(parsedInput) && isMedicalContext(parsedInput)) {
    return "kr-medical";
  }

  return "global";
}

export function createComplianceRulePackRefinementPlan(
  rulePackId: ComplianceRulePackId = "kr-medical",
): ComplianceRulePackRefinementPlan {
  const rulePack = complianceRulePacks[rulePackId];
  const supportedRuleIds = rulePack.rules.map((rule) => rule.id);
  const missingRuleIds = supportedComplianceRuleIds.filter(
    (ruleId) => !supportedRuleIds.includes(ruleId),
  );
  const hasDraftOnlyGate = supportedRuleIds.includes("UNREVIEWED_MEDICAL_PUBLISH");

  return {
    autoPublishAllowed: false,
    generatedBy: complianceGenerationMode,
    legalOwnerRequired: true,
    publishPolicy: "draft_only",
    ruleCount: supportedRuleIds.length,
    rulePackId,
    stages: [
      {
        evidence:
          missingRuleIds.length === 0
            ? `${supportedRuleIds.length} deterministic rules cover every supported medical advertising rule id.`
            : `Missing deterministic rule ids: ${missingRuleIds.join(", ")}.`,
        id: "rule_coverage",
        nextAction:
          missingRuleIds.length === 0
            ? "Keep fixture coverage aligned with each supported rule id."
            : "Add deterministic rules before expanding the rule pack.",
        status: missingRuleIds.length === 0 ? "ready" : "blocked",
        title: "Deterministic rule coverage",
      },
      {
        evidence:
          rulePackId === "kr-medical"
            ? "KR medical pack contains Korean phrase refinements for outcomes, safety, superlatives, before/after, testimonials, and promotions."
            : "Global pack uses English baseline medical advertising risk phrases.",
        id: "market_phrase_refinement",
        nextAction:
          rulePackId === "kr-medical"
            ? "Review false positive and false negative Korean phrases with legal or market owner before deployment."
            : "Create market-specific phrase refinements before using this pack for non-English medical copy.",
        status: "ready",
        title: "Market phrase refinement",
      },
      {
        evidence: "Rule pack changes affect legal-review routing and draft-only gates.",
        id: "legal_owner_review",
        nextAction: "Assign a legal or market owner to approve phrase changes and severity calibration.",
        status: "needs_owner",
        title: "Legal owner approval",
      },
      {
        evidence: hasDraftOnlyGate
          ? "UNREVIEWED_MEDICAL_PUBLISH remains part of the rule pack."
          : "Draft-only publish guard is missing from this rule pack.",
        id: "draft_only_publish_gate",
        nextAction: "Keep medical content in draft-only workflows and do not connect rule output to CMS publish actions.",
        status: hasDraftOnlyGate ? "ready" : "blocked",
        title: "Draft-only publish gate",
      },
    ],
    supportedRuleIds,
  };
}

function isKrMarketContext(input: ComplianceReviewInput) {
  return (
    complianceRulePacks["kr-medical"].localePattern.test(input.locale) || isKrDomain(input.url)
  );
}

function isKrDomain(url: string | null) {
  if (!url) {
    return false;
  }

  try {
    return new URL(url).hostname.toLowerCase().endsWith(".kr");
  } catch {
    return false;
  }
}

function createPatternRule(config: CompliancePatternRuleConfig): ComplianceRule {
  return {
    id: config.id,
    evaluate(input) {
      const parsedInput = ComplianceReviewInputSchema.parse(input);
      const match = findFirstMatch(parsedInput.text, config.patterns);

      if (!match || !isMedicalContext(parsedInput)) {
        return [];
      }

      return [
        createComplianceFlagDraft({
          input: parsedInput,
          match,
          ruleId: config.id,
          riskLevel: config.riskLevel,
          title: config.title,
          message: config.message,
          observedValue: match.match,
          expectedValue: config.expectedValue,
          sourceField: "text",
          recommendation: config.recommendation,
          replacementSuggestion: config.replacementSuggestion
        })
      ];
    }
  };
}

function createComplianceFlagDraft({
  expectedValue,
  input,
  match,
  message,
  observedValue,
  recommendation,
  replacementSuggestion,
  riskLevel,
  ruleId,
  sourceField,
  title
}: {
  readonly expectedValue: string;
  readonly input: ComplianceReviewInput;
  readonly match: ComplianceMatch;
  readonly message: string;
  readonly observedValue: string;
  readonly recommendation: string;
  readonly replacementSuggestion: string;
  readonly riskLevel: ComplianceRiskLevel;
  readonly ruleId: ComplianceRuleId;
  readonly sourceField: string;
  readonly title: string;
}) {
  return ComplianceFlagDraftSchema.parse({
    ruleId,
    riskLevel,
    status: "open",
    title,
    message,
    evidence: {
      url: input.url,
      excerpt: createExcerpt(input.text, match.index, match.match),
      observedValue,
      expectedValue,
      sourceField,
      match: match.match
    },
    recommendation,
    replacementSuggestion,
    ownerType: "legal",
    publishPolicy: "draft_only",
    generatedBy: complianceGenerationMode
  });
}

function findFirstMatch(text: string, patterns: readonly RegExp[]): ComplianceMatch | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);

    if (!match || match.index < 0) {
      continue;
    }

    return {
      index: match.index,
      match: match[0]
    };
  }

  return null;
}

function createExcerpt(text: string, index: number, match: string) {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + match.length + 48);
  const excerpt = text.slice(start, end).trim().replace(/\s+/gu, " ");

  return excerpt.length > 0 ? excerpt : text.trim().slice(0, 96);
}

function isMedicalContext(input: ComplianceReviewInput) {
  const haystack = [input.industry ?? "", input.title ?? "", input.text].join(" ").toLowerCase();

  return /\b(clinic|dermatology|hospital|medical|medicine|patient|surgery|treatment|botox|filler|laser|injection|therapy)\b/iu.test(
    haystack,
  );
}

function getHighestRiskLevel(flags: readonly ComplianceFlagDraft[]) {
  const firstFlag = flags[0];

  if (!firstFlag) {
    return null;
  }

  const priority = {
    critical: 4,
    high: 3,
    low: 1,
    medium: 2
  } as const satisfies Record<ComplianceRiskLevel, number>;

  return flags.reduce<ComplianceRiskLevel>(
    (highest, flag) => (priority[flag.riskLevel] > priority[highest] ? flag.riskLevel : highest),
    firstFlag.riskLevel,
  );
}

function getReviewStatus(overallRiskLevel: ComplianceRiskLevel | null) {
  if (overallRiskLevel === null) {
    return "clear";
  }

  if (overallRiskLevel === "critical" || overallRiskLevel === "high") {
    return "blocked";
  }

  return "needs_review";
}
