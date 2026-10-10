import { describe, expect, it } from "vitest";

import {
  aeoContentGapQuestionLimit,
  createWorkOrderFromComplianceFlag,
  createWorkOrderFromGeoVisibilityReport,
  createWorkOrderFromSchemaRecommendation,
  createWorkOrderFromSeoIssue,
  createWorkOrdersFromAeoReadinessReports,
  createWorkOrdersFromComplianceFlags,
  createWorkOrdersFromGeoVisibilityReports,
  createWorkOrdersFromSchemaRecommendations,
  createWorkOrdersFromSeoIssues,
  hasSchemaWorkOrderTemplate,
  hasWorkOrderTemplate,
  supportedSchemaRecommendationTypes,
  supportedSeoIssueRuleIds,
  workOrderInputSources,
  workordersPackage
} from "./index.js";
import type {
  AeoReadinessReportRecord,
  ComplianceFlag,
  GeoVisibilityReportRecord,
  SchemaJsonLdType,
  SchemaRecommendationRecord,
  SeoIssueDraft,
  SeoIssueRuleId
} from "@searchops/types";

type IssueOverrides = Partial<Omit<SeoIssueDraft, "evidence">> & {
  readonly evidence?: Partial<SeoIssueDraft["evidence"]>;
};

const issueDefaults = {
  severity: "high",
  category: "headings",
  priority: "p1",
  title: "Missing H1 heading",
  evidence: {
    url: "https://example.com/services/seo",
    observedValue: 0,
    expectedValue: 1,
    sourceField: "h1Count"
  },
  impactScore: 80,
  effortScore: 25,
  priorityScore: 79
} as const;

function createIssue(overrides: IssueOverrides = {}): SeoIssueDraft {
  return {
    ruleId: "H1_MISSING",
    ...issueDefaults,
    ...overrides,
    evidence: {
      ...issueDefaults.evidence,
      ...overrides.evidence
    }
  } as SeoIssueDraft;
}

function createIssueForRule(ruleId: SeoIssueRuleId): SeoIssueDraft {
  switch (ruleId) {
    case "TITLE_MISSING":
      return createIssue({
        ruleId,
        category: "metadata",
        title: "Missing title tag",
        evidence: {
          observedValue: null,
          expectedValue: "Non-empty <title> text",
          sourceField: "title"
        }
      });
    case "META_DESC_MISSING":
      return createIssue({
        ruleId,
        category: "metadata",
        priority: "p2",
        title: "Missing meta description",
        evidence: {
          observedValue: null,
          expectedValue: "Non-empty meta description",
          sourceField: "metaDescription"
        }
      });
    case "H1_MISSING":
      return createIssue({ ruleId });
    case "MULTIPLE_H1":
      return createIssue({
        ruleId,
        severity: "medium",
        priority: "p2",
        title: "Multiple H1 headings",
        evidence: {
          observedValue: 2,
          expectedValue: 1,
          sourceField: "h1Count"
        }
      });
    case "NOINDEX_ON_IMPORTANT_PAGE":
      return createIssue({
        ruleId,
        severity: "critical",
        category: "indexability",
        priority: "p0",
        title: "Important page is noindexed",
        evidence: {
          observedValue: true,
          expectedValue: false,
          sourceField: "indexability.noindex"
        }
      });
    case "CANONICAL_MISSING":
      return createIssue({
        ruleId,
        severity: "medium",
        category: "canonical",
        priority: "p2",
        title: "Missing canonical URL",
        evidence: {
          observedValue: null,
          expectedValue: "Self-referencing canonical URL",
          sourceField: "canonicalUrl"
        }
      });
    case "CANONICAL_MISMATCH":
      return createIssue({
        ruleId,
        category: "canonical",
        title: "Canonical URL does not match the final URL",
        evidence: {
          observedValue: "https://example.com/old",
          expectedValue: "https://example.com/services/seo",
          sourceField: "canonicalUrl"
        }
      });
    case "IMAGE_ALT_MISSING":
      return createIssue({
        ruleId,
        severity: "low",
        category: "images",
        priority: "p3",
        title: "Images are missing alt text",
        evidence: {
          observedValue: ["https://example.com/image.jpg"],
          expectedValue: "All images have non-empty alt text",
          sourceField: "images[].alt"
        }
      });
    default:
      return createIssue({ ruleId });
  }
}

function createSchemaRecommendation(
  type: SchemaJsonLdType = "Service",
  overrides: Partial<SchemaRecommendationRecord> = {},
): SchemaRecommendationRecord {
  return {
    id: `schema_rec_${type}`,
    siteId: "site_1",
    pageUrl: "https://example.com/services/seo",
    type,
    priority: type === "MedicalClinic" || type === "Service" ? "p1" : "p2",
    status: "open",
    reason: `The page has no ${type} JSON-LD block.`,
    evidence: {
      url: "https://example.com/services/seo",
      observedTypes: ["WebPage"],
      expectedType: type,
      sourceField: "jsonLd"
    },
    jsonLd: {
      "@context": "https://schema.org",
      "@type": type,
      name: `${type} draft`,
      url: "https://example.com/services/seo"
    },
    instructions: [`Add ${type} JSON-LD to the page.`],
    requiredFields: ["@context", "@type", "name", "url"],
    recommendedFields: ["description"],
    generatedBy: "deterministic",
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function createGeoVisibilityReport(
  overrides: Partial<GeoVisibilityReportRecord> = {},
): GeoVisibilityReportRecord {
  return {
    id: "geo_report_visible",
    siteId: "site_1",
    brandName: "Example Clinic",
    domain: "example.com",
    locale: "ko-KR",
    market: "KR",
    status: "visible",
    score: 72,
    mentionRate: 67,
    citationRate: 67,
    competitorCitationRate: 33,
    credentialSources: {},
    queryCount: 3,
    providerCount: 2,
    observations: [
      {
        provider: "chatgpt",
        query: "seo clinic",
        locale: "ko-KR",
        answerText: "Example Clinic is mentioned.",
        citedUrls: ["https://example.com/services/seo"],
        observedAt: "2026-05-24T00:00:00.000Z",
        source: "fixture"
      }
    ],
    citations: [
      {
        domain: "example.com",
        owned: true,
        url: "https://example.com/services/seo"
      }
    ],
    checks: [
      {
        checkId: "BRAND_MENTIONED",
        status: "warning",
        score: 60,
        evidence: {
          observedValue: 67,
          expectedValue: ">= 70",
          sourceField: "observations.answerText"
        }
      },
      {
        checkId: "OWNED_URL_CITED",
        status: "pass",
        score: 100,
        evidence: {
          observedValue: 67,
          expectedValue: ">= 50",
          sourceField: "observations.citedUrls"
        }
      }
    ],
    generatedBy: "deterministic",
    evaluatedAt: "2026-05-24T00:00:00.000Z",
    createdAt: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function createComplianceFlag(overrides: Partial<ComplianceFlag> = {}): ComplianceFlag {
  return {
    id: "compliance_flag_1",
    organizationId: "org_1",
    siteId: "site_1",
    workOrderId: null,
    subjectType: "page_copy",
    subjectId: "page_1",
    ruleId: "ABSOLUTE_SAFETY_CLAIM",
    url: "https://example.com/services/botox",
    riskLevel: "high",
    status: "open",
    title: "Absolute safety claim",
    message: "The content uses absolute safety language.",
    evidence: {
      url: "https://example.com/services/botox",
      excerpt: "This clinic treatment is completely safe.",
      observedValue: "completely safe",
      expectedValue: "Medical content should avoid absolute safety claims.",
      sourceField: "text",
      match: "completely safe"
    },
    recommendation: "Replace absolute safety language with balanced wording.",
    replacementSuggestion: "Explain that risks vary by individual.",
    generatedBy: "deterministic",
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

describe("workorders foundation", () => {
  it("declares deterministic input sources", () => {
    expect(workOrderInputSources).toEqual([
      "aeo-core",
      "seo-core",
      "compliance",
      "schema-core",
      "geo-core"
    ]);
  });

  it("identifies the package", () => {
    expect(workordersPackage).toBe("workorders");
  });
});

describe("Compliance flag to work order mapper", () => {
  it("creates a deterministic legal review work order", () => {
    const flag = createComplianceFlag();

    expect(createWorkOrderFromComplianceFlag(flag)).toEqual({
      title: "/services/botox Absolute safety claim",
      problem: "The content uses absolute safety language.",
      evidence: {
        url: "https://example.com/services/botox",
        observedValue: "completely safe",
        expectedValue: "Medical content should avoid absolute safety claims.",
        sourceField: "text"
      },
      impact:
        "미검수 문구가 공개 페이지에 나가면 게재가 막히고, 법무 검토 부담이 생기며, 신뢰가 떨어집니다.",
      instructions: [
        "초안을 고치기 전에 지적된 문장과 출처 필드를 확인합니다.",
        "Replace absolute safety language with balanced wording.",
        "Explain that risks vary by individual.",
        "법무 검수가 수정본을 승인할 때까지 콘텐츠를 초안 상태로 둡니다."
      ],
      ownerType: "legal",
      priority: "p1",
      acceptanceCriteria: [
        "절대적 안전성 표현을 삭제했거나, 검수를 거친 균형 잡힌 표현으로 바꿨다.",
        "법무 검수에서 위험 고지와 상담 안내 맥락이 적절함을 확인했다.",
        "후속 의료광고법 검수에서 이 지적이 열린 상태로 다시 나오지 않는다.",
        "검수 승인이 기록될 때까지 콘텐츠가 초안 상태로만 남아 있다."
      ],
      verificationMethod:
        "수정한 초안에 의료광고법 검수를 다시 돌려, 게재 전에 해당 지적이 승인·기각·해소 처리됐는지 확인합니다.",
      estimatedEffort: "m",
      relatedIssues: []
    });
  });

  it("maps compliance risk levels to priority and effort", () => {
    expect(
      createWorkOrderFromComplianceFlag(
        createComplianceFlag({ riskLevel: "critical", ruleId: "GUARANTEED_RESULT_CLAIM" }),
      ),
    ).toMatchObject({ estimatedEffort: "m", priority: "p0" });
    expect(
      createWorkOrderFromComplianceFlag(
        createComplianceFlag({ riskLevel: "medium", ruleId: "PRICE_DISCOUNT_PROMOTION" }),
      ),
    ).toMatchObject({ estimatedEffort: "s", priority: "p2" });
    expect(
      createWorkOrderFromComplianceFlag(
        createComplianceFlag({ riskLevel: "low", ruleId: undefined }),
      ),
    ).toMatchObject({ estimatedEffort: "s", priority: "p3" });
  });

  it("maps compliance flags without shared state", () => {
    const workOrders = createWorkOrdersFromComplianceFlags([
      createComplianceFlag({ id: "flag_high", riskLevel: "high" }),
      createComplianceFlag({ id: "flag_low", riskLevel: "low" })
    ]);

    expect(workOrders.map((workOrder) => workOrder.priority)).toEqual(["p1", "p3"]);
  });

  it("requires a URL before conversion", () => {
    expect(() =>
      createWorkOrderFromComplianceFlag(
        createComplianceFlag({
          evidence: null,
          url: null
        }),
      ),
    ).toThrow(/URL/);
  });
});

describe("GEO visibility report to work order mapper", () => {
  it("creates a deterministic GEO visibility improvement work order", () => {
    const report = createGeoVisibilityReport();

    expect(createWorkOrderFromGeoVisibilityReport(report)).toEqual({
      title: "Example Clinic GEO 노출 개선",
      problem:
        "GEO 노출이 visible 상태입니다. 점수 72/100, 언급률 67%, 자사 인용률 67%.",
      evidence: {
        url: "https://example.com/",
        observedValue: "status visible; score 72; mention 67%; citation 67%; competitor 33%",
        expectedValue:
          "점수 75 이상(strong); 언급률 70% 이상; 자사 인용률 50% 이상; 경쟁사 인용률 40% 이하",
        sourceField: "geoVisibilityReport"
      },
      impact:
        "이용자가 비브랜드 탐색 질의를 할 때 AI 답변엔진이 브랜드를 빠뜨리거나, 경쟁사를 인용하거나, 자사 URL 을 인용하지 않을 수 있습니다.",
      instructions: [
        "콘텐츠를 고치기 전에 질의별·제공자별 GEO 관측 결과를 확인합니다.",
        "이미 질의 의도에 맞고 자연스럽게 인용될 수 있는 자사 페이지를 먼저 손봅니다.",
        "의학적 내용이나 효과 주장에 해당하는 문구는 의료광고법 검수가 끝날 때까지 초안 상태로 둡니다.",
        "답변에 쓰이는 페이지의 브랜드·기관 정보를 보강해, 관련 질의 맥락에서 브랜드가 분명히 언급되게 합니다."
      ],
      ownerType: "marketer",
      priority: "p2",
      acceptanceCriteria: [
        "다음 GEO 노출 리포트가 strong 상태에 도달한다.",
        "언급률이 70% 이상이다.",
        "자사 인용률이 50% 이상이다.",
        "경쟁사 인용률이 40% 이하다.",
        "리포트가 서로 다른 질의 3개, 제공자 2곳 이상을 다룬다."
      ],
      verificationMethod:
        "같은 질의 세트로 GEO 노출 리포트를 새로 만들어, 점수·언급률·인용률·경쟁사 인용 위험이 수용 기준을 만족하는지 확인합니다.",
      estimatedEffort: "m",
      relatedIssues: []
    });
  });

  it("maps GEO status to priority and effort deterministically", () => {
    expect(
      createWorkOrderFromGeoVisibilityReport(
        createGeoVisibilityReport({ status: "not_visible", score: 15 }),
      ),
    ).toMatchObject({ estimatedEffort: "l", priority: "p0" });
    expect(
      createWorkOrderFromGeoVisibilityReport(
        createGeoVisibilityReport({ status: "weak", score: 36 }),
      ),
    ).toMatchObject({ estimatedEffort: "m", priority: "p1" });
    expect(
      createWorkOrderFromGeoVisibilityReport(
        createGeoVisibilityReport({ status: "strong", score: 94 }),
      ),
    ).toMatchObject({
      estimatedEffort: "s",
      priority: "p3",
      title: "Example Clinic GEO 노출 유지"
    });
  });

  it("maps GEO report lists without shared state", () => {
    const workOrders = createWorkOrdersFromGeoVisibilityReports([
      createGeoVisibilityReport({ id: "geo_report_visible" }),
      createGeoVisibilityReport({
        id: "geo_report_not_visible",
        status: "not_visible",
        score: 15
      })
    ]);

    expect(workOrders.map((workOrder) => workOrder.priority)).toEqual(["p2", "p0"]);
  });

  it("rejects invalid GEO report inputs", () => {
    expect(() =>
      createWorkOrderFromGeoVisibilityReport({
        ...createGeoVisibilityReport(),
        generatedBy: "llm"
      } as unknown as GeoVisibilityReportRecord),
    ).toThrow();
  });
});

describe("Schema recommendation to work order mapper", () => {
  it("maps every supported schema recommendation type to a template", () => {
    for (const schemaType of supportedSchemaRecommendationTypes) {
      expect(hasSchemaWorkOrderTemplate(schemaType)).toBe(true);

      const workOrder = createWorkOrderFromSchemaRecommendation(
        createSchemaRecommendation(schemaType),
      );

      expect(workOrder.title).toContain("/services/seo");
      expect(workOrder.title).toContain(schemaType);
      expect(workOrder.relatedIssues).toEqual(["SCHEMA_MISSING"]);
      expect(workOrder.verificationMethod).toContain("스키마 추천 재검사");
    }
  });

  it("creates a deterministic Service JSON-LD work order", () => {
    const recommendation = createSchemaRecommendation("Service");

    expect(createWorkOrderFromSchemaRecommendation(recommendation)).toEqual({
      title: "/services/seo Service JSON-LD 적용",
      problem: "The page has no Service JSON-LD block.",
      evidence: {
        url: "https://example.com/services/seo",
        observedValue: ["WebPage"],
        expectedValue: "Service",
        sourceField: "jsonLd"
      },
      impact:
        "구조화된 서비스 데이터는 검색·답변엔진이 제공 서비스·제공자·서비스 URL 을 이해하게 합니다.",
      instructions: [
        "시술·서비스 상세 페이지에 Service JSON-LD 를 추가합니다.",
        "서비스명은 사실 그대로 쓰고, 근거 없는 효과 표현은 넣지 않습니다.",
        "Add Service JSON-LD to the page.",
        "필수 JSON-LD 필드: @context, @type, name, url."
      ],
      ownerType: "developer",
      priority: "p1",
      acceptanceCriteria: [
        "스키마 추천 재검사에서 이 URL 에 Service 이 더 이상 나오지 않는다.",
        "JSON-LD 에 서비스명·제공자·URL 이 들어 있다.",
        "서비스 설명이 화면에 보이는 내용과 일치한다."
      ],
      verificationMethod:
        "https://example.com/services/seo 에 스키마 추천 재검사를 돌려, 열린 Service 추천이 남지 않았는지 확인합니다.",
      estimatedEffort: "m",
      relatedIssues: ["SCHEMA_MISSING"]
    });
  });

  it("routes MedicalClinic recommendations to legal review", () => {
    const workOrder = createWorkOrderFromSchemaRecommendation(
      createSchemaRecommendation("MedicalClinic"),
    );

    expect(workOrder.ownerType).toBe("legal");
    expect(workOrder.title).toBe("/services/seo MedicalClinic JSON-LD 의료광고법 검수");
    expect(workOrder.acceptanceCriteria).toContain(
      "의료광고법 검수에서 근거 없는 의학적 표현이 없음을 확인했다.",
    );
  });

  it("maps schema recommendation lists without shared state", () => {
    const workOrders = createWorkOrdersFromSchemaRecommendations([
      createSchemaRecommendation("WebPage"),
      createSchemaRecommendation("BreadcrumbList")
    ]);

    expect(workOrders.map((workOrder) => workOrder.title)).toEqual([
      "/services/seo WebPage JSON-LD 적용",
      "/services/seo BreadcrumbList JSON-LD 적용"
    ]);
  });

  it("rejects invalid schema recommendation inputs", () => {
    expect(() =>
      createWorkOrderFromSchemaRecommendation({
        ...createSchemaRecommendation("Service"),
        generatedBy: "llm"
      } as unknown as SchemaRecommendationRecord),
    ).toThrow();
  });
});

describe("SEO issue to work order mapper", () => {
  it("maps every supported SEO rule to a template", () => {
    for (const ruleId of supportedSeoIssueRuleIds) {
      expect(hasWorkOrderTemplate(ruleId)).toBe(true);

      const workOrder = createWorkOrderFromSeoIssue(createIssueForRule(ruleId));

      expect(workOrder.title).toContain("/services/seo");
      expect(workOrder.instructions.length).toBeGreaterThan(0);
      expect(workOrder.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(workOrder.verificationMethod).toContain("재검사");
    }
  });

  it("creates a deterministic H1 missing work order", () => {
    const issue = createIssue();

    expect(createWorkOrderFromSeoIssue(issue)).toEqual({
      title: "/services/seo H1 제목 추가",
      problem: "페이지에 H1 제목이 없습니다.",
      evidence: issue.evidence,
      impact:
        "화면의 제목 구조만으로는 검색엔진과 답변엔진이 페이지의 핵심 주제를 파악하지 못합니다.",
      instructions: [
        "페이지 상단에 내용을 설명하는 H1 을 하나 추가합니다.",
        "목표 주제와 서비스명을 자연스럽게 넣습니다.",
        "페이지에 H1 은 하나만 둡니다."
      ],
      ownerType: "content",
      priority: "p1",
      acceptanceCriteria: [
        "재크롤에서 h1Count 가 1로 나온다.",
        "H1 텍스트가 비어 있지 않다.",
        "title 과 H1 이 같은 주제를 가리킨다."
      ],
      verificationMethod: "크롤러 재검사를 돌려 h1Count 가 정확히 1인지 확인합니다.",
      estimatedEffort: "s",
      relatedIssues: ["MULTIPLE_H1", "TITLE_MISSING"]
    });
  });

  it("preserves issue evidence and priority", () => {
    const issue = createIssueForRule("NOINDEX_ON_IMPORTANT_PAGE");
    const workOrder = createWorkOrderFromSeoIssue(issue);

    expect(workOrder.evidence).toEqual(issue.evidence);
    expect(workOrder.priority).toBe("p0");
    expect(workOrder.ownerType).toBe("developer");
  });

  it("maps issue lists without shared state", () => {
    const workOrders = createWorkOrdersFromSeoIssues([
      createIssueForRule("TITLE_MISSING"),
      createIssueForRule("META_DESC_MISSING")
    ]);

    expect(workOrders.map((workOrder) => workOrder.title)).toEqual([
      "/services/seo 타이틀 태그 수정",
      "/services/seo 메타 설명 수정"
    ]);
  });

  it("rejects SEO rules without a work order template", () => {
    expect(() => createWorkOrderFromSeoIssue(createIssueForRule("TITLE_DUPLICATE"))).toThrow(
      /No work order template/
    );
  });
});

const SITE_URL = "https://example-clinic.com/";

function gapReport(
  phrase: string,
  status: "pass" | "warning" | "fail",
  pageUrl: string | null = "https://example-clinic.com/botox",
): AeoReadinessReportRecord {
  const score = status === "pass" ? 100 : status === "warning" ? 60 : 0;
  return {
    id: `aeo_${phrase}`,
    siteId: "site_1",
    keywordId: null,
    phrase,
    locale: "ko-KR",
    intent: null,
    pageUrl,
    status: "needs_work",
    score: 46,
    checks: [
      {
        checkId: "PAGE_ANSWERS_QUESTION",
        status,
        score,
        evidence: {
          url: pageUrl,
          observedValue: [],
          expectedValue: "Question-form heading or answer block covering the keyword",
          sourceField: "questionHeadings"
        }
      }
    ],
    generatedBy: "deterministic",
    rulesVersion: "2",
    evaluatedAt: "2026-10-09T00:00:00.000Z",
    createdAt: "2026-10-09T00:00:00.000Z"
  };
}

describe("AEO 콘텐츠 공백 워크오더", () => {
  it("공백 질문들을 묶어 정확히 1건을 만든다", () => {
    const orders = createWorkOrdersFromAeoReadinessReports(
      [gapReport("보톡스 가격", "fail"), gapReport("보톡스 부작용", "fail")],
      SITE_URL,
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      ownerType: "content",
      priority: "p2",
      estimatedEffort: "s",
      evidence: {
        url: "https://example-clinic.com/botox",
        observedValue: ["보톡스 가격", "보톡스 부작용"]
      }
    });
    expect(orders[0]?.title).toContain("2개");
  });

  it("주제는 다루는 warning 은 공백이 아니다 — 제외한다", () => {
    expect(
      createWorkOrdersFromAeoReadinessReports(
        [gapReport("보톡스 가격", "warning"), gapReport("주차 안내", "pass")],
        SITE_URL,
      ),
    ).toHaveLength(0);
  });

  it("공백이 0건이면 워크오더를 만들지 않는다", () => {
    expect(createWorkOrdersFromAeoReadinessReports([], SITE_URL)).toHaveLength(0);
  });

  // SeoIssueEvidenceSchema.url 은 non-null 이다. 전부 null 이면 사이트 URL 로 올린다.
  it("실패 리포트의 pageUrl 이 전부 null 이면 사이트 URL 을 쓴다", () => {
    const orders = createWorkOrdersFromAeoReadinessReports(
      [gapReport("보톡스 가격", "fail", null)],
      SITE_URL,
    );
    expect(orders[0]?.evidence.url).toBe(SITE_URL);
  });

  it("공백 수로 우선순위·공수를 결정적으로 나눈다", () => {
    const many = Array.from({ length: 5 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    expect(createWorkOrdersFromAeoReadinessReports(many, SITE_URL)[0]).toMatchObject({
      priority: "p1",
      estimatedEffort: "l"
    });

    const three = Array.from({ length: 3 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    expect(createWorkOrdersFromAeoReadinessReports(three, SITE_URL)[0]).toMatchObject({
      priority: "p2",
      estimatedEffort: "m"
    });
  });

  // Review Focus 2: 공백이 수십 건이면 본문이 사람이 못 읽는 길이가 된다.
  it("질문이 상한을 넘으면 상위 N개만 적고 나머지 수를 남긴다", () => {
    const many = Array.from({ length: 25 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    const order = createWorkOrdersFromAeoReadinessReports(many, SITE_URL)[0];

    expect(order?.instructions.length).toBeLessThanOrEqual(aeoContentGapQuestionLimit + 2);
    expect(order?.problem).toContain("나머지 15개");
  });

  // Review Focus 4: 판정 불가는 영구 fail 이라 고칠 방법이 없다 — 노이즈다.
  // 술어는 룰의 출력(sourceField)을 그대로 쓴다. 재토큰화 사본을 두면 리포트와 어긋난다.
  it("판정 불가 행은 공백에서 제외한다", () => {
    const undecidable = gapReport("???", "fail");
    const marked = {
      ...undecidable,
      checks: [{ ...undecidable.checks[0]!, evidence: { ...undecidable.checks[0]!.evidence, sourceField: "keyword.phrase" } }]
    };
    expect(createWorkOrdersFromAeoReadinessReports([marked], SITE_URL)).toHaveLength(0);
  });

  it("1글자 조합 키워드는 공백으로 올린다 — 판정 불가가 아니다", () => {
    expect(
      createWorkOrdersFromAeoReadinessReports([gapReport("코 턱", "fail")], SITE_URL),
    ).toHaveLength(1);
  });

  // Review Focus 3: 같은 입력이면 같은 출력이어야 호출부가 중복을 걸러낼 수 있다.
  it("같은 입력에 같은 출력을 낸다 — 중복 판정의 전제", () => {
    const reports = [gapReport("보톡스 가격", "fail"), gapReport("보톡스 부작용", "fail")];
    expect(createWorkOrdersFromAeoReadinessReports(reports, SITE_URL)).toEqual(
      createWorkOrdersFromAeoReadinessReports(reports, SITE_URL),
    );
  });

  /**
   * 자연스러운 호출부는 listAeoReadinessReports — 사이트의 전 행(제한 없음, evaluatedAt desc)이다.
   * 축약하지 않으면 공백 3건 × 크롤런 3회가 "답변 없는 질문 9개" 가 되고 우선순위까지 뒤집힌다.
   */
  it("phrase 별 최신 1건으로 축약한다 — 크롤런이 쌓여도 수가 부풀지 않는다", () => {
    const history = ["2026-10-07", "2026-10-08", "2026-10-09"].flatMap((day) =>
      ["보톡스 가격", "임플란트 비용", "레이저 부작용"].map((phrase) => ({
        ...gapReport(phrase, "fail"),
        id: `aeo_${phrase}_${day}`,
        evaluatedAt: `${day}T00:00:00.000Z`
      })),
    );

    const order = createWorkOrdersFromAeoReadinessReports(history, SITE_URL)[0];

    expect(order?.title).toContain("3개");
    expect(order?.priority).toBe("p2");
    expect(order?.estimatedEffort).toBe("m");
    expect(order?.evidence.observedValue).toEqual([
      "보톡스 가격",
      "임플란트 비용",
      "레이저 부작용"
    ]);
  });

  // 이미 고친 질문에 콘텐츠를 또 만들라고 지시하면 안 된다.
  it("최신 측정이 pass 면 과거 fail 은 공백이 아니다", () => {
    const old = { ...gapReport("보톡스 가격", "fail"), id: "old", evaluatedAt: "2026-10-01T00:00:00.000Z" };
    const fresh = { ...gapReport("보톡스 가격", "pass"), id: "new", evaluatedAt: "2026-10-09T00:00:00.000Z" };

    expect(createWorkOrdersFromAeoReadinessReports([old, fresh], SITE_URL)).toHaveLength(0);
  });

  it("aeo-core 를 워크오더 입력 소스로 선언한다", () => {
    expect(workOrderInputSources).toContain("aeo-core");
  });
});
