import { describe, expect, it } from "vitest";

import {
  createWorkOrderFromGeoVisibilityReport,
  createWorkOrderFromSchemaRecommendation,
  createWorkOrderFromSeoIssue,
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

describe("workorders foundation", () => {
  it("declares deterministic input sources", () => {
    expect(workOrderInputSources).toEqual([
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

describe("GEO visibility report to work order mapper", () => {
  it("creates a deterministic GEO visibility improvement work order", () => {
    const report = createGeoVisibilityReport();

    expect(createWorkOrderFromGeoVisibilityReport(report)).toEqual({
      title: "Example Clinic GEO visibility improvement",
      problem:
        "GEO visibility is visible with a 72/100 score, 67% mention rate, and 67% owned citation rate.",
      evidence: {
        url: "https://example.com/",
        observedValue: "status visible; score 72; mention 67%; citation 67%; competitor 33%",
        expectedValue:
          "strong score >= 75; mention >= 70%; owned citation >= 50%; competitor citation <= 40%",
        sourceField: "geoVisibilityReport"
      },
      impact:
        "AI answer engines may omit the brand, cite competitors, or fail to cite owned URLs when users ask non-brand discovery queries.",
      instructions: [
        "Review GEO observations by query and provider before editing content.",
        "Prioritize owned pages that already match the query intent and can be cited naturally.",
        "Keep all medical or claim-like content as draft until compliance review is complete.",
        "Update entity and brand signals on answer-ready pages so the brand is explicitly mentioned in relevant query contexts."
      ],
      ownerType: "marketer",
      priority: "p2",
      acceptanceCriteria: [
        "Next GEO visibility report reaches strong status.",
        "Mention rate is at or above 70%.",
        "Owned citation rate is at or above 50%.",
        "Competitor citation rate is at or below 40%.",
        "Report covers at least three distinct queries and two providers."
      ],
      verificationMethod:
        "Create a new GEO visibility report from the same query set and confirm the score, mention rate, citation rate, and competitor citation risk meet the acceptance criteria.",
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
      title: "Example Clinic GEO visibility maintenance"
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
      expect(workOrder.verificationMethod).toContain("schema recommendation recheck");
    }
  });

  it("creates a deterministic Service JSON-LD work order", () => {
    const recommendation = createSchemaRecommendation("Service");

    expect(createWorkOrderFromSchemaRecommendation(recommendation)).toEqual({
      title: "/services/seo Service JSON-LD implementation",
      problem: "The page has no Service JSON-LD block.",
      evidence: {
        url: "https://example.com/services/seo",
        observedValue: ["WebPage"],
        expectedValue: "Service",
        sourceField: "jsonLd"
      },
      impact:
        "Structured service data helps search and answer engines understand the offering, provider, and service URL.",
      instructions: [
        "Add Service JSON-LD to the service detail page.",
        "Keep service names factual and avoid unsupported claims.",
        "Add Service JSON-LD to the page.",
        "Required JSON-LD fields: @context, @type, name, url."
      ],
      ownerType: "developer",
      priority: "p1",
      acceptanceCriteria: [
        "Schema recommendation recheck no longer returns Service for the URL.",
        "JSON-LD includes service name, provider, and URL.",
        "The service description matches visible page content."
      ],
      verificationMethod:
        "Run schema recommendation recheck for https://example.com/services/seo and confirm no open Service recommendation remains.",
      estimatedEffort: "m",
      relatedIssues: ["SCHEMA_MISSING"]
    });
  });

  it("routes MedicalClinic recommendations to legal review", () => {
    const workOrder = createWorkOrderFromSchemaRecommendation(
      createSchemaRecommendation("MedicalClinic"),
    );

    expect(workOrder.ownerType).toBe("legal");
    expect(workOrder.title).toBe("/services/seo MedicalClinic JSON-LD compliance review");
    expect(workOrder.acceptanceCriteria).toContain(
      "Compliance review confirms no unsupported medical claims.",
    );
  });

  it("maps schema recommendation lists without shared state", () => {
    const workOrders = createWorkOrdersFromSchemaRecommendations([
      createSchemaRecommendation("WebPage"),
      createSchemaRecommendation("BreadcrumbList")
    ]);

    expect(workOrders.map((workOrder) => workOrder.title)).toEqual([
      "/services/seo WebPage JSON-LD implementation",
      "/services/seo BreadcrumbList JSON-LD implementation"
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
      expect(workOrder.verificationMethod).toContain("recheck");
    }
  });

  it("creates a deterministic H1 missing work order", () => {
    const issue = createIssue();

    expect(createWorkOrderFromSeoIssue(issue)).toEqual({
      title: "/services/seo missing H1 fix",
      problem: "The page has no H1 heading.",
      evidence: issue.evidence,
      impact:
        "Search engines and answer engines may not identify the primary page topic from the visible heading structure.",
      instructions: [
        "Add one descriptive H1 near the top of the page.",
        "Include the target topic and service name naturally.",
        "Keep only one H1 on the page."
      ],
      ownerType: "content",
      priority: "p1",
      acceptanceCriteria: [
        "Re-crawl reports h1Count = 1.",
        "The H1 text is non-empty.",
        "The title and H1 describe the same page topic."
      ],
      verificationMethod: "Run a crawler recheck and confirm h1Count is exactly 1.",
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
      "/services/seo title tag fix",
      "/services/seo meta description fix"
    ]);
  });

  it("rejects SEO rules without a work order template", () => {
    expect(() => createWorkOrderFromSeoIssue(createIssueForRule("TITLE_DUPLICATE"))).toThrow(
      /No work order template/
    );
  });
});
