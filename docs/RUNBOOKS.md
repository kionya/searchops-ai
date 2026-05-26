# RUNBOOKS.md

Operational runbooks for SearchOps AI production hardening. These procedures are deployment-facing and must not change deterministic SEO/AEO/GEO/compliance package behavior.

## Database Backup And Restore

Purpose:
- Protect PostgreSQL data before migrations, deploys, and incident response work.
- Prove backups are restorable before treating them as safe.

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
- `DATABASE_URL`
- `REDIS_URL`
- `SEARCHOPS_CMS_WEBHOOK_SECRETS` when CMS webhooks are enabled.
- `SEARCHOPS_RATE_LIMIT_ENABLED`, `SEARCHOPS_RATE_LIMIT_MAX`, and `SEARCHOPS_RATE_LIMIT_WINDOW_MS` when API rate limits are enabled.
- Provider credentials only in deployment secret storage, never in fixtures or committed files.

Pre-deploy checks:
1. Run `corepack pnpm verify` on the release commit.
2. Run `corepack pnpm db:migrate:status`.
3. Confirm Redis connectivity for BullMQ queues and rate-limit storage if enabled.
4. Confirm CMS webhook secrets are provider-scoped and rotated through the deployment secret manager.
5. Confirm `/health`, `/metrics`, and `/ops/metrics-export` are reachable from the operations network.
6. Confirm tenant-scoped API calls deny cross-tenant access.

Post-deploy checks:
1. Trigger a fixture-safe crawl or runtime smoke test in a non-production tenant.
2. Confirm worker queues consume jobs and dead-letter queues remain empty.
3. Confirm `/ops/metrics-export` reports request counters and zero unexpected alerts.
4. Confirm CMS webhook signature failures return `401` before side effects.

## Secret Rotation

Purpose:
- Rotate secrets without losing deterministic auditability or leaking customer data.

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
