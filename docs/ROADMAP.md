# Development Roadmap

SearchOps AI is built in phases. Each phase should leave the repo in a working state with tests and documentation updated before moving to the next phase.

## Phase 0. Codex-ready foundation
Establish the monorepo scaffold, ownership rules, planning templates, review rules, and baseline project documentation.

## Phase 1. Core product shell
Create the basic app shell for web, API, worker, shared config, shared types, and database access without deep product logic.

## Phase 2. Site crawler
Implement deterministic site crawling, HTML fetching/parsing, link extraction, robots/sitemap handling, and page snapshot generation.

## Phase 3. SEO issue engine
Implement deterministic SEO rules, scoring, issue classification, evidence output, and independent unit tests for each rule.

## Phase 4. Work order automation
Convert SEO and compliance issues into actionable work orders with deterministic templates, priorities, owners, and recheck criteria.

## Phase 5. Dashboard
Build the dashboard views for crawl runs, issues, work orders, recheck status, and workflow progress.

## Phase 6. Data connectors
Add external adapters behind connector boundaries for GSC, GA4, PageSpeed, Bing, CMS systems, and fixture-based tests.

Phase 6 foundation status:
- Connector contracts, deterministic fixture adapters, sync enqueue, worker consumption, persistence, history API, dashboard history, and dashboard trigger UI are in place.
- Live provider credentials and live external API calls remain deferred until explicitly scoped.
- Connector outputs must continue through adapter ports and normalized persistence before they are used by dashboard or planning features.

## Phase 7. Keyword / AEO engine
Add keyword intent modeling, answer-readiness checks, FAQ/content planning signals, and AEO workflow outputs.

Phase 7 non-negotiables:
- Deterministic first. No LLM is required for keyword classification, answer-readiness checks, or content planning signals.
- AI support may be added later through `packages/ai-core` for explanation or draft assistance only.
- ContentBrief outputs are draft-only and must never auto-publish.
- Public contracts are Zod-validated and independently unit tested.

Phase 7 foundation status:
- `CDX-071`: Keyword/AEO contracts are in `packages/types` with Zod tests.
- `CDX-072`: Deterministic keyword intent and answer-readiness rules are in `packages/aeo-core` with independent unit tests.
- `CDX-073`: ContentBrief draft mapper is deterministic, draft-only, and tested in `packages/aeo-core`.
- `CDX-074`: ContentBrief API and persistence are wired through `apps/api`, `packages/db`, and shared response contracts.
- ContentBrief dashboard history and create UI are connected with API data plus deterministic fixture fallback.
- Keyword/AEO dashboard readiness reports are connected to persisted AEO readiness API data plus deterministic fixture fallback.
- AEO readiness report persistence is in place for dashboard history; report generation stays rule-based and deterministic.

Phase 7 remaining limitations:
- No LLM explanation or copy-assist flow is connected; any future AI support must stay optional in `packages/ai-core`.
- FAQ gap records are modeled as deterministic contracts and mapper inputs, but automatic FAQ gap generation is still future scope.
- ContentBriefs remain draft-only and are not published to CMS or external channels.
- Live connector-derived keyword discovery is still future scope; current dashboard/API flows work with manual or fixture keyword inputs.

## Phase 8. Schema engine
Generate and validate structured data recommendations, including JSON-LD work orders and schema-specific recheck rules.

Phase 8 non-negotiables:
- Deterministic first. JSON-LD recommendations must be reproducible from crawler snapshots and site context.
- No LLM is required for schema detection, recommendation selection, or JSON-LD draft construction.
- Schema recommendations are drafts and must be reviewed before publishing to a CMS or production page.
- Public contracts are Zod-validated and independently unit tested.

Phase 8 foundation status:
- JSON-LD recommendation contracts are in `packages/types` with Zod tests.
- Deterministic schema type extraction and JSON-LD recommendation rules are in `packages/schema-core`.
- Initial rules cover WebSite, WebPage, Article, FAQPage, BreadcrumbList, LocalBusiness, MedicalClinic, and Service recommendations.
- Schema recommendation API and Prisma persistence are connected through `apps/api` and `packages/db`.
- Schema recommendation reruns are idempotent by site, page URL, and schema type.
- Schema recommendations can be converted into idempotent WorkOrders through deterministic templates.

Phase 8 remaining limitations:
- No dashboard surface or schema recheck status flow is connected yet.
- JSON-LD output is a recommendation draft, not an auto-publish payload.
- Schema validation against live rich result tooling remains future scope.

## Phase 9. GEO monitor
Monitor AI visibility signals and generative engine readiness using deterministic inputs where possible and clearly separated AI-assisted analysis where needed.

## Phase 10. Compliance engine
Expand medical advertising risk filters, claim checks, approval states, and draft-only content safeguards.

## Phase 11. Production hardening
Harden security, observability, queues, retries, rate limits, deployment, migrations, backups, and operational runbooks.
