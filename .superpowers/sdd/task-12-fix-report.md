# Task 12 Review Fix Report

Date: 2026-07-14

Scope: fix every finding in `.superpowers/sdd/task-12-review-report.md` without changing the approved Tasks 1-11 boundaries.

## Result

1. Web `/ops/readiness` is protected by Supabase middleware. The page resolves the verified current user and calls the API with `apiFetchAsUser`. Missing auth, 401/403, store/network failure, and invalid strict responses render fixed fail-closed UI; this route has no service-principal or demo fallback.
2. `shouldEnableConnectorLiveRuntime` is the shared Worker/readiness predicate. Configured credential storage or Worker PageSpeed enables connector live runtime, and `canRunLiveConnectorSync` additionally requires `liveExternalApis=enabled`.
3. Tenant readiness now exposes `unmigratedLegacyCredentials` and `observedLegacyFallbacks` separately. Observed use is parsed strictly from exact-organization `ConnectorSyncRun.summary.credentialSources` in a seven-day window. Malformed or credential-shaped summaries do not count as safe evidence.
4. Connector setup receives separate `apiEnv` and optional `workerEnv`. The HTTP API provides API env only and therefore reports Worker runtime, refresh, PageSpeed, and keyring parity as unverified. The CLI never merges targets and accepts `--api-env-file` and `--worker-env-file`.
5. Operational docs use one order: backup/status/key, additive migrate, API, Worker, Web, backfill dry-run/apply/reconcile, validate, encrypted cutover, seven-day zero observed legacy, separate destructive approval. Initial, routine, and emergency key lifecycle sections are separate.
6. Worker and connector READMEs define global GA4/Bing/customer Google values as `dual`-mode legacy migration inputs only. New site/account configuration is DB-backed and encrypted.
7. Operational readiness and connector setup public Zod objects are deeply strict at item/check, summary, and root levels.
8. Root `check:connector-live` builds Types, DB, and Connectors before the API CLI. `test:connector-live-clean-artifact` removes/restores ignored build artifacts and verifies the command without modifying tracked files.
9. Worker-only optional GEO model and rich-result validator env keys are listed in the Worker example and provisioning appendix.

## TDD RED Evidence

The following failures were recorded before production changes:

- Web focused tests: 4 failures. `/ops/readiness` middleware returned 200, the loader used a service/fixture path, and 403/503 returned demo data.
- Connectors focused test: 1 failure because `shouldEnableConnectorLiveRuntime` did not exist.
- Types focused tests: 2 failures because nested unknown and credential-shaped readiness fields were accepted.
- Connector setup tests: tenant Bing could report runnable while Worker live mode was disabled, and API env alone marked Worker refresh configured.
- CLI env tests: API and Worker local files were merged and deployment returned one environment.
- DB counterexample: a migrated legacy row with a recent exact-tenant `credentialSources.gsc=legacy` run still returned the old zero fallback metric.
- Readiness/docs tests: migration and observed-use status were not separate, rollout order was wrong, READMEs were stale, optional Worker envs were absent, and the root CLI did not build DB.

## GREEN Verification

Focused:

```text
API readiness/setup/CLI/server: 199 passed
DB provider credential store: 48 passed
Types strict contracts: 62 passed
Web readiness/middleware/page: 92 passed before final full Web run
Worker full: 108 passed
```

Full requested packages:

```text
@searchops/types: 95 passed
@searchops/db: 133 passed
@searchops/api: 339 passed
@searchops/web: 161 passed
@searchops/worker: 108 passed
Total: 836 passed
```

Commands completed successfully:

```bash
corepack pnpm --filter @searchops/types --filter @searchops/db --filter @searchops/api --filter @searchops/web --filter @searchops/worker -r test
corepack pnpm check:connector-live -- --deployment --api-env-file=scripts/dev/api.env.example --worker-env-file=scripts/dev/worker.env.example --json
corepack pnpm test:connector-live-clean-artifact
corepack pnpm build
corepack pnpm -r typecheck
corepack pnpm lint
git diff --check
```

The synthetic separate-target CLI reported API and Worker runtime checks independently, kept live external APIs disabled, remained DB-free, and returned no blocked checks. The clean-artifact smoke rebuilt required workspace artifacts and restored the previous ignored artifacts.

## Security and Scope Checks

- Readiness snapshots are loaded only for the verified user principal organization; caller-supplied organization input is ignored.
- API responses remain metadata-only and strict. Tests reject snapshot credential fields and nested unknown fields.
- Vercel documentation contains only browser-safe API/app/Supabase values and forbids DB, Redis, encryption, OAuth secret, provider key, and customer identifiers.
- Railway API and Worker placement is separate; keyring parity is validated only when both targets are supplied.
- No secret value, real customer ID, or live provider response was added.

## Limitations

- No live DB, Redis, Supabase, provider, customer system, migration, deployment, or secret store was accessed.
- No seven-day production observation evidence exists yet; the code only establishes the exact-tenant query and strict counting contract.
- The HTTP API intentionally cannot mark Worker readiness complete until a separate trusted Worker target/signal is supplied. The local CLI can verify both explicit target files.
- Historical approved design/plan/task artifacts retain their original terminology as records; current operational instructions are in `docs/PROVISIONING_RUNBOOK.md`, current READMEs, and this report.
- Browser E2E against a deployed Supabase session remains outside this local Task 12 fix; Web-to-API bearer propagation and signed API principal scope are covered by automated tests.
- No push was performed.
