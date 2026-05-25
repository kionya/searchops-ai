import {
  CrawlerPageSnapshotSchema,
  JsonLdRecommendationSchema,
  JsonLdRecommendationSetSchema,
  SchemaRichResultValidationResultSchema
} from "@searchops/types";
import type {
  CrawlerPageSnapshot,
  JsonLdObject,
  JsonLdRecommendation,
  JsonLdRecommendationSet,
  SchemaJsonLdType,
  SchemaRecommendationPriority,
  SchemaRichResultValidationResult
} from "@searchops/types";

export const schemaCorePackage = "schema-core" as const;
export const schemaCoreGenerationMode = "deterministic" as const;

export interface SchemaSiteContext {
  readonly id: string;
  readonly domain: string;
  readonly name: string | null;
  readonly industry: string | null;
  readonly language: string;
  readonly country: string;
}

export interface SchemaRuleContext {
  readonly organizationName?: string | null;
  readonly site: SchemaSiteContext;
  readonly snapshot: CrawlerPageSnapshot;
}

export interface SchemaRecommendationRule {
  readonly id: SchemaJsonLdType;
  readonly recommend: (context: SchemaRuleContext) => readonly JsonLdRecommendation[];
}

export interface SchemaRecommendationBatchInput {
  readonly organizationName?: string | null;
  readonly rules?: readonly SchemaRecommendationRule[];
  readonly site: SchemaSiteContext;
  readonly snapshots: readonly CrawlerPageSnapshot[];
}

export interface SchemaRecommendationSummary {
  readonly byPriority: Record<SchemaRecommendationPriority, number>;
  readonly byType: Record<SchemaJsonLdType, number>;
  readonly total: number;
}

export interface SchemaRichResultValidationInput {
  readonly jsonLd: JsonLdObject;
  readonly recommendedFields?: readonly string[];
  readonly requiredFields: readonly string[];
  readonly type: SchemaJsonLdType;
  readonly url: string;
}

const supportedSchemaTypes = [
  "WebSite",
  "WebPage",
  "Article",
  "FAQPage",
  "BreadcrumbList",
  "LocalBusiness",
  "MedicalClinic",
  "Service"
] as const satisfies readonly SchemaJsonLdType[];

const priorities = ["p0", "p1", "p2", "p3"] as const satisfies readonly SchemaRecommendationPriority[];

export const webSiteRecommendationRule: SchemaRecommendationRule = {
  id: "WebSite",
  recommend(context) {
    if (!isHomePage(context.snapshot.url) || hasSchemaType(context.snapshot, "WebSite")) {
      return [];
    }

    const siteName = getSiteName(context);

    return [
      createRecommendation({
        context,
        instructions: [
          "Add WebSite JSON-LD on the homepage.",
          "Keep the name and canonical homepage URL aligned with the registered site."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "WebSite",
          inLanguage: context.site.language,
          name: siteName,
          url: getSiteBaseUrl(context.site)
        },
        priority: "p2",
        reason: "The homepage has no WebSite JSON-LD block.",
        recommendedFields: ["potentialAction"],
        requiredFields: ["@context", "@type", "name", "url"],
        type: "WebSite"
      })
    ];
  }
};

export const webPageRecommendationRule: SchemaRecommendationRule = {
  id: "WebPage",
  recommend(context) {
    if (hasSchemaType(context.snapshot, "WebPage")) {
      return [];
    }

    const pageName = getPageName(context);

    return [
      createRecommendation({
        context,
        instructions: [
          "Add WebPage JSON-LD to the page.",
          "Use the same URL as the canonical URL after canonical issues are resolved."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "WebPage",
          inLanguage: context.site.language,
          isPartOf: {
            "@type": "WebSite",
            name: getSiteName(context),
            url: getSiteBaseUrl(context.site)
          },
          name: pageName,
          url: context.snapshot.url
        },
        priority: "p2",
        reason: "The page has no WebPage JSON-LD block.",
        recommendedFields: ["description", "breadcrumb"],
        requiredFields: ["@context", "@type", "url", "name"],
        type: "WebPage"
      })
    ];
  }
};

export const breadcrumbRecommendationRule: SchemaRecommendationRule = {
  id: "BreadcrumbList",
  recommend(context) {
    const segments = getPathSegments(context.snapshot.url);

    if (segments.length < 2 || hasSchemaType(context.snapshot, "BreadcrumbList")) {
      return [];
    }

    return [
      createRecommendation({
        context,
        instructions: [
          "Add BreadcrumbList JSON-LD for nested pages.",
          "Match each breadcrumb item to the visible navigation trail when one exists."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: createBreadcrumbItems(context.snapshot.url, segments)
        },
        priority: "p2",
        reason: "The nested page has no BreadcrumbList JSON-LD block.",
        recommendedFields: [],
        requiredFields: ["@context", "@type", "itemListElement"],
        type: "BreadcrumbList"
      })
    ];
  }
};

export const faqPageRecommendationRule: SchemaRecommendationRule = {
  id: "FAQPage",
  recommend(context) {
    const questions = extractQuestionHeadings(context.snapshot).slice(0, 6);

    if (questions.length === 0 || hasSchemaType(context.snapshot, "FAQPage")) {
      return [];
    }

    return [
      createRecommendation({
        context,
        instructions: [
          "Add FAQPage JSON-LD only after the visible page includes reviewed answers.",
          "Keep every JSON-LD question and answer synchronized with visible content."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: questions.map((question) => ({
            "@type": "Question",
            acceptedAnswer: {
              "@type": "Answer",
              text: `Add a concise reviewed answer for: ${question}`
            },
            name: question
          }))
        },
        priority: "p2",
        reason: "Question-style headings are present but FAQPage JSON-LD is missing.",
        recommendedFields: ["mainEntity.acceptedAnswer.text"],
        requiredFields: ["@context", "@type", "mainEntity"],
        type: "FAQPage"
      })
    ];
  }
};

export const articleRecommendationRule: SchemaRecommendationRule = {
  id: "Article",
  recommend(context) {
    if (!isArticleLikePage(context.snapshot.url) || hasSchemaType(context.snapshot, "Article")) {
      return [];
    }

    const organizationName = getOrganizationName(context);

    return [
      createRecommendation({
        context,
        instructions: [
          "Add Article JSON-LD to editorial or guide-style pages.",
          "Confirm headline, author, and publisher values before release."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Article",
          author: {
            "@type": "Organization",
            name: organizationName
          },
          headline: getPageName(context),
          mainEntityOfPage: {
            "@id": context.snapshot.url,
            "@type": "WebPage"
          },
          publisher: {
            "@type": "Organization",
            name: organizationName
          }
        },
        priority: "p2",
        reason: "The editorial page has no Article JSON-LD block.",
        recommendedFields: ["datePublished", "dateModified", "image"],
        requiredFields: ["@context", "@type", "headline", "mainEntityOfPage"],
        type: "Article"
      })
    ];
  }
};

export const serviceRecommendationRule: SchemaRecommendationRule = {
  id: "Service",
  recommend(context) {
    if (!isServicePage(context.snapshot.url) || hasSchemaType(context.snapshot, "Service")) {
      return [];
    }

    return [
      createRecommendation({
        context,
        instructions: [
          "Add Service JSON-LD to service detail pages.",
          "Keep service names factual and avoid unsupported claims."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Service",
          areaServed: context.site.country,
          name: getPageName(context),
          provider: {
            "@type": isMedicalSite(context) ? "MedicalClinic" : "Organization",
            name: getSiteName(context)
          },
          url: context.snapshot.url
        },
        priority: "p1",
        reason: "The service page has no Service JSON-LD block.",
        recommendedFields: ["description", "serviceType"],
        requiredFields: ["@context", "@type", "name", "provider", "url"],
        type: "Service"
      })
    ];
  }
};

export const medicalClinicRecommendationRule: SchemaRecommendationRule = {
  id: "MedicalClinic",
  recommend(context) {
    if (!isMedicalSite(context) || hasSchemaType(context.snapshot, "MedicalClinic")) {
      return [];
    }

    return [
      createRecommendation({
        context,
        instructions: [
          "Use MedicalClinic JSON-LD for medical organizations after compliance review.",
          "Confirm specialties, addresses, and phone numbers before adding optional fields."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "MedicalClinic",
          areaServed: context.site.country,
          name: getSiteName(context),
          url: getSiteBaseUrl(context.site)
        },
        priority: "p1",
        reason: "The medical site has no MedicalClinic JSON-LD block.",
        recommendedFields: ["address", "telephone", "medicalSpecialty", "openingHours"],
        requiredFields: ["@context", "@type", "name", "url"],
        type: "MedicalClinic"
      })
    ];
  }
};

export const localBusinessRecommendationRule: SchemaRecommendationRule = {
  id: "LocalBusiness",
  recommend(context) {
    if (
      isMedicalSite(context) ||
      !isLocationPage(context.snapshot.url) ||
      hasSchemaType(context.snapshot, "LocalBusiness")
    ) {
      return [];
    }

    return [
      createRecommendation({
        context,
        instructions: [
          "Add LocalBusiness JSON-LD to location or contact pages.",
          "Confirm address and contact details before adding optional fields."
        ],
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          areaServed: context.site.country,
          name: getSiteName(context),
          url: getSiteBaseUrl(context.site)
        },
        priority: "p2",
        reason: "The location page has no LocalBusiness JSON-LD block.",
        recommendedFields: ["address", "telephone", "openingHours"],
        requiredFields: ["@context", "@type", "name", "url"],
        type: "LocalBusiness"
      })
    ];
  }
};

export const defaultSchemaRecommendationRules = [
  webSiteRecommendationRule,
  webPageRecommendationRule,
  breadcrumbRecommendationRule,
  faqPageRecommendationRule,
  articleRecommendationRule,
  serviceRecommendationRule,
  medicalClinicRecommendationRule,
  localBusinessRecommendationRule
] as const satisfies readonly SchemaRecommendationRule[];

export function recommendJsonLdForSnapshot(
  context: SchemaRuleContext,
  rules: readonly SchemaRecommendationRule[] = defaultSchemaRecommendationRules,
): JsonLdRecommendationSet {
  const parsedContext = {
    ...context,
    snapshot: CrawlerPageSnapshotSchema.parse(context.snapshot)
  } satisfies SchemaRuleContext;
  const recommendations = rules.flatMap((rule) => rule.recommend(parsedContext));

  return JsonLdRecommendationSetSchema.parse({
    generatedBy: schemaCoreGenerationMode,
    pageUrl: parsedContext.snapshot.url,
    recommendations,
    siteId: parsedContext.site.id
  });
}

export function recommendJsonLdForSnapshots(
  input: SchemaRecommendationBatchInput,
): readonly JsonLdRecommendationSet[] {
  return input.snapshots.map((snapshot) => {
    const context: SchemaRuleContext =
      input.organizationName === undefined
        ? {
            site: input.site,
            snapshot
          }
        : {
            organizationName: input.organizationName,
            site: input.site,
            snapshot
          };

    return recommendJsonLdForSnapshot(context, input.rules);
  });
}

export function summarizeJsonLdRecommendations(
  sets: readonly JsonLdRecommendationSet[],
): SchemaRecommendationSummary {
  const byType = Object.fromEntries(supportedSchemaTypes.map((type) => [type, 0])) as Record<
    SchemaJsonLdType,
    number
  >;
  const byPriority = Object.fromEntries(priorities.map((priority) => [priority, 0])) as Record<
    SchemaRecommendationPriority,
    number
  >;

  for (const set of sets) {
    for (const recommendation of set.recommendations) {
      byType[recommendation.type] += 1;
      byPriority[recommendation.priority] += 1;
    }
  }

  return {
    byPriority,
    byType,
    total: sets.reduce((total, set) => total + set.recommendations.length, 0)
  };
}

export function extractJsonLdTypes(snapshot: Pick<CrawlerPageSnapshot, "jsonLd">) {
  const foundTypes = new Set<SchemaJsonLdType>();

  for (const block of snapshot.jsonLd) {
    visitJsonLdNode(block.parsed, foundTypes);
  }

  return supportedSchemaTypes.filter((type) => foundTypes.has(type));
}

export function hasSchemaType(
  snapshot: Pick<CrawlerPageSnapshot, "jsonLd">,
  expectedType: SchemaJsonLdType,
) {
  return extractJsonLdTypes(snapshot).includes(expectedType);
}

export function validateJsonLdDraft(
  input: SchemaRichResultValidationInput,
): SchemaRichResultValidationResult {
  const requiredFields = uniqueNonBlankStrings(input.requiredFields);
  const recommendedFields = uniqueNonBlankStrings(input.recommendedFields ?? []);
  const observedRootTypes = getRootJsonLdTypes(input.jsonLd);
  const hasExpectedRootType = observedRootTypes.includes(input.type);
  const missingRequiredFields = requiredFields.filter(
    (field) => !hasValueAtPath(input.jsonLd, field),
  );
  const missingRecommendedFields = recommendedFields.filter(
    (field) => !hasValueAtPath(input.jsonLd, field),
  );

  const issues = [
    ...(hasExpectedRootType
      ? []
      : [
          {
            field: "@type",
            message: `Root @type must include ${input.type}.`,
            severity: "error" as const,
            sourceField: "jsonLd"
          }
        ]),
    ...missingRequiredFields.map((field) => ({
      field,
      message: `Required field ${field} is missing from ${input.type} JSON-LD.`,
      severity: "error" as const,
      sourceField: "jsonLd"
    })),
    ...missingRecommendedFields.map((field) => ({
      field,
      message: `Recommended field ${field} is missing from ${input.type} JSON-LD.`,
      severity: "warning" as const,
      sourceField: "jsonLd"
    }))
  ];

  const status = !hasExpectedRootType
    ? "type_mismatch"
    : missingRequiredFields.length > 0
      ? "needs_required_fields"
      : "eligible";

  return SchemaRichResultValidationResultSchema.parse({
    eligible: status === "eligible",
    generatedBy: schemaCoreGenerationMode,
    issues,
    missingRecommendedFields,
    missingRequiredFields,
    recommendedFields,
    requiredFields,
    status,
    type: input.type,
    url: input.url
  });
}

export function validateJsonLdRecommendation(
  recommendation: Pick<
    JsonLdRecommendation,
    "jsonLd" | "recommendedFields" | "requiredFields" | "type" | "url"
  >,
) {
  return validateJsonLdDraft({
    jsonLd: recommendation.jsonLd,
    recommendedFields: recommendation.recommendedFields,
    requiredFields: recommendation.requiredFields,
    type: recommendation.type,
    url: recommendation.url
  });
}

export function validateJsonLdRecommendations(
  recommendations: readonly Pick<
    JsonLdRecommendation,
    "jsonLd" | "recommendedFields" | "requiredFields" | "type" | "url"
  >[],
) {
  return recommendations.map((recommendation) => validateJsonLdRecommendation(recommendation));
}

function createRecommendation({
  context,
  instructions,
  jsonLd,
  priority,
  reason,
  recommendedFields,
  requiredFields,
  type
}: {
  readonly context: SchemaRuleContext;
  readonly instructions: readonly string[];
  readonly jsonLd: JsonLdObject;
  readonly priority: SchemaRecommendationPriority;
  readonly reason: string;
  readonly recommendedFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly type: SchemaJsonLdType;
}) {
  return JsonLdRecommendationSchema.parse({
    evidence: {
      expectedType: type,
      observedTypes: extractJsonLdTypes(context.snapshot),
      sourceField: "jsonLd",
      url: context.snapshot.url
    },
    generatedBy: schemaCoreGenerationMode,
    instructions,
    jsonLd,
    priority,
    reason,
    recommendedFields,
    requiredFields,
    type,
    url: context.snapshot.url
  });
}

function visitJsonLdNode(value: unknown, foundTypes: Set<SchemaJsonLdType>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitJsonLdNode(item, foundTypes);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const typeValue of extractTypeValues(value["@type"])) {
    const normalizedType = normalizeSchemaType(typeValue);

    if (normalizedType) {
      foundTypes.add(normalizedType);
    }
  }

  for (const nestedValue of Object.values(value)) {
    visitJsonLdNode(nestedValue, foundTypes);
  }
}

function extractTypeValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTypeValues(item));
  }

  return [];
}

function normalizeSchemaType(value: string): SchemaJsonLdType | null {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/schema\.org\//iu, "")
    .replace(/^schema:/iu, "")
    .split(/[#/]/u)
    .filter(Boolean)
    .at(-1);

  if (!cleaned) {
    return null;
  }

  return supportedSchemaTypes.find((type) => type.toLowerCase() === cleaned.toLowerCase()) ?? null;
}

function getRootJsonLdTypes(jsonLd: JsonLdObject) {
  const rootTypes = new Set<SchemaJsonLdType>();

  for (const typeValue of extractTypeValues(jsonLd["@type"])) {
    const normalizedType = normalizeSchemaType(typeValue);

    if (normalizedType) {
      rootTypes.add(normalizedType);
    }
  }

  return supportedSchemaTypes.filter((type) => rootTypes.has(type));
}

function hasValueAtPath(value: unknown, path: string): boolean {
  const [head, ...tail] = path.split(".").filter(Boolean);

  if (!head) {
    return hasUsableValue(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => hasValueAtPath(item, path));
  }

  if (!isRecord(value) || !(head in value)) {
    return false;
  }

  return hasValueAtPath(value[head], tail.join("."));
}

function hasUsableValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => hasUsableValue(item));
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return true;
}

function getPathSegments(url: string) {
  return new URL(url).pathname.split("/").filter((segment) => segment.length > 0);
}

function isHomePage(url: string) {
  const parsedUrl = new URL(url);

  return parsedUrl.pathname === "/" && parsedUrl.search.length === 0;
}

function isArticleLikePage(url: string) {
  const segments = getPathSegments(url).map((segment) => segment.toLowerCase());

  return segments.some((segment) =>
    ["article", "articles", "blog", "guide", "guides", "insight", "insights", "news"].includes(
      segment,
    ),
  );
}

function isServicePage(url: string) {
  const segments = getPathSegments(url).map((segment) => segment.toLowerCase());

  return segments.some((segment) => ["service", "services"].includes(segment));
}

function isLocationPage(url: string) {
  const segments = getPathSegments(url).map((segment) => segment.toLowerCase());

  return segments.some((segment) =>
    ["about", "contact", "contacts", "direction", "directions", "location", "locations"].includes(
      segment,
    ),
  );
}

function isMedicalSite(context: SchemaRuleContext) {
  const values = [
    context.site.industry ?? "",
    context.site.domain,
    context.site.name ?? "",
    context.snapshot.url
  ]
    .join(" ")
    .toLowerCase();

  return /clinic|derma|dermatology|health|hospital|medical|병원|의료|의원|피부/u.test(values);
}

function extractQuestionHeadings(snapshot: CrawlerPageSnapshot) {
  return uniqueNonBlankStrings(snapshot.headings.h2.filter((heading) => isQuestionHeading(heading)));
}

function isQuestionHeading(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized.endsWith("?")) {
    return true;
  }

  return /^(can|does|do|how|is|should|what|when|where|who|why)\b/u.test(normalized) ||
    /무엇|어떻게|왜|언제|어디|얼마|인가|나요|까요|습니까|이란/u.test(normalized);
}

function createBreadcrumbItems(url: string, segments: readonly string[]) {
  const parsedUrl = new URL(url);
  const items = [
    {
      "@type": "ListItem",
      item: parsedUrl.origin,
      name: "Home",
      position: 1
    }
  ];

  for (const [index, segment] of segments.entries()) {
    items.push({
      "@type": "ListItem",
      item: `${parsedUrl.origin}/${segments.slice(0, index + 1).join("/")}`,
      name: toTitleCase(decodePathSegment(segment)),
      position: index + 2
    });
  }

  return items;
}

function getPageName(context: SchemaRuleContext) {
  const heading = context.snapshot.headings.h1.find((value) => value.trim().length > 0);

  return (
    nonBlank(context.snapshot.title) ??
    nonBlank(heading ?? null) ??
    getPathTopic(context.snapshot.url) ??
    getSiteName(context)
  );
}

function getPathTopic(url: string) {
  const [lastSegment] = getPathSegments(url).slice(-1);

  if (!lastSegment) {
    return null;
  }

  return toTitleCase(decodePathSegment(lastSegment));
}

function getSiteName(context: SchemaRuleContext) {
  return nonBlank(context.site.name) ?? context.site.domain;
}

function getOrganizationName(context: SchemaRuleContext) {
  return nonBlank(context.organizationName ?? null) ?? getSiteName(context);
}

function getSiteBaseUrl(site: SchemaSiteContext) {
  return `https://${site.domain.replace(/\/+$/u, "")}/`;
}

function uniqueNonBlankStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/gu, " ");
    const key = normalized.toLowerCase();

    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function nonBlank(value: string | null) {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment).replace(/\.[a-z0-9]+$/iu, "").replace(/[-_]+/gu, " ");
  } catch {
    return segment.replace(/\.[a-z0-9]+$/iu, "").replace(/[-_]+/gu, " ");
  }
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .split(" ")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
