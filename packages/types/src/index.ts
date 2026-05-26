import { z } from "zod";

export const productName = "SearchOps AI" as const;
export const crawlQueueName = "searchops-crawl" as const;
export const connectorQueueName = "searchops-connectors" as const;
export const connectorSyncJobName = "connector-sync" as const;
export const geoAnswerMonitorQueueName = "searchops-geo-answer-monitor" as const;
export const geoAnswerMonitorJobName = "geo-answer-monitor" as const;
export const schemaRichResultValidationQueueName =
  "searchops-schema-rich-result-validation" as const;
export const schemaRichResultValidationJobName = "schema-rich-result-validation" as const;

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const IdSchema = z.string().min(1);
const NonEmptyStringSchema = z.string().trim().min(1);
const PercentageScoreSchema = z.number().int().min(0).max(100);
const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "Expected an HTTP or HTTPS URL",
  });
const JsonObjectStringSchema = z.string().refine((value) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}, "Expected a JSON object string");
const BooleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");
const PositiveIntegerStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Expected a positive integer")
  .transform((value) => Number(value));
export const NormalizedUrlSchema = HttpUrlSchema;

export type NormalizedUrl = z.infer<typeof NormalizedUrlSchema>;

const DomainSchema = z
  .string()
  .min(1)
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Expected a bare domain such as example.com"),
  );

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string().min(1),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiMetricsResponseSchema = z.object({
  service: z.literal("api"),
  uptimeSeconds: z.number().nonnegative(),
  requests: z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.record(z.number().int().nonnegative()),
  }),
});

export type ApiMetricsResponse = z.infer<typeof ApiMetricsResponseSchema>;

const OperationalCounterMapSchema = z.record(z.number().int().nonnegative());

export const OperationalAlertSchema = z.object({
  id: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  severity: z.enum(["info", "warning", "critical"]),
  source: z.enum(["api", "worker"]),
});

export type OperationalAlert = z.infer<typeof OperationalAlertSchema>;

export const OperationalMetricsExportResponseSchema = z.object({
  service: z.literal("api"),
  generatedAt: IsoDateTimeSchema,
  uptimeSeconds: z.number().nonnegative(),
  requests: z.object({
    total: z.number().int().nonnegative(),
    byStatus: OperationalCounterMapSchema,
  }),
  workers: z.object({
    deadLetterJobs: z.object({
      total: z.number().int().nonnegative(),
      byQueue: OperationalCounterMapSchema,
      byStatus: OperationalCounterMapSchema,
    }),
  }),
  alerts: z.array(OperationalAlertSchema),
});

export type OperationalMetricsExportResponse = z.infer<
  typeof OperationalMetricsExportResponseSchema
>;

export const DeadLetterJobPayloadSchema = z.object({
  originalQueue: NonEmptyStringSchema,
  originalJobName: NonEmptyStringSchema,
  originalJobId: z.string().min(1).nullable(),
  failedReason: NonEmptyStringSchema,
  attemptsMade: z.number().int().nonnegative(),
  failedAt: IsoDateTimeSchema,
});

export type DeadLetterJobPayload = z.infer<typeof DeadLetterJobPayloadSchema>;

export const DeadLetterJobStatusSchema = z.enum([
  "active",
  "completed",
  "delayed",
  "failed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

export type DeadLetterJobStatus = z.infer<typeof DeadLetterJobStatusSchema>;

export const DeadLetterJobRecordSchema = z.object({
  id: IdSchema,
  queueName: NonEmptyStringSchema,
  jobId: z.string().min(1).nullable(),
  status: DeadLetterJobStatusSchema,
  enqueuedAt: IsoDateTimeSchema.nullable(),
  processedAt: IsoDateTimeSchema.nullable(),
  payload: DeadLetterJobPayloadSchema,
});

export type DeadLetterJobRecord = z.infer<typeof DeadLetterJobRecordSchema>;

export const DeadLetterJobListResponseSchema = z.object({
  deadLetterJobs: z.array(DeadLetterJobRecordSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    byQueue: z.record(z.number().int().nonnegative()),
    byStatus: z.record(z.number().int().nonnegative()),
  }),
});

export type DeadLetterJobListResponse = z.infer<typeof DeadLetterJobListResponseSchema>;

export const DeleteDeadLetterJobResponseSchema = z.object({
  deadLetterJobId: IdSchema,
  removed: z.boolean(),
});

export type DeleteDeadLetterJobResponse = z.infer<
  typeof DeleteDeadLetterJobResponseSchema
>;

export const OperationalRunbookStepSchema = z.object({
  id: NonEmptyStringSchema,
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  command: z.string().min(1).nullable(),
  status: z.enum(["blocked", "pending", "ready"]),
});

export type OperationalRunbookStep = z.infer<typeof OperationalRunbookStepSchema>;

export const BackupRestoreDrillPlanSchema = z.object({
  id: NonEmptyStringSchema,
  environment: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  requiredInputs: z.array(NonEmptyStringSchema),
  status: z.enum(["blocked", "ready"]),
  steps: z.array(OperationalRunbookStepSchema),
});

export type BackupRestoreDrillPlan = z.infer<typeof BackupRestoreDrillPlanSchema>;

export const SecretRotationPlanRequestSchema = z.object({
  provider: NonEmptyStringSchema,
  oldSecretRef: NonEmptyStringSchema,
  newSecretRef: NonEmptyStringSchema,
  verificationEvent: NonEmptyStringSchema.optional(),
});

export type SecretRotationPlanRequest = z.infer<typeof SecretRotationPlanRequestSchema>;

export const SecretRotationPlanSchema = z.object({
  id: NonEmptyStringSchema,
  provider: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  oldSecretRef: NonEmptyStringSchema,
  newSecretRef: NonEmptyStringSchema,
  verificationEvent: NonEmptyStringSchema,
  status: z.enum(["blocked", "ready"]),
  steps: z.array(OperationalRunbookStepSchema),
});

export type SecretRotationPlan = z.infer<typeof SecretRotationPlanSchema>;

export const DeadLetterReplayPlanSchema = z.object({
  id: NonEmptyStringSchema,
  createdAt: IsoDateTimeSchema,
  deadLetterJobId: IdSchema,
  originalQueue: NonEmptyStringSchema,
  originalJobName: NonEmptyStringSchema,
  originalJobId: z.string().min(1).nullable(),
  reason: NonEmptyStringSchema,
  status: z.enum(["blocked", "ready"]),
  steps: z.array(OperationalRunbookStepSchema),
});

export type DeadLetterReplayPlan = z.infer<typeof DeadLetterReplayPlanSchema>;

export const OperationalDispatchStatusSchema = z.enum([
  "accepted",
  "blocked",
  "dry_run",
  "failed",
]);

export type OperationalDispatchStatus = z.infer<typeof OperationalDispatchStatusSchema>;

export const OperationalDispatchResultSchema = z.object({
  provider: NonEmptyStringSchema,
  externalRunId: z.string().min(1).nullable(),
  acceptedAt: IsoDateTimeSchema,
  status: OperationalDispatchStatusSchema,
  message: NonEmptyStringSchema,
});

export type OperationalDispatchResult = z.infer<typeof OperationalDispatchResultSchema>;

export const ExecuteBackupRestoreDrillRequestSchema = z.object({
  environment: NonEmptyStringSchema.default("production"),
  dryRun: z.boolean().default(false),
});

export type ExecuteBackupRestoreDrillRequest = z.infer<
  typeof ExecuteBackupRestoreDrillRequestSchema
>;

export const BackupRestoreDrillExecutionResponseSchema = z.object({
  dryRun: z.boolean(),
  plan: BackupRestoreDrillPlanSchema,
  dispatch: OperationalDispatchResultSchema,
});

export type BackupRestoreDrillExecutionResponse = z.infer<
  typeof BackupRestoreDrillExecutionResponseSchema
>;

export const ExecuteSecretRotationRequestSchema = SecretRotationPlanRequestSchema.extend({
  dryRun: z.boolean().default(false),
});

export type ExecuteSecretRotationRequest = z.infer<
  typeof ExecuteSecretRotationRequestSchema
>;

export const SecretRotationExecutionResponseSchema = z.object({
  dryRun: z.boolean(),
  plan: SecretRotationPlanSchema,
  dispatch: OperationalDispatchResultSchema,
});

export type SecretRotationExecutionResponse = z.infer<
  typeof SecretRotationExecutionResponseSchema
>;

export const SearchOpsEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection URL"),
  SEARCHOPS_CMS_WEBHOOK_SECRETS: JsonObjectStringSchema.optional(),
  SEARCHOPS_IDP_JWT_HS256_SECRET: z.string().min(1).optional(),
  SEARCHOPS_IDP_JWKS_JSON: JsonObjectStringSchema.optional(),
  SEARCHOPS_IDP_ISSUER: z.string().min(1).optional(),
  SEARCHOPS_IDP_AUDIENCE: z.string().min(1).optional(),
  SEARCHOPS_OBSERVABILITY_LOG_DRAIN_TOKEN: z.string().min(1).optional(),
  SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL: HttpUrlSchema.optional(),
  SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_TOKEN: z.string().min(1).optional(),
  SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL: HttpUrlSchema.optional(),
  SEARCHOPS_RATE_LIMIT_ENABLED: BooleanStringSchema.optional(),
  SEARCHOPS_RATE_LIMIT_MAX: PositiveIntegerStringSchema.optional(),
  SEARCHOPS_RATE_LIMIT_WINDOW_MS: PositiveIntegerStringSchema.optional(),
  SEARCHOPS_RESTORE_DRILL_WEBHOOK_TOKEN: z.string().min(1).optional(),
  SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL: HttpUrlSchema.optional(),
  SEARCHOPS_SECRET_ROTATION_WEBHOOK_TOKEN: z.string().min(1).optional(),
  SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL: HttpUrlSchema.optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
  createdAt: IsoDateTimeSchema,
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const UserSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  email: z.string().email(),
  name: z.string().min(1).nullable(),
  role: z.string().min(1),
  createdAt: IsoDateTimeSchema,
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
  createdAt: IsoDateTimeSchema,
});

export type Site = z.infer<typeof SiteSchema>;

export const CrawlRunSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  status: z.string().min(1),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  summary: z.record(z.unknown()).nullable(),
});

export type CrawlRun = z.infer<typeof CrawlRunSchema>;

export const CreateCrawlRunRequestSchema = z.object({
  startUrl: HttpUrlSchema.optional(),
  maxPages: z.number().int().positive().max(100).default(25),
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
  createdAt: IsoDateTimeSchema,
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
  createdAt: IsoDateTimeSchema,
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
  "ROBOTS_BLOCKED",
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
  "content",
]);

export type SeoIssueCategory = z.infer<typeof SeoIssueCategorySchema>;

export const SeoIssuePrioritySchema = z.enum(["p0", "p1", "p2", "p3"]);

export type SeoIssuePriority = z.infer<typeof SeoIssuePrioritySchema>;

export const SeoIssueEvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

export type SeoIssueEvidenceValue = z.infer<typeof SeoIssueEvidenceValueSchema>;

export const SeoIssueEvidenceSchema = z.object({
  url: NormalizedUrlSchema,
  observedValue: SeoIssueEvidenceValueSchema,
  expectedValue: SeoIssueEvidenceValueSchema,
  sourceField: z.string().min(1),
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
  priorityScore: z.number().int().min(0).max(100),
});

export type SeoIssueDraft = z.infer<typeof SeoIssueDraftSchema>;

export const WorkOrderOwnerTypeSchema = z.enum(["developer", "marketer", "content", "legal"]);

export type WorkOrderOwnerType = z.infer<typeof WorkOrderOwnerTypeSchema>;

export const WorkOrderPrioritySchema = SeoIssuePrioritySchema;

export type WorkOrderPriority = z.infer<typeof WorkOrderPrioritySchema>;

export const WorkOrderStatusSchema = z.enum([
  "open",
  "in_progress",
  "in_review",
  "done",
  "blocked",
]);

export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

export const EstimatedEffortSchema = z.enum(["s", "m", "l"]);

export type EstimatedEffort = z.infer<typeof EstimatedEffortSchema>;

export const WorkOrderDraftSchema = z.object({
  title: z.string().min(1),
  problem: z.string().min(1),
  evidence: SeoIssueEvidenceSchema,
  impact: z.string().min(1),
  instructions: z.array(z.string().min(1)).min(1),
  ownerType: WorkOrderOwnerTypeSchema,
  priority: WorkOrderPrioritySchema,
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  verificationMethod: z.string().min(1),
  estimatedEffort: EstimatedEffortSchema,
  relatedIssues: z.array(SeoIssueRuleIdSchema),
});

export type WorkOrderDraft = z.infer<typeof WorkOrderDraftSchema>;

export const WorkOrderSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema.nullable(),
  seoIssueId: IdSchema.nullable(),
  schemaRecommendationId: IdSchema.nullable().optional(),
  geoVisibilityReportId: IdSchema.nullable().optional(),
  status: WorkOrderStatusSchema,
  priority: WorkOrderPrioritySchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  problem: z.string(),
  evidence: SeoIssueEvidenceSchema.nullable(),
  impact: z.string(),
  instructions: z.array(z.string().min(1)),
  ownerType: WorkOrderOwnerTypeSchema,
  acceptanceCriteria: z.array(z.string().min(1)),
  verificationMethod: z.string(),
  estimatedEffort: EstimatedEffortSchema,
  relatedIssues: z.array(SeoIssueRuleIdSchema),
  assignedTo: IdSchema.nullable(),
  dueDate: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const WorkOrderListResponseSchema = z.object({
  workOrders: z.array(WorkOrderSchema),
});

export type WorkOrderListResponse = z.infer<typeof WorkOrderListResponseSchema>;

export const UpdateWorkOrderRequestSchema = z.object({
  status: WorkOrderStatusSchema.optional(),
  priority: WorkOrderPrioritySchema.optional(),
  assignedTo: IdSchema.nullable().optional(),
  dueDate: IsoDateTimeSchema.nullable().optional(),
});

export type UpdateWorkOrderRequest = z.infer<typeof UpdateWorkOrderRequestSchema>;

export const RecheckWorkOrderRequestSchema = z.object({
  startUrl: HttpUrlSchema.optional(),
  maxPages: z.number().int().positive().max(10).default(1),
});

export type RecheckWorkOrderRequest = z.infer<typeof RecheckWorkOrderRequestSchema>;

export const ResolveWorkOrderIssueResponseSchema = z.object({
  workOrder: WorkOrderSchema,
  seoIssue: SeoIssueSchema.nullable(),
});

export type ResolveWorkOrderIssueResponse = z.infer<typeof ResolveWorkOrderIssueResponseSchema>;

export const KeywordIntentSchema = z.enum([
  "informational",
  "commercial",
  "transactional",
  "navigational",
  "local",
  "mixed",
]);

export type KeywordIntent = z.infer<typeof KeywordIntentSchema>;

export const KeywordSourceSchema = z.enum(["manual", "gsc", "ga4", "bing", "cms", "fixture"]);

export type KeywordSource = z.infer<typeof KeywordSourceSchema>;

export const KeywordTargetSchema = z.object({
  siteId: IdSchema,
  phrase: NonEmptyStringSchema,
  locale: z.string().min(2).default("ko-KR"),
  language: z.string().min(2).default("ko"),
  country: z.string().min(2).default("KR"),
  intent: KeywordIntentSchema.nullable().default(null),
  source: KeywordSourceSchema.default("manual"),
});

export type KeywordTarget = z.infer<typeof KeywordTargetSchema>;

export const KeywordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  phrase: NonEmptyStringSchema,
  locale: z.string().min(2).default("ko-KR"),
  intent: KeywordIntentSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});

export type Keyword = z.infer<typeof KeywordSchema>;

export const AeoAnswerBlockSchema = z.object({
  question: NonEmptyStringSchema,
  answer: NonEmptyStringSchema,
  sourceField: z.string().min(1),
});

export type AeoAnswerBlock = z.infer<typeof AeoAnswerBlockSchema>;

export const AeoPageSignalSchema = z.object({
  url: NormalizedUrlSchema,
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  h1: z.string().nullable(),
  h2: z.array(z.string()),
  wordCount: z.number().int().nonnegative(),
  schemaTypes: z.array(NonEmptyStringSchema).default([]),
  questionHeadings: z.array(NonEmptyStringSchema).default([]),
  answerBlocks: z.array(AeoAnswerBlockSchema).default([]),
});

export type AeoPageSignal = z.infer<typeof AeoPageSignalSchema>;

export const KeywordAeoInputSchema = z.object({
  keyword: KeywordTargetSchema,
  candidatePage: AeoPageSignalSchema.nullable(),
});

export type KeywordAeoInput = z.infer<typeof KeywordAeoInputSchema>;

export const AeoReadinessStatusSchema = z.enum(["ready", "needs_work", "not_ready"]);

export type AeoReadinessStatus = z.infer<typeof AeoReadinessStatusSchema>;

export const AeoReadinessCheckIdSchema = z.enum([
  "KEYWORD_INTENT_DEFINED",
  "ANSWER_SUMMARY_PRESENT",
  "QUESTION_COVERAGE",
  "FAQ_SCHEMA_PRESENT",
  "STRUCTURED_HEADINGS",
  "CITABLE_SOURCE_PRESENT",
  "CONTENT_DEPTH",
]);

export type AeoReadinessCheckId = z.infer<typeof AeoReadinessCheckIdSchema>;

export const AeoReadinessCheckStatusSchema = z.enum(["pass", "warning", "fail"]);

export type AeoReadinessCheckStatus = z.infer<typeof AeoReadinessCheckStatusSchema>;

export const AeoEvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

export type AeoEvidenceValue = z.infer<typeof AeoEvidenceValueSchema>;

export const AeoEvidenceSchema = z.object({
  url: NormalizedUrlSchema.nullable(),
  observedValue: AeoEvidenceValueSchema,
  expectedValue: AeoEvidenceValueSchema,
  sourceField: z.string().min(1),
});

export type AeoEvidence = z.infer<typeof AeoEvidenceSchema>;

export const AeoReadinessCheckSchema = z.object({
  checkId: AeoReadinessCheckIdSchema,
  status: AeoReadinessCheckStatusSchema,
  score: PercentageScoreSchema,
  evidence: AeoEvidenceSchema,
});

export type AeoReadinessCheck = z.infer<typeof AeoReadinessCheckSchema>;

export const AeoReadinessReportSchema = z.object({
  keyword: KeywordTargetSchema,
  pageUrl: NormalizedUrlSchema.nullable(),
  status: AeoReadinessStatusSchema,
  score: PercentageScoreSchema,
  checks: z.array(AeoReadinessCheckSchema).min(1),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
});

export type AeoReadinessReport = z.infer<typeof AeoReadinessReportSchema>;

export const AeoReadinessReportRecordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  keywordId: IdSchema.nullable(),
  phrase: NonEmptyStringSchema,
  locale: z.string().min(2),
  intent: KeywordIntentSchema.nullable(),
  pageUrl: NormalizedUrlSchema.nullable(),
  status: AeoReadinessStatusSchema,
  score: PercentageScoreSchema,
  checks: z.array(AeoReadinessCheckSchema).min(1),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});

export type AeoReadinessReportRecord = z.infer<typeof AeoReadinessReportRecordSchema>;

export const AeoQuestionIntentSchema = z.enum([
  "definition",
  "how_to",
  "comparison",
  "pricing",
  "eligibility",
  "local",
  "aftercare",
  "risk",
  "other",
]);

export type AeoQuestionIntent = z.infer<typeof AeoQuestionIntentSchema>;

export const AeoFaqGapSchema = z.object({
  question: NonEmptyStringSchema,
  intent: AeoQuestionIntentSchema,
  priority: SeoIssuePrioritySchema,
  suggestedAnswerAngle: NonEmptyStringSchema,
  evidence: AeoEvidenceSchema,
});

export type AeoFaqGap = z.infer<typeof AeoFaqGapSchema>;

export const AeoFaqGapSetSchema = z.object({
  keyword: KeywordTargetSchema,
  pageUrl: NormalizedUrlSchema.nullable(),
  gaps: z.array(AeoFaqGapSchema),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
});

export type AeoFaqGapSet = z.infer<typeof AeoFaqGapSetSchema>;

export const ContentBriefStatusSchema = z.enum(["draft", "archived"]);

export type ContentBriefStatus = z.infer<typeof ContentBriefStatusSchema>;

export const ContentBriefSectionSchema = z.object({
  heading: NonEmptyStringSchema,
  purpose: NonEmptyStringSchema,
  targetQuestions: z.array(NonEmptyStringSchema).default([]),
  acceptanceCriteria: z.array(NonEmptyStringSchema).default([]),
});

export type ContentBriefSection = z.infer<typeof ContentBriefSectionSchema>;

export const ContentBriefOutlineSchema = z.array(ContentBriefSectionSchema).min(1);

export type ContentBriefOutline = z.infer<typeof ContentBriefOutlineSchema>;

export const ContentBriefDraftSchema = z.object({
  siteId: IdSchema,
  keywordId: IdSchema.nullable().default(null),
  primaryKeyword: NonEmptyStringSchema,
  locale: z.string().min(2).default("ko-KR"),
  intent: KeywordIntentSchema,
  title: NonEmptyStringSchema,
  status: z.literal("draft"),
  summary: NonEmptyStringSchema,
  outline: ContentBriefOutlineSchema,
  faqQuestions: z.array(NonEmptyStringSchema).default([]),
  acceptanceCriteria: z.array(NonEmptyStringSchema).min(1),
  generationMode: z.literal("deterministic"),
  publishPolicy: z.literal("draft_only"),
});

export type ContentBriefDraft = z.infer<typeof ContentBriefDraftSchema>;

export const ContentBriefSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  keywordId: IdSchema.nullable(),
  primaryKeyword: NonEmptyStringSchema,
  locale: z.string().min(2),
  intent: KeywordIntentSchema,
  title: NonEmptyStringSchema,
  status: ContentBriefStatusSchema,
  summary: NonEmptyStringSchema,
  outline: ContentBriefOutlineSchema.nullable(),
  faqQuestions: z.array(NonEmptyStringSchema),
  acceptanceCriteria: z.array(NonEmptyStringSchema),
  generationMode: z.literal("deterministic"),
  publishPolicy: z.literal("draft_only"),
  createdAt: IsoDateTimeSchema,
});

export type ContentBrief = z.infer<typeof ContentBriefSchema>;

export const CreateContentBriefDraftKeywordSchema = z.object({
  phrase: NonEmptyStringSchema,
  locale: z.string().min(2).optional(),
  language: z.string().min(2).optional(),
  country: z.string().min(2).optional(),
  intent: KeywordIntentSchema.nullable().optional(),
  source: KeywordSourceSchema.optional(),
});

export type CreateContentBriefDraftKeyword = z.infer<typeof CreateContentBriefDraftKeywordSchema>;

export const CreateContentBriefDraftRequestSchema = z.object({
  keyword: CreateContentBriefDraftKeywordSchema,
  keywordId: IdSchema.nullable().optional(),
  candidatePage: AeoPageSignalSchema.nullable().optional(),
  readinessReport: AeoReadinessReportSchema.optional(),
  faqGapSet: AeoFaqGapSetSchema.optional(),
  evaluatedAt: IsoDateTimeSchema.optional(),
});

export type CreateContentBriefDraftRequest = z.infer<typeof CreateContentBriefDraftRequestSchema>;

export const CreateAeoReadinessReportRequestSchema = z.object({
  keyword: CreateContentBriefDraftKeywordSchema,
  keywordId: IdSchema.nullable().optional(),
  candidatePage: AeoPageSignalSchema.nullable().optional(),
  evaluatedAt: IsoDateTimeSchema.optional(),
});

export type CreateAeoReadinessReportRequest = z.infer<typeof CreateAeoReadinessReportRequestSchema>;

export const CreateAeoReadinessReportResponseSchema = z.object({
  report: AeoReadinessReportRecordSchema,
  readinessReport: AeoReadinessReportSchema,
});

export type CreateAeoReadinessReportResponse = z.infer<
  typeof CreateAeoReadinessReportResponseSchema
>;

export const AeoReadinessReportListResponseSchema = z.object({
  reports: z.array(AeoReadinessReportRecordSchema),
});

export type AeoReadinessReportListResponse = z.infer<typeof AeoReadinessReportListResponseSchema>;

export const CreateContentBriefDraftResponseSchema = z.object({
  contentBrief: ContentBriefSchema,
  draft: ContentBriefDraftSchema,
  faqGapSet: AeoFaqGapSetSchema,
  readinessReport: AeoReadinessReportSchema,
});

export type CreateContentBriefDraftResponse = z.infer<typeof CreateContentBriefDraftResponseSchema>;

export const ContentBriefListResponseSchema = z.object({
  contentBriefs: z.array(ContentBriefSchema),
});

export type ContentBriefListResponse = z.infer<typeof ContentBriefListResponseSchema>;

export const ContentBriefDetailResponseSchema = z.object({
  contentBrief: ContentBriefSchema,
});

export type ContentBriefDetailResponse = z.infer<typeof ContentBriefDetailResponseSchema>;

export const GeoProviderSchema = z.enum([
  "chatgpt",
  "perplexity",
  "gemini",
  "copilot",
  "claude",
  "manual",
]);

export type GeoProvider = z.infer<typeof GeoProviderSchema>;

export const GeoAnswerMonitorProviderSchema = z.enum([
  "chatgpt",
  "perplexity",
  "gemini",
  "copilot",
  "claude",
]);

export type GeoAnswerMonitorProvider = z.infer<typeof GeoAnswerMonitorProviderSchema>;

export const LiveExternalApiModeSchema = z.enum(["disabled", "enabled"]);

export type LiveExternalApiMode = z.infer<typeof LiveExternalApiModeSchema>;

export const GeoAnswerMonitorGenerationModeSchema = z.enum(["fixture", "connector"]);

export type GeoAnswerMonitorGenerationMode = z.infer<
  typeof GeoAnswerMonitorGenerationModeSchema
>;

export const GeoObservationSourceSchema = z.enum(["manual", "fixture", "connector"]);

export type GeoObservationSource = z.infer<typeof GeoObservationSourceSchema>;

export const GeoVisibilityStatusSchema = z.enum(["strong", "visible", "weak", "not_visible"]);

export type GeoVisibilityStatus = z.infer<typeof GeoVisibilityStatusSchema>;

export const GeoVisibilityCheckIdSchema = z.enum([
  "BRAND_MENTIONED",
  "OWNED_URL_CITED",
  "QUERY_COVERAGE",
  "PROVIDER_DIVERSITY",
  "COMPETITOR_CITATION_RISK",
]);

export type GeoVisibilityCheckId = z.infer<typeof GeoVisibilityCheckIdSchema>;

export const GeoVisibilityCheckStatusSchema = z.enum(["pass", "warning", "fail"]);

export type GeoVisibilityCheckStatus = z.infer<typeof GeoVisibilityCheckStatusSchema>;

export const GeoEvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

export type GeoEvidenceValue = z.infer<typeof GeoEvidenceValueSchema>;

export const GeoEvidenceSchema = z.object({
  observedValue: GeoEvidenceValueSchema,
  expectedValue: GeoEvidenceValueSchema,
  sourceField: z.string().min(1),
});

export type GeoEvidence = z.infer<typeof GeoEvidenceSchema>;

export const GeoTargetSchema = z.object({
  siteId: IdSchema,
  brandName: NonEmptyStringSchema,
  domain: DomainSchema,
  locale: z.string().min(2).default("ko-KR"),
  market: z.string().min(2).default("KR"),
});

export type GeoTarget = z.infer<typeof GeoTargetSchema>;

export const GeoCitationSchema = z.object({
  url: NormalizedUrlSchema,
  domain: DomainSchema,
  owned: z.boolean(),
});

export type GeoCitation = z.infer<typeof GeoCitationSchema>;

export const GeoAnswerObservationSchema = z.object({
  provider: GeoProviderSchema,
  query: NonEmptyStringSchema,
  locale: z.string().min(2).default("ko-KR"),
  answerText: z.string().default(""),
  citedUrls: z.array(NormalizedUrlSchema).default([]),
  observedAt: IsoDateTimeSchema,
  source: GeoObservationSourceSchema.default("manual"),
});

export type GeoAnswerObservation = z.infer<typeof GeoAnswerObservationSchema>;

export const GeoAnswerMonitorQuerySchema = z.object({
  query: NonEmptyStringSchema,
  locale: z.string().min(2).optional(),
});

export type GeoAnswerMonitorQuery = z.infer<typeof GeoAnswerMonitorQuerySchema>;

export const GeoAnswerMonitorRequestSchema = z.object({
  target: GeoTargetSchema,
  queries: z.array(GeoAnswerMonitorQuerySchema).min(1),
  observedAt: IsoDateTimeSchema.optional(),
});

export type GeoAnswerMonitorRequest = z.infer<typeof GeoAnswerMonitorRequestSchema>;

export const GeoAnswerMonitorProviderListSchema = z
  .array(GeoAnswerMonitorProviderSchema)
  .min(1)
  .refine((providers) => new Set(providers).size === providers.length, {
    message: "GEO answer monitor providers must be unique",
  });

export type GeoAnswerMonitorProviderList = z.infer<
  typeof GeoAnswerMonitorProviderListSchema
>;

export const DefaultGeoAnswerMonitorProviders = ["chatgpt", "perplexity"] as const;

export const GeoAnswerMonitorResultSchema = z.object({
  provider: GeoAnswerMonitorProviderSchema,
  observations: z.array(GeoAnswerObservationSchema).min(1),
  generatedBy: GeoAnswerMonitorGenerationModeSchema,
  liveExternalApis: LiveExternalApiModeSchema,
});

export type GeoAnswerMonitorResult = z.infer<typeof GeoAnswerMonitorResultSchema>;

export const GeoVisibilityCheckSchema = z.object({
  checkId: GeoVisibilityCheckIdSchema,
  status: GeoVisibilityCheckStatusSchema,
  score: PercentageScoreSchema,
  evidence: GeoEvidenceSchema,
});

export type GeoVisibilityCheck = z.infer<typeof GeoVisibilityCheckSchema>;

export const GeoVisibilityReportSchema = z.object({
  target: GeoTargetSchema,
  status: GeoVisibilityStatusSchema,
  score: PercentageScoreSchema,
  mentionRate: PercentageScoreSchema,
  citationRate: PercentageScoreSchema,
  competitorCitationRate: PercentageScoreSchema,
  queryCount: z.number().int().nonnegative(),
  providerCount: z.number().int().nonnegative(),
  observations: z.array(GeoAnswerObservationSchema).min(1),
  citations: z.array(GeoCitationSchema),
  checks: z.array(GeoVisibilityCheckSchema).min(1),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
});

export type GeoVisibilityReport = z.infer<typeof GeoVisibilityReportSchema>;

export const GeoVisibilityReportRecordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  brandName: NonEmptyStringSchema,
  domain: DomainSchema,
  locale: z.string().min(2),
  market: z.string().min(2),
  status: GeoVisibilityStatusSchema,
  score: PercentageScoreSchema,
  mentionRate: PercentageScoreSchema,
  citationRate: PercentageScoreSchema,
  competitorCitationRate: PercentageScoreSchema,
  queryCount: z.number().int().nonnegative(),
  providerCount: z.number().int().nonnegative(),
  observations: z.array(GeoAnswerObservationSchema).min(1),
  citations: z.array(GeoCitationSchema),
  checks: z.array(GeoVisibilityCheckSchema).min(1),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
});

export type GeoVisibilityReportRecord = z.infer<typeof GeoVisibilityReportRecordSchema>;

export const CreateGeoVisibilityReportRequestSchema = z.object({
  target: GeoTargetSchema,
  observations: z.array(GeoAnswerObservationSchema).min(1),
  evaluatedAt: IsoDateTimeSchema.optional(),
});

export type CreateGeoVisibilityReportRequest = z.infer<
  typeof CreateGeoVisibilityReportRequestSchema
>;

export const CreateGeoVisibilityReportResponseSchema = z.object({
  report: GeoVisibilityReportRecordSchema,
  visibilityReport: GeoVisibilityReportSchema,
});

export type CreateGeoVisibilityReportResponse = z.infer<
  typeof CreateGeoVisibilityReportResponseSchema
>;

export const GeoVisibilityReportListResponseSchema = z.object({
  reports: z.array(GeoVisibilityReportRecordSchema),
});

export type GeoVisibilityReportListResponse = z.infer<typeof GeoVisibilityReportListResponseSchema>;

export const CreateGeoVisibilityReportWorkOrderResponseSchema = z.object({
  report: GeoVisibilityReportRecordSchema,
  workOrder: WorkOrderSchema,
});

export type CreateGeoVisibilityReportWorkOrderResponse = z.infer<
  typeof CreateGeoVisibilityReportWorkOrderResponseSchema
>;

export const GeoAnswerMonitorJobPayloadSchema = z.object({
  organizationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  target: GeoTargetSchema,
  queries: z.array(GeoAnswerMonitorQuerySchema).min(1),
  observedAt: IsoDateTimeSchema,
  providers: GeoAnswerMonitorProviderListSchema.default([
    ...DefaultGeoAnswerMonitorProviders,
  ]),
});

export type GeoAnswerMonitorJobPayload = z.infer<typeof GeoAnswerMonitorJobPayloadSchema>;

export const GeoAnswerMonitorJobResultSchema = z.object({
  organizationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  observedAt: IsoDateTimeSchema,
  providers: GeoAnswerMonitorProviderListSchema,
  monitorResults: z.array(GeoAnswerMonitorResultSchema).min(1),
  visibilityReport: GeoVisibilityReportSchema,
});

export type GeoAnswerMonitorJobResult = z.infer<typeof GeoAnswerMonitorJobResultSchema>;

export const QueuedGeoAnswerMonitorJobSchema = z.object({
  id: IdSchema,
  name: z.literal(geoAnswerMonitorJobName),
  payload: GeoAnswerMonitorJobPayloadSchema,
});

export type QueuedGeoAnswerMonitorJob = z.infer<typeof QueuedGeoAnswerMonitorJobSchema>;

export const QueueGeoAnswerMonitorRequestSchema = GeoAnswerMonitorRequestSchema.extend({
  providers: GeoAnswerMonitorProviderListSchema.default([
    ...DefaultGeoAnswerMonitorProviders,
  ]),
});

export type QueueGeoAnswerMonitorRequest = z.infer<typeof QueueGeoAnswerMonitorRequestSchema>;

export const QueueGeoAnswerMonitorResponseSchema = z.object({
  job: QueuedGeoAnswerMonitorJobSchema,
});

export type QueueGeoAnswerMonitorResponse = z.infer<
  typeof QueueGeoAnswerMonitorResponseSchema
>;

export const AiPromptSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  purpose: z.string().min(1),
  template: z.string().min(1),
  createdAt: IsoDateTimeSchema,
});

export type AiPrompt = z.infer<typeof AiPromptSchema>;

export const AiResultSchema = z.object({
  id: IdSchema,
  promptId: IdSchema,
  status: z.string().min(1),
  output: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});

export type AiResult = z.infer<typeof AiResultSchema>;

export const ComplianceSubjectTypeSchema = z.enum([
  "content_brief",
  "page_copy",
  "schema_recommendation",
  "work_order",
  "manual",
]);

export type ComplianceSubjectType = z.infer<typeof ComplianceSubjectTypeSchema>;

export const ComplianceReviewSourceSchema = z.enum([
  "content_brief",
  "cms",
  "fixture",
  "manual",
  "schema_recommendation",
  "work_order",
]);

export type ComplianceReviewSource = z.infer<typeof ComplianceReviewSourceSchema>;

export const CompliancePublishStateSchema = z.enum(["draft", "scheduled", "published"]);

export type CompliancePublishState = z.infer<typeof CompliancePublishStateSchema>;

export const ComplianceRulePackIdSchema = z.enum(["global", "kr-medical"]);

export type ComplianceRulePackId = z.infer<typeof ComplianceRulePackIdSchema>;

export const ComplianceRuleIdSchema = z.enum([
  "GUARANTEED_RESULT_CLAIM",
  "ABSOLUTE_SAFETY_CLAIM",
  "SUPERLATIVE_CLAIM",
  "BEFORE_AFTER_REFERENCE",
  "PATIENT_TESTIMONIAL_REFERENCE",
  "PRICE_DISCOUNT_PROMOTION",
  "UNREVIEWED_MEDICAL_PUBLISH",
]);

export type ComplianceRuleId = z.infer<typeof ComplianceRuleIdSchema>;

export const ComplianceRiskLevelSchema = z.enum(["critical", "high", "medium", "low"]);

export type ComplianceRiskLevel = z.infer<typeof ComplianceRiskLevelSchema>;

export const ComplianceFlagStatusSchema = z.enum([
  "open",
  "in_review",
  "approved",
  "dismissed",
  "resolved",
]);

export type ComplianceFlagStatus = z.infer<typeof ComplianceFlagStatusSchema>;

export const ComplianceReviewStatusSchema = z.enum(["clear", "needs_review", "blocked"]);

export type ComplianceReviewStatus = z.infer<typeof ComplianceReviewStatusSchema>;

export const ComplianceEvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

export type ComplianceEvidenceValue = z.infer<typeof ComplianceEvidenceValueSchema>;

export const ComplianceEvidenceSchema = z.object({
  url: NormalizedUrlSchema.nullable(),
  excerpt: z.string().min(1),
  observedValue: ComplianceEvidenceValueSchema,
  expectedValue: ComplianceEvidenceValueSchema,
  sourceField: z.string().min(1),
  match: z.string().min(1).nullable().default(null),
});

export type ComplianceEvidence = z.infer<typeof ComplianceEvidenceSchema>;

export const ComplianceReviewInputSchema = z.object({
  siteId: IdSchema,
  subjectType: ComplianceSubjectTypeSchema,
  subjectId: IdSchema.nullable().default(null),
  url: NormalizedUrlSchema.nullable().default(null),
  locale: z.string().min(2).default("ko-KR"),
  industry: z.string().min(1).nullable().default(null),
  title: z.string().min(1).nullable().default(null),
  text: NonEmptyStringSchema,
  publishState: CompliancePublishStateSchema.default("draft"),
  source: ComplianceReviewSourceSchema.default("manual"),
});

export type ComplianceReviewInput = z.infer<typeof ComplianceReviewInputSchema>;

export const ComplianceFlagDraftSchema = z.object({
  ruleId: ComplianceRuleIdSchema,
  riskLevel: ComplianceRiskLevelSchema,
  status: z.literal("open").default("open"),
  title: z.string().min(1),
  message: z.string().min(1),
  evidence: ComplianceEvidenceSchema,
  recommendation: z.string().min(1),
  replacementSuggestion: z.string().min(1).nullable().default(null),
  ownerType: z.literal("legal").default("legal"),
  publishPolicy: z.literal("draft_only"),
  generatedBy: z.literal("deterministic"),
});

export type ComplianceFlagDraft = z.infer<typeof ComplianceFlagDraftSchema>;

export const ComplianceReviewReportSchema = z.object({
  input: ComplianceReviewInputSchema,
  flags: z.array(ComplianceFlagDraftSchema),
  rulePackId: ComplianceRulePackIdSchema,
  status: ComplianceReviewStatusSchema,
  overallRiskLevel: ComplianceRiskLevelSchema.nullable(),
  publishPolicy: z.literal("draft_only"),
  generatedBy: z.literal("deterministic"),
  evaluatedAt: IsoDateTimeSchema,
});

export type ComplianceReviewReport = z.infer<typeof ComplianceReviewReportSchema>;

export const CreateComplianceReviewRequestSchema = ComplianceReviewInputSchema.extend({
  evaluatedAt: IsoDateTimeSchema.optional(),
});

export type CreateComplianceReviewRequest = z.infer<typeof CreateComplianceReviewRequestSchema>;

export const ComplianceFlagSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema.nullable(),
  workOrderId: IdSchema.nullable(),
  subjectType: ComplianceSubjectTypeSchema.optional(),
  subjectId: IdSchema.nullable().optional(),
  ruleId: ComplianceRuleIdSchema.optional(),
  url: NormalizedUrlSchema.nullable().optional(),
  riskLevel: ComplianceRiskLevelSchema.or(z.string().min(1)),
  status: ComplianceFlagStatusSchema.or(z.string().min(1)),
  title: z.string().min(1).nullable().optional(),
  message: z.string().min(1),
  evidence: ComplianceEvidenceSchema.nullable().optional(),
  recommendation: z.string().min(1).nullable().optional(),
  replacementSuggestion: z.string().min(1).nullable().optional(),
  generatedBy: z.literal("deterministic").optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema.optional(),
});

export type ComplianceFlag = z.infer<typeof ComplianceFlagSchema>;

export const ComplianceFlagListResponseSchema = z.object({
  complianceFlags: z.array(ComplianceFlagSchema),
});

export type ComplianceFlagListResponse = z.infer<typeof ComplianceFlagListResponseSchema>;

export const UpdateComplianceFlagRequestSchema = z.object({
  status: ComplianceFlagStatusSchema.optional(),
  workOrderId: IdSchema.nullable().optional(),
});

export type UpdateComplianceFlagRequest = z.infer<typeof UpdateComplianceFlagRequestSchema>;

export const CreateComplianceReviewResponseSchema = z.object({
  report: ComplianceReviewReportSchema,
  complianceFlags: z.array(ComplianceFlagSchema),
});

export type CreateComplianceReviewResponse = z.infer<typeof CreateComplianceReviewResponseSchema>;

export const CreateComplianceFlagWorkOrderResponseSchema = z.object({
  complianceFlag: ComplianceFlagSchema,
  workOrder: WorkOrderSchema,
});

export type CreateComplianceFlagWorkOrderResponse = z.infer<
  typeof CreateComplianceFlagWorkOrderResponseSchema
>;

export const RecheckComplianceFlagRequestSchema = z.object({
  evaluatedAt: IsoDateTimeSchema.optional(),
  industry: z.string().min(1).nullable().optional(),
  locale: z.string().min(2).optional(),
  publishState: CompliancePublishStateSchema.optional(),
  source: ComplianceReviewSourceSchema.optional(),
  text: NonEmptyStringSchema,
  title: z.string().min(1).nullable().optional(),
  url: NormalizedUrlSchema.nullable().optional(),
});

export type RecheckComplianceFlagRequest = z.infer<typeof RecheckComplianceFlagRequestSchema>;

export const RecheckComplianceFlagResponseSchema = z.object({
  complianceFlag: ComplianceFlagSchema,
  report: ComplianceReviewReportSchema,
  resolved: z.boolean(),
  workOrder: WorkOrderSchema.nullable(),
});

export type RecheckComplianceFlagResponse = z.infer<typeof RecheckComplianceFlagResponseSchema>;

export const CmsContentStatusSchema = z.enum(["draft", "published", "archived"]);

export type CmsContentStatus = z.infer<typeof CmsContentStatusSchema>;

export const CmsContentUpdatedEventRequestSchema = z.object({
  siteId: IdSchema,
  provider: z.literal("cms").default("cms"),
  cmsType: z.string().min(1),
  externalId: z.string().min(1),
  url: NormalizedUrlSchema,
  title: z.string().min(1).nullable().default(null),
  text: NonEmptyStringSchema,
  status: CmsContentStatusSchema.default("draft"),
  locale: z.string().min(2).optional(),
  industry: z.string().min(1).nullable().optional(),
  updatedAt: IsoDateTimeSchema,
  source: z.literal("cms").default("cms"),
});

export type CmsContentUpdatedEventRequest = z.infer<typeof CmsContentUpdatedEventRequestSchema>;

export const CmsContentUpdatedEventResponseSchema = z.object({
  event: CmsContentUpdatedEventRequestSchema,
  matchedFlagCount: z.number().int().nonnegative(),
  skippedFlagCount: z.number().int().nonnegative(),
  rechecks: z.array(RecheckComplianceFlagResponseSchema),
});

export type CmsContentUpdatedEventResponse = z.infer<typeof CmsContentUpdatedEventResponseSchema>;

export const ClosedLoopAuditEventTypeSchema = z.enum([
  "cms_content_updated",
  "compliance_recheck",
  "compliance_flag_resolved",
  "work_order_done",
]);

export type ClosedLoopAuditEventType = z.infer<typeof ClosedLoopAuditEventTypeSchema>;

export const ClosedLoopAuditEventStatusSchema = z.enum([
  "received",
  "skipped",
  "open",
  "resolved",
  "done",
  "failed",
]);

export type ClosedLoopAuditEventStatus = z.infer<typeof ClosedLoopAuditEventStatusSchema>;

export const ClosedLoopAuditEventSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema.nullable(),
  eventType: ClosedLoopAuditEventTypeSchema,
  status: ClosedLoopAuditEventStatusSchema,
  source: z.string().min(1),
  subjectType: z.string().min(1).nullable(),
  subjectId: z.string().min(1).nullable(),
  cmsType: z.string().min(1).nullable(),
  externalId: z.string().min(1).nullable(),
  complianceFlagId: IdSchema.nullable(),
  workOrderId: IdSchema.nullable(),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: IsoDateTimeSchema,
});

export type ClosedLoopAuditEvent = z.infer<typeof ClosedLoopAuditEventSchema>;

export const ClosedLoopAuditEventListResponseSchema = z.object({
  auditEvents: z.array(ClosedLoopAuditEventSchema),
});

export type ClosedLoopAuditEventListResponse = z.infer<
  typeof ClosedLoopAuditEventListResponseSchema
>;

export const CmsWebhookSignatureHeadersSchema = z.object({
  "x-searchops-cms-type": z.string().min(1),
  "x-searchops-timestamp": IsoDateTimeSchema,
  "x-searchops-signature": z.string().regex(/^sha256=[a-f0-9]{64}$/i),
});

export type CmsWebhookSignatureHeaders = z.infer<typeof CmsWebhookSignatureHeadersSchema>;

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(1),
});

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationListResponseSchema = z.object({
  organizations: z.array(OrganizationSchema),
});

export type OrganizationListResponse = z.infer<typeof OrganizationListResponseSchema>;

export const CreateSiteRequestSchema = z.object({
  domain: DomainSchema,
  name: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  language: z.string().min(2).default("ko"),
  country: z.string().min(2).default("KR"),
});

export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;

export const UpdateSiteRequestSchema = z.object({
  domain: DomainSchema.optional(),
  name: z.string().min(1).nullable().optional(),
  industry: z.string().min(1).nullable().optional(),
  language: z.string().min(2).optional(),
  country: z.string().min(2).optional(),
});

export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;

export const SiteListResponseSchema = z.object({
  sites: z.array(SiteSchema),
});

export type SiteListResponse = z.infer<typeof SiteListResponseSchema>;

export const AuthRoleSchema = z.enum(["admin", "editor", "owner", "system", "viewer"]);

export type AuthRole = z.infer<typeof AuthRoleSchema>;

export const AuthContextSourceSchema = z.enum(["idp", "mock"]);

export type AuthContextSource = z.infer<typeof AuthContextSourceSchema>;

export const AuthenticatedUserContextSchema = z.object({
  userId: IdSchema,
  organizationId: IdSchema,
  role: AuthRoleSchema.default("admin"),
  source: AuthContextSourceSchema,
  provider: z.string().min(1).nullable().default(null),
  email: z.string().email().nullable().default(null),
});

export type AuthenticatedUserContext = z.infer<typeof AuthenticatedUserContextSchema>;

export const MockUserContextSchema = AuthenticatedUserContextSchema.extend({
  source: z.literal("mock"),
});

export type MockUserContext = z.infer<typeof MockUserContextSchema>;

export const IdpClaimMappingInputSchema = z.object({
  provider: z.string().min(1),
  subject: IdSchema,
  organizationId: IdSchema,
  role: AuthRoleSchema,
  email: z.string().email().nullable().default(null),
});

export type IdpClaimMappingInput = z.infer<typeof IdpClaimMappingInputSchema>;

export const LinkClassificationSchema = z.enum(["internal", "external"]);

export type LinkClassification = z.infer<typeof LinkClassificationSchema>;

export const LinkSignalSchema = z.object({
  href: z.string().min(1),
  url: NormalizedUrlSchema,
  text: z.string(),
  rel: z.string().nullable(),
  target: z.string().nullable(),
  classification: LinkClassificationSchema,
});

export type LinkSignal = z.infer<typeof LinkSignalSchema>;

export const ImageSignalSchema = z.object({
  src: z.string().min(1),
  url: NormalizedUrlSchema.nullable(),
  alt: z.string().nullable(),
  hasAlt: z.boolean(),
});

export type ImageSignal = z.infer<typeof ImageSignalSchema>;

export const JsonLdParsedSchema = z.union([z.record(z.unknown()), z.array(z.unknown())]).nullable();

export type JsonLdParsed = z.infer<typeof JsonLdParsedSchema>;

export const JsonLdBlockSchema = z.object({
  raw: z.string().min(1),
  parsed: JsonLdParsedSchema,
});

export type JsonLdBlock = z.infer<typeof JsonLdBlockSchema>;

export const SchemaJsonLdTypeSchema = z.enum([
  "WebSite",
  "WebPage",
  "Article",
  "FAQPage",
  "BreadcrumbList",
  "LocalBusiness",
  "MedicalClinic",
  "Service",
]);

export type SchemaJsonLdType = z.infer<typeof SchemaJsonLdTypeSchema>;

export const SchemaRecommendationPrioritySchema = SeoIssuePrioritySchema;

export type SchemaRecommendationPriority = z.infer<typeof SchemaRecommendationPrioritySchema>;

export const JsonLdObjectSchema = z.record(z.unknown());

export type JsonLdObject = z.infer<typeof JsonLdObjectSchema>;

export const JsonLdRecommendationEvidenceSchema = z.object({
  url: NormalizedUrlSchema,
  observedTypes: z.array(SchemaJsonLdTypeSchema),
  expectedType: SchemaJsonLdTypeSchema,
  sourceField: z.string().min(1),
});

export type JsonLdRecommendationEvidence = z.infer<typeof JsonLdRecommendationEvidenceSchema>;

export const JsonLdRecommendationSchema = z.object({
  type: SchemaJsonLdTypeSchema,
  url: NormalizedUrlSchema,
  priority: SchemaRecommendationPrioritySchema,
  reason: NonEmptyStringSchema,
  evidence: JsonLdRecommendationEvidenceSchema,
  jsonLd: JsonLdObjectSchema,
  instructions: z.array(NonEmptyStringSchema).min(1),
  requiredFields: z.array(NonEmptyStringSchema).min(1),
  recommendedFields: z.array(NonEmptyStringSchema).default([]),
  generatedBy: z.literal("deterministic"),
});

export type JsonLdRecommendation = z.infer<typeof JsonLdRecommendationSchema>;

export const JsonLdRecommendationSetSchema = z.object({
  siteId: IdSchema,
  pageUrl: NormalizedUrlSchema,
  recommendations: z.array(JsonLdRecommendationSchema),
  generatedBy: z.literal("deterministic"),
});

export type JsonLdRecommendationSet = z.infer<typeof JsonLdRecommendationSetSchema>;

export const SchemaRichResultValidationStatusSchema = z.enum([
  "eligible",
  "needs_required_fields",
  "type_mismatch",
]);

export type SchemaRichResultValidationStatus = z.infer<
  typeof SchemaRichResultValidationStatusSchema
>;

export const SchemaRichResultValidationIssueSchema = z.object({
  severity: z.enum(["error", "warning"]),
  field: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  sourceField: NonEmptyStringSchema,
});

export type SchemaRichResultValidationIssue = z.infer<
  typeof SchemaRichResultValidationIssueSchema
>;

export const SchemaRichResultValidationGenerationModeSchema = z.enum([
  "deterministic",
  "connector",
]);

export type SchemaRichResultValidationGenerationMode = z.infer<
  typeof SchemaRichResultValidationGenerationModeSchema
>;

export const SchemaRichResultValidationResultSchema = z.object({
  type: SchemaJsonLdTypeSchema,
  url: NormalizedUrlSchema,
  status: SchemaRichResultValidationStatusSchema,
  eligible: z.boolean(),
  requiredFields: z.array(NonEmptyStringSchema),
  missingRequiredFields: z.array(NonEmptyStringSchema),
  recommendedFields: z.array(NonEmptyStringSchema),
  missingRecommendedFields: z.array(NonEmptyStringSchema),
  issues: z.array(SchemaRichResultValidationIssueSchema),
  generatedBy: SchemaRichResultValidationGenerationModeSchema,
  liveExternalApis: LiveExternalApiModeSchema.default("disabled"),
});

export type SchemaRichResultValidationResult = z.infer<
  typeof SchemaRichResultValidationResultSchema
>;

export const SchemaRichResultValidationJobPayloadSchema = z.object({
  recommendationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  requestedAt: IsoDateTimeSchema,
  url: NormalizedUrlSchema,
  type: SchemaJsonLdTypeSchema,
  jsonLd: JsonLdObjectSchema,
  requiredFields: z.array(NonEmptyStringSchema).min(1),
  recommendedFields: z.array(NonEmptyStringSchema).default([]),
});

export type SchemaRichResultValidationJobPayload = z.infer<
  typeof SchemaRichResultValidationJobPayloadSchema
>;

export const SchemaRichResultValidationJobResultSchema = z.object({
  recommendationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  requestedAt: IsoDateTimeSchema,
  validationResult: SchemaRichResultValidationResultSchema,
});

export type SchemaRichResultValidationJobResult = z.infer<
  typeof SchemaRichResultValidationJobResultSchema
>;

export const QueuedSchemaRichResultValidationJobSchema = z.object({
  id: IdSchema,
  name: z.literal(schemaRichResultValidationJobName),
  payload: SchemaRichResultValidationJobPayloadSchema,
});

export type QueuedSchemaRichResultValidationJob = z.infer<
  typeof QueuedSchemaRichResultValidationJobSchema
>;

export const SchemaRecommendationStatusSchema = z.enum([
  "open",
  "converted",
  "dismissed",
  "resolved",
]);

export type SchemaRecommendationStatus = z.infer<typeof SchemaRecommendationStatusSchema>;

export const SchemaRecommendationRecordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  pageUrl: NormalizedUrlSchema,
  type: SchemaJsonLdTypeSchema,
  priority: SchemaRecommendationPrioritySchema,
  status: SchemaRecommendationStatusSchema,
  reason: NonEmptyStringSchema,
  evidence: JsonLdRecommendationEvidenceSchema,
  jsonLd: JsonLdObjectSchema,
  instructions: z.array(NonEmptyStringSchema),
  requiredFields: z.array(NonEmptyStringSchema),
  recommendedFields: z.array(NonEmptyStringSchema),
  generatedBy: z.literal("deterministic"),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type SchemaRecommendationRecord = z.infer<typeof SchemaRecommendationRecordSchema>;

export const SchemaRecommendationListResponseSchema = z.object({
  recommendations: z.array(SchemaRecommendationRecordSchema),
});

export type SchemaRecommendationListResponse = z.infer<
  typeof SchemaRecommendationListResponseSchema
>;

export const SchemaRecommendationDetailResponseSchema = z.object({
  recommendation: SchemaRecommendationRecordSchema,
});

export type SchemaRecommendationDetailResponse = z.infer<
  typeof SchemaRecommendationDetailResponseSchema
>;

export const CreateSchemaRecommendationWorkOrderResponseSchema = z.object({
  recommendation: SchemaRecommendationRecordSchema,
  workOrder: WorkOrderSchema,
});

export type CreateSchemaRecommendationWorkOrderResponse = z.infer<
  typeof CreateSchemaRecommendationWorkOrderResponseSchema
>;

export const HeadingSignalSchema = z.object({
  h1: z.array(z.string()),
  h2: z.array(z.string()),
});

export type HeadingSignal = z.infer<typeof HeadingSignalSchema>;

export const IndexabilitySignalSchema = z.object({
  noindex: z.boolean(),
  nofollow: z.boolean(),
  canonicalMismatch: z.boolean(),
  robotsBlocked: z.boolean().nullable(),
});

export type IndexabilitySignal = z.infer<typeof IndexabilitySignalSchema>;

export const ContentSignalSchema = z.object({
  textLength: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  duplicateHash: z.string().regex(/^[a-f0-9]{64}$/),
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
    external: z.array(LinkSignalSchema),
  }),
  images: z.array(ImageSignalSchema),
  jsonLd: z.array(JsonLdBlockSchema),
  indexability: IndexabilitySignalSchema,
  content: ContentSignalSchema,
});

export type CrawlerPageSnapshot = z.infer<typeof CrawlerPageSnapshotSchema>;

export const CreateSchemaRecommendationsRequestSchema = z.object({
  organizationName: z.string().min(1).nullable().optional(),
  snapshots: z.array(CrawlerPageSnapshotSchema).min(1),
});

export type CreateSchemaRecommendationsRequest = z.infer<
  typeof CreateSchemaRecommendationsRequestSchema
>;

export const CreateSchemaRecommendationsResponseSchema = z.object({
  recommendationSets: z.array(JsonLdRecommendationSetSchema),
  recommendations: z.array(SchemaRecommendationRecordSchema),
});

export type CreateSchemaRecommendationsResponse = z.infer<
  typeof CreateSchemaRecommendationsResponseSchema
>;

export const RecheckSchemaRecommendationRequestSchema = z.object({
  snapshot: CrawlerPageSnapshotSchema,
});

export type RecheckSchemaRecommendationRequest = z.infer<
  typeof RecheckSchemaRecommendationRequestSchema
>;

export const RecheckSchemaRecommendationResponseSchema = z.object({
  expectedType: SchemaJsonLdTypeSchema,
  observedTypes: z.array(SchemaJsonLdTypeSchema),
  recommendation: SchemaRecommendationRecordSchema,
  resolved: z.boolean(),
  workOrder: WorkOrderSchema.nullable(),
});

export type RecheckSchemaRecommendationResponse = z.infer<
  typeof RecheckSchemaRecommendationResponseSchema
>;

export const CrawlJobPageInputSchema = z.object({
  url: NormalizedUrlSchema,
  finalUrl: NormalizedUrlSchema.optional(),
  html: z.string().min(1),
  statusCode: z.number().int().positive().nullable().default(null),
});

export type CrawlJobPageInput = z.infer<typeof CrawlJobPageInputSchema>;

export const CrawlJobPayloadSchema = z.object({
  crawlRunId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  schemaRecommendationId: IdSchema.nullable().optional(),
  startUrl: NormalizedUrlSchema,
  maxPages: z.number().int().positive().max(100),
  pages: z.array(CrawlJobPageInputSchema).default([]),
});

export type CrawlJobPayload = z.infer<typeof CrawlJobPayloadSchema>;

export const QueuedCrawlJobSchema = z.object({
  id: IdSchema,
  name: z.literal("crawl"),
  payload: CrawlJobPayloadSchema,
});

export type QueuedCrawlJob = z.infer<typeof QueuedCrawlJobSchema>;

export const CreateCrawlRunResponseSchema = z.object({
  crawlRun: CrawlRunSchema,
  job: QueuedCrawlJobSchema,
});

export type CreateCrawlRunResponse = z.infer<typeof CreateCrawlRunResponseSchema>;

export const QueueSchemaRecommendationRecheckCrawlResponseSchema = z.object({
  recommendation: SchemaRecommendationRecordSchema,
  crawlRun: CrawlRunSchema,
  job: QueuedCrawlJobSchema,
});

export type QueueSchemaRecommendationRecheckCrawlResponse = z.infer<
  typeof QueueSchemaRecommendationRecheckCrawlResponseSchema
>;

export const QueueSchemaRichResultValidationRequestSchema = z.object({
  requestedAt: IsoDateTimeSchema.optional(),
});

export type QueueSchemaRichResultValidationRequest = z.infer<
  typeof QueueSchemaRichResultValidationRequestSchema
>;

export const QueueSchemaRichResultValidationResponseSchema = z.object({
  recommendation: SchemaRecommendationRecordSchema,
  job: QueuedSchemaRichResultValidationJobSchema,
});

export type QueueSchemaRichResultValidationResponse = z.infer<
  typeof QueueSchemaRichResultValidationResponseSchema
>;

export const RecheckWorkOrderResponseSchema = z.object({
  workOrder: WorkOrderSchema,
  crawlRun: CrawlRunSchema,
  job: QueuedCrawlJobSchema,
});

export type RecheckWorkOrderResponse = z.infer<typeof RecheckWorkOrderResponseSchema>;

export const CrawlJobSummarySchema = z.object({
  pagesRequested: z.number().int().nonnegative(),
  pagesProcessed: z.number().int().nonnegative(),
  internalLinks: z.number().int().nonnegative(),
  externalLinks: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  jsonLdBlocks: z.number().int().nonnegative(),
  noindexPages: z.number().int().nonnegative(),
});

export type CrawlJobSummary = z.infer<typeof CrawlJobSummarySchema>;

export const CrawlJobResultSchema = z.object({
  crawlRunId: IdSchema,
  siteId: IdSchema,
  status: z.enum(["completed", "empty"]),
  snapshots: z.array(CrawlerPageSnapshotSchema),
  summary: CrawlJobSummarySchema,
});

export type CrawlJobResult = z.infer<typeof CrawlJobResultSchema>;

export const RobotsRuleSchema = z.object({
  userAgents: z.array(z.string().min(1)),
  allow: z.array(z.string()),
  disallow: z.array(z.string()),
  crawlDelay: z.number().nonnegative().nullable(),
});

export type RobotsRule = z.infer<typeof RobotsRuleSchema>;

export const RobotsTxtSchema = z.object({
  rules: z.array(RobotsRuleSchema),
  sitemaps: z.array(NormalizedUrlSchema),
});

export type RobotsTxt = z.infer<typeof RobotsTxtSchema>;

export const SitemapUrlEntrySchema = z.object({
  loc: NormalizedUrlSchema,
  lastmod: z.string().nullable(),
  changefreq: z.string().nullable(),
  priority: z.number().min(0).max(1).nullable(),
});

export type SitemapUrlEntry = z.infer<typeof SitemapUrlEntrySchema>;

export const SitemapIndexEntrySchema = z.object({
  loc: NormalizedUrlSchema,
  lastmod: z.string().nullable(),
});

export type SitemapIndexEntry = z.infer<typeof SitemapIndexEntrySchema>;

export const ParsedSitemapSchema = z.object({
  type: z.enum(["urlset", "sitemapindex"]),
  urls: z.array(SitemapUrlEntrySchema),
  sitemaps: z.array(SitemapIndexEntrySchema),
});

export type ParsedSitemap = z.infer<typeof ParsedSitemapSchema>;

const ConnectorDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().nonnegative();

export const ConnectorProviderSchema = z.enum(["gsc", "ga4", "pagespeed", "bing", "cms"]);

export type ConnectorProvider = z.infer<typeof ConnectorProviderSchema>;

const DefaultConnectorProviders = ["gsc", "ga4", "pagespeed", "bing", "cms"] as const;

export const ConnectorProviderListSchema = z
  .array(ConnectorProviderSchema)
  .min(1)
  .refine((providers) => new Set(providers).size === providers.length, {
    message: "Connector providers must be unique",
  });

export type ConnectorProviderList = z.infer<typeof ConnectorProviderListSchema>;

export const ConnectorAuthModeSchema = z.enum(["oauth", "api_key", "none"]);

export type ConnectorAuthMode = z.infer<typeof ConnectorAuthModeSchema>;

export const ConnectorSyncStatusSchema = z.enum(["ok", "partial", "failed"]);

export type ConnectorSyncStatus = z.infer<typeof ConnectorSyncStatusSchema>;

export const ConnectorSyncRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
]);

export type ConnectorSyncRunStatus = z.infer<typeof ConnectorSyncRunStatusSchema>;

export const GscSearchMetricSchema = z.object({
  provider: z.literal("gsc"),
  siteUrl: NormalizedUrlSchema,
  query: z.string().min(1),
  page: NormalizedUrlSchema,
  country: z.string().min(2),
  device: z.string().min(1),
  clicks: NonNegativeIntegerSchema,
  impressions: NonNegativeIntegerSchema,
  ctr: z.number().min(0).max(1),
  position: NonNegativeNumberSchema,
  startDate: ConnectorDateSchema,
  endDate: ConnectorDateSchema,
});

export type GscSearchMetric = z.infer<typeof GscSearchMetricSchema>;

export const Ga4PageMetricSchema = z.object({
  provider: z.literal("ga4"),
  propertyId: z.string().min(1),
  pagePath: z.string().min(1),
  sessions: NonNegativeIntegerSchema,
  engagedSessions: NonNegativeIntegerSchema,
  conversions: NonNegativeNumberSchema,
  totalUsers: NonNegativeIntegerSchema,
  startDate: ConnectorDateSchema,
  endDate: ConnectorDateSchema,
});

export type Ga4PageMetric = z.infer<typeof Ga4PageMetricSchema>;

export const PageSpeedMetricSchema = z.object({
  provider: z.literal("pagespeed"),
  url: NormalizedUrlSchema,
  strategy: z.enum(["mobile", "desktop"]),
  performanceScore: z.number().min(0).max(100),
  accessibilityScore: z.number().min(0).max(100),
  seoScore: z.number().min(0).max(100),
  largestContentfulPaintMs: NonNegativeNumberSchema,
  cumulativeLayoutShift: NonNegativeNumberSchema,
  interactionToNextPaintMs: NonNegativeNumberSchema,
  fetchedAt: IsoDateTimeSchema,
});

export type PageSpeedMetric = z.infer<typeof PageSpeedMetricSchema>;

export const BingUrlMetricSchema = z.object({
  provider: z.literal("bing"),
  siteUrl: NormalizedUrlSchema,
  url: NormalizedUrlSchema,
  indexed: z.boolean(),
  clicks: NonNegativeIntegerSchema,
  impressions: NonNegativeIntegerSchema,
  discoveredAt: IsoDateTimeSchema.nullable(),
  lastCrawledAt: IsoDateTimeSchema.nullable(),
});

export type BingUrlMetric = z.infer<typeof BingUrlMetricSchema>;

export const CmsPageRecordSchema = z.object({
  provider: z.literal("cms"),
  cmsType: z.string().min(1),
  externalId: z.string().min(1),
  url: NormalizedUrlSchema,
  title: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]),
  updatedAt: IsoDateTimeSchema,
});

export type CmsPageRecord = z.infer<typeof CmsPageRecordSchema>;

export const ConnectorRecordSchema = z.discriminatedUnion("provider", [
  GscSearchMetricSchema,
  Ga4PageMetricSchema,
  PageSpeedMetricSchema,
  BingUrlMetricSchema,
  CmsPageRecordSchema,
]);

export type ConnectorRecord = z.infer<typeof ConnectorRecordSchema>;

export const KeywordDiscoveryEvidenceSchema = z.object({
  provider: ConnectorProviderSchema,
  pageUrl: NormalizedUrlSchema.nullable(),
  sourceField: NonEmptyStringSchema,
  clicks: NonNegativeIntegerSchema.optional(),
  impressions: NonNegativeIntegerSchema.optional(),
  position: z.number().nonnegative().nullable().optional(),
  title: NonEmptyStringSchema.optional(),
});

export type KeywordDiscoveryEvidence = z.infer<typeof KeywordDiscoveryEvidenceSchema>;

export const KeywordDiscoveryCandidateSchema = z.object({
  keyword: KeywordTargetSchema,
  pageUrl: NormalizedUrlSchema.nullable(),
  score: z.number().int().nonnegative(),
  evidence: KeywordDiscoveryEvidenceSchema,
});

export type KeywordDiscoveryCandidate = z.infer<typeof KeywordDiscoveryCandidateSchema>;

export const KeywordDiscoverySetSchema = z.object({
  siteId: IdSchema,
  candidates: z.array(KeywordDiscoveryCandidateSchema),
  generatedBy: z.literal("deterministic"),
  discoveredAt: IsoDateTimeSchema,
});

export type KeywordDiscoverySet = z.infer<typeof KeywordDiscoverySetSchema>;

export const KeywordDiscoveryCandidateRecordSchema = z.object({
  id: IdSchema,
  siteId: IdSchema,
  keywordId: IdSchema.nullable(),
  phrase: NonEmptyStringSchema,
  locale: z.string().min(2),
  language: z.string().min(2),
  country: z.string().min(2),
  intent: KeywordIntentSchema.nullable(),
  source: KeywordSourceSchema,
  pageUrl: NormalizedUrlSchema.nullable(),
  score: z.number().int().nonnegative(),
  evidence: KeywordDiscoveryEvidenceSchema,
  generatedBy: z.literal("deterministic"),
  discoveredAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type KeywordDiscoveryCandidateRecord = z.infer<
  typeof KeywordDiscoveryCandidateRecordSchema
>;

export const CreateKeywordDiscoveryRequestSchema = z.object({
  connectorSyncRunId: IdSchema,
  discoveredAt: IsoDateTimeSchema.optional(),
  minImpressions: NonNegativeIntegerSchema.default(1),
  maxCandidates: z.number().int().positive().max(100).default(25),
  locale: z.string().min(2).optional(),
  language: z.string().min(2).optional(),
  country: z.string().min(2).optional(),
});

export type CreateKeywordDiscoveryRequest = z.infer<
  typeof CreateKeywordDiscoveryRequestSchema
>;

export const CreateKeywordDiscoveryResponseSchema = z.object({
  discoverySet: KeywordDiscoverySetSchema,
  candidates: z.array(KeywordDiscoveryCandidateRecordSchema),
});

export type CreateKeywordDiscoveryResponse = z.infer<
  typeof CreateKeywordDiscoveryResponseSchema
>;

export const KeywordDiscoveryListResponseSchema = z.object({
  candidates: z.array(KeywordDiscoveryCandidateRecordSchema),
});

export type KeywordDiscoveryListResponse = z.infer<
  typeof KeywordDiscoveryListResponseSchema
>;

export const ConnectorRunResultSchema = z
  .object({
    provider: ConnectorProviderSchema,
    status: ConnectorSyncStatusSchema,
    fetchedAt: IsoDateTimeSchema,
    fixture: z.boolean(),
    records: z.array(ConnectorRecordSchema),
  })
  .refine((result) => result.records.every((record) => record.provider === result.provider), {
    message: "Connector run provider must match every normalized record provider",
    path: ["records"],
  });

export type ConnectorRunResult = z.infer<typeof ConnectorRunResultSchema>;

export const ConnectorRecordCountsByProviderSchema = z.object({
  bing: NonNegativeIntegerSchema,
  cms: NonNegativeIntegerSchema,
  ga4: NonNegativeIntegerSchema,
  gsc: NonNegativeIntegerSchema,
  pagespeed: NonNegativeIntegerSchema,
});

export type ConnectorRecordCountsByProvider = z.infer<typeof ConnectorRecordCountsByProviderSchema>;

export const ConnectorBatchSyncSummarySchema = z.object({
  failedProviders: NonNegativeIntegerSchema,
  okProviders: NonNegativeIntegerSchema,
  partialProviders: NonNegativeIntegerSchema,
  recordCountsByProvider: ConnectorRecordCountsByProviderSchema,
  totalProviders: NonNegativeIntegerSchema,
  totalRecords: NonNegativeIntegerSchema,
});

export type ConnectorBatchSyncSummary = z.infer<typeof ConnectorBatchSyncSummarySchema>;

export const ConnectorSyncRunSummarySchema = z.union([
  ConnectorBatchSyncSummarySchema,
  z.record(z.unknown()),
]);

export type ConnectorSyncRunSummary = z.infer<typeof ConnectorSyncRunSummarySchema>;

export const ConnectorSyncResultSchema = z.object({
  id: IdSchema,
  syncRunId: IdSchema,
  provider: ConnectorProviderSchema,
  status: ConnectorSyncStatusSchema,
  fetchedAt: IsoDateTimeSchema,
  fixture: z.boolean(),
  recordCount: NonNegativeIntegerSchema,
  records: z.array(ConnectorRecordSchema),
  createdAt: IsoDateTimeSchema,
});

export type ConnectorSyncResult = z.infer<typeof ConnectorSyncResultSchema>;

export const ConnectorSyncRunSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema,
  status: ConnectorSyncRunStatusSchema,
  providers: ConnectorProviderListSchema,
  requestedByUserId: IdSchema,
  fixture: z.boolean(),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  summary: ConnectorSyncRunSummarySchema.nullable(),
});

export type ConnectorSyncRun = z.infer<typeof ConnectorSyncRunSchema>;

export const ConnectorSyncJobPayloadSchema = z.object({
  connectorSyncRunId: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  fetchedAt: IsoDateTimeSchema,
  providers: ConnectorProviderListSchema.default([...DefaultConnectorProviders]),
});

export type ConnectorSyncJobPayload = z.infer<typeof ConnectorSyncJobPayloadSchema>;

export const ConnectorSyncJobResultSchema = z.object({
  connectorSyncRunId: IdSchema,
  organizationId: IdSchema,
  siteId: IdSchema,
  siteDomain: DomainSchema,
  requestedByUserId: IdSchema,
  fetchedAt: IsoDateTimeSchema,
  results: z.array(ConnectorRunResultSchema),
  summary: ConnectorBatchSyncSummarySchema,
});

export type ConnectorSyncJobResult = z.infer<typeof ConnectorSyncJobResultSchema>;

export const QueuedConnectorSyncJobSchema = z.object({
  id: IdSchema,
  name: z.literal(connectorSyncJobName),
  payload: ConnectorSyncJobPayloadSchema,
});

export type QueuedConnectorSyncJob = z.infer<typeof QueuedConnectorSyncJobSchema>;

export const DeadLetterReplayPayloadSchema = z.union([
  CrawlJobPayloadSchema,
  ConnectorSyncJobPayloadSchema,
  GeoAnswerMonitorJobPayloadSchema,
  SchemaRichResultValidationJobPayloadSchema,
]);

export type DeadLetterReplayPayload = z.infer<typeof DeadLetterReplayPayloadSchema>;

export const DeadLetterReplayRequestSchema = z.object({
  payload: DeadLetterReplayPayloadSchema,
  removeDeadLetterJob: z.boolean().default(true),
});

export type DeadLetterReplayRequest = z.infer<typeof DeadLetterReplayRequestSchema>;

export const QueuedDeadLetterReplayJobSchema = z.union([
  QueuedCrawlJobSchema,
  QueuedConnectorSyncJobSchema,
  QueuedGeoAnswerMonitorJobSchema,
  QueuedSchemaRichResultValidationJobSchema,
]);

export type QueuedDeadLetterReplayJob = z.infer<typeof QueuedDeadLetterReplayJobSchema>;

export const DeadLetterReplayExecutionResponseSchema = z.object({
  plan: DeadLetterReplayPlanSchema,
  replayJob: QueuedDeadLetterReplayJobSchema,
  removedDeadLetterJob: z.boolean(),
  status: z.literal("replayed"),
});

export type DeadLetterReplayExecutionResponse = z.infer<
  typeof DeadLetterReplayExecutionResponseSchema
>;

export const CreateConnectorSyncRunRequestSchema = z.object({
  providers: ConnectorProviderListSchema.default([...DefaultConnectorProviders]),
});

export type CreateConnectorSyncRunRequest = z.infer<typeof CreateConnectorSyncRunRequestSchema>;

export const CreateConnectorSyncRunResponseSchema = z.object({
  connectorSyncRun: ConnectorSyncRunSchema,
  job: QueuedConnectorSyncJobSchema,
});

export type CreateConnectorSyncRunResponse = z.infer<typeof CreateConnectorSyncRunResponseSchema>;

export const ConnectorSyncRunListResponseSchema = z.object({
  connectorSyncRuns: z.array(ConnectorSyncRunSchema),
});

export type ConnectorSyncRunListResponse = z.infer<typeof ConnectorSyncRunListResponseSchema>;

export const ConnectorSyncRunDetailResponseSchema = z.object({
  connectorSyncRun: ConnectorSyncRunSchema,
  results: z.array(ConnectorSyncResultSchema),
});

export type ConnectorSyncRunDetailResponse = z.infer<typeof ConnectorSyncRunDetailResponseSchema>;

export const PageSnapshotSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  h1Count: z.number().int().nonnegative().default(0),
});

export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
