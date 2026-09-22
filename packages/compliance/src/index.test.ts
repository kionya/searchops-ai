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
  text: "Our clinic provides botox treatment after consultation. Side effects may occur; consult our medical staff.",
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

  it("does not flag crawled public pages — draft 로 되돌릴 수 없는 남의 페이지다", () => {
    const flags = unreviewedMedicalPublishRule.evaluate(
      createInput({
        publishState: "published",
        source: "crawl",
        text: "저희는 강남에 위치한 의원입니다. 진료 시간은 평일 오전 9시부터 오후 6시까지입니다."
      }),
    );

    expect(flags).toHaveLength(0);
  });

  it("keeps the whole crawl report clear when the page has no violation", () => {
    const report = evaluateCompliance(
      createInput({
        publishState: "published",
        source: "crawl",
        title: "병원 소개",
        text: "저희는 강남에 위치한 의원입니다. 예약은 전화로 가능합니다. clinic 안내 페이지입니다."
      }),
      { evaluatedAt },
    );

    expect(report.flags).toHaveLength(0);
    expect(report.status).toBe("clear");
    // §57 사전심의는 룰이 아니라 체크리스트 항목 8 로만 남는다.
    expect(report.checklist.find((entry) => entry.item === 8)?.status).toBe("needs_verification");
  });

  it("still flags real violations on crawled pages", () => {
    const report = evaluateCompliance(
      createInput({
        publishState: "published",
        source: "crawl",
        text: "이 의원의 시술은 100% 효과 보장 합니다."
      }),
      { evaluatedAt },
    );

    expect(report.flags.map((flag) => flag.ruleId)).toContain("GUARANTEED_RESULT_CLAIM");
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
      text: "이 의료 클리닉은 부작용 없는 보톡스 시술과 선착순 할인 이벤트를 안내합니다. 시술 후 부작용이 발생할 수 있습니다."
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
      "PRICE_DISCOUNT_PROMOTION",
      "SIDE_EFFECT_DISCLOSURE_MISSING"
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

  describe("T4 medical-ad-guard 9항목", () => {
    const ko = (text: string, overrides: Partial<ComplianceReviewInput> = {}) =>
      evaluateCompliance(createInput({ text, ...overrides }), { evaluatedAt, rulePackId: "kr-medical" });
    const ruleIds = (text: string) => ko(text).flags.map((flag) => flag.ruleId);
    const disclaimer = " 시술 후 부작용이 발생할 수 있으므로 의료진과 상담하시기 바랍니다.";

    it("every flag carries a legal clause and a checklist item", () => {
      const report = ko("100% 효과 보장 전후 사진 타 병원보다 저렴 임상 입증 김OO 기자 = 선착순 할인 시술");
      expect(report.flags.length).toBeGreaterThanOrEqual(7);
      for (const flag of report.flags) {
        expect(flag.legalClause).toMatch(/의료법 §/u);
        expect(flag.checklistItem).toBeGreaterThanOrEqual(1);
      }
      expect(report.flags.find((flag) => flag.ruleId === "PRICE_DISCOUNT_PROMOTION")?.legalClause).toBe("의료법 §27③");
    });

    it("item 4 comparative/defamatory: positive x2, negative x2", () => {
      expect(ruleIds("타 병원보다 저렴한 보톡스 시술" + disclaimer)).toContain("COMPARATIVE_OR_DEFAMATORY_CLAIM");
      expect(ruleIds("다른 의원과 달리 저희 클리닉은 시술" + disclaimer)).toContain("COMPARATIVE_OR_DEFAMATORY_CLAIM");
      expect(ruleIds("저희 클리닉의 보톡스 시술 안내" + disclaimer)).not.toContain("COMPARATIVE_OR_DEFAMATORY_CLAIM");
      expect(ruleIds("병원 위치와 진료 시간 안내" + disclaimer)).not.toContain("COMPARATIVE_OR_DEFAMATORY_CLAIM");
    });

    it("item 6 unsubstantiated/new tech: positive x2, negative x2", () => {
      expect(ruleIds("임상적으로 입증된 리프팅 시술" + disclaimer)).toContain("UNSUBSTANTIATED_OR_NEW_TECH_CLAIM");
      expect(ruleIds("국내 최초 도입 특허 장비 시술" + disclaimer)).toContain("UNSUBSTANTIATED_OR_NEW_TECH_CLAIM");
      expect(ruleIds("리프팅 시술 과정과 회복 기간 안내" + disclaimer)).not.toContain("UNSUBSTANTIATED_OR_NEW_TECH_CLAIM");
      expect(ruleIds("의료진 소개와 진료 과목" + disclaimer)).not.toContain("UNSUBSTANTIATED_OR_NEW_TECH_CLAIM");
    });

    it("item 7 side-effect disclosure: flags procedure copy without disclaimer only", () => {
      expect(ruleIds("보톡스 시술 안내와 예약 방법")).toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
      expect(ruleIds("레이저 제모 프로그램 소개")).toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
      expect(ruleIds("보톡스 시술 안내" + disclaimer)).not.toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
      expect(ruleIds("의료진 소개와 진료 시간")).not.toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
      // "부작용 없는" 은 고지가 아니다
      expect(ruleIds("부작용 없는 보톡스 시술")).toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
    });

    it("item 9 advertorial format: positive x2, negative x2", () => {
      expect(ruleIds("김민수 기자 = 이 클리닉의 시술이 주목받고 있다" + disclaimer)).toContain("ADVERTORIAL_FORMAT");
      expect(ruleIds("단독 인터뷰: 전문가 의견에 따르면 시술 효과" + disclaimer)).toContain("ADVERTORIAL_FORMAT");
      expect(ruleIds("클리닉 시술 안내" + disclaimer)).not.toContain("ADVERTORIAL_FORMAT");
      expect(ruleIds("진료 예약은 전화로" + disclaimer)).not.toContain("ADVERTORIAL_FORMAT");
    });

    it("item 3 before/after with a disclaimer is downgraded, without one stays medium", () => {
      const withDisclosure = ko("시술 전후 사진" + disclaimer).flags.find((flag) => flag.ruleId === "BEFORE_AFTER_REFERENCE");
      const without = ko("시술 전후 사진").flags.find((flag) => flag.ruleId === "BEFORE_AFTER_REFERENCE");
      expect(withDisclosure?.riskLevel).toBe("low");
      expect(without?.riskLevel).toBe("medium");
    });

    it("report level: safe verdict is impossible while any item is unverified (item 8)", () => {
      const clean = "의료진 소개와 진료 시간 안내";
      const unknown = ko(clean);
      expect(unknown.status).toBe("clear");
      expect(unknown.checklist).toHaveLength(9);
      expect(unknown.checklist.find((entry) => entry.item === 8)?.status).toBe("needs_verification");
      expect(unknown.verdict).toBe("needs_review");

      const confirmed = ko(clean, { priorReviewStatus: "confirmed" });
      expect(confirmed.checklist.every((entry) => entry.status === "pass")).toBe(true);
      expect(confirmed.verdict).toBe("safe");

      const published = ko(clean, { priorReviewStatus: "confirmed", publishState: "published" });
      expect(published.checklist.find((entry) => entry.item === 8)).toMatchObject({ status: "flagged", ruleIds: ["UNREVIEWED_MEDICAL_PUBLISH"] });
      expect(published.flags[0]?.priorReviewRequired).toBe(true);
      expect(published.verdict).toBe("danger");

      const risky = ko("타 병원보다 저렴", { priorReviewStatus: "confirmed" });
      expect(risky.verdict).toBe("danger");
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
