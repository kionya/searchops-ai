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
- Automatic FAQ gap generation is connected through `packages/aeo-core` and the ContentBrief API response, using deterministic page/readiness signals only.
- Connector-derived keyword discovery can turn normalized GSC/CMS connector results into deterministic `KeywordTarget` candidates without live API calls.
- Keyword discovery candidates persist idempotently from connector sync history and appear on the Content dashboard with API data plus deterministic fixture fallback.

Phase 7 remaining limitations:

- No LLM explanation or copy-assist flow is connected; any future AI support must stay optional in `packages/ai-core`.
- ContentBriefs remain draft-only and are not published to CMS or external channels.
- ContentBrief create flow still works with manual or fixture keyword inputs while keyword discovery remains advisory.

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
- Schema recommendation dashboard history, work order conversion actions, and deterministic fixture fallback are connected in `apps/web`.
- Schema recommendation recheck can accept a crawler snapshot, detect the expected JSON-LD type deterministically, update recommendation status/evidence, and close a linked work order when resolved.
- Schema recommendation recheck can queue a scoped one-page crawl for the recommendation page URL through the API/worker crawl boundary.
- Queued schema recheck crawls carry `schemaRecommendationId`; the worker can persist UrlRecords, extract observed JSON-LD types from the completed snapshot, update recommendation evidence/status, and close/reopen the linked work order.
- Offline rich-result validation contracts can check JSON-LD root type, required fields, and recommended fields without live external validators.
- Live rich-result validator wrappers can accept explicit validator clients and normalize responses through `packages/connectors`; no validator SDK, credential, or network client is enabled by default.
- Rich-result validation jobs can be enqueued through the API, consumed by the worker, run through deterministic offline validation or explicit connector injection, and persisted into schema recommendation evidence.

Phase 8 remaining limitations:

- JSON-LD output is a recommendation draft, not an auto-publish payload.
- Deployment-specific live validator credentials/client injection and dashboard trigger UI remain future scope.

## Phase 9. GEO monitor

Monitor AI visibility signals and generative engine readiness using deterministic inputs where possible and clearly separated AI-assisted analysis where needed.

Phase 9 non-negotiables:

- Deterministic first. GEO scoring must be reproducible from stored observations and citations.
- No LLM is required for brand mention detection, owned citation detection, provider diversity, or status scoring.
- Live AI provider collection must stay behind connector boundaries and fixture-based tests by default.
- Public contracts are Zod-validated and independently unit tested.

Phase 9 foundation status:

- GEO visibility monitor contracts are in `packages/types` with Zod tests.
- Deterministic visibility scoring is in `packages/geo-core` with independent unit tests.
- API creation/history routes persist `GeoVisibilityReport` records through repository ports.
- Dashboard GEO history and create action are connected with API data plus deterministic fixture fallback.
- GEO visibility reports can be converted into idempotent WorkOrders through deterministic templates.
- The GEO dashboard can trigger report-to-work-order conversion through API data with fixture fallback.
- GEO answer monitor provider contracts and fixture adapters live in `packages/connectors` with live external APIs disabled by default.
- GEO answer monitor live adapter wrappers can accept explicit provider clients and normalize responses into `source = connector` observations; no SDK, credential, or network client is enabled by default.
- GEO answer monitor jobs can be enqueued through the API, consumed by the worker, evaluated by deterministic `geo-core`, and persisted as `GeoVisibilityReport` history.

Phase 9 remaining limitations:

- Observation collection through the dashboard is still fixture/manual input only; live provider credentials and deployment-specific client injection remain future deployment scope.
- Reports are converted to work orders on explicit dashboard/API action; automatic bulk generation remains future scope.
- Compliance review remains separate; medical claim risk flags are still Phase 10 scope.

## Phase 10. Compliance engine

Expand medical advertising risk filters, claim checks, approval states, and draft-only content safeguards.

Phase 10 non-negotiables:

- Deterministic first. Compliance flags must be reproducible from typed review inputs.
- No LLM is required for medical advertising risk detection.
- Medical content remains draft-only until compliance review is complete.
- Rules must be independently unit tested and return evidence, recommendation, and replacement guidance.
- Public contracts are Zod-validated and owned by `packages/types`.

Phase 10 foundation status:

- Compliance review contracts are in `packages/types` with Zod tests.
- Deterministic medical advertising risk rules are in `packages/compliance`.
- Initial rules cover guaranteed result claims, absolute safety claims, superlatives, before-and-after references, patient testimonials, price promotions, and non-draft medical publishing.
- Compliance reports return draft-only flags, overall risk, and blocked/needs-review/clear status.
- Compliance review API and Prisma persistence store ComplianceFlag history.
- Compliance dashboard history, fixture review action, status updates, and WorkOrder conversion are connected with API data plus deterministic fixture fallback.
- Compliance flags can be converted into idempotent legal-owned WorkOrders through deterministic templates.
- Deterministic rule pack selection is available for `global` and `kr-medical` packs.
- `kr-medical` adds readable Korean medical advertising refinements for guaranteed outcomes, absolute safety, superlatives, before-and-after references, testimonials, and event/discount promotions.
- `kr-medical` rule pack selection can use either Korean locale signals or Korean-market `.kr` domains.
- `kr-medical` exposes a deterministic rule pack refinement workflow for rule coverage, market phrase review, legal owner approval, and draft-only publish gates.
- Revised compliance copy can be rechecked through the API and dashboard; resolved flags close linked WorkOrders, while still-failing rules keep work open.
- CMS content update events can trigger deterministic rechecks for matching active ComplianceFlags without fetching from or publishing to the live CMS.
- CMS webhook signature verification is enforced when provider secrets are configured, using provider-scoped HMAC headers plus timestamp replay protection.
- WordPress, Webflow, and generic headless CMS webhook payloads can be normalized through `packages/connectors` before entering the shared CMS recheck flow.
- WordPress and Webflow provider webhook routes can verify selected native signature headers as a fallback to the SearchOps HMAC contract.
- Closed-loop audit events persist the CMS update, compliance recheck, resolved flag, and completed WorkOrder transitions for history lookup.

Phase 10 remaining limitations:

- Compliance reviews do not publish content or push changes to a CMS.
- Legal/market owner approval for KR medical rule pack refinement remains a governance step outside automated tests.
- Live CMS management APIs remain future hardening scope.

## Phase 11. Production hardening

Harden security, observability, queues, retries, rate limits, deployment, migrations, backups, and operational runbooks.

Phase 11 starting status:

- `CDX-110`: Root verification scripts use Corepack-backed `pnpm -r` with explicit package builds before typecheck/test for stable fresh-clone CI execution, while Turbo remains available through `*:turbo` scripts for cache-aware runs.
- Pull requests and pushes to `main` run GitHub Actions CI for install, lint, typecheck, test, and build.
- `CDX-111`: CMS content update events now support provider-scoped HMAC signature verification, timestamp replay protection, and explicit webhook secret env validation.
- `CDX-112`: CMS provider webhook adapters normalize WordPress, Webflow, and generic headless payloads into the shared deterministic CMS content event contract before recheck.
- `CDX-113`: Closed-loop audit logs persist CMS-triggered recheck transitions and expose site-scoped history through the API.
- `CDX-114`: Production hardening foundation adds API rate-limit controls, request metrics, BullMQ retry/backoff assertions, and worker dead-letter queue payloads for failed jobs.
- `CDX-127`: Dead-letter operations APIs and dashboard expose worker failure metadata and allow safe entry cleanup without storing secrets or raw credentials.
- `CDX-128`: API rate limiting now uses an injectable store boundary with in-memory defaults and a Redis-like distributed counter adapter for multi-instance deployments.
- `CDX-129`: Mock auth context now carries roles and is enforced for tenant-scoped API reads/writes. Cross-tenant organization/site access is denied and viewer writes are blocked.
- `CDX-130`: Operations metrics export combines API request counters, worker dead-letter summaries, and deterministic alert signals behind the ops API boundary.
- `CDX-131`: Backup, restore, migration verification, deployment environment, and secret rotation runbooks are documented with Corepack-backed migration status/deploy scripts.
- `CDX-132`: `/ops/metrics-export` writes to injected log drain and alert router adapters, and the web dashboard exposes an operations observability view with API data plus deterministic fixture fallback.
- `CDX-133`: Trusted external IdP claim headers map into the same typed API auth context as mock auth, preserving tenant and role checks without live IdP calls in tests.
- `CDX-134`: Operations plan APIs generate deterministic backup restore drill plans, secret rotation plans, and blocked dead-letter replay workflows without exposing secrets or auto-requeueing jobs.
- `CDX-135`: Runtime operations executors wire HTTP observability drains/alerts from env, HS256 bearer-token IdP verification, restore drill and secret rotation dispatch routes, and queue-specific idempotent dead-letter replay actions.
- `CDX-136`: The dashboard, fallback copy, status labels, empty states, and seed demo data are localized to Korean while internal API fields and rule IDs remain English.
- `CDX-137`: Web metadata, root HTML language, not-found UI, and progress artifacts are aligned with Korean deployment surfaces.
- `CDX-138`: Web runtime API base URL handling normalizes `SEARCHOPS_API_BASE_URL` values with or without `https://` before server-side fetches.
- `CDX-139`: Railway API/worker smoke checks and Redis/BullMQ `noeviction` requirements are documented for production operations.
- `CDX-140`: API bearer-token auth supports RS256/JWKS verification through explicit deployment JWKS env, alongside the existing HS256 verifier.
- `CDX-141`: Launch readiness API and dashboard track the remaining Phase 6-11 and productization work as configured, provisioning-needed, or manual-follow-up items without exposing secrets.
- `CDX-142`: Production launch docs cover billing, onboarding, privacy, terms, security, and deployment provisioning tasks that cannot be completed by code alone.

Phase 11 remaining limitations:

- API rate limiting has a Redis-like distributed adapter boundary, but deployment-specific Redis client wiring and edge-provider implementations remain future scope.
- Metrics export can feed injected log drain and alert router adapters, including HTTP SaaS/webhook endpoints configured by env; provider account provisioning remains deployment scope.
- Dead-letter queues capture failed job metadata and expose operator cleanup views, and supported queues can be replayed with operator-supplied source-of-truth payloads and deterministic replay job IDs.
- HS256 and RS256/JWKS bearer verification are available at the API runtime boundary; provider account provisioning and JWKS rotation policy remain deployment follow-up work.
- Restore drill and secret rotation dispatch routes call configured HTTP executors; the external scheduler/secret manager account and credential provisioning remain deployment scope.
