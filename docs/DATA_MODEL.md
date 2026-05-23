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

No schema recommendation may be treated as an auto-publish payload. Dashboard surfaces and schema-specific recheck history belong to later Phase 8 tasks.

## Phase 8 Schema WorkOrder Mapping
WorkOrder records may link to one SchemaRecommendation through `schemaRecommendationId`. The field is nullable so existing SEO issue work orders remain unchanged, and unique so converting the same recommendation is idempotent.

When a schema recommendation is converted, its status becomes `converted`; the resulting work order still requires human execution and review before any JSON-LD is deployed.
