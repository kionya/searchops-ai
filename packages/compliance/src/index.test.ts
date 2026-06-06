import { describe, expect, it } from "vitest";

import type { ComplianceReviewInput } from "@searchops/types";

import {
  absoluteSafetyClaimRule,
  complianceGenerationMode,
  compliancePackage,
  complianceRulePacks,
  createComplianceRulePackRefinementPlan,
  defaultComplianceRules,
  evaluateCompliance,
  guaranteedResultClaimRule,
  krMedicalComplianceRules,
  medicalContentPublishPolicy,
  priceDiscountPromotionRule,
  selectComplianceRulePackId,
  supportedComplianceRuleIds,
  unreviewedMedicalPublishRule
} from "./index.js";

const evaluatedAt = "2026-05-24T00:00:00.000Z";

const baseInput = {
  siteId: "site_1",
  subjectType: "page_copy",
  subjectId: "page_1",
  url: "https://example-clinic.com/services/botox",
  locale: "ko-KR",
  industry: "medical",
  title: "Botox clinic service page",
  text: "Our clinic provides botox treatment after consultation.",
  publishState: "draft",
  source: "fixture"
} satisfies ComplianceReviewInput;

function createInput(overrides: Partial<ComplianceReviewInput> = {}): ComplianceReviewInput {
  return {
    ...baseInput,
    ...overrides
  };
}

describe("compliance contracts", () => {
  it("identifies the package and draft-only generation mode", () => {
    expect(compliancePackage).toBe("compliance");
    expect(complianceGenerationMode).toBe("deterministic");
    expect(medicalContentPublishPolicy).toBe("draft-with-compliance-flags-only");
  });

  it("exports default rules in deterministic order", () => {
    expect(defaultComplianceRules.map((rule) => rule.id)).toEqual(supportedComplianceRuleIds);
    expect(krMedicalComplianceRules.map((rule) => rule.id)).toEqual(supportedComplianceRuleIds);
  });

  it("selects deterministic rule packs by locale and medical context", () => {
    expect(Object.keys(complianceRulePacks)).toEqual(["global", "kr-medical"]);
    expect(selectComplianceRulePackId(baseInput)).toBe("kr-medical");
    expect(
      selectComplianceRulePackId(
        createInput({
          industry: "software",
          locale: "en-US",
          title: "SaaS page",
          text: "This software page has no medical context."
        }),
      ),
    ).toBe("global");
  });

  it("creates a deterministic KR medical rule pack refinement workflow", () => {
    const plan = createComplianceRulePackRefinementPlan("kr-medical");

    expect(plan).toMatchObject({
      autoPublishAllowed: false,
      generatedBy: "deterministic",
      legalOwnerRequired: true,
      publishPolicy: "draft_only",
      ruleCount: supportedComplianceRuleIds.length,
      rulePackId: "kr-medical",
      supportedRuleIds: supportedComplianceRuleIds,
    });
    expect(plan.stages.map((stage) => stage.id)).toEqual([
      "rule_coverage",
      "market_phrase_refinement",
      "legal_owner_review",
      "draft_only_publish_gate",
    ]);
    expect(plan.stages.find((stage) => stage.id === "legal_owner_review")).toMatchObject({
      status: "needs_owner",
    });
    expect(plan.stages.filter((stage) => stage.status === "blocked")).toHaveLength(0);
  });
});

describe("medical advertising risk rules", () => {
  it("flags guaranteed result claims as critical", () => {
    const [flag] = guaranteedResultClaimRule.evaluate(
      createInput({
        text: "Our medical clinic provides guaranteed botox results for every patient."
      }),
    );

    expect(flag).toMatchObject({
      generatedBy: "deterministic",
      publishPolicy: "draft_only",
      riskLevel: "critical",
      ruleId: "GUARANTEED_RESULT_CLAIM",
      status: "open"
    });
    expect(flag?.evidence).toMatchObject({
      match: "guaranteed",
      sourceField: "text",
      url: "https://example-clinic.com/services/botox"
    });
  });

  it("flags absolute safety claims independently", () => {
    const [flag] = absoluteSafetyClaimRule.evaluate(
      createInput({
        text: "This clinic treatment is completely safe and painless."
      }),
    );

    expect(flag).toMatchObject({
      riskLevel: "high",
      ruleId: "ABSOLUTE_SAFETY_CLAIM"
    });
    expect(flag?.replacementSuggestion).toContain("risks");
  });

  it("does not flag non-medical copy with the same promotional wording", () => {
    const flags = priceDiscountPromotionRule.evaluate(
      createInput({
        industry: "software",
        title: "SaaS landing page",
        text: "This best software plan includes a limited-time discount."
      }),
    );

    expect(flags).toHaveLength(0);
  });

  it("blocks scheduled or published medical content until compliance review", () => {
    const [flag] = unreviewedMedicalPublishRule.evaluate(
      createInput({
        publishState: "scheduled"
      }),
    );

    expect(flag).toMatchObject({
      riskLevel: "critical",
      ruleId: "UNREVIEWED_MEDICAL_PUBLISH"
    });
    expect(flag?.evidence).toMatchObject({
      observedValue: "scheduled",
      expectedValue: "draft",
      sourceField: "publishState"
    });
  });
});

describe("compliance report evaluation", () => {
  it("creates deterministic blocked reports for high-risk medical copy", () => {
    const report = evaluateCompliance(
      createInput({
        text: [
          "Our medical clinic offers guaranteed treatment outcomes.",
          "The treatment is completely safe.",
          "A limited-time discount is available."
        ].join(" ")
      }),
      { evaluatedAt },
    );

    expect(report).toMatchObject({
      evaluatedAt,
      generatedBy: "deterministic",
      overallRiskLevel: "critical",
      publishPolicy: "draft_only",
      rulePackId: "kr-medical",
      status: "blocked"
    });
    expect(report.flags.map((flag) => flag.ruleId)).toEqual([
      "GUARANTEED_RESULT_CLAIM",
      "ABSOLUTE_SAFETY_CLAIM",
      "PRICE_DISCOUNT_PROMOTION"
    ]);
  });

  it("returns clear reports when no deterministic rule matches", () => {
    const report = evaluateCompliance(createInput(), { evaluatedAt });

    expect(report).toMatchObject({
      flags: [],
      overallRiskLevel: null,
      status: "clear"
    });
  });

  it("applies Korean medical advertising refinements only in the KR medical rule pack", () => {
    const input = createInput({
      text: "이 의료 클리닉은 부작용 없는 보톡스 시술과 선착순 할인 이벤트를 안내합니다."
    });

    expect(evaluateCompliance(input, { evaluatedAt, rulePackId: "global" }).flags).toHaveLength(0);
    expect(evaluateCompliance(input, { evaluatedAt, rulePackId: "kr-medical" })).toMatchObject({
      rulePackId: "kr-medical",
      flags: [
        {
          ruleId: "ABSOLUTE_SAFETY_CLAIM",
          riskLevel: "high"
        },
        {
          ruleId: "PRICE_DISCOUNT_PROMOTION",
          riskLevel: "medium"
        }
      ]
    });
  });

  it("flags readable Korean medical advertising phrases deterministically", () => {
    const report = evaluateCompliance(
      createInput({
        text: [
          "100% 효과 보장",
          "부작용 없는 무통 시술",
          "전후 사진과 환자 후기",
          "선착순 할인 이벤트"
        ].join(" ")
      }),
      { evaluatedAt },
    );

    expect(report.rulePackId).toBe("kr-medical");
    expect(report.flags.map((flag) => flag.ruleId)).toEqual([
      "GUARANTEED_RESULT_CLAIM",
      "ABSOLUTE_SAFETY_CLAIM",
      "BEFORE_AFTER_REFERENCE",
      "PATIENT_TESTIMONIAL_REFERENCE",
      "PRICE_DISCOUNT_PROMOTION"
    ]);
  });

  it("selects the KR medical rule pack for Korean market domains", () => {
    const input = createInput({
      locale: "en-US",
      url: "https://example-clinic.kr/services/botox",
      text: "100% 효과 보장"
    });

    expect(selectComplianceRulePackId(input)).toBe("kr-medical");
    expect(evaluateCompliance(input, { evaluatedAt })).toMatchObject({
      flags: [
        {
          ruleId: "GUARANTEED_RESULT_CLAIM",
          riskLevel: "critical"
        }
      ],
      rulePackId: "kr-medical"
    });
  });

  it("is reproducible for the same input and timestamp", () => {
    const input = createInput({
      text: "This medical clinic has before and after treatment results in review."
    });

    expect(evaluateCompliance(input, { evaluatedAt })).toEqual(
      evaluateCompliance(input, { evaluatedAt }),
    );
  });
});
