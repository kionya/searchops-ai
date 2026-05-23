import { compliancePackage } from "@searchops/compliance";
import { schemaCorePackage } from "@searchops/schema-core";
import { seoCorePackage } from "@searchops/seo-core";
import {
  SchemaRecommendationRecordSchema,
  SeoIssueDraftSchema,
  WorkOrderDraftSchema
} from "@searchops/types";
import type {
  EstimatedEffort,
  SchemaJsonLdType,
  SchemaRecommendationRecord,
  SeoIssueDraft,
  SeoIssueRuleId,
  WorkOrderDraft,
  WorkOrderOwnerType
} from "@searchops/types";

export const workordersPackage = "workorders" as const;

export const workOrderInputSources = [
  seoCorePackage,
  compliancePackage,
  schemaCorePackage
] as const;

interface WorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly estimatedEffort: EstimatedEffort;
  readonly relatedIssues: readonly SeoIssueRuleId[];
  readonly title: (path: string) => string;
  readonly problem: (issue: SeoIssueDraft) => string;
  readonly impact: string;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationMethod: string;
}

interface SchemaWorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly estimatedEffort: EstimatedEffort;
  readonly impact: string;
  readonly title: (path: string, type: SchemaJsonLdType) => string;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: (type: SchemaJsonLdType) => readonly string[];
}

export const supportedSeoIssueRuleIds = [
  "TITLE_MISSING",
  "META_DESC_MISSING",
  "H1_MISSING",
  "MULTIPLE_H1",
  "NOINDEX_ON_IMPORTANT_PAGE",
  "CANONICAL_MISSING",
  "CANONICAL_MISMATCH",
  "IMAGE_ALT_MISSING"
] as const satisfies readonly SeoIssueRuleId[];

export const supportedSchemaRecommendationTypes = [
  "WebSite",
  "WebPage",
  "Article",
  "FAQPage",
  "BreadcrumbList",
  "LocalBusiness",
  "MedicalClinic",
  "Service"
] as const satisfies readonly SchemaJsonLdType[];

const workOrderTemplates = {
  TITLE_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["META_DESC_MISSING", "H1_MISSING"],
    title: (path) => `${path} title tag fix`,
    problem: () => "The page is missing a non-empty title tag.",
    impact:
      "Search engines and answer engines may not identify the page topic or display a useful result title.",
    instructions: [
      "Add one unique title tag for the page.",
      "Include the primary topic and service name naturally.",
      "Keep the title specific to this URL and avoid duplicating another page title."
    ],
    acceptanceCriteria: [
      "Re-crawl reports a non-empty title value.",
      "The title is unique for this page.",
      "The title topic matches the visible page content."
    ],
    verificationMethod: "Run a crawler recheck and confirm the title field is non-empty."
  },
  META_DESC_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["TITLE_MISSING"],
    title: (path) => `${path} meta description fix`,
    problem: () => "The page is missing a non-empty meta description.",
    impact:
      "Search snippets and AI summaries may have weaker context because the page lacks a concise description.",
    instructions: [
      "Add one meta description that summarizes the page.",
      "Mention the primary topic and user intent without keyword stuffing.",
      "Keep the description unique to this URL."
    ],
    acceptanceCriteria: [
      "Re-crawl reports a non-empty metaDescription value.",
      "The description accurately summarizes the page.",
      "The description is not duplicated from another key page."
    ],
    verificationMethod: "Run a crawler recheck and confirm the metaDescription field is non-empty."
  },
  H1_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["MULTIPLE_H1", "TITLE_MISSING"],
    title: (path) => `${path} missing H1 fix`,
    problem: () => "The page has no H1 heading.",
    impact:
      "Search engines and answer engines may not identify the primary page topic from the visible heading structure.",
    instructions: [
      "Add one descriptive H1 near the top of the page.",
      "Include the target topic and service name naturally.",
      "Keep only one H1 on the page."
    ],
    acceptanceCriteria: [
      "Re-crawl reports h1Count = 1.",
      "The H1 text is non-empty.",
      "The title and H1 describe the same page topic."
    ],
    verificationMethod: "Run a crawler recheck and confirm h1Count is exactly 1."
  },
  MULTIPLE_H1: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["H1_MISSING"],
    title: (path) => `${path} multiple H1 cleanup`,
    problem: (issue) => `The page has ${String(issue.evidence.observedValue)} H1 headings.`,
    impact:
      "Multiple H1 headings can dilute the primary topic signal used by search and answer engines.",
    instructions: [
      "Choose one H1 as the primary page heading.",
      "Convert secondary H1 headings to H2 or lower-level headings.",
      "Keep the visible heading hierarchy in logical order."
    ],
    acceptanceCriteria: [
      "Re-crawl reports h1Count = 1.",
      "Secondary headings use H2 or lower levels.",
      "The remaining H1 matches the primary page topic."
    ],
    verificationMethod: "Run a crawler recheck and confirm h1Count is exactly 1."
  },
  NOINDEX_ON_IMPORTANT_PAGE: {
    ownerType: "developer",
    estimatedEffort: "s",
    relatedIssues: ["ROBOTS_BLOCKED"],
    title: (path) => `${path} noindex removal`,
    problem: () => "An important page is marked noindex.",
    impact:
      "The page may be excluded from search results and unavailable for AI answer engine citation.",
    instructions: [
      "Confirm the page should be indexable.",
      "Remove the noindex directive from robots meta or HTTP headers.",
      "Check that the page is not blocked by robots.txt."
    ],
    acceptanceCriteria: [
      "Re-crawl reports indexability.noindex = false.",
      "The page remains accessible with a successful HTTP status.",
      "robots.txt does not block the URL."
    ],
    verificationMethod: "Run a crawler recheck and confirm indexability.noindex is false."
  },
  CANONICAL_MISSING: {
    ownerType: "developer",
    estimatedEffort: "s",
    relatedIssues: ["CANONICAL_MISMATCH"],
    title: (path) => `${path} canonical URL fix`,
    problem: () => "The page is missing a canonical URL.",
    impact:
      "Search engines may have weaker duplicate handling and may choose a less appropriate canonical URL.",
    instructions: [
      "Add a canonical link element for the page.",
      "Use the final indexable URL as the canonical URL.",
      "Avoid pointing the canonical to an unrelated URL."
    ],
    acceptanceCriteria: [
      "Re-crawl reports a non-empty canonicalUrl value.",
      "The canonical URL is HTTP or HTTPS.",
      "The canonical URL points to the preferred final URL."
    ],
    verificationMethod: "Run a crawler recheck and confirm canonicalUrl is present."
  },
  CANONICAL_MISMATCH: {
    ownerType: "developer",
    estimatedEffort: "m",
    relatedIssues: ["CANONICAL_MISSING"],
    title: (path) => `${path} canonical mismatch fix`,
    problem: (issue) =>
      `The canonical URL is ${String(issue.evidence.observedValue)}, but expected ${String(
        issue.evidence.expectedValue
      )}.`,
    impact:
      "Search engines may consolidate ranking signals into the wrong URL or ignore the intended page.",
    instructions: [
      "Review the canonical link for this URL.",
      "Update the canonical to the preferred final URL.",
      "Confirm redirects and canonical tags agree on the same destination."
    ],
    acceptanceCriteria: [
      "Re-crawl reports indexability.canonicalMismatch = false.",
      "canonicalUrl matches the preferred final URL.",
      "The canonical target is crawlable and indexable."
    ],
    verificationMethod:
      "Run a crawler recheck and confirm indexability.canonicalMismatch is false."
  },
  IMAGE_ALT_MISSING: {
    ownerType: "content",
    estimatedEffort: "m",
    relatedIssues: [],
    title: (path) => `${path} image alt text fix`,
    problem: (issue) =>
      `One or more images are missing alt text: ${formatEvidenceValue(issue.evidence.observedValue)}.`,
    impact:
      "Image context, accessibility, and multimodal AI understanding may be weaker without alt text.",
    instructions: [
      "Review each image missing alt text.",
      "Add concise alt text that describes meaningful images.",
      "Use empty alt text only for decorative images."
    ],
    acceptanceCriteria: [
      "Re-crawl reports no IMAGE_ALT_MISSING issue for the URL.",
      "Meaningful images have descriptive alt text.",
      "Decorative images are intentionally marked with empty alt text."
    ],
    verificationMethod: "Run a crawler recheck and confirm all meaningful images have alt text."
  }
} satisfies Record<(typeof supportedSeoIssueRuleIds)[number], WorkOrderTemplate>;

const schemaWorkOrderTemplates = {
  Article: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "Article JSON-LD helps search and answer engines understand the page as editorial content with a headline, author, and publisher.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add the reviewed Article JSON-LD block to the page.",
      "Confirm headline, author, publisher, and visible content alignment before release."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "JSON-LD validates as an Article object with required fields present.",
      "The JSON-LD values match visible page content."
    ]
  },
  BreadcrumbList: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "Breadcrumb structured data clarifies page hierarchy for search results and answer engine citation context.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add BreadcrumbList JSON-LD for the nested page.",
      "Keep every breadcrumb item aligned with visible navigation and canonical URLs."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "Each breadcrumb item has name, item, and position fields.",
      "Breadcrumb URLs resolve within the same site scope."
    ]
  },
  FAQPage: {
    ownerType: "content",
    estimatedEffort: "m",
    impact:
      "FAQPage JSON-LD can make reviewed question-and-answer content easier for search and answer engines to extract.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add FAQPage JSON-LD only for reviewed visible FAQ content.",
      "Keep every JSON-LD question and answer synchronized with visible page copy."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "Every JSON-LD question has a matching visible question on the page.",
      "Every answer has been reviewed before release."
    ]
  },
  LocalBusiness: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "LocalBusiness JSON-LD helps search systems understand location, contact, and local entity context.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add LocalBusiness JSON-LD to the location or contact page.",
      "Confirm address, phone, and opening hours before adding optional fields."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "Required name and URL fields are present.",
      "Optional contact fields match official business information."
    ]
  },
  MedicalClinic: {
    ownerType: "legal",
    estimatedEffort: "m",
    impact:
      "MedicalClinic JSON-LD can clarify medical entity context, but medical claims and specialties require compliance review.",
    title: (path, type) => `${path} ${type} JSON-LD compliance review`,
    instructions: [
      "Review the MedicalClinic JSON-LD draft before implementation.",
      "Confirm specialties, contact details, and claims comply with medical advertising rules.",
      "Hand off approved structured data to a developer for release."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL after approved implementation.`,
      "Compliance review confirms no unsupported medical claims.",
      "Required name and URL fields are present."
    ]
  },
  Service: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "Structured service data helps search and answer engines understand the offering, provider, and service URL.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add Service JSON-LD to the service detail page.",
      "Keep service names factual and avoid unsupported claims."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "JSON-LD includes service name, provider, and URL.",
      "The service description matches visible page content."
    ]
  },
  WebPage: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "WebPage JSON-LD gives search and answer engines a clear page entity tied to the canonical URL.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add WebPage JSON-LD to the page.",
      "Align the JSON-LD URL with the canonical URL after canonical issues are resolved."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "JSON-LD includes page name and URL.",
      "The page URL matches the canonical page URL."
    ]
  },
  WebSite: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "WebSite JSON-LD helps search systems identify the site entity and homepage URL.",
    title: (path, type) => `${path} ${type} JSON-LD implementation`,
    instructions: [
      "Add WebSite JSON-LD to the homepage.",
      "Keep the site name and URL aligned with the registered site."
    ],
    acceptanceCriteria: (type) => [
      `Schema recommendation recheck no longer returns ${type} for the URL.`,
      "JSON-LD includes site name and homepage URL.",
      "The homepage URL resolves within the same site scope."
    ]
  }
} satisfies Record<(typeof supportedSchemaRecommendationTypes)[number], SchemaWorkOrderTemplate>;

export function createWorkOrderFromSeoIssue(issue: SeoIssueDraft): WorkOrderDraft {
  const parsedIssue = SeoIssueDraftSchema.parse(issue);
  const template = getWorkOrderTemplate(parsedIssue.ruleId);
  const path = formatUrlPath(parsedIssue.evidence.url);

  return WorkOrderDraftSchema.parse({
    title: template.title(path),
    problem: template.problem(parsedIssue),
    evidence: parsedIssue.evidence,
    impact: template.impact,
    instructions: [...template.instructions],
    ownerType: template.ownerType,
    priority: parsedIssue.priority,
    acceptanceCriteria: [...template.acceptanceCriteria],
    verificationMethod: template.verificationMethod,
    estimatedEffort: template.estimatedEffort,
    relatedIssues: [...template.relatedIssues]
  });
}

export function createWorkOrdersFromSeoIssues(
  issues: readonly SeoIssueDraft[]
): readonly WorkOrderDraft[] {
  return issues.map((issue) => createWorkOrderFromSeoIssue(issue));
}

export function createWorkOrderFromSchemaRecommendation(
  recommendation: SchemaRecommendationRecord,
): WorkOrderDraft {
  const parsedRecommendation = SchemaRecommendationRecordSchema.parse(recommendation);
  const template = getSchemaWorkOrderTemplate(parsedRecommendation.type);
  const path = formatUrlPath(parsedRecommendation.pageUrl);

  return WorkOrderDraftSchema.parse({
    title: template.title(path, parsedRecommendation.type),
    problem: parsedRecommendation.reason,
    evidence: {
      url: parsedRecommendation.pageUrl,
      observedValue: parsedRecommendation.evidence.observedTypes,
      expectedValue: parsedRecommendation.evidence.expectedType,
      sourceField: parsedRecommendation.evidence.sourceField
    },
    impact: template.impact,
    instructions: [
      ...template.instructions,
      ...parsedRecommendation.instructions,
      `Required JSON-LD fields: ${parsedRecommendation.requiredFields.join(", ")}.`
    ],
    ownerType: template.ownerType,
    priority: parsedRecommendation.priority,
    acceptanceCriteria: [...template.acceptanceCriteria(parsedRecommendation.type)],
    verificationMethod: `Run schema recommendation recheck for ${parsedRecommendation.pageUrl} and confirm no open ${parsedRecommendation.type} recommendation remains.`,
    estimatedEffort: template.estimatedEffort,
    relatedIssues: ["SCHEMA_MISSING"]
  });
}

export function createWorkOrdersFromSchemaRecommendations(
  recommendations: readonly SchemaRecommendationRecord[],
): readonly WorkOrderDraft[] {
  return recommendations.map((recommendation) =>
    createWorkOrderFromSchemaRecommendation(recommendation),
  );
}

export function hasWorkOrderTemplate(ruleId: SeoIssueRuleId) {
  return Object.hasOwn(workOrderTemplates, ruleId);
}

export function hasSchemaWorkOrderTemplate(type: SchemaJsonLdType) {
  return Object.hasOwn(schemaWorkOrderTemplates, type);
}

function getWorkOrderTemplate(ruleId: SeoIssueRuleId) {
  if (!hasWorkOrderTemplate(ruleId)) {
    throw new Error(`No work order template for SEO rule: ${ruleId}`);
  }

  return workOrderTemplates[ruleId as (typeof supportedSeoIssueRuleIds)[number]];
}

function getSchemaWorkOrderTemplate(type: SchemaJsonLdType) {
  if (!hasSchemaWorkOrderTemplate(type)) {
    throw new Error(`No work order template for schema recommendation: ${type}`);
  }

  return schemaWorkOrderTemplates[type as (typeof supportedSchemaRecommendationTypes)[number]];
}

function formatUrlPath(url: string) {
  const { pathname } = new URL(url);
  return pathname === "" ? "/" : pathname;
}

function formatEvidenceValue(value: SeoIssueDraft["evidence"]["observedValue"]) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}
