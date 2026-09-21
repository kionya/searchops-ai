import {
  ComplianceFlagDraftSchema,
  ComplianceReviewInputSchema,
  ComplianceReviewReportSchema
} from "@searchops/types";
import type {
  ComplianceChecklistItem,
  ComplianceChecklistResult,
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
  /** 의료법 조항. 정본: medical-ad-guard DANGER 표. */
  readonly legalClause: string;
  /** medical-ad-guard 9항목 번호. */
  readonly checklistItem: ComplianceChecklistItem;
  readonly priorReviewRequired?: boolean;
  /** 면책(부작용 고지)이 같이 있으면 이 위험도로 낮춘다(항목 3 전후사진). */
  readonly riskLevelWithDisclosure?: ComplianceRiskLevel;
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
  "UNREVIEWED_MEDICAL_PUBLISH",
  "COMPARATIVE_OR_DEFAMATORY_CLAIM",
  "UNSUBSTANTIATED_OR_NEW_TECH_CLAIM",
  "SIDE_EFFECT_DISCLOSURE_MISSING",
  "ADVERTORIAL_FORMAT"
] as const satisfies readonly ComplianceRuleId[];

/**
 * medical-ad-guard 9항목 ↔ 룰 1:1 대응표. 정본은 SKILL.md 의 "검수 필수 체크리스트 — 9항목 전수".
 * 항목 8(사전심의)은 외부 사실이라 룰이 아니라 input.priorReviewStatus 로만 닫힌다.
 */
export const complianceChecklistCanon = [
  { item: 1, label: "보장성·최상급 표현", legalClause: "의료법 §56② 3·4·7·8호", ruleIds: ["GUARANTEED_RESULT_CLAIM", "ABSOLUTE_SAFETY_CLAIM", "SUPERLATIVE_CLAIM"] },
  { item: 2, label: "치료 경험담(후기)", legalClause: "의료법 §56② 2호", ruleIds: ["PATIENT_TESTIMONIAL_REFERENCE"] },
  { item: 3, label: "전후(Before/After) 사진", legalClause: "의료법 §56② 2호", ruleIds: ["BEFORE_AFTER_REFERENCE"] },
  { item: 4, label: "비교·비방광고", legalClause: "의료법 §56② 4·5호", ruleIds: ["COMPARATIVE_OR_DEFAMATORY_CLAIM"] },
  { item: 5, label: "환자 유인·알선", legalClause: "의료법 §27③", ruleIds: ["PRICE_DISCOUNT_PROMOTION"] },
  { item: 6, label: "객관적 근거·신의료기술", legalClause: "의료법 §56② 3호·§53", ruleIds: ["UNSUBSTANTIATED_OR_NEW_TECH_CLAIM"] },
  { item: 7, label: "부작용 등 중요정보 누락", legalClause: "의료법 §56② 7호", ruleIds: ["SIDE_EFFECT_DISCLOSURE_MISSING"] },
  { item: 8, label: "사전심의", legalClause: "의료법 §57", ruleIds: ["UNREVIEWED_MEDICAL_PUBLISH"] },
  { item: 9, label: "기사형 광고", legalClause: "의료법 §56②", ruleIds: ["ADVERTORIAL_FORMAT"] }
] as const satisfies readonly Omit<ComplianceChecklistResult, "status">[];

const guaranteedResultClaimRuleConfig = {
  id: "GUARANTEED_RESULT_CLAIM",
  legalClause: "의료법 §56② 3호·8호",
  checklistItem: 1,
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
  legalClause: "의료법 §56② 3호·7호",
  checklistItem: 1,
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
  legalClause: "의료법 §56② 4호·8호",
  checklistItem: 1,
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
  legalClause: "의료법 §56② 2호",
  checklistItem: 3,
  riskLevelWithDisclosure: "low",
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
  legalClause: "의료법 §56② 2호",
  checklistItem: 2,
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
  legalClause: "의료법 §27③",
  checklistItem: 5,
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

const comparativeOrDefamatoryClaimRuleConfig = {
  id: "COMPARATIVE_OR_DEFAMATORY_CLAIM",
  legalClause: "의료법 §56② 4호·5호",
  checklistItem: 4,
  riskLevel: "high",
  title: "Comparative or defamatory claim",
  message: "The content compares with, or disparages, other clinics or practitioners. Plain comparison counts even without a superiority claim.",
  expectedValue: "No comparison with or disparagement of other medical institutions or practitioners.",
  recommendation: "Remove the comparison or disparagement and describe only this clinic's own facts.",
  replacementSuggestion: "State the clinic's own service scope, credentials, and process without referencing others.",
  patterns: [
    /\b(better|cheaper|safer|faster)\s+than\s+(other|any|most)\s+(clinics?|hospitals?|doctors?)\b/iu,
    /\bunlike\s+other\s+(clinics?|hospitals?)\b/iu,
    /\bcompared\s+(to|with)\s+other\s+(clinics?|hospitals?)\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const unsubstantiatedOrNewTechClaimRuleConfig = {
  id: "UNSUBSTANTIATED_OR_NEW_TECH_CLAIM",
  legalClause: "의료법 §56② 3호·§53",
  checklistItem: 6,
  riskLevel: "high",
  title: "Unsubstantiated or new medical technology claim",
  message: "The content asserts clinical proof, first adoption, patents, or new medical technology without evidence.",
  expectedValue: "Objective evidence attached, or the claim removed; new medical technology must have passed assessment (§53).",
  recommendation: "Attach verifiable evidence or remove the assertion; confirm §53 assessment status for new technology.",
  replacementSuggestion: "Describe the procedure factually and cite the assessment or study only when it can be shown.",
  patterns: [
    /\bclinically\s+proven\b/iu,
    /\bscientifically\s+proven\b/iu,
    /\bfirst\s+in\s+(korea|asia|the\s+world)\b/iu,
    /\bpatented\s+(treatment|procedure|technique|technology)\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

const advertorialFormatRuleConfig = {
  id: "ADVERTORIAL_FORMAT",
  legalClause: "의료법 §56②",
  checklistItem: 9,
  riskLevel: "medium",
  title: "Advertorial (news or expert-opinion) format",
  message: "The content is styled as news coverage, an interview, or expert opinion, which can disguise an advertisement.",
  expectedValue: "Advertising must be recognizable as advertising, not as reporting or expert commentary.",
  recommendation: "Remove reporter/press framing and expert-opinion styling; present the content plainly as clinic information.",
  replacementSuggestion: "Use first-person clinic voice with clear service information instead of an editorial format.",
  patterns: [
    /\bstaff\s+writer\b/iu,
    /\bpress\s+release\b/iu,
    /\baccording\s+to\s+(the\s+)?experts?\b/iu,
    /\bexperts?\s+say\b/iu,
    /\b(reporter|correspondent)\b/iu
  ]
} as const satisfies CompliancePatternRuleConfig;

export const guaranteedResultClaimRule = createPatternRule(guaranteedResultClaimRuleConfig);
export const comparativeOrDefamatoryClaimRule = createPatternRule(comparativeOrDefamatoryClaimRuleConfig);
export const unsubstantiatedOrNewTechClaimRule = createPatternRule(unsubstantiatedOrNewTechClaimRuleConfig);
export const advertorialFormatRule = createPatternRule(advertorialFormatRuleConfig);

export const krComparativeOrDefamatoryClaimRule = createPatternRule({
  ...comparativeOrDefamatoryClaimRuleConfig,
  patterns: [
    ...comparativeOrDefamatoryClaimRuleConfig.patterns,
    /(타|다른|여느)\s*(병원|의원|클리닉|의료진|의사)\s*(보다|대비|과\s*달리|와\s*달리|에\s*비해)/u,
    /(병원|의원|클리닉)\s*(비교|랭킹|순위)/u,
    /(타|다른)\s*(병원|의원|클리닉)\s*(은|는)\s*(못|안|위험|엉터리)/u,
    /(비방|폄하|헐뜯)/u
  ]
});

export const krUnsubstantiatedOrNewTechClaimRule = createPatternRule({
  ...unsubstantiatedOrNewTechClaimRuleConfig,
  patterns: [
    ...unsubstantiatedOrNewTechClaimRuleConfig.patterns,
    /임상(적으로)?\s*(입증|증명|검증)/u,
    /과학적으로\s*(입증|증명)/u,
    /(국내|세계|아시아)\s*최초\s*(도입|시술|개발)?/u,
    /특허\s*(받은|시술|기술|장비)/u,
    /신의료기술/u
  ]
});

export const krAdvertorialFormatRule = createPatternRule({
  ...advertorialFormatRuleConfig,
  patterns: [
    ...advertorialFormatRuleConfig.patterns,
    /(본지|취재진|기자)\s*(가|는|이|=)/u,
    /[가-힣]{2,4}\s*기자\b/u,
    /(단독|특별)\s*(보도|취재|인터뷰)/u,
    /전문가\s*(의견|칼럼)에\s*따르면/u,
    /(뉴스|신문)\s*(보도|기사)에\s*따르면/u
  ]
});

// 항목 7: 시술 문구가 있는데 부작용·주의사항 고지가 없다. 페이지 단위 판정이라 패턴 룰이 아니다.
const procedureKeywordPattern =
  /(레이저|보톡스|필러|리프팅|시술|수술|주사|박피|제모|임플란트|교정|laser|botox|filler|lifting|surgery|injection|implant)/iu;
const sideEffectDisclosurePattern =
  /(부작용|주의사항)[^.。\n]{0,20}(있|발생|생길|나타날|안내|상담)|side[\s-]*effects?\s+(may|can|could|might)|risks?\s+(may|can|include)/iu;

export const sideEffectDisclosureMissingRule = {
  id: "SIDE_EFFECT_DISCLOSURE_MISSING",
  evaluate(input) {
    const parsedInput = ComplianceReviewInputSchema.parse(input);
    if (!isMedicalContext(parsedInput)) {
      return [];
    }
    const procedure = procedureKeywordPattern.exec(parsedInput.text);
    if (!procedure || sideEffectDisclosurePattern.test(parsedInput.text)) {
      return [];
    }
    return [
      createComplianceFlagDraft({
        input: parsedInput,
        match: { index: procedure.index, match: procedure[0] },
        ruleId: "SIDE_EFFECT_DISCLOSURE_MISSING",
        legalClause: "의료법 §56② 7호",
        checklistItem: 7,
        riskLevel: "medium",
        title: "Side-effect disclosure missing",
        message: "The content describes a procedure but carries no side-effect or precaution notice.",
        observedValue: "no side-effect disclosure",
        expectedValue: "Procedure-type disclaimer present (개인차·부작용 발생 가능·의료진 상담).",
        sourceField: "text",
        recommendation:
          "Add the required disclaimer for this procedure type where it is visible without scrolling; 검토 필요 — 자동 차단 아님.",
        replacementSuggestion:
          "시술 및 수술 후 부작용이 발생할 수 있으므로 의료진과 충분히 상담하시기 바랍니다."
      })
    ];
  }
} satisfies ComplianceRule;
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
        legalClause: "의료법 §57",
        checklistItem: 8,
        priorReviewRequired: true,
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
  unreviewedMedicalPublishRule,
  comparativeOrDefamatoryClaimRule,
  unsubstantiatedOrNewTechClaimRule,
  sideEffectDisclosureMissingRule,
  advertorialFormatRule
] as const satisfies readonly ComplianceRule[];

export const krMedicalComplianceRules = [
  krGuaranteedResultClaimRule,
  krAbsoluteSafetyClaimRule,
  krSuperlativeClaimRule,
  krBeforeAfterReferenceRule,
  krPatientTestimonialReferenceRule,
  krPriceDiscountPromotionRule,
  unreviewedMedicalPublishRule,
  krComparativeOrDefamatoryClaimRule,
  krUnsubstantiatedOrNewTechClaimRule,
  sideEffectDisclosureMissingRule,
  krAdvertorialFormatRule
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
  const status = getReviewStatus(overallRiskLevel);
  const checklist = buildComplianceChecklist(parsedInput, flags);

  return ComplianceReviewReportSchema.parse({
    input: parsedInput,
    flags,
    rulePackId,
    status,
    overallRiskLevel,
    publishPolicy: "draft_only",
    generatedBy: complianceGenerationMode,
    evaluatedAt,
    checklist,
    verdict: getComplianceVerdict(status, checklist)
  });
}

/** 9항목 전수. 항목 8 은 룰이 아니라 사람이 넘긴 priorReviewStatus 로만 pass 가 된다. */
export function buildComplianceChecklist(
  input: ComplianceReviewInput,
  flags: readonly ComplianceFlagDraft[]
): ComplianceChecklistResult[] {
  const flaggedItems = new Set(flags.map((flag) => flag.checklistItem));
  return complianceChecklistCanon.map((entry) => {
    const flagged = flaggedItems.has(entry.item);
    const status =
      flagged ? "flagged"
      : entry.item === 8 && (input.priorReviewStatus ?? "unknown") === "unknown" ? "needs_verification"
      : "pass";
    return { ...entry, ruleIds: [...entry.ruleIds], status };
  });
}

/** safe 는 9항목 전부 pass 일 때만. 미확인이 하나라도 있으면 safe 판정 불가(정본 판정 원칙). */
export function getComplianceVerdict(
  status: ComplianceReviewReport["status"],
  checklist: readonly ComplianceChecklistResult[]
): ComplianceReviewReport["verdict"] {
  if (status === "blocked") {
    return "danger";
  }
  return checklist.every((entry) => entry.status === "pass") ? "safe" : "needs_review";
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

      const disclosed = config.riskLevelWithDisclosure !== undefined && sideEffectDisclosurePattern.test(parsedInput.text);
      return [
        createComplianceFlagDraft({
          input: parsedInput,
          match,
          ruleId: config.id,
          legalClause: config.legalClause,
          checklistItem: config.checklistItem,
          ...(config.priorReviewRequired === undefined ? {} : { priorReviewRequired: config.priorReviewRequired }),
          riskLevel: disclosed ? (config.riskLevelWithDisclosure ?? config.riskLevel) : config.riskLevel,
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
  checklistItem,
  expectedValue,
  input,
  legalClause,
  match,
  message,
  priorReviewRequired = false,
  observedValue,
  recommendation,
  replacementSuggestion,
  riskLevel,
  ruleId,
  sourceField,
  title
}: {
  readonly checklistItem: ComplianceChecklistItem;
  readonly expectedValue: string;
  readonly input: ComplianceReviewInput;
  readonly legalClause: string;
  readonly match: ComplianceMatch;
  readonly message: string;
  readonly priorReviewRequired?: boolean;
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
    generatedBy: complianceGenerationMode,
    legalClause,
    checklistItem,
    priorReviewRequired
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
