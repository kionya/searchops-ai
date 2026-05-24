# DATA_MODEL.md

## Phase 1 Entities
- Organization: tenant/workspace boundary.
- User: mock-auth user belonging to an organization.
- Site: crawl target owned by an organization.
- CrawlRun: one crawl execution for a site.
- UrlRecord: normalized URL observed during crawl.
- SeoIssue: deterministic issue emitted by `packages/seo-core` in later phases.
- WorkOrder: actionable task generated from issues or compliance flags.
- Keyword: query target for SEO/AEO planning.
- ContentBrief: draft planning output for content workflows.
- AiPrompt: prompt template metadata for optional AI-assisted workflows.
- AiResult: draft AI output metadata.
- ComplianceFlag: medical advertising risk flag.

## Migration Rule
Every DB change must include a Prisma migration and seed fixture when product data shape changes.

## Phase 1 Seed Fixture
The seed fixture creates one organization, one owner user, one site, and one queued crawl run. If `DATABASE_URL` is not set, the seed script prints the fixture instead of connecting to PostgreSQL.

## Phase 2 Crawl Persistence
Crawler persistence is idempotent by `UrlRecord`'s existing `@@unique([siteId, url])` constraint. Worker crawl results upsert URL records with crawl run id, status code, title, and meta description, then update the crawl run status, end timestamp, and summary JSON. No Prisma schema change is required for CDX-024 because Phase 1 already introduced `CrawlRun` and `UrlRecord`.

## Phase 2 Runtime Persistence
The API runtime creates crawl runs through Prisma and enqueues crawl jobs through BullMQ. The worker runtime consumes those jobs and writes results through the same `UrlRecord` and `CrawlRun` tables. The write path remains idempotent by site URL, so retrying a crawl job updates the existing URL record instead of creating duplicates.

If runtime crawling fails, the worker updates the crawl run to `failed`, sets `endedAt`, and stores a compact error summary. This prevents failed BullMQ jobs from leaving crawl runs permanently in `queued`.

## Phase 6 Connector Persistence
- ConnectorSyncRun: one connector sync request for a site. It stores the site, organization, requested user, selected providers, sync mode, status, timestamps, and summary JSON.
- ConnectorSyncResult: one persisted provider result for a connector sync run. It stores provider, status, fetched timestamp, fixture flag, record count, normalized records JSON, and provider-specific metadata JSON.

Connector sync persistence is idempotent by sync run and provider. Retrying a provider update should replace that provider result for the same run and then recompute the run summary. Fixture records must not contain secrets or real customer data.

Expected connector sync statuses:
- Run status: `queued`, `running`, `completed`, `partial`, `failed`.
- Provider result status: `ok`, `partial`, `failed`.

## Phase 7 Keyword and AEO Guardrails
Keyword records represent deterministic query targets for SEO/AEO planning. ContentBrief records are draft planning outputs only; they must not be treated as publishable CMS content.

The first Keyword/AEO contracts should model deterministic inputs and outputs before any AI-assisted drafting is introduced. Optional AI explanations or drafts belong in `AiPrompt`, `AiResult`, and `packages/ai-core`, not in the deterministic rule contracts.

## Phase 7 ContentBrief Persistence
ContentBrief persistence stores deterministic draft planning fields:
- `primaryKeyword`, `locale`, and `intent` capture the keyword target used to generate the draft.
- `summary`, `outline`, `faqQuestions`, and `acceptanceCriteria` capture the actionable planning output.
- `generationMode` must remain `deterministic` for rule-generated drafts.
- `publishPolicy` must remain `draft_only`; CMS publishing belongs to a future explicitly scoped workflow.

The API may create or reuse a Keyword record when persisting a ContentBrief, but the brief itself remains a draft artifact and must not depend on LLM output.

## Phase 7 AEO Readiness Persistence
AeoReadinessReport records store deterministic Keyword/AEO readiness history for a site:
- `phrase`, `locale`, and `intent` denormalize the evaluated Keyword target for stable history.
- `pageUrl`, `status`, `score`, and `checks` store the deterministic readiness output.
- `generatedBy` must remain `deterministic`.
- `evaluatedAt` records the scoring timestamp, while `createdAt` records persistence time.

The API may create or reuse a Keyword record when persisting a report. Reports do not depend on LLM output, live connector fetches, or CMS publishing.

## Phase 8 Schema Recommendation Persistence
SchemaRecommendation records store deterministic JSON-LD recommendation drafts for a site:
- `pageUrl`, `type`, `priority`, and `status` identify the recommended schema action.
- `reason`, `evidence`, `jsonLd`, `instructions`, `requiredFields`, and `recommendedFields` store the reviewable recommendation payload.
- `generatedBy` must remain `deterministic`.
- The unique key is `siteId`, `pageUrl`, and `type` so reruns update the same recommendation draft.

Supported recommendation statuses are `open`, `converted`, `dismissed`, and `resolved`. Snapshot recheck updates `evidence.observedTypes`; if the expected JSON-LD type is present, the recommendation becomes `resolved`.

No schema recommendation may be treated as an auto-publish payload. Dashboard actions can create work orders and submit deterministic recheck snapshots, but publishing JSON-LD to a CMS or production page remains out of scope.

## Phase 8 Schema WorkOrder Mapping
WorkOrder records may link to one SchemaRecommendation through `schemaRecommendationId`. The field is nullable so existing SEO issue work orders remain unchanged, and unique so converting the same recommendation is idempotent.

When a schema recommendation is converted, its status becomes `converted`; the resulting work order still requires human execution and review before any JSON-LD is deployed. If a schema recheck resolves the recommendation, the linked work order is marked `done`.

## Phase 9 GEO Visibility Persistence
GeoVisibilityReport records store deterministic AI visibility monitoring snapshots for a site:
- `brandName`, `domain`, `locale`, and `market` capture the evaluated target.
- `status`, `score`, `mentionRate`, `citationRate`, and `competitorCitationRate` store the deterministic visibility outcome.
- `queryCount` and `providerCount` summarize observation breadth.
- `observations`, `citations`, and `checks` store JSON evidence for dashboard review and future work order mapping.
- `generatedBy` must remain `deterministic`.
- `evaluatedAt` records the scoring timestamp, while `createdAt` records persistence time.

Reports are history rows rather than idempotent replacements. A new run creates a new report so GEO visibility can be compared over time. Observation collection is manual or fixture-driven in Phase 9; live AI provider collection remains future connector scope.

## Phase 9 GEO WorkOrder Mapping
WorkOrder records may link to one GeoVisibilityReport through `geoVisibilityReportId`. The field is nullable so SEO issue and schema recommendation work orders remain unchanged, and unique so converting the same GEO report is idempotent.

The resulting work order stores deterministic evidence derived from the report rates and checks. It does not store AI-generated analysis, does not publish content, and does not change the underlying report history row.

## Phase 10 Compliance Contracts
ComplianceReviewInput is the typed review request for medical advertising checks. It identifies the source subject, optional URL, locale, industry, title, text, publish state, and source system.

ComplianceReviewReport is deterministic output from `packages/compliance`. It stores flag drafts, overall risk, review status, `draft_only` publish policy, and `deterministic` generation mode.

ComplianceFlagDraft is not a persisted record yet. It is the contract API and DB layers will use in later Phase 10 work to persist ComplianceFlag rows, drive dashboard review workflows, and generate WorkOrders. Existing ComplianceFlag persistence remains backward-compatible while optional rule, subject, evidence, recommendation, and replacement fields are modeled in shared types.
