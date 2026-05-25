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
- `packages/workorders -> packages/seo-core | packages/compliance | packages/schema-core | packages/geo-core | packages/types`
- `packages/seo-core -> packages/types`
- `packages/crawler-core -> packages/types`
- `packages/connectors -> packages/types`
- `packages/compliance -> packages/types`
- `packages/aeo-core -> packages/types`
- `packages/schema-core -> packages/types`
- `packages/geo-core -> packages/types`

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
- `packages/geo-core -> packages/ai-core`
- `packages/geo-core -> packages/db`
- `packages/geo-core -> packages/connectors`
- `packages/compliance -> packages/ai-core`
- `packages/compliance -> packages/db`
- `packages/compliance -> packages/connectors`
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

Connector-derived keyword discovery lives in `packages/connectors` because it translates normalized provider records into `KeywordTarget` candidates. The discovery step remains deterministic, uses stored or fixture connector results, and does not call live provider APIs by itself.

## Phase 7 Keyword and AEO Boundary

Phase 7 introduces deterministic Keyword/AEO contracts before any generation layer. The `packages/aeo-core` package owns keyword intent, answer-readiness, FAQ gap, and content planning signal logic.

`packages/aeo-core` must have no LLM, DB, network, or connector dependency. It receives typed inputs, returns typed drafts/signals, and remains independently unit testable. Optional explanations, copy drafts, or prompt-driven variants belong later in `packages/ai-core`.

ContentBrief outputs are draft-only planning artifacts. They must never auto-publish to a CMS or external channel.

`apps/api` owns the HTTP boundary for AEO readiness report creation/history and ContentBrief draft creation/history. It may call deterministic `packages/aeo-core` functions, validate requests and responses through `packages/types`, and persist through repository ports. It must not call LLM providers, live connectors, or CMS publish adapters for Phase 7 flows.

When a ContentBrief request does not include a FAQ gap set, the API generates one through `packages/aeo-core` from the typed keyword, candidate page, and readiness report. The generated gap set is returned as response evidence but is not a publishing action.

`packages/db` owns AEO readiness, keyword discovery, and ContentBrief persistence. `KeywordDiscoveryCandidate` stores idempotent connector-derived keyword candidates by site, phrase, locale, and source; `AeoReadinessReport` stores deterministic report history for dashboard use, while `ContentBrief` stores draft-only planning output. Retrying or re-running a readiness evaluation can create another history row; the dashboard orders the latest evaluations first.

`apps/web` may read keyword discovery, AEO readiness, and ContentBrief history through `SEARCHOPS_API_BASE_URL`. If the API is unavailable or not configured, it renders deterministic fixture fallback states and labels them as fixture data.

## Phase 8 Schema Engine Boundary

Phase 8 starts with deterministic JSON-LD recommendation contracts and rule logic. The `packages/schema-core` package owns schema type extraction from crawler snapshots and JSON-LD recommendation drafts for WebSite, WebPage, Article, FAQPage, BreadcrumbList, LocalBusiness, MedicalClinic, and Service.

`packages/schema-core` must have no LLM, DB, network, connector, or CMS dependency. It receives typed crawler snapshots plus site context, returns Zod-validated recommendation sets, and remains independently unit testable. It also owns offline rich-result draft validation for required fields, recommended fields, and root schema type checks. Optional explanation text, code generation assistance, live rich-result validation, and CMS publishing belong outside the deterministic core.

`packages/connectors` owns the optional live rich-result validator adapter boundary. Live validator wrappers require an explicitly injected client and normalize the response into `SchemaRichResultValidationResult` with `generatedBy = connector` and `liveExternalApis = enabled`; no validator SDK, credential, or network client is enabled by default.

`apps/api` owns the HTTP boundary for schema recommendation creation/history, work order conversion, snapshot-based recheck, and crawl orchestration for recommendation rechecks. It may call deterministic `packages/schema-core`, validate requests and responses through `packages/types`, scope recommendation page URLs to the registered site domain/subdomains, persist recommendation drafts through repository ports, and enqueue a one-page crawl for a recommendation page URL with the `schemaRecommendationId` needed for worker handoff. It must not call LLM providers, live rich-result validators, or CMS publish adapters for Phase 8 schema recommendation flows.

`apps/worker` owns the queued schema recheck handoff after a crawl finishes. When a crawl job carries `schemaRecommendationId`, the worker persists UrlRecords, extracts observed JSON-LD types from the matching crawler snapshot through `packages/schema-core`, and asks `packages/db` to update recommendation evidence/status plus the linked work order status. The worker does not publish JSON-LD or call live rich-result tooling.

`packages/db` owns schema recommendation persistence. Recommendations are idempotent by site, page URL, and schema type so rerunning the same deterministic analysis updates the existing draft instead of creating duplicates. Recheck persistence updates the recommendation evidence/status from observed JSON-LD types and, when a linked work order exists, may mark the work order `done` once the expected type is present.

`packages/workorders` owns deterministic SchemaRecommendation to WorkOrder mapping. `apps/api` may convert a persisted schema recommendation into one idempotent work order and mark the recommendation `converted`; it must not publish JSON-LD to a CMS or production page.

`apps/web` owns the dashboard surface for schema recommendations. It may read schema recommendation history, convert open recommendations to work orders, submit deterministic snapshot rechecks, and trigger API-owned recheck crawl orchestration through API helpers with fixture fallback when `SEARCHOPS_API_BASE_URL` is unavailable.

## Phase 9 GEO Monitor Boundary

Phase 9 starts with deterministic GEO visibility contracts and scoring. The `packages/geo-core` package owns brand mention detection, owned-domain citation detection, query coverage, provider diversity, competitor citation risk, and status scoring from typed observations.

`packages/geo-core` must have no LLM, DB, network, connector, browser, or CMS dependency. It receives typed `GeoTarget` and `GeoAnswerObservation` inputs, returns Zod-validated visibility reports, and remains independently unit testable. Optional explanation text or AI-assisted interpretation belongs later in `packages/ai-core`, while answer observation collection belongs behind connector adapters.

`packages/connectors` owns GEO answer monitor adapter ports, fixture adapters, and injected-client live adapter wrappers for AI-answer providers such as ChatGPT, Perplexity, Gemini, Copilot, and Claude. Fixture adapters normalize stored answer observations into `GeoAnswerObservation` records with `liveExternalApis = disabled`; live wrappers require an explicit provider client and return `source = connector` observations with `liveExternalApis = enabled`. No provider SDK, credential, or network call is created by default.

`apps/api` owns the HTTP boundary for GEO visibility report creation/history and report-to-work-order conversion. It may call deterministic `packages/geo-core` and `packages/workorders`, validate requests and responses through `packages/types`, scope target domains to the registered site domain or subdomain, and persist through repository ports. It must not call LLM providers or live AI answer providers for Phase 9 flows.

`packages/db` owns GEO visibility persistence. `GeoVisibilityReport` stores report history for dashboard use, including observations and citations as JSON evidence. Re-running a visibility evaluation creates another history row so the dashboard can show trendable snapshots. `WorkOrder.geoVisibilityReportId` links one report to at most one idempotent task.

`packages/workorders` owns deterministic GeoVisibilityReport to WorkOrder mapping. It uses only persisted report fields and static templates.

`apps/web` owns the dashboard surface for GEO visibility. It may read report history, create deterministic fixture-based reports, and convert reports to work orders through API helpers, with fixture fallback when `SEARCHOPS_API_BASE_URL` is unavailable.

## Phase 10 Compliance Engine Boundary

Phase 10 starts with deterministic compliance review contracts and medical advertising risk rules. The `packages/compliance` package owns rule interfaces, default rule ordering, rule pack selection, phrase/risk checks, draft-only publish safeguards, and report status classification from typed review input.

`packages/compliance` must have no LLM, DB, network, connector, browser, or CMS dependency. It receives typed review input, returns Zod-validated compliance reports and flag drafts, and remains independently unit testable.

`apps/api` owns the HTTP boundary for compliance review creation, flag history, status updates, ComplianceFlag to WorkOrder conversion, revised-copy rechecks, and inbound CMS content update events. It may call deterministic `packages/compliance` and `packages/workorders`, validate requests and responses through `packages/types`, scope review/CMS event URLs to the registered site domain/subdomains, and persist through repository ports.

`packages/db` owns ComplianceFlag persistence. Flags are review history rows with deterministic evidence, recommendations, replacement suggestions, and optional work order links.

`apps/web` owns the dashboard surface for compliance review history. It may run fixture-backed reviews, update flag statuses, create legal-review work orders, and recheck revised fixture copy through API helpers, with fixture fallback when `SEARCHOPS_API_BASE_URL` is unavailable.

`kr-medical` rule pack refinements stay inside `packages/compliance`. They extend the shared rule IDs with Korean medical advertising phrases for guaranteed outcomes, absolute safety, superlatives, before-and-after references, testimonials, and event/discount promotions. Rule pack selection may use locale or Korean-market domains, but detection remains deterministic and independently tested.

Medical content must stay draft-only until compliance review is complete. No Phase 10 layer may publish to a CMS or call LLM providers for risk detection.

CMS-origin rechecks are event-driven. The API accepts a typed content update payload from a CMS adapter or webhook boundary and rechecks matching active ComplianceFlags from the supplied text. The API must not reach out to the CMS from inside the request handler.

CMS webhook security lives at the API boundary, not inside `packages/compliance`. When provider secrets are configured, the API verifies `x-searchops-cms-type`, `x-searchops-timestamp`, and `x-searchops-signature` before any recheck side effect. The signature is an HMAC-SHA256 over the timestamp plus canonical normalized event payload, scoped to the provider-specific `cmsType` secret, with timestamp replay protection.

Provider-specific CMS webhook payload adapters live in `packages/connectors`. WordPress, Webflow, and generic headless CMS payloads are normalized to `CmsContentUpdatedEventRequest` before the API invokes the shared CMS-origin recheck flow. These adapters are deterministic, fixture-tested, and do not fetch from or publish to CMS systems.

Closed-loop audit logging is owned by the API and DB layers. The deterministic compliance engine still returns only review results; the API records operational events such as CMS update received, compliance recheck, flag resolved, and linked WorkOrder completed so operators can inspect the loop without coupling audit persistence into `packages/compliance`.

## Phase 11 Production Hardening Boundary

Production hardening starts at runtime boundaries before deeper platform policy work. `apps/api` owns HTTP rate limiting and request metrics because those controls depend on request identity and deployment topology. The first implementation is in-memory and deterministic for local/test environments; distributed rate limiting can replace the same boundary later.

`apps/worker` owns BullMQ worker failure handling. Queue producers define retry/backoff defaults, while worker runtimes write failed jobs to a dead-letter queue after BullMQ exhausts retries. Dead-letter payloads intentionally store queue/job metadata and failure reason, not secrets or raw external credentials.
