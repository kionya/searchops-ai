# Provisioning Runbook

이 문서는 SearchOps AI의 Web(Vercel), API(Railway), Worker(Railway), PostgreSQL/Auth(Supabase)를 실제 운영에 배치할 때 사용하는 절차다. 모든 예시는 합성 값이며 실제 secret, 고객 ID, token을 파일, 문서, 스크린샷, Git에 남기지 않는다.

## 1. 먼저 구분할 것

- 플랫폼 readiness: DB, Redis, IdP, Google OAuth 앱, encryption keyring처럼 서비스가 부팅하고 암호화 credential을 처리하기 위한 설정이다.
- 조직/사이트 readiness: 조직의 `ProviderAccount`와 사이트의 `SiteConnector` 상태다. GSC 속성, GA4 Property ID, Bing 고객 key/resource, GEO BYOK는 여기에 속한다.
- 로컬 `corepack pnpm check:connector-live`는 DB를 조회하지 않고 runtime/platform env만 검사한다.
- 인증된 `GET /ops/readiness`는 검증된 user principal의 `organizationId`로만 tenant snapshot을 조회한다. 요청 query/body로 다른 조직을 지정할 수 없다.
- API/Worker는 동일한 `SEARCHOPS_CREDENTIAL_STORAGE_MODE`와 active/previous encryption keyring을 사용한다. Vercel에는 encryption key를 절대 넣지 않는다.

## 2. 서비스별 env 배치

### Vercel Web

아래 값만 Web 프로젝트의 Production 환경에 넣는다. Supabase publishable key는 브라우저 공개를 전제로 한 값이며 service-role key가 아니다.

<!-- VERCEL_ENV_BEGIN -->
- `SEARCHOPS_API_BASE_URL=https://api.searchops.example`
- `SEARCHOPS_PUBLIC_APP_URL=https://app.searchops.example`
- `NEXT_PUBLIC_SUPABASE_URL=https://project-ref.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_example`
<!-- VERCEL_ENV_END -->

Vercel에는 `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, credential encryption keyring, Google client secret/state secret, provider API key, 고객 token, GA4 Property ID, Bing key를 넣지 않는다. `turbo run build` 또는 Vercel build가 이 server-only 값들을 요구한다면 Web 설정으로 우회하지 말고 build dependency를 수정한다. Vercel이 관리하는 production runtime을 사용하므로 `NODE_ENV`도 수동으로 덮어쓰지 않는다.

### Railway API

<!-- RAILWAY_API_ENV_BEGIN -->
필수 runtime:

- `NODE_ENV=production`
- `DATABASE_URL`: Supabase runtime PostgreSQL URL
- `REDIS_URL`: API와 Worker가 공유하는 Railway Redis URL
- `SEARCHOPS_API_BASE_URL=https://api.searchops.example`
- `SEARCHOPS_PUBLIC_APP_URL=https://app.searchops.example`

Supabase IdP:

- `SEARCHOPS_IDP_JWKS_JSON`: Supabase JWKS JSON 전체
- `SEARCHOPS_IDP_ISSUER=https://project-ref.supabase.co/auth/v1`
- `SEARCHOPS_IDP_AUDIENCE=authenticated`
- 레거시 HS256 프로젝트만 `SEARCHOPS_IDP_JWT_HS256_SECRET`을 JWKS 대신 사용

Provider credential storage:

- `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual` 또는 cutover 후 `encrypted`
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID=prod-v1`
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY`: 32-byte base64 값
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON={}` 또는 rotation 중 이전 key map

Google OAuth 앱:

- `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID`
- `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET`
- `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI=https://api.searchops.example/connectors/google/oauth/callback`
- `SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET`

선택 API-owned secret:

- `SEARCHOPS_CMS_WEBHOOK_SECRETS`
- `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL`, `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_TOKEN`
- `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL`, `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_TOKEN`
- `SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL`, `SEARCHOPS_RESTORE_DRILL_WEBHOOK_TOKEN`
- `SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL`, `SEARCHOPS_SECRET_ROTATION_WEBHOOK_TOKEN`
<!-- RAILWAY_API_ENV_END -->

`NODE_ENV=production`은 개발용 mock/trusted-header fallback을 허용하지 않는 배포 경계이며 production rate limiting 기본값도 활성화한다. 단, IdP verifier가 함께 설정되어야 실제 bearer token을 검증할 수 있다.

### Railway Worker

<!-- RAILWAY_WORKER_ENV_BEGIN -->
필수 runtime:

- `NODE_ENV=production`
- `DATABASE_URL`: API와 같은 Supabase 데이터베이스
- `REDIS_URL`: API와 같은 Redis 인스턴스
- `SEARCHOPS_CREDENTIAL_STORAGE_MODE`: API와 같은 값
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID`: API와 같은 값
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY`: API와 같은 값
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON`: API와 같은 값

Google refresh 앱:

- `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID`: API와 같은 OAuth client
- `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET`: API와 같은 OAuth client secret

선택 SearchOps-funded 플랫폼 key:

- `SEARCHOPS_PAGESPEED_API_KEY`
- `SEARCHOPS_GEO_CHATGPT_API_KEY`
- `SEARCHOPS_GEO_CLAUDE_API_KEY`
- `SEARCHOPS_GEO_GEMINI_API_KEY`
- `SEARCHOPS_GEO_PERPLEXITY_API_KEY`

선택 Worker-only adapter 설정:

- `SEARCHOPS_GEO_CHATGPT_MODEL`
- `SEARCHOPS_GEO_CLAUDE_MODEL`
- `SEARCHOPS_GEO_GEMINI_MODEL`
- `SEARCHOPS_GEO_PERPLEXITY_MODEL`
- `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`
- `SEARCHOPS_RICH_RESULT_VALIDATOR_TOKEN`
<!-- RAILWAY_WORKER_ENV_END -->

Worker에 사이트별 GSC 속성, GA4 Property ID, Bing 고객 key, 고객 Google token, 조직 GEO BYOK를 넣지 않는다. Worker는 각 job의 `organizationId`와 `siteId`로 encrypted `ProviderAccount`/`SiteConnector`를 조회한다.

### Supabase

- PostgreSQL database와 Auth를 소유한다.
- runtime용 `DATABASE_URL`과 migration용 `DIRECT_DATABASE_URL`을 운영자에게 제공한다. migration 실행 환경에서만 두 값을 주입한다.
- JWKS, issuer, audience를 Railway API의 IdP verifier에 제공한다.
- custom access token hook은 표준 `role=authenticated`를 유지하고 top-level `organization_id`, `user_role`, `sub`, `email`을 발급한다. `user_role`은 `owner|admin|editor|viewer|system` 중 하나다.
- Prisma migration의 적용 주체는 운영 deploy 절차다. Vercel Web이 migration을 실행하지 않는다.
- Worker runtime secret을 일반 테이블에 평문 저장하지 않는다. 예외는 AES-256-GCM으로 암호화된 `ProviderAccount` payload와 비밀이 아닌 connector metadata뿐이다.

## 3. DB와 Redis를 어디에 넣는가

1. Supabase에서 runtime connection URL을 준비해 Railway API와 Worker의 `DATABASE_URL`에 각각 설정한다.
2. migration 명령을 실행하는 운영자 환경에는 migrate-compatible direct/session URL을 `DIRECT_DATABASE_URL`로 주입한다.
3. Railway Redis를 생성하고 같은 reference variable을 API와 Worker의 `REDIS_URL`에 설정한다.
4. Redis eviction policy가 BullMQ에 맞는 `noeviction`인지 확인한다.
5. Web/Vercel에는 DB와 Redis URL을 넣지 않는다.

`DATABASE_URL`이 없으면 API와 Worker가 PostgreSQL을 사용할 수 없고, `REDIS_URL`이 없으면 API queue/rate-limit와 Worker BullMQ가 같은 작업 흐름을 공유할 수 없다. 두 값은 Railway의 두 서비스에 각각 저장해야 하며 한 서비스에만 넣는 것으로는 충분하지 않다.

## 4. Production rollout 순서

아래 순서는 변경하지 않는다. 각 단계의 증거를 기록한 뒤 다음 단계로 이동한다.

### 4.1 Backup과 status

1. Supabase의 복구 가능한 backup을 생성한다.
2. 별도 scratch DB restore 검증이 성공해야 한다.
3. release commit과 현재 migration 상태를 기록한다.

```bash
corepack pnpm db:migrate:status
```

Backup/restore 증거가 없으면 이후 migration, backfill, cutover를 실행하지 않는다.

### 4.2 Initial encryption key

최초 rollout에서만 운영자 terminal로 다음 명령을 실행한다.

```bash
openssl rand -base64 32
```

출력을 파일로 저장하지 않고 Railway API와 Worker의 `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` secret 입력란에 직접 같은 값으로 붙여 넣는다. 문서, 메모, 스크린샷, shell history 공유, Git, Vercel에는 넣지 않는다. 두 서비스에 같은 active key ID, key material, previous-key JSON, `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual`을 설정한다. 이 단계는 routine/emergency rotation이 아니다.

### 4.3 Additive migrate

평문 필드를 삭제하지 않는 additive migration만 적용한다.

```bash
corepack pnpm db:migrate:deploy
corepack pnpm db:migrate:status
```

### 4.4 API 배포

새 schema를 읽고 `dual` read/write를 제공하는 API를 먼저 배포한다. Health, verified user auth, exact-tenant readiness snapshot, keyring semantic validation을 확인한다.

### 4.5 Worker 배포

같은 `dual` mode/keyring을 가진 Worker를 다음에 배포한다. Queue 소비, tenant credential resolution, refresh, `credentialSources` summary 기록을 확인한다.

### 4.6 Web 배포

마지막으로 Web을 배포한다. Vercel에는 browser-safe 값만 있는지 확인하고 ProviderAccount/SiteConnector UI와 user-principal `/ops/readiness` 호출을 확인한다.

### 4.7 Backfill dry-run, apply, reconcile

API, Worker, Web 배포가 모두 확인된 뒤에만 실행한다. 각 실행의 대상, 성공, skip, failure 수를 기록한다.

```bash
corepack pnpm credentials:migrate -- --dry-run
corepack pnpm credentials:migrate -- --apply --batch-size=100
corepack pnpm credentials:migrate -- --dry-run
```

마지막 dry-run은 reconcile 증거다. 인증된 `/ops/readiness`의 `unmigratedLegacyCredentials`도 0이어야 한다.

### 4.8 Validate

```bash
corepack pnpm check:connector-live
corepack pnpm check:connector-live -- --deployment --api-env-file=scripts/dev/api.env.example --worker-env-file=scripts/dev/worker.env.example --json
```

CLI는 DB-free platform 검사이며 API/Worker 파일을 합치지 않는다. 실제 운영 값은 Railway secret에서 주입하고 파일, 문서, 스크린샷, Git에 남기지 않는다. 조직별 GSC/GA4/Bing과 migration 상태는 verified owner/admin user로 `/ops/readiness`와 `/ops/integrations`에서 확인한다. `unmigratedLegacyCredentials`는 이관 잔량이고 `observedLegacyFallbacks`는 정확한 조직의 문서화된 관측 창에서 실제 사용된 legacy credential 수다.

두 개 이상의 서로 다른 사이트로 GSC/GA4 resource 격리, Bing account/resource, GEO BYOK 우선순위, PageSpeed 플랫폼 key를 검증한다. Backfill 잔량 0만으로 cutover를 승인하지 않는다.

### 4.9 Encrypted cutover

`unmigratedLegacyCredentials=0`이고 현재 관측 범위의 `observedLegacyFallbacks=0`인 상태에서 API와 Worker의 `SEARCHOPS_CREDENTIAL_STORAGE_MODE=encrypted`를 함께 변경한다. API, Worker, Web 순서로 재배포하고 각 단계에서 health/auth/queue/readiness를 확인한다.

### 4.10 Seven-day zero-observed-legacy

Encrypted cutover 뒤 최소 7일 동안 `observedLegacyFallbacks=0`, refresh error 0, decryption error 0을 관찰한다. 관측 창은 정확한 조직의 `ConnectorSyncRun.summary.credentialSources`를 기준으로 하며 malformed summary는 readiness 근거로 사용하지 않는다.

### 4.11 Separate destructive approval

7일 증거가 완료되어도 legacy table/read path를 자동 삭제하지 않는다. 별도 contract migration 계획, 별도 코드 리뷰, backup 재확인, 운영자 명시 승인이 모두 있어야 destructive SQL을 실행할 수 있다.

## 5. Rollback

Encrypted cutover에서 decryption, refresh, 또는 미이관 credential 문제가 발생하면 API와 Worker를 함께 `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual`로 되돌리고 API, Worker, Web 순서로 재배포한다. Previous key를 제거하지 말고 backup과 오류 metadata를 보존한 상태에서 backfill과 readiness를 다시 검사한다.

## 6. Key lifecycle

### Routine key rotation

정상적인 주기 교체에서는 새 active key를 API/Worker에 함께 추가하고 기존 active key를 previous map으로 옮긴 뒤 다음 순서로 재암호화한다.

```bash
corepack pnpm credentials:rotate -- --dry-run
corepack pnpm credentials:rotate -- --apply --batch-size=100
corepack pnpm credentials:rotate -- --dry-run
```

Reconcile과 API/Worker parity가 확인될 때까지 previous key를 제거하지 않는다.

### Emergency key rotation

노출 가능성이 있으면 affected provider token/API key를 provider에서 먼저 revoke/reissue한다. 그 다음 새 encryption key를 API/Worker에 함께 배포하고 위 rotate dry-run/apply/reconcile을 실행한다. 암호화 key rotation만으로 이미 노출된 provider credential을 무효화할 수는 없다. 사고 기록과 별도 보안 승인을 남긴다.

## 7. Legacy env의 임시 범위

`SEARCHOPS_GA4_PROPERTY_ID`, `SEARCHOPS_BING_API_KEY`, `SEARCHOPS_GSC_ACCESS_TOKEN`, `SEARCHOPS_GA4_ACCESS_TOKEN`, `SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON`, `SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON`은 `dual` migration 기간의 기존 fallback 입력으로만 간주한다. 새 고객/사이트 설정에는 사용하지 않는다. 모든 대상이 encrypted account/site binding으로 이관되고 7일 zero-legacy 관찰을 통과한 뒤 별도 승인된 contract migration에서 제거한다.
