# ARCHITECTURE.md

## Runtime Shape
- `apps/web`: Next.js dashboard UI.
- `apps/api`: Fastify REST API boundary.
- `apps/worker`: BullMQ worker runtime boundary.
- `packages/*`: reusable domain and infrastructure modules.

## Dependency Direction
Allowed:
- `apps/* -> packages/*`
- `apps/api -> packages/db | packages/types`
- `packages/workorders -> packages/seo-core | packages/compliance | packages/types`
- `packages/seo-core -> packages/types`
- `packages/crawler-core -> packages/types`
- `packages/connectors -> packages/types`
- `packages/compliance -> packages/types`

Forbidden:
- `packages/* -> apps/*`
- `packages/seo-core -> packages/ai-core`
- `packages/seo-core -> packages/db`
- `packages/crawler-core -> packages/seo-core`
- `packages/ui -> packages/db | packages/connectors | apps/worker`

## Determinism Boundary
The core crawl -> analyze -> workorder -> recheck loop must run without LLM provider access. LLM usage is isolated in `packages/ai-core` for optional drafting/explanation workflows.

## External Systems
External APIs must be hidden behind `packages/connectors` and tested with mock fixtures by default.

## Phase 1 DB Boundary
The Prisma schema and migration live in `packages/db`. The API uses an in-memory repository for Phase 1 CRUD tests so local PostgreSQL is not required for shell verification.

## Phase 2 Crawl Queue Boundary
`apps/api` owns the HTTP boundary for creating crawl runs and enqueueing crawl jobs through a queue port. `apps/worker` owns crawl job processing and calls `packages/crawler-core` for deterministic HTML signal extraction. Live fetching, Redis-backed queue execution, and UrlRecord persistence are intentionally deferred to later crawler tasks.

## Phase 2 Crawl Persistence Boundary
`packages/crawler-core` owns deterministic robots.txt and sitemap.xml parsing. `packages/db` owns idempotent crawl result persistence helpers that map worker crawl results to `UrlRecord` upserts and `CrawlRun.summary` updates. `apps/worker` composes those helpers after HTML signal extraction. The helpers are tested against a fake persistence client so local PostgreSQL is not required for CDX-024 verification.

## Phase 2 Runtime Crawl Boundary
Runtime crawl execution is now wired behind ports. `apps/api` uses a Prisma-backed repository and BullMQ-backed crawl queue when started through `apps/api/src/index.ts`; tests can still inject memory repositories and queues. `apps/worker` consumes the shared crawl queue, uses `packages/crawler-core` for bounded live fetching and HTML signal extraction, then persists through the `packages/db` Prisma adapter. Unit tests use mock fetchers and fake persistence clients; they do not call live websites, Redis, or PostgreSQL.

Runtime crawling is scoped to the registered site domain and its subdomains. Localhost, private IP, and link-local IP targets are blocked, and redirects or robots sitemap URLs outside that scope are rejected. Failed crawl execution updates the `CrawlRun` status to `failed` with an error summary.
