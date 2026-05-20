import { z } from "zod";

export const productName = "SearchOps AI" as const;
export const crawlQueueName = "searchops-crawl" as const;

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const IdSchema = z.string().min(1);
const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "Expected an HTTP or HTTPS URL"
  });
export const NormalizedUrlSchema = HttpUrlSchema;

export type NormalizedUrl = z.infer<typeof NormalizedUrlSchema>;

const DomainSchema = z
  .string()
  .min(1)
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Expected a bare domain such as example.com"));

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string().min(1)
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const SearchOpsEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection URL"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type SearchOpsEnv = z.infer<typeof SearchOpsEnvSchema>;

export function parseSearchOpsEnv(input: NodeJS.ProcessEnv) {
  const parsed = SearchOpsEnvSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid SearchOps environment: ${message}`);
  }
  return parsed.data;
}

export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  createdAt: IsoDateTimeSchema
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const UserSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  email: z.string().email(),
  name: z.string().min(1).nullable(),
  role: z.string().min(1),
  createdAt: IsoDateTimeSchema
});

export type User = z.infer<typeof UserSchema>;

export const SiteSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  domain: DomainSchema,
  name: z.string().min(1).nullable(),
  industry: z.string().min(1).nullable(),
  language: z.string().min(2).default("ko"),
  country: z.string().min(2).default("KR"),
  createdAt: IsoDateTimeSchema
});

export type Site = z.infer<typeof SiteSchema>;

export const CrawlRunSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  status: z.string().min(1),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  summary: z.record(z.unknown()).nullable()
});

export type CrawlRun = z.infer<typeof CrawlRunSchema>;

export const CreateCrawlRunRequestSchema = z.object({
  startUrl: HttpUrlSchema.optional(),
  maxPages: z.number().int().positive().max(100).default(25)
});

export type CreateCrawlRunRequest = z.infer<typeof CreateCrawlRunRequestSchema>;

export const UrlRecordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  crawlRunId: IdSchema.nullable(),
  url: z.string().url(),
  statusCode: z.number().int().nullable(),
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  createdAt: IsoDateTimeSchema
});

export type UrlRecord = z.infer<typeof UrlRecordSchema>;

export const SeoIssueSchema = z.object({
  id: IdSchema,
  crawlRunId: IdSchema,
  urlRecordId: IdSchema.nullable(),
  ruleId: z.string().min(1),
  severity: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
  evidence: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema
});

export type SeoIssue = z.infer<typeof SeoIssueSchema>;

export const SeoIssueRuleIdSchema = z.enum([
  "TITLE_MISSING",
  "TITLE_DUPLICATE",
  "META_DESC_MISSING",
  "H1_MISSING",
  "MULTIPLE_H1",
  "NOINDEX_ON_IMPORTANT_PAGE",
  "CANONICAL_MISSING",
  "CANONICAL_MISMATCH",
  "BROKEN_INTERNAL_LINK",
  "IMAGE_ALT_MISSING",
  "SCHEMA_MISSING",
  "THIN_CONTENT",
  "ORPHAN_PAGE",
  "ROBOTS_BLOCKED"
]);

export type SeoIssueRuleId = z.infer<typeof SeoIssueRuleIdSchema>;

export const SeoIssueSeveritySchema = z.enum(["critical", "high", "medium", "low"]);

export type SeoIssueSeverity = z.infer<typeof SeoIssueSeveritySchema>;

export const SeoIssueCategorySchema = z.enum([
  "metadata",
  "headings",
  "canonical",
  "indexability",
  "images",
  "links",
  "schema",
  "content"
]);

export type SeoIssueCategory = z.infer<typeof SeoIssueCategorySchema>;

export const SeoIssuePrioritySchema = z.enum(["p0", "p1", "p2", "p3"]);

export type SeoIssuePriority = z.infer<typeof SeoIssuePrioritySchema>;

export const SeoIssueEvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string())
]);

export type SeoIssueEvidenceValue = z.infer<typeof SeoIssueEvidenceValueSchema>;

export const SeoIssueEvidenceSchema = z.object({
  url: NormalizedUrlSchema,
  observedValue: SeoIssueEvidenceValueSchema,
  expectedValue: SeoIssueEvidenceValueSchema,
  sourceField: z.string().min(1)
});

export type SeoIssueEvidence = z.infer<typeof SeoIssueEvidenceSchema>;

export const SeoIssueDraftSchema = z.object({
  ruleId: SeoIssueRuleIdSchema,
  severity: SeoIssueSeveritySchema,
  category: SeoIssueCategorySchema,
  priority: SeoIssuePrioritySchema,
  title: z.string().min(1),
  evidence: SeoIssueEvidenceSchema,
  impactScore: z.number().int().min(0).max(100),
  effortScore: z.number().int().min(0).max(100),
  priorityScore: z.number().int().min(0).max(100)
});

export type SeoIssueDraft = z.infer<typeof SeoIssueDraftSchema>;

export const WorkOrderSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema.nullable(),
  seoIssueId: IdSchema.nullable(),
  status: z.string().min(1),
  priority: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  createdAt: IsoDateTimeSchema
});

export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const KeywordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  phrase: z.string().min(1),
  locale: z.string().min(2).default("ko-KR"),
  intent: z.string().nullable(),
  createdAt: IsoDateTimeSchema
});

export type Keyword = z.infer<typeof KeywordSchema>;

export const ContentBriefSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  keywordId: IdSchema.nullable(),
  title: z.string().min(1),
  status: z.string().min(1),
  outline: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema
});

export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const AiPromptSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  purpose: z.string().min(1),
  template: z.string().min(1),
  createdAt: IsoDateTimeSchema
});

export type AiPrompt = z.infer<typeof AiPromptSchema>;

export const AiResultSchema = z.object({
  id: IdSchema,
  promptId: IdSchema,
  status: z.string().min(1),
  output: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema
});

export type AiResult = z.infer<typeof AiResultSchema>;

export const ComplianceFlagSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema.nullable(),
  workOrderId: IdSchema.nullable(),
  riskLevel: z.string().min(1),
  status: z.string().min(1),
  message: z.string().min(1),
  createdAt: IsoDateTimeSchema
});

export type ComplianceFlag = z.infer<typeof ComplianceFlagSchema>;

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(1)
});

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationListResponseSchema = z.object({
  organizations: z.array(OrganizationSchema)
});

export type OrganizationListResponse = z.infer<typeof OrganizationListResponseSchema>;

export const CreateSiteRequestSchema = z.object({
  domain: DomainSchema,
  name: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  language: z.string().min(2).default("ko"),
  country: z.string().min(2).default("KR")
});

export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;

export const UpdateSiteRequestSchema = z.object({
  domain: DomainSchema.optional(),
  name: z.string().min(1).nullable().optional(),
  industry: z.string().min(1).nullable().optional(),
  language: z.string().min(2).optional(),
  country: z.string().min(2).optional()
});

export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;

export const SiteListResponseSchema = z.object({
  sites: z.array(SiteSchema)
});

export type SiteListResponse = z.infer<typeof SiteListResponseSchema>;

export const MockUserContextSchema = z.object({
  userId: IdSchema,
  organizationId: IdSchema,
  source: z.literal("mock")
});

export type MockUserContext = z.infer<typeof MockUserContextSchema>;

export const LinkClassificationSchema = z.enum(["internal", "external"]);

export type LinkClassification = z.infer<typeof LinkClassificationSchema>;

export const LinkSignalSchema = z.object({
  href: z.string().min(1),
  url: NormalizedUrlSchema,
  text: z.string(),
  rel: z.string().nullable(),
  target: z.string().nullable(),
  classification: LinkClassificationSchema
});

export type LinkSignal = z.infer<typeof LinkSignalSchema>;

export const ImageSignalSchema = z.object({
  src: z.string().min(1),
  url: NormalizedUrlSchema.nullable(),
  alt: z.string().nullable(),
  hasAlt: z.boolean()
});

export type ImageSignal = z.infer<typeof ImageSignalSchema>;

export const JsonLdParsedSchema = z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable();

export type JsonLdParsed = z.infer<typeof JsonLdParsedSchema>;

export const JsonLdBlockSchema = z.object({
  raw: z.string().min(1),
  parsed: JsonLdParsedSchema
});

export type JsonLdBlock = z.infer<typeof JsonLdBlockSchema>;

export const HeadingSignalSchema = z.object({
  h1: z.array(z.string()),
  h2: z.array(z.string())
});

export type HeadingSignal = z.infer<typeof HeadingSignalSchema>;

export const IndexabilitySignalSchema = z.object({
  noindex: z.boolean(),
  nofollow: z.boolean(),
  canonicalMismatch: z.boolean(),
  robotsBlocked: z.boolean().nullable()
});

export type IndexabilitySignal = z.infer<typeof IndexabilitySignalSchema>;

export const ContentSignalSchema = z.object({
  textLength: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  duplicateHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export type ContentSignal = z.infer<typeof ContentSignalSchema>;

export const CrawlerPageSnapshotSchema = z.object({
  url: NormalizedUrlSchema,
  finalUrl: NormalizedUrlSchema.nullable(),
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  robotsMeta: z.string().nullable(),
  canonicalUrl: NormalizedUrlSchema.nullable(),
  h1Count: z.number().int().nonnegative(),
  h2Count: z.number().int().nonnegative(),
  headings: HeadingSignalSchema,
  links: z.object({
    internal: z.array(LinkSignalSchema),
    external: z.array(LinkSignalSchema)
  }),
  images: z.array(ImageSignalSchema),
  jsonLd: z.array(JsonLdBlockSchema),
  indexability: IndexabilitySignalSchema,
  content: ContentSignalSchema
});

export type CrawlerPageSnapshot = z.infer<typeof CrawlerPageSnapshotSchema>;

export const CrawlJobPageInputSchema = z.object({
  url: NormalizedUrlSchema,
  finalUrl: NormalizedUrlSchema.optional(),
  html: z.string().min(1),
  statusCode: z.number().int().positive().nullable().default(null)
});

export type CrawlJobPageInput = z.infer<typeof CrawlJobPageInputSchema>;

export const CrawlJobPayloadSchema = z.object({
  crawlRunId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  startUrl: NormalizedUrlSchema,
  maxPages: z.number().int().positive().max(100),
  pages: z.array(CrawlJobPageInputSchema).default([])
});

export type CrawlJobPayload = z.infer<typeof CrawlJobPayloadSchema>;

export const QueuedCrawlJobSchema = z.object({
  id: IdSchema,
  name: z.literal("crawl"),
  payload: CrawlJobPayloadSchema
});

export type QueuedCrawlJob = z.infer<typeof QueuedCrawlJobSchema>;

export const CreateCrawlRunResponseSchema = z.object({
  crawlRun: CrawlRunSchema,
  job: QueuedCrawlJobSchema
});

export type CreateCrawlRunResponse = z.infer<typeof CreateCrawlRunResponseSchema>;

export const CrawlJobSummarySchema = z.object({
  pagesRequested: z.number().int().nonnegative(),
  pagesProcessed: z.number().int().nonnegative(),
  internalLinks: z.number().int().nonnegative(),
  externalLinks: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  jsonLdBlocks: z.number().int().nonnegative(),
  noindexPages: z.number().int().nonnegative()
});

export type CrawlJobSummary = z.infer<typeof CrawlJobSummarySchema>;

export const CrawlJobResultSchema = z.object({
  crawlRunId: IdSchema,
  siteId: IdSchema,
  status: z.enum(["completed", "empty"]),
  snapshots: z.array(CrawlerPageSnapshotSchema),
  summary: CrawlJobSummarySchema
});

export type CrawlJobResult = z.infer<typeof CrawlJobResultSchema>;

export const RobotsRuleSchema = z.object({
  userAgents: z.array(z.string().min(1)),
  allow: z.array(z.string()),
  disallow: z.array(z.string()),
  crawlDelay: z.number().nonnegative().nullable()
});

export type RobotsRule = z.infer<typeof RobotsRuleSchema>;

export const RobotsTxtSchema = z.object({
  rules: z.array(RobotsRuleSchema),
  sitemaps: z.array(NormalizedUrlSchema)
});

export type RobotsTxt = z.infer<typeof RobotsTxtSchema>;

export const SitemapUrlEntrySchema = z.object({
  loc: NormalizedUrlSchema,
  lastmod: z.string().nullable(),
  changefreq: z.string().nullable(),
  priority: z.number().min(0).max(1).nullable()
});

export type SitemapUrlEntry = z.infer<typeof SitemapUrlEntrySchema>;

export const SitemapIndexEntrySchema = z.object({
  loc: NormalizedUrlSchema,
  lastmod: z.string().nullable()
});

export type SitemapIndexEntry = z.infer<typeof SitemapIndexEntrySchema>;

export const ParsedSitemapSchema = z.object({
  type: z.enum(["urlset", "sitemapindex"]),
  urls: z.array(SitemapUrlEntrySchema),
  sitemaps: z.array(SitemapIndexEntrySchema)
});

export type ParsedSitemap = z.infer<typeof ParsedSitemapSchema>;

export const PageSnapshotSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  h1Count: z.number().int().nonnegative().default(0)
});

export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
