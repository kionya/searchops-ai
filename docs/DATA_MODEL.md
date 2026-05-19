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