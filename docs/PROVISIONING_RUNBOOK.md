# Provisioning Runbook — env 키 목록 & Railway/Vercel/Supabase 설정 절차

> `/ops/readiness`의 "프로비저닝 필요" 항목을 실제로 해결하기 위한 운영 절차서.
> 상위 정책은 [PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md), 수동 런북은 [RUNBOOKS.md](./RUNBOOKS.md) 참조.
> 모든 env 키는 `packages/types/src/index.ts`의 `SearchOpsEnvSchema`(283–314행)에서 검증된 실제 키 이름이다.

## 0. 핵심 원칙 (먼저 읽을 것)

1. **`/ops/readiness`의 초록 배지 = "env 키가 존재함"일 뿐, "기능이 작동함"이 아니다** (`apps/api/src/readiness.ts` `inferStatus`는 존재 여부만 검사). 완료 기준은 배지가 아니라 실제 동작 검증이다.
2. **서비스는 3개**: **API**(Railway), **Worker**(Railway, 별도 서비스), **Web**(Vercel). env는 서비스별로 따로 설정한다.
3. **부팅 필수 2개**: `DATABASE_URL`, `REDIS_URL`은 `.optional()`이 아님 → 없으면 API·Worker **둘 다 부팅 크래시**.
4. **죽은 env(설정해도 무효)**: `SEARCHOPS_GEO_*`, `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`, `SEARCHOPS_ERROR_MONITORING_DSN`, `SEARCHOPS_UPTIME_CHECK_URL`, `*_ACCESS_TOKEN`, `*_SERVICE_ACCOUNT_JSON`, `SEARCHOPS_CMS_API_TOKEN` — 스키마에 없거나 기능 코드가 안 읽음. **설정 금지/무의미**.

---

## 1. 서비스별 env 키 매트릭스

### 1-A. API 서비스 (Railway)

| env 키 | 필수도 | 형식/값 | 효과 (코드 근거) |
|---|---|---|---|
| `DATABASE_URL` | **필수** | Postgres URL (Supabase) | 부팅 필수. 없으면 크래시 (`types index.ts:284`) |
| `REDIS_URL` | **필수** | Redis URL (Railway add-on) | 부팅 필수 + 모든 BullMQ 큐·rate limit backing (`index.ts:33-43`) |
| `NODE_ENV` | **필수** | `production` | rate limit 기본 ON + IdP와 함께 **fail-open 차단** (`index.ts:40,64-65`) |
| `SEARCHOPS_IDP_JWKS_JSON` | **필수**(택1) | Supabase JWKS JSON (**RSA만**) | RS256 검증기 활성화 (`index.ts:54-59`, `auth.ts:366` ES256 거부) |
| `SEARCHOPS_IDP_JWT_HS256_SECRET` | (택1·레거시) | HS256 비밀키 | HS256 검증기 (`index.ts:48-53`) |
| `SEARCHOPS_IDP_ISSUER` | 권장 | `https://<ref>.supabase.co/auth/v1` | 토큰 `iss` 검증 (`auth.ts:333`) |
| `SEARCHOPS_IDP_AUDIENCE` | 권장 | `authenticated` | 토큰 `aud` 검증 (`auth.ts:337-349`) |
| `SEARCHOPS_PUBLIC_APP_URL` | **필수** | Web 정규 https origin (끝 `/` 무관) | OAuth 후 returnTo 리다이렉트 (`server.ts:1842`). 없으면 콜백이 raw JSON 노출 |
| `SEARCHOPS_API_BASE_URL` | 권장 | API 자신의 https origin | connector live-setup 리포트 일관성 (`connector-live-setup.ts:113`) |
| `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID` | OAuth(원자) | Google OAuth client id | GSC/GA4 핸드셰이크 (`connector-live-setup.ts:16-21`) |
| `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET` | OAuth(원자) | client secret | 〃 |
| `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI` | OAuth(원자) | http(s) 절대 URL, Google Console과 **정확히 일치** | 〃 (`connector-live-setup.ts:176-190`) |
| `SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET` | OAuth(원자) | **16자 이상** 난수 | 〃 (`connector-live-setup.ts:192-205`) |
| `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL` | 권장 | http(s) URL | **alert-routing + error-monitoring-uptime 동시 충족** (`index.ts:75-81`, `readiness.ts:340`) |
| `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_TOKEN` | 선택 | Bearer 토큰 | 위 웹훅 인증 |
| `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL` / `_TOKEN` | 선택(저가치) | http(s) URL | 메트릭 log drain (`index.ts:68-74`) |
| `SEARCHOPS_RATE_LIMIT_ENABLED` | 선택 | `true`/`false` | 기본: prod=ON (`index.ts:40`) |
| `SEARCHOPS_RATE_LIMIT_MAX` / `_WINDOW_MS` | 선택 | 정수 | 기본 120 / 60000 (`index.ts:111-112`) |
| `SEARCHOPS_CMS_WEBHOOK_SECRETS` | defer | **JSON object 문자열** (provider→secret) | CMS 웹훅 서명검증. 잘못 넣으면 전 웹훅 401 |
| `SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL` / `_TOKEN` | defer | http(s) URL | restore drill dispatch (`index.ts:82-88`) |
| `SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL` / `_TOKEN` | defer | http(s) URL | secret rotation dispatch (`index.ts:89-95`) |
| `PORT` / `SEARCHOPS_API_HOST` | 자동 | Railway가 PORT 주입 | `index.ts:97-98` (보통 손댈 필요 없음) |

### 1-B. Worker 서비스 (Railway · API와 별도 서비스)

| env 키 | 필수도 | 형식/값 | 효과 (코드 근거) |
|---|---|---|---|
| `DATABASE_URL` | **필수** | API와 동일 | 부팅 필수 (`worker/index.ts:11`) |
| `REDIS_URL` | **필수** | **API와 같은 인스턴스** | 큐 공유 (`worker/index.ts:12-27`) |
| `NODE_ENV` | 권장 | `production` | 일관성 |
| `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID` | live sync | API와 동일 값 | connector sync live 처리 (`worker/index.ts:18`) |
| `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET` | live sync | API와 동일 값 | 〃 (`worker/index.ts:19`) |
| `SEARCHOPS_GA4_PROPERTY_ID` | live sync | **숫자만** (`^\d+$`, G-… 아님) | GA4 sync (`worker/index.ts:17`, 검증 `connector-live-setup.ts:277`) |
| `SEARCHOPS_PAGESPEED_API_KEY` | live sync | Google API key | PageSpeed sync (`worker/index.ts:21`) |
| `SEARCHOPS_BING_API_KEY` | defer | Bing Webmaster key | Bing sync (`worker/index.ts:16`) |

> ⚠️ **워커 live 모드 전환**: 위 5개 중 **아무거나 1개라도** 설정되면 워커 connector sync가 전체 live 모드로 바뀐다(`worker/index.ts:65-72`). 그리고 Google OAuth가 **부분 설정**(quad 중 일부만)이면 live 게이트가 **blocked**된다(`connector-live-setup.ts:430-447`). → Google 키는 반드시 **원자적으로(4개 한 번에)** 넣을 것.

### 1-C. Web 서비스 (Vercel)

| env 키 | 필수도 | 형식/값 | 효과 |
|---|---|---|---|
| `SEARCHOPS_API_BASE_URL` | **필수** | Railway API https origin | 없으면 web이 데모 모드로 빠짐 (`apps/web/src/api-base-url.ts`) |
| `SEARCHOPS_PUBLIC_APP_URL` | **필수** | Web 정규 origin (API와 동일 값) | OAuth returnTo 생성 (`connectors/page.tsx:487-493`) |
| `NEXT_PUBLIC_SUPABASE_URL` | 로그인 구현 시 | `https://<ref>.supabase.co` | ⚠️ 아직 스키마에 없음 — 로그인 UI 구현과 함께 추가 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 로그인 구현 시 | Supabase anon key | 〃 |

---

## 2. 단계별 설정 절차

### Phase 0 — DB 부팅 기반 (Supabase)
1. Supabase 프로젝트(서울)에서 connection string 확보. **단일 `DATABASE_URL`만 쓰므로**(스키마에 `directUrl` 없음, `schema.prisma:8`) **Session Pooler(5432)** 또는 직접 연결 문자열을 사용한다. Transaction pooler(6543)는 Prisma migrate와 호환 문제 → 피한다.
2. 운영 DB에 마이그레이션 적용 (로컬/CI에서 운영 `DATABASE_URL`로):
   ```bash
   DATABASE_URL=<prod> pnpm db:migrate:deploy
   DATABASE_URL=<prod> pnpm db:seed
   DATABASE_URL=<prod> pnpm db:migrate:status   # 검증
   ```
3. ⚠️ seed가 만드는 `phaseOneSeedIds`(org_demo)는 Phase 2 전까지 fail-open 상태에서 기본 신원이 된다 → Phase 2를 빨리 닫을 것.

### Phase 1 — Redis (Railway)
1. Railway에 Redis plugin 추가. eviction policy = **`noeviction`** (BullMQ 요구, CHECKLIST:40).
2. API·Worker 두 서비스에 reference variable로 주입: `REDIS_URL=${{Redis.REDIS_URL}}`.
3. 두 서비스 재배포 → 로그 `SearchOps API listening` / `SearchOps worker listening` 확인.

### Phase 2 — 실제 인증 (Supabase Auth) + 🔴 fail-open 차단
1. Supabase Auth 활성화, 로그인 provider(이메일/OAuth) 설정.
2. **custom access token hook**(Postgres 함수)으로 JWT에 클레임 주입: `sub`, `email`, `organization_id`, `role`. **`role`은 반드시** `admin|editor|owner|system|viewer` 중 하나(`AuthRoleSchema`).
3. JWKS 확보: `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` → **RSA(RS256)인지 확인**.
   - RSA면 → `SEARCHOPS_IDP_JWKS_JSON`에 JSON 전체, `SEARCHOPS_IDP_ISSUER=https://<ref>.supabase.co/auth/v1`, `SEARCHOPS_IDP_AUDIENCE=authenticated`.
   - 레거시 공유 HS256면 → `SEARCHOPS_IDP_JWT_HS256_SECRET`. (ES256은 검증기가 거부)
4. **fail-open 차단 = env 2개 동시 충족(코드 변경 불필요)**:
   - `NODE_ENV=production` **그리고** IdP env 설정 → `index.ts:60-67`이 `allowMockFallback=false`, `allowTrustedHeaders=false`로 리졸버 생성 → `x-mock-*`/`x-searchops-idp-*` 사칭·익명 admin 차단.
   - ⚠️ 둘 중 **하나만** 설정하면 안 닫힘: IdP만 있고 NODE_ENV≠production이면 mock fallback 유지, NODE_ENV만 production이고 IdP 없으면 `index.ts:44`가 resolver를 undefined로 만들어 `server.ts:287` fail-open으로 빠진다.
5. **단, 코드 작업 1건 동반 필수**: Web에 로그인 UI + 모든 API 요청에 `Authorization: Bearer <jwt>` 전달 구현(현재 없음). fail-open을 닫으면 토큰 없는 요청은 전부 401 → 로그인 구현과 **같은 배포로 함께** 나가야 앱이 안 깨진다.
6. 검증: 두 조직/두 사용자 스모크 계정으로 ① 교차 조직 접근 차단 ② viewer write 차단 ③ 로그인 라운드트립 성공 확인.

### Phase 3 — 도메인/정규 URL (Vercel)
1. Vercel 커스텀 도메인 추가 → 레지스트라에 DNS 레코드(서브도메인 CNAME→cname.vercel-dns.com) → HTTPS 자동 발급(전파 대기).
2. `SEARCHOPS_PUBLIC_APP_URL`(=Web origin)과 `SEARCHOPS_API_BASE_URL`(=Railway API origin)을 **Vercel(Web)과 Railway(API) 양쪽 동일**하게 설정.
3. Web 재배포 + API 재시작.

### Phase 4 — 관측/알림
1. Slack/Discord/webhook 등 알림 수신 URL을 `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL`(API)에 설정 → **alert-routing + error-monitoring-uptime 동시 해결**.
2. **실질 다운 감지는 env가 아님**: 외부 uptime 모니터(예: Better Stack/UptimeRobot)를 API `GET /health`에 연결. (내부 알림은 `/ops/metrics-export` 호출 시점에만 발동 = fire-on-read)

### Phase 5 — Google 커넥터 (GSC + GA4 + keyword discovery)
1. Google Cloud 프로젝트 생성 → **Search Console API + Analytics Data API + PageSpeed Insights API** 사용 설정.
2. OAuth consent screen 구성 → **OAuth 2.0 Web 클라이언트** 생성 → CLIENT_ID/SECRET 확보.
3. Authorized redirect URI = API OAuth 콜백 URL. 이 값을 `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI`에 **정확히 동일**하게.
4. `SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET` = `openssl rand -hex 32`(16자 이상).
5. **API 서비스**에 quad 4개 + **Worker 서비스**에 CLIENT_ID/SECRET + `SEARCHOPS_GA4_PROPERTY_ID`(숫자) + (Phase 6) PageSpeed.
6. ⚠️ 연결은 **테넌트별 UI OAuth 흐름**으로 완료해야 실데이터가 들어온다(env만으로는 readiness만 초록, 데이터 0).

### Phase 6 — PageSpeed
1. Google Cloud에서 API key 생성 → `SEARCHOPS_PAGESPEED_API_KEY`를 **Worker**에 설정.
2. Google OAuth quad 완료 **후** 추가(부분 quad 상태에서 추가하면 워커 게이트 blocked).

### Defer (출시 후)
- `SEARCHOPS_BING_API_KEY`(Worker), `SEARCHOPS_CMS_WEBHOOK_SECRETS`(API) — 고객 수요 시.
- `SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL`, `SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL` — 수신 리시버 없음 → 출시는 RUNBOOKS.md 수동 절차.
- `geo-live-providers`, `rich-result-live-validator` — **엔지니어링 필요**(env 스키마 미존재). env만 넣어도 무효.
- `organization-invite` — 하드코딩 manual_followup. `canLaunch=false`를 묶고 있으므로 코드 전환 필요(MVP는 수동 멤버십 seed).

---

## 3. 출시 전 최종 검증 체크리스트
- [ ] API·Worker 둘 다 정상 부팅 (DATABASE_URL/REDIS_URL OK)
- [ ] `NODE_ENV=production` + IdP env → 익명 요청이 401, `x-mock-*` 헤더 사칭 차단됨을 실제 호출로 확인
- [ ] Web 로그인 → Bearer 전달 → 보호 라우트 접근 라운드트립 성공
- [ ] 커스텀 도메인 HTTPS + `PUBLIC_APP_URL`/`API_BASE_URL` 양쪽 일치
- [ ] 알림 웹훅 + 외부 `/health` uptime 모니터 동작
- [ ] (선택) Google OAuth: 사이트 1개 OAuth 완료 후 GSC 단독 sync 성공
- [ ] `/ops/readiness` & `/ops/productization`에서 launch-blocking 0 확인 (단, 죽은 env로 초록 만들지 말 것)
