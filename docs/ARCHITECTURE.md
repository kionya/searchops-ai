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
- `packages/workorders -> packages/seo-core | packages/compliance | packages/schema-core | packages/types`
- `packages/seo-core -> packages/types`
- `packages/crawler-core -> packages/types`
- `packages/connectors -> packages/types`
- `packages/compliance -> packages/types`
- `packages/aeo-core -> packages/types`
- `packages/schema-core -> packages/types`

Forbidden:
- `packages/* -> apps/*`
- `packages/seo-core -> packages/ai-core`
- `packages/seo-core -> packages/db`
- `packages/aeo-core -> packages/ai-core`
- `packages/aeo-core -> packages/db`
- `packages/aeo-core -> packages/connectors`
- `packages/schema-core -> packages/ai-core`
- `packages/schema-core -> packages/db`
- `packages/schema-core -> packages/connectors`
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

## Phase 6 Connector Boundary
`packages/connectors` owns connector adapter contracts, fixture adapters, provider response normalization, and connector-specific test fixtures. Live provider calls are disabled by default and must remain behind adapter ports.

`apps/api` owns connector sync HTTP routes, mock-auth scoping, and queue enqueue. It must not call GSC, GA4, PageSpeed, Bing, or CMS APIs directly.

`apps/worker` owns connector sync job consumption. It calls connector adapter ports, then persists normalized results through `packages/db`. Re-running a provider within the same sync run must update the existing provider result rather than creating duplicate provider rows.

`apps/web` may trigger syncs and read sync history through `SEARCHOPS_API_BASE_URL`. If the API is unavailable in local shell views, the dashboard may render deterministic fixture-facing states, but those states must not be confused with live external provider data.

## Phase 7 Keyword and AEO Boundary
Phase 7 introduces deterministic Keyword/AEO contracts before any generation layer. The `packages/aeo-core` package owns keyword intent, answer-readiness, FAQ gap, and content planning signal logic.

`packages/aeo-core` must have no LLM, DB, network, or connector dependency. It receives typed inputs, returns typed drafts/signals, and remains independently unit testable. Optional explanations, copy drafts, or prompt-driven variants belong later in `packages/ai-core`.

ContentBrief outputs are draft-only planning artifacts. They must never auto-publish to a CMS or external channel.

`apps/api` owns the HTTP boundary for AEO readiness report creation/history and ContentBrief draft creation/history. It may call deterministic `packages/aeo-core` functions, validate requests and responses through `packages/types`, and persist through repository ports. It must not call LLM providers, live connectors, or CMS publish adapters for Phase 7 flows.

`packages/db` owns AEO readiness and ContentBrief persistence. `AeoReadinessReport` stores deterministic report history for dashboard use, while `ContentBrief` stores draft-only planning output. Retrying or re-running a readiness evaluation can create another history row; the dashboard orders the latest evaluations first.

`apps/web` may read AEO readiness and ContentBrief history through `SEARCHOPS_API_BASE_URL`. If the API is unavailable or not configured, it renders deterministic fixture fallback states and labels them as fixture data.

## Phase 8 Schema Engine Boundary
Phase 8 starts with deterministic JSON-LD recommendation contracts and rule logic. The `packages/schema-core` package owns schema type extraction from crawler snapshots and JSON-LD recommendation drafts for WebSite, WebPage, Article, FAQPage, BreadcrumbList, LocalBusiness, MedicalClinic, and Service.

`packages/schema-core` must have no LLM, DB, network, connector, or CMS dependency. It receives typed crawler snapshots plus site context, returns Zod-validated recommendation sets, and remains independently unit testable. Optional explanation text, code generation assistance, persistence, dashboard surfaces, work order mapping, and recheck automation belong to later Phase 8 tasks.

`apps/api` owns the HTTP boundary for schema recommendation creation/history. It may call deterministic `packages/schema-core`, validate requests and responses through `packages/types`, and persist recommendation drafts through repository ports. It must not call LLM providers, live rich-result validators, or CMS publish adapters for Phase 8 schema recommendation flows.

`packages/db` owns schema recommendation persistence. Recommendations are idempotent by site, page URL, and schema type so rerunning the same deterministic analysis updates the existing draft instead of creating duplicates.

`packages/workorders` owns deterministic SchemaRecommendation to WorkOrder mapping. `apps/api` may convert a persisted schema recommendation into one idempotent work order and mark the recommendation `converted`; it must not publish JSON-LD to a CMS or production page.
