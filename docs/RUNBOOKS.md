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

## 크롤 배치 (상시 워커 없이 운영)

Purpose:
- 상시 호스팅 없이 크롤을 주기 실행해 SeoIssue/WorkOrder를 만들고 리쥬엘 콘솔로 적재한다.

2026-08 기준 무료 상시 호스팅이 사실상 사라져(Railway 무료 폐지, Koyeb 신규 차단 + Worker 금지,
Render 무료에 워커 없음, Oracle A1 용량 경합) 상시 워커를 포기하고 배치로 전환했다.

- 진입점: `apps/worker/src/batch-crawl.ts` → `node apps/worker/dist/batch-crawl.js`
- 워크플로: `.github/workflows/batch-crawl.yml` (매일 KST 03:00, `workflow_dispatch`로 수동 실행 가능)
- **Redis를 쓰지 않는다.** 큐를 우회해 `processAndPersistCrawlJob`을 직접 호출한다.
  그래서 `./runtime.js`(bullmq를 끌어온다)와 `parseSearchOpsEnv`(`REDIS_URL`을 필수로 요구한다)를
  배치 경로에서 임포트하면 안 된다.
- 크롤 대상은 **DB에 등록된 모든 `Site`**다. 웹에서 사이트를 등록하면 다음 실행에서 자동으로
  크롤된다 — 시크릿을 손대지 않는다.
- `SEARCHOPS_RICHDOC_SITE_IDS`는 **적재(미러링) 대상만** 정한다. 목록 밖 사이트는 크롤은 되지만
  리쥬엘 콘솔로는 안 넘어간다(브리지가 push 전에 거른다). 계약에 적힌 id가 DB에 없으면 배치가 실패한다.
  ⚠️ 예전에는 이 값이 크롤 대상까지 겸해서, 웹에서 등록한 사이트가 영원히 크롤되지 않았다.
- 필요한 secret: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SEARCHOPS_RICHDOC_SUPABASE_URL`,
  `SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY`, `SEARCHOPS_RICHDOC_SITE_IDS`

⚠️ **주기를 함부로 올리지 않는다.** `SeoIssue`의 유니크 키가 `crawlRunId`를 포함해서 크롤 1회마다
이슈와 지시서 세트가 새로 생기고, 리쥬엘 콘솔의 지시서가 실행 횟수에 비례해 쌓인다.
일 1회로 시작하고, 늘리려면 중복 정리 방식을 먼저 정한다.

한 사이트가 실패해도 나머지는 계속 처리하고 마지막에 종료 코드 1로 알린다(설정 누락은 2).
실패한 크롤은 `CrawlRun.status = "failed"`로 남아 콘솔에서 보인다.

API(`apps/api`)는 배포하지 않지만 코드는 그대로 둔다 — 배치가 그 Prisma 계층을 재사용하고,
상시 호스팅을 다시 구하면 그대로 부활한다. `Dockerfile`과 `compose.prod.yaml`도 같은 이유로 남겨둔다.

## richdoc 계약 검증 (배포 플랫폼 불필요)

Purpose:
- richdoc-saas(리쥬엘) 연동 어댑터가 계약 정본 스키마를 실제로 만족하는지, 배포 없이 확인한다.
- 계약 정본은 richdoc-saas 레포의 `supabase/searchops_contract.sql` 하나다. 이 레포에 사본을 만들지 않는다.

로컬 검증 (자격증명 불필요, 로컬 postgres 가동 필요):
1. `corepack pnpm smoke:richdoc`
2. 임시 DB에 계약 SQL을 적용하고, 미니 PostgREST 셰임 위에서 실제 어댑터를 구동해 검증한 뒤 DB를 지운다.
3. 검증 범위: NOT NULL/unique/기본값 등 스키마 적합성, upsert idempotency, 상태·심각도 매핑,
   콘솔 관리 컬럼(`issues.status`, `first_seen`) 비침범, `last_seen` 전진, Site.id allowlist fail-closed.
4. 계약 SQL 경로 기본값은 `../richdoc-saas/supabase/searchops_contract.sql`이다.
   다른 위치면 `--contract <path>` 또는 `RICHDOC_CONTRACT_SQL`로 지정한다.

실연결 검증 (배포 직전 1회):
1. `SEARCHOPS_RICHDOC_SUPABASE_URL`, `SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY`를 설정한다.
2. `node scripts/richdoc-smoke.mjs --live`
3. 마커 도메인 `richdoc-smoke.invalid` 행만 쓰고 종료 시 삭제한다. 눈으로 확인하려면 `--keep`.
4. 실패하면 계약 SQL 미적용, service_role key 오류, RLS 설정 중 하나를 의심한다.

자동 회귀 감지:
- GitHub Actions `richdoc-contract`가 관련 파일 PR·main push·매일 1회 위 로컬 검증을 돌린다.
- richdoc-saas가 private이라 `RICHDOC_REPO_TOKEN` secret(읽기 PAT)이 필요하다.
  미설정 시 잡은 실패 대신 경고를 남기고 건너뛴다.
- 이 워크플로는 Railway 등 배포 플랫폼에 의존하지 않는다. 계약 회귀는 여기서 먼저 드러난다.

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
1. Follow the single order in `PROVISIONING_RUNBOOK.md`: backup/status/key, additive migrate, API, Worker, Web, then backfill dry-run/apply/reconcile.
2. `unmigratedLegacyCredentials` is migration completeness; make it zero without using it as evidence of actual runtime use.
3. Keep `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual` while `observedLegacyFallbacks > 0` or any recent sync reports `credentialSources.*=legacy`.
4. Set both API and Worker to `encrypted` only after migration validation and observed use are zero.
5. Observe exact-organization sync summaries for seven days after cutover. If encrypted mode reports fallback or decryption errors, roll API, Worker, and Web back in that order with both runtimes in `dual`.
6. Plaintext legacy table removal requires a separate destructive approval after the observation window.

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
