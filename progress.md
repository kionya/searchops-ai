# SearchOps AI Progress

> 이 문서 위쪽은 **운영 배포·프로비저닝 진행상황**(최신), 아래쪽은 **제품 빌드 로그(Phase 0–11)**.

---

## 🚀 운영 배포 · 프로비저닝 진행상황

Updated: 2026-06-23
Live: web = https://searchops.totopapa.com (+ https://searchops-ai-web.vercel.app) · api = https://searchops-api-production.up.railway.app

> 🔴 **ACTION REQUIRED (2026-06-23)**: PR #80(org-invite) 머지로 코드는 배포됐으나 **운영 DB에 Invitation 테이블 미생성** → 초대 라우트 4종 현재 500. Railway는 마이그레이션을 **자동 적용하지 않음**(확정). 수동 적용 필요:
> ```bash
> cd ~/searchops-ai
> DATABASE_URL='<Railway API의 DATABASE_URL, Supabase session pooler :5432>' corepack pnpm db:migrate:deploy
> ```
> 검증: `POST /invites/<아무token>/accept` → 404(`Invitation not found`)면 성공. (나머지 API·기능은 정상; 초대 라우트만 영향.)

### 현재 운영 상태 (한눈에)

| 구성요소 | 상태 |
|---|---|
| DB (Supabase, 서울) | ✅ 연결·마이그레이션 적용 |
| Redis (Railway, noeviction) | ✅ 연결 |
| API 엔진 (Railway) | ✅ 가동 (`/health` 200) |
| Worker 엔진 (Railway) | ✅ 가동 (Active) |
| 웹사이트 (Vercel) | ✅ 가동 + API 실시간 연결 |
| 인증/보안 | ✅ `NODE_ENV=production` + HS256 IdP → 익명/사칭 차단(fail-open 닫힘) |

**/ops/readiness 실측 (2026-06-23):** 전체 **41** / 설정됨 **26** / 프로비저닝 필요 **6** / 수동 후속 **9** — 배지 "API 데이터". (A: alert-routing·error-monitoring-uptime(22→24) · B: production-domain(24→25) · C: organization-invite(25→26, manual_followup→configured)) — C의 rich-result/GEO/log-drain은 코드 배선 완료지만 readiness 배지는 **운영 env 설정 시** configured로 전환(현재 6개 프로비저닝필요에 포함).

### 완료한 작업 (이번 배포 사이클)

1. **Phase 0 — DB**: Supabase 연결 + `prisma migrate deploy`(15개) + seed. 로컬 Docker로 동일 파이프라인 리허설 후 운영 적용.
2. **Phase 1 — Redis**: Railway Redis(noeviction) 연결, API·Worker 양쪽 부팅 확인.
3. **인증/보안**: `NODE_ENV=production` + `SEARCHOPS_IDP_JWT_HS256_SECRET` → mock/trusted-header fallback 차단(`/ops/*` 401로 확인).
4. **웹↔API 연결 (PR #75 머지)**: `apps/web/src/api-client.ts`(`apiFetch` + HS256 서비스 토큰 자동 발급) 추가, 16개 모듈 **37곳** `fetch`→`apiFetch`, `/ops/readiness`·`/ops/productization`·`/ops/observability` `force-dynamic`. typecheck/lint/build 통과.
5. **Vercel web env**: `SEARCHOPS_API_BASE_URL` + `SEARCHOPS_IDP_JWT_HS256_SECRET` 설정. (실수로 넣었던 `NODE_ENV`/`DATABASE_URL` 제거 → 빌드 복구)
6. **결과**: `/ops/readiness` "데모 데이터" → "API 데이터" 전환 확인.
7. **A안 — 알림 + 에러/가동 모니터링 (PR #76 머지, 2026-06-22)**:
   - `apps/web/app/api/ops/alert-sink/route.ts` 인증 sink(Bearer 상수시간 검증·로깅·200) + `.github/workflows/ops-heartbeat.yml`(5분: `/health` 다운 감지 → 실패 시 GitHub 알림 + HS256 단명 토큰으로 `/ops/metrics-export` 호출해 **fire-on-read** 구동).
   - 설정: Vercel `SEARCHOPS_OPS_ALERT_SINK_TOKEN` / Railway `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL`(+`_TOKEN`) / GH repo secret `SEARCHOPS_IDP_JWT_HS256_SECRET`(searchops-ai).
   - 검증: readiness `alert-routing`+`error-monitoring-uptime` **configured**(22→24), sink `GET` 200·잘못된 토큰 401, 워크플로 수동 실행 성공(`health=200 metrics-export=200`).
   - ⚠️ 미검증 1건: 실제 알림 1회 전달(= Railway `_TOKEN` ↔ Vercel `SINK_TOKEN` 일치). 불일치 시 첫 실알림에서 sink 401 → `/ops/metrics-export` 500 → 워크플로 실패로 드러남(self-detecting). 두 값이 동일하면 정상.
   - 보너스: main이 **클린 빌드에서 실패하던** `next/script` 타입 잠복버그(Vercel `NODE_ENV=production` 설치 + Turbo 캐시로 가려져 있던 것)를 `apps/web/next.config.mjs`에서 함께 수정(배포 빌드 타입/린트 재검사 off; CI `verify`가 게이트).
8. **B안 — 커스텀 도메인 연결 (2026-06-22)**:
   - 웹 대시보드 `https://searchops.totopapa.com` 연결 (Cloudflare CNAME `searchops`→`cname.vercel-dns.com`, **DNS only/회색 구름** + Vercel 프로젝트 도메인 추가 + HTTPS 자동 발급).
   - `SEARCHOPS_PUBLIC_APP_URL=https://searchops.totopapa.com`을 **Vercel + Railway 양쪽** 설정 → 웹 재배포로 적용.
   - 검증: HTTPS(HTTP/2, 유효 인증서, icn1 서울 엣지) · `/api/ops/alert-sink` 200 · `/ops/readiness` 200, readiness `production-domain` **configured**(24→25).
   - API는 도메인 변경 불필요 확인(웹→API 서버-투-서버, CORS 없음; `SEARCHOPS_API_BASE_URL`·Google OAuth redirect 불변).
9. **C안 — 나머지 프로비저닝 dead-env 제거 (PR #77·#78·#79·#80 머지, 2026-06-23)**:
   - **#77 rich-result**: `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`(+`_TOKEN`) env 스키마 + connectors `createHttpSchemaRichResultValidatorClient` + worker 배선. (배포 시 URL을 API+Worker 양쪽 필수.)
   - **#78 log-drain**: `apps/web/app/api/ops/log-drain-sink` 인증 self-host sink. (`SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`=Railway `..._LOG_DRAIN_TOKEN`.)
   - **#79 GEO**: 4 provider client(OpenAI호환=ChatGPT+Perplexity, Gemini, Anthropic raw HTTP) + per-provider fixture fallback + worker 배선. `SEARCHOPS_GEO_{CHATGPT,CLAUDE,GEMINI,PERPLEXITY}_{API_KEY,MODEL}`. Copilot은 공개 API 없어 fixture 유지.
   - **#80 org-invite Tier C**: Invitation 모델+추가전용 마이그레이션 + 라우트 4종(create/list/revoke admin·owner, accept=token capability) + repository(memory+prisma) + env-gated 이메일(`SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL`/`_TOKEN`, 미설정 시 서버로그). organization-invite readiness→configured. **canLaunch는 billing-subscription이 manual_followup이라 여전히 false.**
   - ⚠️ **#80 마이그레이션 수동 적용 필요**(상단 ACTION REQUIRED). 공통 교훈: dead-env 3종(env스키마 미존재/client 미구현/worker fixture 폴백)은 셋 다 고쳐야 실동작. Railway는 마이그레이션 자동 적용 안 함.

### 환경변수 위치 (어디에 무엇이)

- **Railway API**: `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, `SEARCHOPS_IDP_JWT_HS256_SECRET`, `SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL`(+`_TOKEN`), `SEARCHOPS_PUBLIC_APP_URL`(=`https://searchops.totopapa.com`), Google OAuth quad 등
- **Railway Worker**: `DATABASE_URL`, `REDIS_URL` (+ 커넥터 키)
- **Vercel Web**: `SEARCHOPS_API_BASE_URL`, `SEARCHOPS_IDP_JWT_HS256_SECRET`, `SEARCHOPS_OPS_ALERT_SINK_TOKEN`(알림 sink 검증 — Railway `_TOKEN`과 **동일값**), `SEARCHOPS_PUBLIC_APP_URL`(=`https://searchops.totopapa.com`, OAuth 복귀 URL용)
- **GitHub repo secret (searchops-ai)**: `SEARCHOPS_IDP_JWT_HS256_SECRET` (ops-heartbeat 워크플로 토큰 발급용)
- ⚠️ Web에는 `NODE_ENV`/`DATABASE_URL`을 **넣지 말 것** (Vercel 빌드 실패; 이 둘은 Railway 전용)
- **C 기능 활성 env (선택 — 미설정 시 dead-env 아닌 "off" 상태, 코드 폴백 안전)**:
  - rich-result: Railway **API+Worker** `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`(+`_TOKEN`)
  - GEO: Railway **API+Worker** `SEARCHOPS_GEO_<provider>_API_KEY`(chatgpt/claude/gemini/perplexity, 모델 override `_MODEL`)
  - log-drain: Railway API `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL`(+`_TOKEN`=`<T>`) + Vercel `SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`=`<T>`
  - invite 이메일: Railway API `SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL`(+`_TOKEN`) — 미설정 시 초대 링크가 서버 로그로 출력

### 다음 작업 (우선순위)

**A·B·C 코드 전부 완료/머지.** 남은 것:

1. 🔴 **[지금] invite 마이그레이션 수동 적용** — 상단 ACTION REQUIRED. 적용 전까지 초대 라우트 4종 500.
2. **C 기능 활성화(선택)** — provider env 설정 시 rich-result/GEO/log-drain이 실동작(현재는 코드 배선만, off 상태). env 매트릭스는 위 "환경변수 위치" 참조.
3. **billing-subscription** — `canLaunch=true`를 막는 마지막 manual_followup. 결제 provider(Stripe 등) 결정·연동 필요(제품 결정).
4. **defer (수신 리시버 없음)**: restore-drill / secret-rotation 웹훅 — 출시는 RUNBOOKS.md 수동 절차.
5. **선택 후속**: 외부 uptime 모니터(UptimeRobot/Better Stack) 이중화 · invite **web UI**(백엔드 API는 완비) · A안 실알림 1회 토큰일치 확인 · Railway release에 `corepack pnpm db:migrate:deploy` 추가(마이그레이션 자동화).

**A. ✅ 완료 (PR #76)** — 알림 + 에러/가동 모니터링.
**B. ✅ 완료 (PR 도메인)** — `https://searchops.totopapa.com`.
**C. ✅ 코드 완료 (PR #77·#78·#79·#80)** — rich-result·log-drain·GEO 4-provider·org-invite. dead-env 제거. (활성화는 env 설정 + #80 마이그레이션 적용.)

### 재시작 후 빠른 재개 ("껐다 켜도 바로")

다음 세션에서 아래처럼 말하면 즉시 이어서 진행:
- ~~"알림 설정 해줘" → A~~ ✅ **완료 (PR #76)**
- ~~"도메인 연결해줘" → B~~ ✅ **완료** — https://searchops.totopapa.com
- ~~"남은 C 항목 진행" → C~~ ✅ **코드 완료 (PR #77·#78·#79·#80)**
- 🔴 **"invite 마이그레이션 적용했어"** → 제가 초대 라우트 동작 검증 (현재 미적용 = 초대 라우트 500, 상단 ACTION REQUIRED)
- **"C 기능 켜줘 ◯◯"** → rich-result/GEO/log-drain provider env 설정 안내
- 상태 확인: https://searchops.totopapa.com/ops/readiness ("API 데이터" 배지 + 수치)
- 상세 절차서: `docs/PROVISIONING_RUNBOOK.md` (서비스별 env 키 매트릭스 + 단계)
- 토큰 수동 발급: `SEARCHOPS_IDP_JWT_HS256_SECRET='<값>' node issue-token.mjs`

---

# 제품 빌드 로그 (Phase 0–11)

Updated: 2026-05-26

## Current State

The repository is on `main` and deployed through the connected GitHub -> Vercel production flow.

Recent completed work:

- PR #65: Dead-letter operations dashboard
- PR #66: Distributed rate-limit adapter
- PR #67: Tenant-scoped mock auth roles
- PR #68: Operational metrics export
- PR #69: Production hardening runbooks
- PR #70: Observability ingestion adapters and dashboard
- PR #71: External IdP claim mapping
- PR #72: Operations hardening plans
- `CDX-135`: Runtime operations executors
- `CDX-136`: Korean dashboard localization
- `CDX-137`: Korean metadata, document progress, and not-found surface cleanup
- `CDX-138`: Web API base URL normalization for deployed runtime fetches
- `CDX-139`: Railway API/worker smoke checks and Redis/BullMQ operations notes
- `CDX-140`: RS256/JWKS IdP bearer-token verifier
- `CDX-141`: Launch readiness API and dashboard for remaining Phase 6-11/productization work
- `CDX-142`: Production launch docs for billing, onboarding, privacy, terms, and security

Latest full verification:

- Focused local verification for CDX-136 passed: `corepack pnpm --filter @searchops/web typecheck`, `corepack pnpm --filter @searchops/web lint`, and `corepack pnpm --filter @searchops/web test`.
- GitHub Actions `verify` passed for PR #65 through PR #72 before merge.
- Vercel production deployment for commit `0568059` reached `READY` and `/sites` returned `200 OK`.

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

1. Finish CDX-137/CDX-138
   - Keep web metadata and not-found UI Korean.
   - Normalize `SEARCHOPS_API_BASE_URL` values with or without `https://`.
   - Run focused web typecheck, lint, and tests.

2. CDX-139 Railway API/Worker operations check
   - Verify API `/health`.
   - Verify worker startup and queue names.
   - Document Redis/BullMQ eviction-policy expectations.

3. Deployment follow-up
   - Provision provider accounts and secret refs for observability, restore scheduler, secret manager, connector credentials, and IdP.
   - Configure `SEARCHOPS_IDP_JWKS_JSON` when the selected IdP only issues RS256/JWKS tokens.

## Guardrails

- No LLM usage for SEO/AEO/GEO/compliance detection truth.
- No live external API calls in tests.
- No CMS auto-publish.
- Medical content remains draft-only.
- Live provider clients must be explicit runtime wiring, not default package behavior.
