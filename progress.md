# SearchOps AI Progress

Updated: 2026-05-26

## Current State

The repository is on `codex/cdx-135-runtime-ops-executors`, branched from the latest merged `main`.

Recent merged PRs:

- PR #65: Dead-letter operations dashboard
- PR #66: Distributed rate-limit adapter
- PR #67: Tenant-scoped mock auth roles
- PR #68: Operational metrics export
- PR #69: Production hardening runbooks
- PR #70: Observability ingestion adapters and dashboard
- PR #71: External IdP claim mapping
- PR #72: Operations hardening plans

Latest full verification:

- Focused local verification for CDX-135 has passed so far: `corepack pnpm --filter @searchops/types test`, `corepack pnpm --filter @searchops/types build`, `corepack pnpm --filter @searchops/api typecheck`, and `corepack pnpm --filter @searchops/api test`.
- GitHub Actions `verify` passed for PR #65 through PR #72 before merge.

## Phase Progress

### Phase 0-5: Foundation, Core Shell, Crawler, SEO, Work Orders, Dashboard

Status: Completed foundation path.

Implemented:

- pnpm/Turborepo TypeScript monorepo foundation.
- Apps: `apps/web`, `apps/api`, `apps/worker`.
- Shared packages: db, types, crawler-core, seo-core, workorders, connectors, compliance, schema/geo/aeo-related cores.
- Prisma model foundation, seed data, API repository boundaries, mock auth, dashboard route shell.
- Site crawler, URL normalization, HTML SEO signal extraction, robots/sitemap parsing, runtime crawl queue, persistence, runtime smoke path.
- Deterministic SEO issue engine and issue/work order mapping.
- Work order API/UI and recheck flows.
- Dashboard shells and Phase 5 routes.

### Phase 6: Connectors

Status: Foundation completed.

Implemented:

- Connector contracts and deterministic fixture adapters.
- Connector sync enqueue, worker consumption, persistence, history API, dashboard history, and trigger UI.
- Connector-derived keyword discovery from normalized GSC/CMS records without live API calls.

Remaining:

- Live provider credential wiring and external API calls remain deferred until explicitly scoped.

### Phase 7: Keyword/AEO Engine

Status: Deterministic MVP completed.

Implemented:

- Keyword/AEO contracts in `packages/types`.
- Deterministic intent/readiness rules in `packages/aeo-core`.
- ContentBrief draft mapper, API/persistence, dashboard history, and create UI.
- Keyword/AEO dashboard readiness reports with persisted API data and fixture fallback.
- Deterministic FAQ gap generation.
- Connector-derived keyword candidate generation.
- Keyword discovery persistence and dashboard workflow added through CDX-124.

Remaining:

- Optional LLM explanation/copy assist in `packages/ai-core`, later only.
- ContentBriefs remain draft-only and must not auto-publish.

### Phase 8: Schema Engine

Status: Deterministic MVP plus runtime handoff completed.

Implemented:

- JSON-LD recommendation contracts and deterministic rules in `packages/schema-core`.
- Schema recommendation API, Prisma persistence, dashboard history, and work order conversion.
- Snapshot-based recheck and queued one-page recheck crawl.
- Worker handoff from completed crawl snapshot to schema recommendation status/work order update.
- Offline rich-result validation.
- Live rich-result validator adapter port in `packages/connectors`, using explicit injected clients only.
- Rich-result validation API enqueue, worker processor, deterministic/default validation, and evidence persistence are connected through CDX-126.

Remaining:

- Deployment-specific live validator credentials/client injection and dashboard trigger UI.
- JSON-LD remains a draft recommendation, not an auto-publish payload.

### Phase 9: GEO Monitor

Status: Deterministic MVP plus runtime handoff completed.

Implemented:

- GEO visibility contracts in `packages/types`.
- Deterministic visibility scoring in `packages/geo-core`.
- API creation/history, Prisma persistence, dashboard history, and work order conversion.
- GEO answer monitor fixture adapters.
- Live GEO answer monitor adapter port in `packages/connectors`, using explicit injected clients only.
- `geo-answer-monitor` API enqueue, worker processor, deterministic `geo-core` evaluation, and DB persistence boundary are wired in CDX-125.

Remaining:

- Live provider credentials and deployment-specific client injection remain future scope.
- Dashboard observation collection is still manual or fixture-driven.
- Automatic bulk work order generation remains future scope.

### Phase 10: Compliance Engine

Status: Closed-loop compliance MVP completed.

Implemented:

- Compliance contracts and deterministic medical advertising rules.
- Global and `kr-medical` rule pack selection.
- Korean medical advertising phrase refinements.
- Compliance API/persistence/dashboard history.
- ComplianceFlag to WorkOrder conversion.
- Revised copy recheck and linked WorkOrder resolution.
- CMS update event recheck flow.
- CMS webhook HMAC signature verification and timestamp replay protection.
- WordPress/Webflow/headless CMS payload normalization.
- Closed-loop audit logging for CMS update -> compliance recheck -> flag/work order transitions.

Remaining:

- Provider-specific native signature schemes.
- Live CMS management APIs.
- No content publishing from compliance flows.

### Phase 11: Production Hardening

Status: Started.

Implemented:

- Stable root verification scripts using Corepack-backed pnpm.
- GitHub Actions CI for install, lint, typecheck, test, and build.
- API rate-limit controls.
- Request metrics foundation.
- BullMQ retry/backoff assertions.
- Worker dead-letter queue payloads.
- Dead-letter operations API and dashboard.
- Injectable API rate-limit store with a Redis-like distributed adapter boundary.
- Mock auth roles enforced for tenant-scoped API access and viewer write denial.
- Operational metrics export for API request counters, worker dead-letter summaries, and deterministic alert signals.
- Backup/restore, migration verification, deployment check, and secret rotation runbooks.
- Metrics export ingestion adapters for log drains and alert routing, plus an `/ops/observability` dashboard with fixture fallback.
- External IdP claim headers map into the same typed API auth context as mock auth.
- Operations plan APIs for backup restore drills, secret rotation, and dead-letter replay workflow planning.
- Runtime HTTP observability log drain and alert webhook adapters can be wired from validated env.
- HS256 bearer-token IdP verification can be enabled at the API runtime boundary.
- Restore drill and secret rotation execution routes dispatch plans to configured deployment executors.
- Supported dead-letter queues can be replayed with operator-supplied source-of-truth payloads and deterministic replay job IDs.

Remaining:

- Deployment-specific Redis client wiring or edge-backed rate limiting.
- Provider account provisioning for observability, restore scheduler, secret manager, and IdP remains deployment work.
- RS256/JWKS IdP verification can be added as a provider-specific hardening follow-up.

## Next Implementation Plan

Recommended order:

1. Finalize CDX-135
   - Run full `corepack pnpm verify`.
   - Self-review the diff against `AGENTS.md` and `docs/CODE_REVIEW.md`.
   - Commit, push, open PR, wait for CI, and merge.

2. Deployment follow-up
   - Provision provider accounts and secret refs for observability, restore scheduler, secret manager, and IdP.
   - Add RS256/JWKS verification if the selected IdP cannot issue HS256 deployment tokens.

## Guardrails

- No LLM usage for SEO/AEO/GEO/compliance detection truth.
- No live external API calls in tests.
- No CMS auto-publish.
- Medical content remains draft-only.
- Live provider clients must be explicit runtime wiring, not default package behavior.
