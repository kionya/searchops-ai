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
  ComplianceRuleId
} from "@searchops/types";

export const compliancePackage = "compliance" as const;
export const complianceGenerationMode = "deterministic" as const;
export const medicalContentPublishPolicy = "draft-with-compliance-flags-only" as const;

export interface ComplianceEvaluationOptions {
  readonly evaluatedAt?: string;
  readonly rules?: readonly ComplianceRule[];
}

export interface ComplianceRule {
  readonly id: ComplianceRuleId;
  readonly evaluate: (input: ComplianceReviewInput) => readonly ComplianceFlagDraft[];
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

export const guaranteedResultClaimRule = createPatternRule({
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
});

export const absoluteSafetyClaimRule = createPatternRule({
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
});

export const superlativeClaimRule = createPatternRule({
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
});

export const beforeAfterReferenceRule = createPatternRule({
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
});

export const patientTestimonialReferenceRule = createPatternRule({
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
});

export const priceDiscountPromotionRule = createPatternRule({
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

export function evaluateCompliance(
  input: ComplianceReviewInput,
  options: ComplianceEvaluationOptions = {},
): ComplianceReviewReport {
  const parsedInput = ComplianceReviewInputSchema.parse(input);
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const rules = options.rules ?? defaultComplianceRules;
  const flags = rules.flatMap((rule) => rule.evaluate(parsedInput));
  const overallRiskLevel = getHighestRiskLevel(flags);

  return ComplianceReviewReportSchema.parse({
    input: parsedInput,
    flags,
    status: getReviewStatus(overallRiskLevel),
    overallRiskLevel,
    publishPolicy: "draft_only",
    generatedBy: complianceGenerationMode,
    evaluatedAt
  });
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
