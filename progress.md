# SearchOps AI Progress

Updated: 2026-05-25

## Current State

The repository is on `main` and aligned with `origin/main`.

Recent merged PRs:

- PR #58: Schema recheck crawl worker handoff
- PR #59: GEO answer live adapter port
- PR #60: Rich result validator adapter port

Latest full verification:

- `corepack pnpm verify` passed locally for the latest work.
- GitHub Actions `verify` passed for PR #58, PR #59, and PR #60 before merge.

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

Status: Deterministic MVP plus adapter boundaries completed.

Implemented:

- JSON-LD recommendation contracts and deterministic rules in `packages/schema-core`.
- Schema recommendation API, Prisma persistence, dashboard history, and work order conversion.
- Snapshot-based recheck and queued one-page recheck crawl.
- Worker handoff from completed crawl snapshot to schema recommendation status/work order update.
- Offline rich-result validation.
- Live rich-result validator adapter port in `packages/connectors`, using explicit injected clients only.

Remaining:

- Runtime wiring for live rich-result validator clients.
- JSON-LD remains a draft recommendation, not an auto-publish payload.

### Phase 9: GEO Monitor

Status: Deterministic MVP plus adapter boundaries completed.

Implemented:

- GEO visibility contracts in `packages/types`.
- Deterministic visibility scoring in `packages/geo-core`.
- API creation/history, Prisma persistence, dashboard history, and work order conversion.
- GEO answer monitor fixture adapters.
- Live GEO answer monitor adapter port in `packages/connectors`, using explicit injected clients only.

Remaining:

- Runtime/job wiring for live provider clients.
- API/dashboard observation collection is still manual or fixture-driven.
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

Remaining:

- Redis-backed or edge-backed distributed rate limiting.
- Central observability export for metrics/logs.
- Dead-letter dashboard and replay workflow.
- Real auth/RBAC and tenant isolation hardening.
- Backup, migration, and deployment secret rotation runbooks.

## Next Implementation Plan

Recommended order:

1. CDX-125: GEO live provider runtime job wiring
   - Add worker job contract for GEO answer monitoring.
   - Wire explicit injected clients behind connector ports.
   - Persist resulting observations as GeoVisibilityReports.
   - Keep tests fixture/fake-client only.

2. CDX-126: Rich-result validator runtime wiring
   - Add optional worker/API orchestration for explicit validator clients.
   - Store validation results or attach them to schema recommendation history.
   - Keep `schema-core` offline and deterministic.

3. CDX-127: Dead-letter operations dashboard
   - Persist or expose dead-letter job metadata.
   - Add operator list/detail/replay-safe design.
   - Avoid storing secrets or raw credentials.

4. CDX-128: Distributed rate limit adapter
   - Keep current process-local limiter as default.
   - Add Redis/edge adapter boundary.
   - Add deterministic tests using fake storage.

5. CDX-129: Auth/RBAC and tenant isolation hardening
   - Replace mock auth context with real auth boundary.
   - Add organization/user/site scoping tests.
   - Add negative tests for cross-tenant access.

6. CDX-130: Observability export
   - Export request metrics and worker failure metrics.
   - Add structured logging conventions.
   - Document operational dashboards and alerts.

7. CDX-131: Backup, migration, and deployment runbooks
   - Document database backup/restore.
   - Add migration verification workflow.
   - Document secret rotation and deployment environment checks.

## Guardrails

- No LLM usage for SEO/AEO/GEO/compliance detection truth.
- No live external API calls in tests.
- No CMS auto-publish.
- Medical content remains draft-only.
- Live provider clients must be explicit runtime wiring, not default package behavior.
