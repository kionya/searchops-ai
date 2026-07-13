# RUNBOOKS.md

Operational runbooks for SearchOps AI production hardening. These procedures are deployment-facing and must not change deterministic SEO/AEO/GEO/compliance package behavior.

## Database Backup And Restore

Purpose:
- Protect PostgreSQL data before migrations, deploys, and incident response work.
- Prove backups are restorable before treating them as safe.

Automation endpoint:
- `GET /ops/backup-restore-drill-plan?environment=<name>` returns the deterministic drill checklist and commands for the target environment.
- `POST /ops/backup-restore-drill-runs` dispatches the drill plan to the configured deployment restore scheduler. It accepts `environment` and `dryRun`.
- The web dashboard exposes the same plan at `/ops/hardening` with fixture fallback when the API base URL is not configured.

Required inputs:
- `DATABASE_URL` for the source database.
- A scratch restore database URL that is not connected to production traffic.
- A private backup destination controlled by the deployment environment.

Preflight:
1. Confirm the target environment and database host.
2. Pause high-risk write jobs if the deploy changes data shape.
3. Run `corepack pnpm db:migrate:status`.
4. Record current commit SHA and migration status in the deployment notes.

Backup:
1. Create a custom-format dump with `pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file searchops-YYYYMMDD-HHMM.dump`.
2. Store the dump in the private backup destination.
3. Record file size, checksum, environment, and created-at timestamp.
4. Keep the checksum separate from the dump so corruption can be detected later.

Restore verification:
1. Restore into a scratch database with `pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_DATABASE_URL" searchops-YYYYMMDD-HHMM.dump`.
2. Point `DATABASE_URL` at the scratch database.
3. Run `corepack pnpm db:migrate:status`.
4. Run `corepack pnpm --filter @searchops/db db:generate`.
5. Run a read-only API smoke test for `/health` and a tenant-scoped list route.

Rollback:
- Prefer forward-fix migrations when data has already been written with the new schema.
- Restore from backup only when the incident owner confirms data loss or an unrecoverable migration.
- Never restore production over an active database without a traffic pause and owner approval.

## Migration Verification

Purpose:
- Make Prisma schema changes predictable before deploy.
- Separate generated client drift from database drift.

Automation endpoint and CI gate:
- `GET /ops/migration-deployment-gate-plan?environment=<name>` returns the deterministic migration deploy gate checklist.
- GitHub Actions `migration-gate` runs `pnpm db:migrate:deploy` and `pnpm db:migrate:status` against a temporary PostgreSQL service on pull requests and pushes to `main`.

Developer workflow:
1. Update `packages/db/prisma/schema.prisma`.
2. Create or update the Prisma migration in `packages/db/prisma/migrations`.
3. Run `corepack pnpm --filter @searchops/db db:generate`.
4. Run `corepack pnpm db:migrate:status` against the intended development database.
5. Run `corepack pnpm verify`.

Release workflow:
1. Confirm CI passed on the merge commit.
2. Run `corepack pnpm db:migrate:status` against the target environment.
3. Take and verify a backup using the database backup runbook.
4. Run `corepack pnpm db:migrate:deploy`.
5. Run `corepack pnpm db:migrate:status` again.
6. Run API and worker smoke checks for queue enqueue, worker consume, and Prisma persistence when the release touches runtime jobs.

Failure handling:
- If `migrate deploy` fails before applying a migration, stop and fix the migration artifact.
- If it fails after partial apply, capture Prisma output and database logs before changing anything else.
- If generated Prisma client output changes without schema or migration changes, regenerate locally and inspect the diff before committing.

## Deployment Environment Checks

Purpose:
- Catch missing runtime dependencies before traffic reaches the release.

Required environment:
- Railway API and Worker each receive `NODE_ENV=production`, `DATABASE_URL`, and the same `REDIS_URL`.
- Railway API and Worker receive the same `SEARCHOPS_CREDENTIAL_STORAGE_MODE`, active encryption key ID/material, and previous-key JSON. Vercel receives none of them.
- Railway API receives Google OAuth client ID/secret/redirect/state values and IdP verification values.
- Railway Worker receives the same Google client ID/secret for refresh, plus optional PageSpeed and SearchOps-funded GEO platform keys.
- `SEARCHOPS_CMS_WEBHOOK_SECRETS` when CMS webhooks are enabled.
- `SEARCHOPS_RATE_LIMIT_ENABLED`, `SEARCHOPS_RATE_LIMIT_MAX`, and `SEARCHOPS_RATE_LIMIT_WINDOW_MS` when API rate limits are enabled.
- `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL` and optional token when metrics exports should post to a provider log drain.
- `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL` and optional token when operational alerts should post to a provider alert route.
- `SEARCHOPS_IDP_JWT_HS256_SECRET`, optional issuer, and optional audience when the API verifies HS256 bearer tokens directly.
- `SEARCHOPS_IDP_JWKS_JSON`, optional issuer, and optional audience when the API verifies RS256/JWKS bearer tokens directly.
- `SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL` and optional token when restore drills are scheduled by an external executor.
- `SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL` and optional token when secret rotations are executed by an external secret manager workflow.
- Platform-owned provider credentials stay in Railway secret storage, never in fixtures or committed files.
- Customer Google/Bing/GEO credentials are encrypted `ProviderAccount` payloads; GSC/GA4/Bing resources are metadata-only `SiteConnector` bindings.
- Production verifies bearer tokens inside the API with the configured HS256 or RS256/JWKS verifier. Trusted `x-searchops-idp-*` headers are local/test-only and are disabled by `NODE_ENV=production`.

Pre-deploy checks:
1. Run `corepack pnpm verify` on the release commit.
2. Run `corepack pnpm db:migrate:status`.
3. Confirm Redis connectivity for BullMQ queues and rate-limit storage if enabled. API runtime rate limiting uses the same `REDIS_URL` when `SEARCHOPS_RATE_LIMIT_ENABLED=true` or `NODE_ENV=production`.
4. Confirm CMS webhook secrets are provider-scoped and rotated through the deployment secret manager.
5. Confirm `/health`, `/metrics`, and `/ops/metrics-export` are reachable from the operations network.
6. Confirm tenant-scoped API calls deny cross-tenant access.
7. Confirm incomplete `x-searchops-idp-*` claim sets fail before route side effects.

Post-deploy checks:
1. Trigger a fixture-safe crawl or runtime smoke test in a non-production tenant.
2. Confirm worker queues consume jobs and dead-letter queues remain empty.
3. Confirm `/ops/metrics-export` reports request counters and zero unexpected alerts.
4. Confirm CMS webhook signature failures return `401` before side effects.
5. For provider webhook routes, confirm WordPress/Webflow native signature failures also return `401` before side effects.

### Railway API/Worker And Redis Checks

Purpose:
- Keep the Railway API and worker services observable without relying on dashboard-only knowledge.
- Prevent BullMQ from running on a Redis policy that can evict queue data under pressure.

Expected Railway services:
- `searchops-api`: HTTP service that exposes `/health`, `/metrics`, and `/ops/metrics-export`.
- `searchops-worker`: worker process that starts BullMQ consumers for `crawl`, `connector-sync`, `geo-answer-monitor`, `schema-rich-result-validation`, `analyze`, `generate`, and `recheck`.
- Redis/Upstash service referenced by both services through the same `REDIS_URL`.

Required Redis setting:
- BullMQ expects Redis `maxmemory-policy` to be `noeviction`.
- If Railway or Upstash logs show `IMPORTANT! Eviction policy is ... It should be "noeviction"`, treat it as an operations warning before production traffic.
- Do not ignore the warning for production crawls because evicted queue keys can break delayed jobs, retries, or dead-letter inspection.

Smoke check sequence:
1. Open the deployed API `/health` URL and confirm a `200` response.
2. Open `/ops/metrics-export` and confirm `api`, `workers`, and `alerts` sections are present.
3. In Railway worker logs, confirm `SearchOps worker listening for jobs: ...`.
4. Queue one fixture-safe crawl or connector-sync job from a demo tenant.
5. Confirm the worker logs a completed job and the API history endpoint shows persisted output.
6. Confirm dead-letter queues are empty, or inspect `/ops/dead-letter-jobs` if any job failed.
7. Open `/ops/readiness` and confirm every remaining provider credential, hardening task, and productization follow-up is visible without exposing secret values.
8. Open `/ops/hardening` and confirm restore drill and migration gate plans render without secret values.

If Redis eviction warnings continue:
1. Prefer a Redis provider or plan that supports `noeviction`.
2. If the provider does not allow `CONFIG SET maxmemory-policy noeviction`, move BullMQ to a Redis deployment that does.
3. Keep rate-limit counters and BullMQ queues separate if an edge/provider cache requires volatile eviction policies.
4. Record the Redis provider, plan, region, and eviction policy in deployment notes.

## Tenant Connector Checks

Purpose:
- Separate platform failures from organization account and site resource configuration.
- Verify that one job resolves only the account and resource bound to its `organizationId` and `siteId`.

Platform preflight:
1. Run `corepack pnpm check:connector-live`. This is a DB-free runtime/platform check.
2. Confirm API and Worker have the same storage mode and active/previous encryption keyring.
3. Confirm the API has all four Google OAuth app values and the Worker has the same client ID/secret for refresh.
4. Treat PageSpeed and SearchOps-funded GEO keys as optional Worker platform credentials.

Tenant readiness:
1. Sign in as the organization owner/admin and open `/ops/integrations`.
2. Connect the Google or Bing `ProviderAccount`; add organization GEO BYOK only when the customer supplies it.
3. On each site connector screen, bind the exact GSC property, numeric GA4 Property ID, and verified Bing resource.
4. Open authenticated `/ops/readiness`. `live-gsc`, `live-ga4`, and `live-bing` come from metadata-only tenant snapshot counts, not global Worker env.
5. Run one provider at a time. `setup_required` means account/resource metadata is incomplete; `failed` means a normalized provider failure occurred.
6. Confirm sync/dead-letter/log output contains no token, API key, encryption envelope, provider response body, or URL with credential query parameters.

Dual-mode migration:
1. Keep `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual` while backfill or any sync reports `credentialSources.*=legacy`.
2. A positive `legacyFallbacks` readiness value is a warning and is not encrypted-cutover evidence.
3. Run the dry-run/apply commands in `PROVISIONING_RUNBOOK.md` after a verified backup.
4. Set both API and Worker to `encrypted` only after fallback and unmigrated counts are zero.
5. If encrypted mode reports fallback or decryption errors, roll both services back to `dual` before retrying.

CMS:
1. A missing live CMS fetch connector is `setup_required`, not a provider failure.
2. Configure provider-scoped `SEARCHOPS_CMS_WEBHOOK_SECRETS` on Railway API when CMS webhooks are enabled.
3. WordPress, Webflow, and generic headless payloads are normalized at the connector boundary.

## Secret Rotation

Purpose:
- Rotate secrets without losing deterministic auditability or leaking customer data.

Automation endpoint:
- `POST /ops/secret-rotation-plan` accepts secret references, not raw secret values, and returns the rotation checklist.
- `POST /ops/secret-rotations` dispatches the rotation plan to the configured secret manager executor. It accepts secret references and `dryRun`; it never accepts raw secret values.

Rotation sequence:
1. Add the new secret in the deployment secret manager.
2. Deploy code/config that accepts the new secret.
3. Send a signed test webhook or connector fixture event with the new secret.
4. Remove the old secret after the verification window.
5. Record the rotation timestamp, owner, affected provider, and validation result.

Rules:
- Do not commit secrets, tokens, private URLs, customer payloads, or live provider fixtures.
- Do not paste secrets into GitHub PRs, issue comments, logs, or screenshots.
- Provider-specific webhook secrets must stay scoped by provider key.
- If a secret exposure is suspected, rotate first, investigate second.

## Dead-Letter Replay

Purpose:
- Give operators a safe replay workflow without requeueing incomplete or unsafe payloads.

Automation endpoint:
- `POST /ops/dead-letter-jobs/:deadLetterJobId/replay-plan` returns the queue/job metadata and a blocked replay checklist.
- `POST /ops/dead-letter-jobs/:deadLetterJobId/replay` enqueues a queue-specific replay job when the operator provides the reconstructed source-of-truth payload.
- The web dashboard exposes replay-plan status from `/ops/dead-letter` and does not auto-requeue metadata-only entries.

Rules:
- Dead-letter entries intentionally omit raw customer/provider payloads.
- Replay requires queue-specific payload reconstruction from source-of-truth data.
- Queue-specific replay uses deterministic replay job IDs, so repeated operator requests target the same replay job identity.
- Replay planning must not clear the dead-letter entry.
- Replay execution may clear the dead-letter entry only after enqueue succeeds and `removeDeadLetterJob` is true.
