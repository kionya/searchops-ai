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

## Phase 7. Keyword / AEO engine
Add keyword intent modeling, answer-readiness checks, FAQ/content planning signals, and AEO workflow outputs.

## Phase 8. Schema engine
Generate and validate structured data recommendations, including JSON-LD work orders and schema-specific recheck rules.

## Phase 9. GEO monitor
Monitor AI visibility signals and generative engine readiness using deterministic inputs where possible and clearly separated AI-assisted analysis where needed.

## Phase 10. Compliance engine
Expand medical advertising risk filters, claim checks, approval states, and draft-only content safeguards.

## Phase 11. Production hardening
Harden security, observability, queues, retries, rate limits, deployment, migrations, backups, and operational runbooks.