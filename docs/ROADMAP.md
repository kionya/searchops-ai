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

Recommended PR sequence:
- `CDX-071`: Keyword/AEO contracts.
- `CDX-072`: Deterministic intent and answer-readiness rules.
- `CDX-073`: ContentBrief draft mapper.
- `CDX-074`: API and persistence connection.
- `CDX-075`: Dashboard content workflow connection.

## Phase 8. Schema engine
Generate and validate structured data recommendations, including JSON-LD work orders and schema-specific recheck rules.

## Phase 9. GEO monitor
Monitor AI visibility signals and generative engine readiness using deterministic inputs where possible and clearly separated AI-assisted analysis where needed.

## Phase 10. Compliance engine
Expand medical advertising risk filters, claim checks, approval states, and draft-only content safeguards.

## Phase 11. Production hardening
Harden security, observability, queues, retries, rate limits, deployment, migrations, backups, and operational runbooks.
