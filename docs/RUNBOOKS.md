# RUNBOOKS.md

Operational runbooks for SearchOps AI production hardening. These procedures are deployment-facing and must not change deterministic SEO/AEO/GEO/compliance package behavior.

## Database Backup And Restore

Purpose:
- Protect PostgreSQL data before migrations, deploys, and incident response work.
- Prove backups are restorable before treating them as safe.

Automation endpoint:
- `GET /ops/backup-restore-drill-plan?environment=<name>` returns the deterministic drill checklist and commands for the target environment.
- `POST /ops/backup-restore-drill-runs` dispatches the drill plan to the configured deployment restore scheduler. It accepts `environment` and `dryRun`.

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
- `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL` and optional token when metrics exports should post to a provider log drain.
- `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL` and optional token when operational alerts should post to a provider alert route.
- `SEARCHOPS_IDP_JWT_HS256_SECRET`, optional issuer, and optional audience when the API verifies HS256 bearer tokens directly.
- `SEARCHOPS_IDP_JWKS_JSON`, optional issuer, and optional audience when the API verifies RS256/JWKS bearer tokens directly.
- `SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL` and optional token when restore drills are scheduled by an external executor.
- `SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL` and optional token when secret rotations are executed by an external secret manager workflow.
- Provider credentials only in deployment secret storage, never in fixtures or committed files.
- External IdP verification can happen before traffic reaches the API through trusted `x-searchops-idp-*` claims, or inside the API runtime with the configured HS256 or RS256/JWKS bearer-token verifier.

Pre-deploy checks:
1. Run `corepack pnpm verify` on the release commit.
2. Run `corepack pnpm db:migrate:status`.
3. Confirm Redis connectivity for BullMQ queues and rate-limit storage if enabled.
4. Confirm CMS webhook secrets are provider-scoped and rotated through the deployment secret manager.
5. Confirm `/health`, `/metrics`, and `/ops/metrics-export` are reachable from the operations network.
6. Confirm tenant-scoped API calls deny cross-tenant access.
7. Confirm incomplete `x-searchops-idp-*` claim sets fail before route side effects.

Post-deploy checks:
1. Trigger a fixture-safe crawl or runtime smoke test in a non-production tenant.
2. Confirm worker queues consume jobs and dead-letter queues remain empty.
3. Confirm `/ops/metrics-export` reports request counters and zero unexpected alerts.
4. Confirm CMS webhook signature failures return `401` before side effects.

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

If Redis eviction warnings continue:
1. Prefer a Redis provider or plan that supports `noeviction`.
2. If the provider does not allow `CONFIG SET maxmemory-policy noeviction`, move BullMQ to a Redis deployment that does.
3. Keep rate-limit counters and BullMQ queues separate if an edge/provider cache requires volatile eviction policies.
4. Record the Redis provider, plan, region, and eviction policy in deployment notes.

## 자사 데이터 커넥터 설정 점검

목적:
- GSC/PageSpeed 정상 동작은 유지하면서 GA4, Bing, CMS 문제를 코드 장애와 설정 문제로 구분한다.
- 커넥터 화면에서 provider를 하나씩 실행해 어느 연결이 막히는지 바로 확인한다.

공통 확인:
1. worker 런타임에서 live connector를 켠 상태인지 확인한다. API/worker readiness에서 live provider credential 항목을 함께 본다.
2. 커넥터 화면에서 `GA4만 실행`, `Bing만 실행`, `CMS만 실행` 버튼으로 provider별 재실행을 먼저 한다.
3. `setup_required`는 아직 설정이 없다는 뜻이다. 장애로 처리하지 말고 아래 설정을 완료한 뒤 해당 provider만 다시 실행한다.
4. `failed`는 provider API가 실제로 거절한 상태다. summary의 `providerErrors.<provider>.code`, `operatorMessage`, `nextAction`을 우선 확인한다.

GA4:
1. Railway worker에 `SEARCHOPS_GA4_PROPERTY_ID`를 설정한다.
2. 값은 GA4 관리 > 속성 세부정보에 있는 숫자 Property ID다. `G-...` 측정 ID나 `GTM-...` 컨테이너 ID를 넣으면 안 된다.
3. API 런타임에는 `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID`, `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET`, `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI`, `SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET`이 필요하다.
4. OAuth로 연결한 Google 계정을 GA4 관리 > 속성 액세스 관리에 추가한다. 최소 권한은 뷰어, 운영 분석까지 보려면 분석가 권한을 권장한다.
5. `ga4_property_id_invalid`가 나오면 `SEARCHOPS_GA4_PROPERTY_ID`가 잘못된 것이다.
6. `ga4_property_access_denied`가 나오면 Property ID 형식은 통과했지만 OAuth Google 계정이 해당 GA4 속성에 접근하지 못한다. 권한을 추가한 뒤 OAuth를 다시 연결하고 GA4만 재실행한다.

Bing:
1. Bing Webmaster Tools > API Access에서 API Key를 발급한다.
2. Railway worker 환경변수 `SEARCHOPS_BING_API_KEY`에 저장하고 worker를 재배포한다.
3. `bing_api_key_missing`은 환경변수가 비어 있는 상태다.
4. `bing_invalid_api_key` 또는 `InvalidApiKey`는 코드 문제가 아니라 Bing Webmaster API Key가 틀렸거나 폐기된 상태다. 새 키로 교체한 뒤 Bing만 재실행한다.
5. `bing_service_unavailable` 또는 503 HTML 응답은 API Key 문제가 아니라 Bing Webmaster API/중간 게이트웨이의 일시 장애 가능성이 높다. 5-10분 뒤 Bing만 재실행하고, 반복되면 Bing Webmaster Tools 상태와 Railway outbound 네트워크를 확인한다.

CMS:
1. 현재 live CMS fetch connector는 미구성 상태다. 이 상태는 `failed`가 아니라 `setup_required`로 본다.
2. CMS 데이터를 자동 반영하려면 `SEARCHOPS_CMS_WEBHOOK_SECRETS`를 provider별 JSON object로 설정하고 CMS webhook을 연결한다.
3. WordPress, Webflow, generic headless CMS webhook payload는 connector boundary에서 정규화된다.
4. CMS API에서 직접 live fetch가 필요하면 provider-specific CMS adapter를 추가한 뒤 CMS만 재실행한다.

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

Rules:
- Dead-letter entries intentionally omit raw customer/provider payloads.
- Replay requires queue-specific payload reconstruction from source-of-truth data.
- Queue-specific replay uses deterministic replay job IDs, so repeated operator requests target the same replay job identity.
- Replay planning must not clear the dead-letter entry.
- Replay execution may clear the dead-letter entry only after enqueue succeeds and `removeDeadLetterJob` is true.
