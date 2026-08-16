# SearchOps AI Progress

> 이 문서 위쪽은 **운영 배포·프로비저닝 진행상황**(최신), 아래쪽은 **제품 빌드 로그(Phase 0–11)**.

---

## richdoc(리쥬엘) 연동 + 배포 전략 전환

Updated: 2026-08-16 (PR #96·#98 머지 완료, 운영 가동 중)
Merged: `f28f295` (연동 어댑터 + 배포 전환) · `3cec287` (지시서 중복 근본 해결)
Live: web = https://searchops-ai-web.vercel.app · **api/worker = 배포 안 함** · 크롤 = GitHub Actions `batch-crawl` (매일 KST 03:00)

> Railway는 더 이상 쓰지 않는다. `searchops-api-production.up.railway.app`은 404이며 위 섹션의 Live 정보는 낡았다.

### 무엇을 만들었나

- **richdoc 적재 어댑터** (`packages/db/src/richdoc.ts`): 크롤 완료 시 `searchops_runs`/`searchops_issues`, 지시서 변경 시 `searchops_work_orders`를 리쥬엘 Supabase로 PostgREST upsert. 계약 정본은 **richdoc-saas 레포**의 `supabase/searchops_contract.sql`이며 이 레포에 사본을 두지 않는다.
- allowlist는 도메인이 아니라 **`Site.id`**다. `Site.domain`은 조직별 unique라 도메인 기준이면 타 조직의 동명 사이트가 단일 테넌트 Supabase로 샌다(리뷰에서 major로 확정).
- `issues.status`/`first_seen`은 콘솔 소유라 전송하지 않는다. 전 메서드 best-effort — 실패해도 크롤이나 API 요청을 깨지 않는다.
- **계약 검증기** (`scripts/richdoc-smoke.mjs`): 임시 DB에 계약 SQL을 적용하고 미니 PostgREST 셰임 위에서 실제 어댑터를 돌려 23종 검증. 배포 플랫폼도 자격증명도 불필요(`pnpm smoke:richdoc`). `--live`로 실제 리쥬엘 대상 검증도 된다. `.github/workflows/richdoc-contract.yml`이 PR·main·매일 1회 실행해 **richdoc 쪽 계약 변경까지** 감지한다.
- **백필** (`scripts/richdoc-backfill.mjs`): 크롤 없이 기존 데이터를 콘솔에 올린다. 재동기화용.

### 배포 전략을 왜 바꿨나

무료 상시 호스팅이 2026-08 기준 사실상 소멸했다(재조사하지 말 것):

| 후보 | 결론 |
|---|---|
| Railway | 무료 폐지, 현재 서비스 404 |
| Koyeb | 2026-02 Mistral 인수로 무료 신규 차단 + **Worker Service 금지** + 강제 scale-to-zero |
| Render | 무료 대상에 background worker 없음 |
| Fly.io | 2024 무료 폐지 (유료 도쿄 월 $2~4) |
| Cloud Run | 상시 유지 시 무료 한도 3~5배 초과 |
| Oracle A1 | 조건은 맞으나 도쿄 용량 경합으로 확보 실패 (`scripts/dev/oci-a1-retry.sh` 남겨둠) |

→ **상시 워커를 포기하고 GitHub Actions cron 배치**(`apps/worker/src/batch-crawl.ts`)로 전환. 큐를 우회해 `processAndPersistCrawlJob`을 직접 호출한다. 부수 이득으로 **Redis가 완전히 사라졌다** — 상시 블로킹 폴이 없어져 관리형 Redis 월 커맨드 한도 문제가 통째로 없어졌다.

⚠️ 배치 경로에서 `./runtime.js`(bullmq를 끌어옴)와 `parseSearchOpsEnv`(REDIS_URL 필수)를 임포트하면 안 된다.

`Dockerfile`/`compose.prod.yaml`은 상시 호스팅을 다시 구할 때를 위해 남겨뒀다. `apps/api`도 배포만 안 할 뿐 코드는 그대로다 — 배치가 그 Prisma 계층을 재사용한다.

### 운영 상태 (2026-08-16 기준)

- 리쥬엘 Supabase(`trmbkdrzvtolvolchoad`)에 계약 SQL 적용 완료, 실데이터 적재 확인.
- GitHub secret 5종 등록: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SEARCHOPS_RICHDOC_SUPABASE_URL`, `_SERVICE_ROLE_KEY`, `_SITE_IDS`(= `cmq3bbygu0001oj01ux3843ke`, gangnam.rejuel.com).
- Actions 실행 성공(1분 19초). 콘솔 현황: runs 4 / issues 10 / work_orders 5. SearchOps DB 지시서도 5건으로 정리 완료.
- 사이트 추가 시 `SEARCHOPS_RICHDOC_SITE_IDS`에 Site.id만 더하면 크롤·적재 대상이 함께 늘어난다.

### 머지 전 리뷰에서 고친 것

- **적재 실패가 종료 코드에 안 잡혔다.** 키 회전이나 계약 미적용으로 100% 실패해도 워크플로가 매일 초록불이고 콘솔만 조용히 멈췄다. 브리지가 삼킨 실패 수를 노출하고 배치가 반영한다.
- `last_seen`에 푸시 시각을 넣어 백필 시 이슈 나이가 사라졌다 → 크롤 시각 사용.
- `work_orders.created_at`이 병합마다 덮여 방치 지시서가 영원히 "오늘 생성"이었다 → payload에서 제외.
- 지시서 행 id를 `WorkOrder.id`에서 파생해 콘솔에 무한 누적(이슈 10건에 지시서 16건, 한 제목이 8번 중복) → (사이트, 제목) 파생으로 병합.
- 그 외: `maxPages` 상한 클램프(초과 시 CrawlRun이 `queued` 고착), 없는 Site.id를 실패로 계상, 워크플로 시크릿을 스텝 레벨로 내려 `pnpm install` postinstall 노출 제거.

### 지시서 중복의 근본 해결 (PR #98, `3cec287`)

`SeoIssue` 유니크 키에서 `crawlRunId`를 뺐다: `@@unique([crawlRunId, urlRecordId, ruleId])` → `@@unique([urlRecordId, ruleId])`.

이슈의 정체성은 크롤 실행이 아니라 **문제 그 자체**(페이지 + 규칙)다. `UrlRecord`가 이미 `@@unique([siteId, url])`이라 크롤 간 재사용되므로 `(urlRecordId, ruleId)`는 안정적인 자연키다. `SchemaRecommendation`이 이미 `@@unique([siteId, pageUrl, type])`인 것과 같은 규약 — `SeoIssue`만 크롤런 스코프였고 그 비대칭이 버그였다. `WorkOrder`는 `seoIssueId @unique`라 이슈가 안정되면 지시서도 자동으로 안정되므로 건드리지 않았다.

빠뜨리면 조용히 깨지는 두 곳:

- upsert의 `update` payload에 **`crawlRunId` 갱신을 넣어야** 한다. 없으면 이슈가 첫 런에 고정되어 richdoc 어댑터의 `where: { crawlRunId }` 조회에서 빠지고, 콘솔 `last_seen`이 멈추면서 `issues_found`가 0으로 보고된다.
- 마이그레이션은 그룹마다 **최신 행을 남긴다**. `WorkOrder.seoIssueId` FK가 `ON DELETE SET NULL`이라 지시서가 가리키는 행을 지우면 조용히 NULL이 되고 다음 크롤에서 지시서가 다시 생긴다.

⚠️ **운영 DB에는 마이그레이션이 자동 적용되지 않는다.** 이 레포에 그런 경로가 없다(CI `migration-gate`는 임시 Postgres 대상). 2026-08-16 운영 Supabase에는 SQL Editor로 직접 적용했고 결과는 확인했다 — 인덱스 교체 완료, `SeoIssue` 20 → 10건(unique 10, NULL urlRecordId 0), 고아 지시서 0건(`seoIssueId`가 NULL인 1건은 스키마 추천 유래로 원래 그렇다).

⚠️ **`_prisma_migrations`에 `20260816120000_seo_issue_identity_per_url_rule` 행이 없다.** 손으로 적용해서다. 다음 `prisma migrate deploy` 때 이미 지운 인덱스를 다시 `DROP INDEX`하려다 실패한다. `prisma migrate resolve --applied 20260816120000_seo_issue_identity_per_url_rule`를 운영 `DIRECT_DATABASE_URL`로 한 번 돌리거나, SQL Editor에서 아래를 실행해야 한다(MCP 연결은 read-only라 세션에서 못 넣었다).

```sql
insert into "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
select gen_random_uuid()::text,
       '381456ece6b8a883a78889c698508aae2c444f56de16ede5b9ca5ca62b0f257b',
       '20260816120000_seo_issue_identity_per_url_rule',
       now(), now(), 1
where not exists (
  select 1 from "_prisma_migrations"
  where migration_name = '20260816120000_seo_issue_identity_per_url_rule'
);
```

미확인으로 남은 것: 새 유니크 키 아래 **첫 배치 실행**(KST 03:00)이 아직 안 돌았다. 돈 뒤 `select count(*), count(distinct ("urlRecordId","ruleId")) from "SeoIssue"`가 같은 값인지, 콘솔 `searchops_issues.last_seen`이 전진하는지 확인하면 위 두 함정이 다 걸린다.

알려진 부수효과: `apps/web/src/site-detail-views.ts:515`가 `issue.crawlRunId === crawlRun.id`로 크롤런별 이슈 수를 세므로 과거 런은 이제 0으로 보인다. 웹 대시보드가 API 없이 404인 동안은 보류.

### 다음 작업

1. **`_prisma_migrations` 이력 보정.** 바로 위 SQL. 안 하면 다음 배포가 깨진다.
2. **배치 실패 알림.** 현재는 GitHub 기본 알림뿐이다. 매일 도는 잡이 조용히 실패하면 며칠 모를 수 있다.
3. **apps/web 대시보드.** API를 배포하지 않아 `/sites/[siteId]/**` 10개 라우트가 404다. `dashboard-shell.tsx`의 `resolveDashboardSite`(현재 호출자 0)로 폴백하면 픽스처 모드로 살릴 수 있다. 지시서 보드는 원래부터 데모 픽스처(`work-order-board.ts`)이며 API를 호출하지 않는다 — 실데이터처럼 보여 오해를 부른다.
4. **역방향 반영.** 리쥬엘 콘솔에서 지시서 상태를 바꿔도 SearchOps로 돌아오지 않는다(단방향 push). 필요해지면 별도 설계.
5. **Task 14 (아래 섹션)** — multi-tenant credential 운영 전환은 여전히 미완이다. 단 Railway 전제가 깨졌으므로 배포 단계는 재작성이 필요하다.

재개 지시: **"richdoc 연동 다음 작업 이어서"**라고 하면 이 섹션 1번부터 시작한다.

---

## Multi-tenant provider credential 구현 상태

Updated: 2026-07-14 (Tasks 1-13 local implementation and verification complete; production execution not started)
Branch: `codex/multitenant-provider-credentials`
Task 12 final code commit: `01a0d40`
Live: web = https://searchops.totopapa.com (+ https://searchops-ai-web.vercel.app) · api = https://searchops-api-production.up.railway.app

> **Current source of truth:** this tracked `progress.md`, `docs/PROVISIONING_RUNBOOK.md`, and `docs/superpowers/plans/2026-07-13-multitenant-provider-credentials.md`. Tasks 1-13 are implemented and verified locally. Task 14 production expand/backfill/cutover has not run and requires explicit operator approval. No live service, database, Redis, provider API, customer account, or secret was accessed in this implementation run.

### 완료된 설계와 구현

- 조직별 `ProviderAccount`에 Google/Bing/GEO BYOK credential을 AES-256-GCM으로 암호화해 저장하고, `SiteConnector`에 GSC 속성/GA4 Property ID 등 사이트별 resource binding을 저장한다.
- Worker는 job의 `siteId`로 조직, 계정, binding을 다시 확인한 뒤 credential을 해독한다. GSC/GA4는 사이트별 binding, Bing/GEO BYOK는 조직별 계정, PageSpeed와 SearchOps 부담 GEO key는 Worker 공통 env를 사용한다.
- Google OAuth callback은 canonical encrypted account를 갱신하고 동일 계정 재연결 시 binding metadata를 보존한다. refresh race, revoke, provider 오류 redaction, tenant scope를 fail-closed로 처리한다.
- Web은 Supabase verified user bearer만 API에 전달한다. `/ops/integrations`, `/sites/[siteId]/connectors`, `/ops/readiness`는 미인증 시 로그인으로 이동하며 service principal/demo fallback을 사용하지 않는다.
- Readiness는 API/Worker env provenance, 미이관 legacy row, 최근 7일 실제 legacy fallback 관측을 분리한다. Vercel에는 encryption key, DB/Redis, Google/provider/customer secret을 두지 않는다.
- Legacy 호환은 `dual` mode에서만 허용한다. backfill과 관찰 기간이 끝난 뒤 `encrypted`로 전환하며, plaintext legacy table 삭제는 별도 승인 대상이다.

### Task 12 clean-artifact 최종 상태

- 보존 대상은 `packages/types/dist`, `packages/db/dist`, `packages/connectors/dist`, `packages/db/src/generated` 네 tree로 고정한다.
- 원본을 repo-local ignored `.searchops-smoke-backups/<run>/originals`로 원자적 `rename`하고, build가 만든 tree는 `quarantine`으로 `rename`한 뒤 원본 backup 자체를 target으로 되돌린다. 원본 backup에는 recursive delete를 수행하지 않는다.
- 모든 원본/부재 상태가 복원된 뒤에만 quarantine을 재귀 정리한다. 복원 실패 시 exact backup 경로와 남은 quarantine 경로를 진단에 출력한다.
- Repository root를 `realpath`로 고정하고 기존 ancestor의 symlink를 거부한다. 정상, 원래 부재, Corepack ENOENT, build 후 CLI 실패, later original move, quarantine move, original restore, quarantine cleanup, symlink escape의 9개 회귀와 실제 clean smoke가 통과했다.
- 독립 리뷰는 transaction safety를 승인했다. 남은 이론적 위험은 hostile concurrent filesystem race이며 CI/local single-process smoke 범위 밖이다.

### Task 13 검증 결과

- Package-focused: Types 95, DB 133, Connectors 62, API 341, Worker 108, Web 161, 합계 900 tests PASS.
- Repository: `corepack pnpm lint`, `corepack pnpm build`, `corepack pnpm -r typecheck`, `corepack pnpm -r test` PASS. 전체 workspace test는 1,067개 PASS.
- Prisma: synthetic local URL로 `prisma validate` PASS, generate/build PASS. 현재 셸에 DB URL이 없고 Docker runtime도 승인되지 않아 `migrate deploy/status`와 credential dry-run은 실행하지 않았다.
- Browser: 로컬 `http://localhost:3000`에서 1200px/390px 로그인 화면 overflow 없음. 세 보호 경로는 정확한 `next` query로 로그인에 fail-closed redirect. 인증 내부 화면은 Web fixture tests로 검증했으며 운영 계정 기반 시각 검증은 Task 14 수동 preflight에 남긴다.

### 다음 작업: Task 14 운영 경계

1. 작업 브랜치의 diff/PR을 검토하고 merge한다. 이 세션에서는 push/PR/merge하지 않았다.
2. 운영자가 복구 가능한 Supabase backup을 확인한 뒤에만 Railway API+Worker에 encryption keyring과 `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual`을 설정한다. Vercel에는 encryption key를 넣지 않는다.
3. Production migration, API, Worker, Web 순서로 배포한다.
4. Railway one-off 환경에서 credential backfill dry-run/apply/dry-run을 실행하고 unmigrated/failed가 0인지 확인한다.
5. 서로 다른 두 사이트의 GSC/GA4 resource isolation, 조직 Bing, GEO BYOK 우선순위, PageSpeed platform key, no-fixture를 확인한다.
6. 실제 legacy fallback이 7일간 0일 때만 API+Worker를 `encrypted` mode로 전환한다. Legacy table drop은 새 계획과 별도 승인 전까지 금지한다.

재개 지시: **“multi-tenant credential Task 14 preflight 이어서”**라고 하면 이 섹션 1번부터 시작한다.

---

## 과거 운영 배포 · 프로비저닝 기록

아래 내용은 2026-06-27 기준 운영 이력이다. 현재 multi-tenant credential branch가 아직 운영에 배포되었다는 의미가 아니다.

> ✅ **org-invite 라이브 (2026-06-23)**: `Invitation` 테이블 운영 DB 생성 확인 + **invite web UI 라이브 (#81)** — 운영 콘솔 `/ops/invites`에서 초대 생성·목록·철회.
> ✅ **마이그레이션 자동화 완료 (2026-06-27, #82)**: Prisma `directUrl`(`DIRECT_DATABASE_URL`=Supabase **session pooler :5432**) + Railway `searchops-api` **Pre-Deploy Command** `corepack pnpm db:migrate:deploy`. 배포 로그로 검증(`No pending migrations to apply`). 이제 스키마 PR 머지→배포 시 **자동 적용**(수동 불필요). (과거 교훈이던 "Railway는 자동 적용 안 함"을 이 설정으로 해결. 런타임 client는 풀러 URL 유지, migrate만 직결 URL 사용.)
> ✅ **시크릿 로테이션 완료 (2026-06-27)**: 노출된 `SEARCHOPS_IDP_JWT_HS256_SECRET`을 4곳(Railway API·Vercel prod+preview·GitHub) 동일 신값으로 교체·검증(대시보드 "API 데이터" + heartbeat success). 옛 값 전부 무효화.
> ✅ **GEO live 활성 (2026-06-27)**: OpenAI(gpt-4o-mini) 키 등록 → `geo-answer-monitor` job 라이브 호출 검증(워커 `completed`, fixture 폴백 없음).

### 현재 운영 상태 (한눈에)

| 구성요소                    | 상태                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| DB (Supabase, 서울)         | ✅ 연결·마이그레이션 적용                                             |
| Redis (Railway, noeviction) | ✅ 연결                                                               |
| API 엔진 (Railway)          | ✅ 가동 (`/health` 200)                                               |
| Worker 엔진 (Railway)       | ✅ 가동 (Active)                                                      |
| 웹사이트 (Vercel)           | ✅ 가동 + API 실시간 연결                                             |
| 인증/보안                   | ✅ `NODE_ENV=production` + HS256 IdP → 익명/사칭 차단(fail-open 닫힘) |

**/ops/readiness 실측 (2026-06-27):** 전체 **41** / 설정됨 **28** / 프로비저닝 필요 **4** / 수동 후속 **9** — 배지 "API 데이터". (A: alert-routing·error-monitoring-uptime · B: production-domain · C: organization-invite + 이번 사이클 **observability-drain**(log-drain) + **geo-live-providers**(OpenAI 키) configured 전환 → 26→28.) **rich-result는 보류**: 의미 있는 외부 validator(우리 계약 형식)가 없어(Google Rich Results는 공개 API 없음) 오프라인 schema-core 검증이 곧 제품 — dead-env는 이미 제거됨.

### 완료한 작업 (이번 배포 사이클)

1. **Phase 0 — DB**: Supabase 연결 + `prisma migrate deploy`(15개) + seed. 로컬 Docker로 동일 파이프라인 리허설 후 운영 적용.
2. **Phase 1 — Redis**: Railway Redis(noeviction) 연결, API·Worker 양쪽 부팅 확인.
3. **인증/보안**: `NODE_ENV=production` + `SEARCHOPS_IDP_JWT_HS256_SECRET` → mock/trusted-header fallback 차단(`/ops/*` 401로 확인).
4. **웹↔API 연결 (PR #75 머지, 이후 Task 12 수정)**: 일반 ops 호출의 초기 `apiFetch` 이력은 유지되지만 `/ops/readiness`는 더 이상 HS256 service principal을 사용하지 않는다. Supabase verified current-user access token을 `apiFetchAsUser`로 전달한다.
5. **Vercel web env (Task 12 최종 기준)**: browser-safe config는 `SEARCHOPS_API_BASE_URL`, `SEARCHOPS_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`다. 현재 Web 서버가 소비하는 `SEARCHOPS_IDP_JWT_HS256_SECRET`, `SEARCHOPS_OPS_ALERT_SINK_TOKEN`, `SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`은 non-`NEXT_PUBLIC` 서버 전용으로 별도 저장하고 client에 절대 노출하지 않는다. `NODE_ENV`, DB/Redis, encryption keyring, Google/provider/customer secret은 넣지 않는다.
6. **Readiness 결과 규칙**: verified user API 응답만 "API 데이터"로 표시한다. 인증/store 장애에서는 demo/fixture로 대체하지 않고 고정 unavailable UI로 닫는다.
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
   - **#77 rich-result**: `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`(+`_TOKEN`) env 스키마 + connectors client + Worker 배선. Task 12 기준 선택형 Worker-only env다.
   - **#78 log-drain**: `apps/web/app/api/ops/log-drain-sink` 인증 self-host sink. (`SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`=Railway `..._LOG_DRAIN_TOKEN`.)
   - **#79 GEO**: 4 provider client(OpenAI호환=ChatGPT+Perplexity, Gemini, Anthropic raw HTTP) + per-provider fixture fallback + worker 배선. `SEARCHOPS_GEO_{CHATGPT,CLAUDE,GEMINI,PERPLEXITY}_{API_KEY,MODEL}`. Copilot은 공개 API 없어 fixture 유지.
   - **#80 org-invite Tier C**: Invitation 모델+추가전용 마이그레이션 + 라우트 4종(create/list/revoke admin·owner, accept=token capability) + repository(memory+prisma) + env-gated 이메일(`SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL`/`_TOKEN`, 미설정 시 서버로그). organization-invite readiness→configured. **canLaunch는 billing-subscription이 manual_followup이라 여전히 false.**
   - ✅ **#80 마이그레이션 적용 완료**(2026-06-23, 수동 `db:migrate:deploy`). 공통 교훈: dead-env 3종(env스키마 미존재/client 미구현/worker fixture 폴백)은 셋 다 고쳐야 실동작.
10. **운영 하드닝 사이클 2 (2026-06-27)**:
    - **시크릿 로테이션**: 노출된 `SEARCHOPS_IDP_JWT_HS256_SECRET`을 4곳(Railway API · Vercel Production+Preview · GitHub repo secret) 동일 신값으로 교체. 검증: 대시보드 "API 데이터"(web↔API) + ops-heartbeat success(GH↔API). 옛 값 무효화. (Vercel CLI는 preview env 비대화형 add 버그 → preview는 대시보드로 설정. 값은 채팅 노출 없이 600 임시파일 경유 후 안전 삭제.)
    - **log-drain 활성화**: self-host sink(#78) + Railway `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL`(=`https://searchops.totopapa.com/api/ops/log-drain-sink`)+`_TOKEN` + Vercel `SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`(동일값). 검증: heartbeat success(토큰 불일치면 metrics-export 500으로 self-detect) + readiness observability-drain configured.
    - **invite web UI (#81)**: `apps/web/app/ops/invites/`(page+actions) + `src/invite-operations.ts`(org-scoped API client, 데모폴백) + 운영 콘솔 "초대 관리" 링크. `/ops/invites`에서 생성/목록/철회(admin·owner). 라이브 "API 데이터" 확인.
    - **마이그레이션 자동화 (#82)**: `schema.prisma` `directUrl=env("DIRECT_DATABASE_URL")` + CI migration-gate에 직결 URL 추가. Railway `searchops-api`에 `DIRECT_DATABASE_URL`(session pooler :5432) + Pre-Deploy Command 설정. 배포 로그로 `prisma migrate deploy` 실행·성공 검증.
    - **dead-letter 정리**: 과거 실패 9건 대시보드 "정리"로 제거 → 0건.
    - **GEO live 활성화 (OpenAI)**: Railway Worker에 `SEARCHOPS_GEO_CHATGPT_API_KEY`(+`_MODEL=gpt-4o-mini`). readiness geo-live-providers configured. 대시보드 "큐 등록"→워커 `geo-answer-monitor job completed`(fixture 폴백 에러 없음=라이브 호출 성공) 검증.
    - **버그 수정 (#83)**: 대시보드 GEO/compliance **서버 액션이 동기 `resolveDashboardSite`로 실제 사이트를 demoSite 도메인(example-clinic.com)으로 폴백** → API 도메인 검사 400(GEO 큐 등록 실패)을 유발. `await loadDashboardSite`(API 조회)로 수정. (API `Fastify({logger:false})`라 에러 미로깅 → 로컬 스키마 재현으로 특정.)

### 환경변수 위치 (어디에 무엇이)

- **Railway API**: `DATABASE_URL`, **`DIRECT_DATABASE_URL`**(migration command only), `REDIS_URL`, `NODE_ENV=production`, IdP verifier, observability/API-owned secrets, public URLs, Google OAuth quad, credential storage mode와 keyring. GEO provider key/model과 rich-result validator는 Worker-only다.
- **Railway Worker**: `DATABASE_URL`, `REDIS_URL`, **`SEARCHOPS_GEO_CHATGPT_API_KEY`**(+`_MODEL=gpt-4o-mini`, GEO 라이브 처리) (+ 커넥터 키)
- **Vercel Web 공개 설정** (Production+Preview): `SEARCHOPS_API_BASE_URL`, `SEARCHOPS_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `NEXT_PUBLIC_` 값은 browser-visible이다.
- **Vercel Web 서버 전용 secret** (Production+Preview): `SEARCHOPS_IDP_JWT_HS256_SECRET`, `SEARCHOPS_OPS_ALERT_SINK_TOKEN`, `SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`. 모두 non-`NEXT_PUBLIC`이며 client code/bundle/응답에 노출하지 않는다. DB/Redis, credential encryption keyring, Google/provider/customer secret과 고객 ID는 Vercel에 두지 않는다.
- **GitHub repo secret (searchops-ai)**: `SEARCHOPS_IDP_JWT_HS256_SECRET` (ops-heartbeat 워크플로 토큰 발급용)
- ⚠️ Web에는 `NODE_ENV`/`DATABASE_URL`을 **넣지 말 것** (Vercel 빌드 실패; 이 둘은 Railway 전용)
- **C 기능 활성 env (미설정 시 dead-env 아닌 "off" 상태, 코드 폴백 안전)**:
  - **log-drain ✅ 활성**: Railway API `SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL`(+`_TOKEN`=`<T>`) + Vercel `SEARCHOPS_OPS_LOG_DRAIN_SINK_TOKEN`=`<T>`
  - **GEO 선택형**: Railway Worker의 `SEARCHOPS_GEO_<provider>_API_KEY`(+`_MODEL`). 조직 고객 BYOK는 encrypted ProviderAccount에 둔다. 실제 live 활성 상태는 이 로컬 Task 12에서 검증하지 않았다.
  - **rich-result 선택형**: 켤 경우 Railway Worker에만 `SEARCHOPS_RICH_RESULT_VALIDATOR_URL`(+`_TOKEN`)을 둔다.
  - invite 이메일(선택): Railway API `SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL`(+`_TOKEN`) — 미설정 시 초대 링크가 서버 로그로 출력

### 다음 작업 (우선순위)

**A·B·C + 운영 하드닝 사이클 2(시크릿 로테이션·log-drain·invite UI·마이그레이션 자동화·dead-letter·GEO live) 전부 완료.** 남은 것:

1. **billing-subscription** — `canLaunch=true`를 막는 마지막 manual_followup. 결제 provider(Stripe 등) 결정·연동 필요(**제품 결정**).
2. **외부 uptime 이중화(선택)** — UptimeRobot/Better Stack 계정에서 `GET /health` 모니터 추가(본인 계정). 현재 GH Actions ops-heartbeat 5분 폴러가 1차 담당.
3. **GEO 추가 provider(선택)** — perplexity/gemini/claude 키 추가 시 함께 라이브(호출당 토큰 과금). 현재 chatgpt(gpt-4o-mini)만 활성.
4. **rich-result ⏸️ 보류** — 의미 있는 외부 validator URL 부재(오프라인 검증이 제품). 켤 실익 없음.
5. **defer (수신 리시버 없음)**: restore-drill / secret-rotation 웹훅 — 출시는 RUNBOOKS.md 수동 절차. · A안 실알림 1회 토큰일치 확인.

**A. ✅ 완료 (PR #76)** — 알림 + 에러/가동 모니터링.
**B. ✅ 완료** — `https://searchops.totopapa.com`.
**C. ✅ 완료 (PR #77·#78·#79·#80 + 마이그레이션 적용)** — rich-result·log-drain·GEO·org-invite. dead-env 제거.
**D(하드닝 사이클 2). ✅ 완료 (2026-06-27)** — 시크릿 로테이션 · log-drain 활성 · invite web UI(#81) · 마이그레이션 자동화(#82) · dead-letter 0건 · GEO live(OpenAI) · 버그수정(#83 GEO/compliance 액션 도메인 폴백).

### 재시작 후 빠른 재개 ("껐다 켜도 바로")

다음 세션에서 아래처럼 말하면 즉시 이어서 진행:

- ~~"알림 설정 해줘" → A~~ ✅ **완료 (PR #76)**
- ~~"도메인 연결해줘" → B~~ ✅ **완료** — https://searchops.totopapa.com
- ~~"남은 C 항목 진행" → C~~ ✅ **완료 (PR #77·#78·#79·#80 + 마이그레이션 적용)**
- ~~"하드닝 사이클 2" → D~~ ✅ **완료** — 로테이션·log-drain·invite UI·마이그레이션 자동화·dead-letter·GEO live
- **"billing 연동하자"** → canLaunch=true의 마지막 차단(Stripe 등 제품 결정)
- **"GEO 다른 provider 켜줘"** → Railway Worker `SEARCHOPS_GEO_<provider>_API_KEY`(과금 주의)
- 상태 확인: https://searchops.totopapa.com/ops/readiness ("API 데이터" 배지 + 28/4)
- 운영 콘솔: https://searchops.totopapa.com/ops (초대 관리 = `/ops/invites`)
- 상세 절차서: `docs/PROVISIONING_RUNBOOK.md` (서비스별 env 키 매트릭스 + 단계)
- 토큰 수동 발급: `SEARCHOPS_IDP_JWT_HS256_SECRET='<값>' node issue-token.mjs`
- ⚠️ 마이그레이션은 이제 **자동**(Railway Pre-Deploy). 수동 적용 불필요.

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
