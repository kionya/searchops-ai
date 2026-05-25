import { describe, expect, it } from "vitest";

import {
  defaultSchemaRecommendationRules,
  extractJsonLdTypes,
  faqPageRecommendationRule,
  hasSchemaType,
  recommendJsonLdForSnapshot,
  recommendJsonLdForSnapshots,
  schemaCoreGenerationMode,
  schemaCorePackage,
  serviceRecommendationRule,
  summarizeJsonLdRecommendations,
  validateJsonLdDraft,
  validateJsonLdRecommendation,
  validateJsonLdRecommendations
} from "./index.js";
import type { CrawlerPageSnapshot } from "@searchops/types";
import type { SchemaRuleContext, SchemaSiteContext } from "./index.js";

const site: SchemaSiteContext = {
  country: "KR",
  domain: "example.com",
  id: "site_1",
  industry: "medical",
  language: "ko",
  name: "Example Clinic"
};

const baseSnapshot: CrawlerPageSnapshot = {
  canonicalUrl: "https://example.com/services/seo",
  content: {
    duplicateHash: "a".repeat(64),
    textLength: 900,
    wordCount: 140
  },
  finalUrl: null,
  h1Count: 1,
  h2Count: 1,
  headings: {
    h1: ["SEO Clinic"],
    h2: ["What does SEO clinic include?"]
  },
  images: [],
  indexability: {
    canonicalMismatch: false,
    nofollow: false,
    noindex: false,
    robotsBlocked: null
  },
  jsonLd: [],
  links: {
    external: [],
    internal: []
  },
  metaDescription: "SEO clinic service page",
  robotsMeta: "index,follow",
  title: "SEO Clinic Service",
  url: "https://example.com/services/seo"
};

function createSnapshot(overrides: Partial<CrawlerPageSnapshot> = {}): CrawlerPageSnapshot {
  return {
    ...baseSnapshot,
    ...overrides
  };
}

function createContext(snapshot = createSnapshot()): SchemaRuleContext {
  return {
    organizationName: "Example Group",
    site,
    snapshot
  };
}

describe("schema-core foundation", () => {
  it("identifies the package and deterministic generation mode", () => {
    expect(schemaCorePackage).toBe("schema-core");
    expect(schemaCoreGenerationMode).toBe("deterministic");
  });

  it("exports default rules in deterministic order", () => {
    expect(defaultSchemaRecommendationRules.map((rule) => rule.id)).toEqual([
      "WebSite",
      "WebPage",
      "BreadcrumbList",
      "FAQPage",
      "Article",
      "Service",
      "MedicalClinic",
      "LocalBusiness"
    ]);
  });
});

describe("JSON-LD type extraction", () => {
  it("extracts supported types from objects, arrays, and @graph blocks", () => {
    const snapshot = createSnapshot({
      jsonLd: [
        {
          raw: "{}",
          parsed: {
            "@graph": [
              {
                "@type": "https://schema.org/WebPage"
              },
              {
                "@type": ["FAQPage", "BreadcrumbList"]
              }
            ]
          }
        },
        {
          raw: "[]",
          parsed: [
            {
              "@type": "schema:Service"
            }
          ]
        }
      ]
    });

    expect(extractJsonLdTypes(snapshot)).toEqual([
      "WebPage",
      "FAQPage",
      "BreadcrumbList",
      "Service"
    ]);
    expect(hasSchemaType(snapshot, "FAQPage")).toBe(true);
    expect(hasSchemaType(snapshot, "Article")).toBe(false);
  });
});

describe("JSON-LD recommendation rules", () => {
  it("recommends WebSite and WebPage JSON-LD for a homepage without schema", () => {
    const set = recommendJsonLdForSnapshot(
      createContext(
        createSnapshot({
          canonicalUrl: "https://example.com/",
          headings: {
            h1: ["Example Clinic"],
            h2: []
          },
          h2Count: 0,
          title: "Example Clinic",
          url: "https://example.com/"
        }),
      ),
    );

    expect(set).toMatchObject({
      generatedBy: "deterministic",
      pageUrl: "https://example.com/",
      siteId: "site_1"
    });
    expect(set.recommendations.map((recommendation) => recommendation.type)).toEqual([
      "WebSite",
      "WebPage",
      "MedicalClinic"
    ]);
  });

  it("does not recommend a schema type that already exists", () => {
    const set = recommendJsonLdForSnapshot(
      createContext(
        createSnapshot({
          jsonLd: [
            {
              raw: "{}",
              parsed: {
                "@context": "https://schema.org",
                "@type": "WebPage"
              }
            }
          ]
        }),
      ),
    );

    expect(set.recommendations.map((recommendation) => recommendation.type)).not.toContain(
      "WebPage",
    );
    expect(set.recommendations[0]?.evidence.observedTypes).toEqual(["WebPage"]);
  });

  it("recommends nested service, FAQ, breadcrumb, and medical clinic schema", () => {
    const set = recommendJsonLdForSnapshot(createContext());

    expect(set.recommendations.map((recommendation) => recommendation.type)).toEqual([
      "WebPage",
      "BreadcrumbList",
      "FAQPage",
      "Service",
      "MedicalClinic"
    ]);
    expect(set.recommendations.find((recommendation) => recommendation.type === "Service"))
      .toMatchObject({
        priority: "p1",
        jsonLd: {
          "@type": "Service",
          provider: {
            "@type": "MedicalClinic"
          }
        }
      });
    expect(set.recommendations.find((recommendation) => recommendation.type === "FAQPage"))
      .toMatchObject({
        jsonLd: {
          mainEntity: [
            {
              name: "What does SEO clinic include?"
            }
          ]
        }
      });
  });

  it("recommends Article JSON-LD for editorial pages", () => {
    const set = recommendJsonLdForSnapshot(
      createContext(
        createSnapshot({
          canonicalUrl: "https://example.com/blog/schema-guide",
          headings: {
            h1: ["Schema Guide"],
            h2: []
          },
          h2Count: 0,
          title: "Schema Guide",
          url: "https://example.com/blog/schema-guide"
        }),
      ),
    );

    expect(set.recommendations.find((recommendation) => recommendation.type === "Article"))
      .toMatchObject({
        jsonLd: {
          "@type": "Article",
          author: {
            name: "Example Group"
          },
          headline: "Schema Guide"
        },
        priority: "p2"
      });
  });

  it("recommends LocalBusiness for non-medical location pages", () => {
    const set = recommendJsonLdForSnapshot({
      site: {
        ...site,
        industry: "retail",
        name: "Example Store"
      },
      snapshot: createSnapshot({
        canonicalUrl: "https://example.com/contact",
        headings: {
          h1: ["Contact"],
          h2: []
        },
        h2Count: 0,
        title: "Contact",
        url: "https://example.com/contact"
      })
    });

    expect(set.recommendations.map((recommendation) => recommendation.type)).toContain(
      "LocalBusiness",
    );
    expect(set.recommendations.map((recommendation) => recommendation.type)).not.toContain(
      "MedicalClinic",
    );
  });

  it("evaluates individual rules independently", () => {
    expect(serviceRecommendationRule.recommend(createContext())).toHaveLength(1);
    expect(
      faqPageRecommendationRule.recommend(
        createContext(
          createSnapshot({
            headings: {
              h1: ["SEO Clinic"],
              h2: ["Plain heading"]
            }
          }),
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("JSON-LD recommendation engine", () => {
  it("is deterministic for the same input", () => {
    const first = recommendJsonLdForSnapshot(createContext());
    const second = recommendJsonLdForSnapshot(createContext());

    expect(second).toEqual(first);
  });

  it("summarizes recommendations by type and priority", () => {
    const sets = recommendJsonLdForSnapshots({
      organizationName: "Example Group",
      site,
      snapshots: [
        createSnapshot(),
        createSnapshot({
          canonicalUrl: "https://example.com/",
          headings: {
            h1: ["Example Clinic"],
            h2: []
          },
          h2Count: 0,
          title: "Example Clinic",
          url: "https://example.com/"
        })
      ]
    });
    const summary = summarizeJsonLdRecommendations(sets);

    expect(summary.total).toBe(8);
    expect(summary.byType.WebPage).toBe(2);
    expect(summary.byType.MedicalClinic).toBe(2);
    expect(summary.byPriority.p1).toBe(3);
    expect(summary.byPriority.p2).toBe(5);
  });
});

describe("offline rich result validation", () => {
  it("marks generated JSON-LD drafts eligible when required fields and root type are present", () => {
    const set = recommendJsonLdForSnapshot(createContext());
    const serviceRecommendation = set.recommendations.find(
      (recommendation) => recommendation.type === "Service",
    );

    expect(serviceRecommendation).toBeDefined();
    if (!serviceRecommendation) {
      throw new Error("Expected Service recommendation");
    }

    expect(validateJsonLdRecommendation(serviceRecommendation)).toMatchObject({
      eligible: true,
      generatedBy: "deterministic",
      missingRecommendedFields: ["description", "serviceType"],
      missingRequiredFields: [],
      status: "eligible",
      type: "Service"
    });
  });

  it("flags missing required fields without calling live validators", () => {
    const result = validateJsonLdDraft({
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Service",
        name: "SEO service",
        url: "https://example.com/services/seo"
      },
      recommendedFields: ["description"],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      type: "Service",
      url: "https://example.com/services/seo"
    });

    expect(result).toMatchObject({
      eligible: false,
      missingRecommendedFields: ["description"],
      missingRequiredFields: ["provider"],
      status: "needs_required_fields"
    });
    expect(result.issues).toEqual([
      {
        field: "provider",
        message: "Required field provider is missing from Service JSON-LD.",
        severity: "error",
        sourceField: "jsonLd"
      },
      {
        field: "description",
        message: "Recommended field description is missing from Service JSON-LD.",
        severity: "warning",
        sourceField: "jsonLd"
      }
    ]);
  });

  it("checks root @type instead of accepting only nested supported types", () => {
    const result = validateJsonLdDraft({
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "SEO service",
        provider: {
          "@type": "Service",
          name: "Nested service"
        },
        url: "https://example.com/services/seo"
      },
      recommendedFields: [],
      requiredFields: ["@context", "@type", "name", "provider", "url"],
      type: "Service",
      url: "https://example.com/services/seo"
    });

    expect(result).toMatchObject({
      eligible: false,
      missingRequiredFields: [],
      status: "type_mismatch"
    });
    expect(result.issues).toEqual([
      {
        field: "@type",
        message: "Root @type must include Service.",
        severity: "error",
        sourceField: "jsonLd"
      }
    ]);
  });

  it("validates recommendation batches deterministically", () => {
    const set = recommendJsonLdForSnapshot(createContext());
    const first = validateJsonLdRecommendations(set.recommendations);
    const second = validateJsonLdRecommendations(set.recommendations);

    expect(second).toEqual(first);
    expect(first.map((result) => result.type)).toEqual([
      "WebPage",
      "BreadcrumbList",
      "FAQPage",
      "Service",
      "MedicalClinic"
    ]);
  });
});
