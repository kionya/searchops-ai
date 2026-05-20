import { describe, expect, it } from "vitest";

import {
  analyzeUrlSeoSnapshot,
  analyzeUrlSeoSnapshots,
  canonicalMismatchRule,
  canonicalMissingRule,
  createEmptySeoIssueSet,
  defaultSeoRules,
  h1MissingRule,
  imageAltMissingRule,
  metaDescriptionMissingRule,
  multipleH1Rule,
  noindexOnImportantPageRule,
  scoreSeoIssue,
  seoCorePackage,
  titleMissingRule
} from "./index.js";
import type { UrlSeoSnapshot } from "./index.js";

type SnapshotOverrides = Partial<
  Omit<UrlSeoSnapshot, "content" | "headings" | "indexability" | "links">
> & {
  readonly content?: Partial<UrlSeoSnapshot["content"]>;
  readonly headings?: Partial<UrlSeoSnapshot["headings"]>;
  readonly indexability?: Partial<UrlSeoSnapshot["indexability"]>;
  readonly links?: Partial<UrlSeoSnapshot["links"]>;
};

const baseSnapshot: UrlSeoSnapshot = {
  url: "https://example.com/services",
  finalUrl: null,
  title: "Services",
  metaDescription: "Service page",
  robotsMeta: "index,follow",
  canonicalUrl: "https://example.com/services",
  h1Count: 1,
  h2Count: 0,
  headings: {
    h1: ["Services"],
    h2: []
  },
  links: {
    internal: [],
    external: []
  },
  images: [
    {
      src: "/hero.jpg",
      url: "https://example.com/hero.jpg",
      alt: "Hero",
      hasAlt: true
    }
  ],
  jsonLd: [],
  indexability: {
    noindex: false,
    nofollow: false,
    canonicalMismatch: false,
    robotsBlocked: null
  },
  content: {
    textLength: 220,
    wordCount: 44,
    duplicateHash: "a".repeat(64)
  }
};

function createSnapshot(overrides: SnapshotOverrides = {}): UrlSeoSnapshot {
  return {
    ...baseSnapshot,
    ...overrides,
    content: {
      ...baseSnapshot.content,
      ...overrides.content
    },
    headings: {
      ...baseSnapshot.headings,
      ...overrides.headings
    },
    indexability: {
      ...baseSnapshot.indexability,
      ...overrides.indexability
    },
    links: {
      ...baseSnapshot.links,
      ...overrides.links
    }
  };
}

describe("seo-core foundation", () => {
  it("exposes a deterministic placeholder issue set", () => {
    expect(createEmptySeoIssueSet({ pages: [] })).toEqual({ pageCount: 0, issues: [] });
  });

  it("identifies the package", () => {
    expect(seoCorePackage).toBe("seo-core");
  });
});

describe("SEO issue rules", () => {
  it("detects missing title tags", () => {
    const [issue] = titleMissingRule.evaluate(createSnapshot({ title: " " }));

    expect(issue).toMatchObject({
      ruleId: "TITLE_MISSING",
      severity: "high",
      category: "metadata",
      evidence: {
        url: "https://example.com/services",
        observedValue: " ",
        expectedValue: "Non-empty <title> text",
        sourceField: "title"
      }
    });
  });

  it("does not report title when it is present", () => {
    expect(titleMissingRule.evaluate(createSnapshot())).toEqual([]);
  });

  it("detects missing meta descriptions", () => {
    const [issue] = metaDescriptionMissingRule.evaluate(createSnapshot({ metaDescription: null }));

    expect(issue).toMatchObject({
      ruleId: "META_DESC_MISSING",
      severity: "medium",
      category: "metadata",
      evidence: {
        observedValue: null,
        expectedValue: "Non-empty meta description",
        sourceField: "metaDescription"
      }
    });
  });

  it("does not report meta description when it is present", () => {
    expect(metaDescriptionMissingRule.evaluate(createSnapshot())).toEqual([]);
  });

  it("detects missing H1 headings", () => {
    const [issue] = h1MissingRule.evaluate(createSnapshot({ h1Count: 0, headings: { h1: [] } }));

    expect(issue).toMatchObject({
      ruleId: "H1_MISSING",
      severity: "high",
      category: "headings",
      evidence: {
        observedValue: 0,
        expectedValue: 1,
        sourceField: "h1Count"
      }
    });
  });

  it("does not report H1 when exactly one exists", () => {
    expect(h1MissingRule.evaluate(createSnapshot())).toEqual([]);
  });

  it("detects multiple H1 headings", () => {
    const [issue] = multipleH1Rule.evaluate(
      createSnapshot({ h1Count: 2, headings: { h1: ["Services", "Clinic"] } })
    );

    expect(issue).toMatchObject({
      ruleId: "MULTIPLE_H1",
      severity: "medium",
      category: "headings",
      evidence: {
        observedValue: 2,
        expectedValue: 1,
        sourceField: "h1Count"
      }
    });
  });

  it("does not report multiple H1 when one exists", () => {
    expect(multipleH1Rule.evaluate(createSnapshot())).toEqual([]);
  });

  it("detects noindex on important pages", () => {
    const [issue] = noindexOnImportantPageRule.evaluate(
      createSnapshot({ indexability: { noindex: true } })
    );

    expect(issue).toMatchObject({
      ruleId: "NOINDEX_ON_IMPORTANT_PAGE",
      severity: "critical",
      category: "indexability",
      priority: "p0",
      evidence: {
        observedValue: true,
        expectedValue: false,
        sourceField: "indexability.noindex"
      }
    });
  });

  it("does not report noindex on deeper non-important URLs", () => {
    expect(
      noindexOnImportantPageRule.evaluate(
        createSnapshot({ url: "https://example.com/blog/post", indexability: { noindex: true } })
      )
    ).toEqual([]);
  });

  it("detects missing canonical URLs", () => {
    const [issue] = canonicalMissingRule.evaluate(createSnapshot({ canonicalUrl: null }));

    expect(issue).toMatchObject({
      ruleId: "CANONICAL_MISSING",
      severity: "medium",
      category: "canonical",
      evidence: {
        observedValue: null,
        expectedValue: "Self-referencing canonical URL",
        sourceField: "canonicalUrl"
      }
    });
  });

  it("does not report canonical when it is present", () => {
    expect(canonicalMissingRule.evaluate(createSnapshot())).toEqual([]);
  });

  it("detects canonical mismatches", () => {
    const [issue] = canonicalMismatchRule.evaluate(
      createSnapshot({
        canonicalUrl: "https://example.com/other",
        indexability: { canonicalMismatch: true }
      })
    );

    expect(issue).toMatchObject({
      ruleId: "CANONICAL_MISMATCH",
      severity: "high",
      category: "canonical",
      evidence: {
        observedValue: "https://example.com/other",
        expectedValue: "https://example.com/services",
        sourceField: "canonicalUrl"
      }
    });
  });

  it("does not report canonical mismatch unless crawler marked it mismatched", () => {
    expect(
      canonicalMismatchRule.evaluate(createSnapshot({ canonicalUrl: "https://example.com/other" }))
    ).toEqual([]);
  });

  it("detects images missing alt text", () => {
    const [issue] = imageAltMissingRule.evaluate(
      createSnapshot({
        images: [
          {
            src: "/hero.jpg",
            url: "https://example.com/hero.jpg",
            alt: "Hero",
            hasAlt: true
          },
          {
            src: "/missing.jpg",
            url: "https://example.com/missing.jpg",
            alt: "",
            hasAlt: false
          }
        ]
      })
    );

    expect(issue).toMatchObject({
      ruleId: "IMAGE_ALT_MISSING",
      severity: "low",
      category: "images",
      evidence: {
        observedValue: ["https://example.com/missing.jpg"],
        expectedValue: "All images have non-empty alt text",
        sourceField: "images[].alt"
      }
    });
  });

  it("does not report images when alt text is present", () => {
    expect(imageAltMissingRule.evaluate(createSnapshot())).toEqual([]);
  });
});

describe("SEO issue engine", () => {
  it("runs default rules in deterministic order", () => {
    const issues = analyzeUrlSeoSnapshot(
      createSnapshot({
        title: null,
        metaDescription: "",
        h1Count: 0,
        headings: { h1: [] },
        canonicalUrl: null,
        indexability: { noindex: true },
        images: [
          {
            src: "/missing.jpg",
            url: null,
            alt: null,
            hasAlt: false
          }
        ]
      })
    );

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "TITLE_MISSING",
      "META_DESC_MISSING",
      "H1_MISSING",
      "NOINDEX_ON_IMPORTANT_PAGE",
      "CANONICAL_MISSING",
      "IMAGE_ALT_MISSING"
    ]);
  });

  it("analyzes multiple URL snapshots without shared state", () => {
    const issues = analyzeUrlSeoSnapshots([
      createSnapshot({ title: null }),
      createSnapshot({ url: "https://example.com/about", metaDescription: null })
    ]);

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "TITLE_MISSING",
      "META_DESC_MISSING"
    ]);
  });

  it("exports the default rule set", () => {
    expect(defaultSeoRules.map((rule) => rule.id)).toEqual([
      "TITLE_MISSING",
      "META_DESC_MISSING",
      "H1_MISSING",
      "MULTIPLE_H1",
      "NOINDEX_ON_IMPORTANT_PAGE",
      "CANONICAL_MISSING",
      "CANONICAL_MISMATCH",
      "IMAGE_ALT_MISSING"
    ]);
  });

  it("calculates severity and priority scores deterministically", () => {
    const issues = [
      titleMissingRule.evaluate(createSnapshot({ title: null }))[0],
      metaDescriptionMissingRule.evaluate(createSnapshot({ metaDescription: null }))[0],
      h1MissingRule.evaluate(createSnapshot({ h1Count: 0, headings: { h1: [] } }))[0],
      multipleH1Rule.evaluate(createSnapshot({ h1Count: 2 }))[0],
      noindexOnImportantPageRule.evaluate(createSnapshot({ indexability: { noindex: true } }))[0],
      canonicalMissingRule.evaluate(createSnapshot({ canonicalUrl: null }))[0],
      canonicalMismatchRule.evaluate(
        createSnapshot({
          canonicalUrl: "https://example.com/other",
          indexability: { canonicalMismatch: true }
        })
      )[0],
      imageAltMissingRule.evaluate(
        createSnapshot({
          images: [{ src: "/missing.jpg", url: null, alt: null, hasAlt: false }]
        })
      )[0]
    ];

    expect(
      issues.map((issue) => ({
        ruleId: issue?.ruleId,
        severity: issue?.severity,
        impactScore: issue?.impactScore,
        effortScore: issue?.effortScore,
        priorityScore: issue?.priorityScore,
        priority: issue?.priority
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "effortScore": 20,
          "impactScore": 80,
          "priority": "p1",
          "priorityScore": 80,
          "ruleId": "TITLE_MISSING",
          "severity": "high",
        },
        {
          "effortScore": 20,
          "impactScore": 55,
          "priority": "p2",
          "priorityScore": 63,
          "ruleId": "META_DESC_MISSING",
          "severity": "medium",
        },
        {
          "effortScore": 25,
          "impactScore": 80,
          "priority": "p1",
          "priorityScore": 79,
          "ruleId": "H1_MISSING",
          "severity": "high",
        },
        {
          "effortScore": 30,
          "impactScore": 55,
          "priority": "p2",
          "priorityScore": 60,
          "ruleId": "MULTIPLE_H1",
          "severity": "medium",
        },
        {
          "effortScore": 20,
          "impactScore": 100,
          "priority": "p0",
          "priorityScore": 94,
          "ruleId": "NOINDEX_ON_IMPORTANT_PAGE",
          "severity": "critical",
        },
        {
          "effortScore": 25,
          "impactScore": 55,
          "priority": "p2",
          "priorityScore": 61,
          "ruleId": "CANONICAL_MISSING",
          "severity": "medium",
        },
        {
          "effortScore": 40,
          "impactScore": 80,
          "priority": "p1",
          "priorityScore": 74,
          "ruleId": "CANONICAL_MISMATCH",
          "severity": "high",
        },
        {
          "effortScore": 35,
          "impactScore": 25,
          "priority": "p3",
          "priorityScore": 37,
          "ruleId": "IMAGE_ALT_MISSING",
          "severity": "low",
        },
      ]
    `);
  });

  it("keeps standalone scoring deterministic", () => {
    expect(scoreSeoIssue("critical", 120)).toEqual({
      impactScore: 100,
      effortScore: 100,
      priorityScore: 70,
      priority: "p1"
    });
  });
});
