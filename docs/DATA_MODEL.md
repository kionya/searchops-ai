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
