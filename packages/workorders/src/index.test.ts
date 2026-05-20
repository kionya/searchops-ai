import { describe, expect, it } from "vitest";

import {
  createWorkOrderFromSeoIssue,
  createWorkOrdersFromSeoIssues,
  hasWorkOrderTemplate,
  supportedSeoIssueRuleIds,
  workOrderInputSources,
  workordersPackage
} from "./index.js";
import type { SeoIssueDraft, SeoIssueRuleId } from "@searchops/types";

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

describe("workorders foundation", () => {
  it("declares SEO and compliance as future input sources", () => {
    expect(workOrderInputSources).toEqual(["seo-core", "compliance"]);
  });

  it("identifies the package", () => {
    expect(workordersPackage).toBe("workorders");
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
