# API 없이 대시보드에 실데이터 띄우기 (직접 DB 모드)

SearchOps API 를 어디에도 배포하지 않은 상태에서 `apps/web` 이 실데이터를 그리게 하는 경로다.

## 왜 API 가 필요 없나

API 가 웹에 더해주던 것은 **데이터 접근 하나뿐이었다.**

| API 가 한다고 여겨진 일 | 실제 |
|---|---|
| 인증 | 웹이 이미 한다 — `getCurrentProviderUser()` 가 Supabase JWT 를 검증한다 |
| 테넌트 스코프 | 웹이 이미 검증된 `organizationId` 를 갖고 있다 (JWT 클레임) |
| 데이터 접근 | **이것만 API 고유** — 그런데 그 알맹이는 같은 Prisma 계층이다 |

`apps/api` 의 사이트 라우트는 `getSite(siteId)` → `site.organizationId` 대조로 스코프한다. 웹은 그 `organizationId` 를 이미 갖고 있으므로 같은 대조를 자기가 하면 된다. HTTP 한 겹이 통째로 없어진다.

## 어떻게 동작하나

```
서버 컴포넌트
  └ getSiteSnapshot(siteId)            apps/web/src/site-database.ts
      └ getCurrentProviderUser()       Supabase JWT → organizationId
      └ loadSiteDashboardSnapshot()    packages/db/src/site-dashboard.ts
            └ 조직 대조 (여기 한 곳)
            └ Site / CrawlRun / UrlRecord / SeoIssue / WorkOrder / SchemaRecommendation
```

**조직 대조는 `loadSiteDashboardSnapshot` 안 한 곳에만 있다.** 엔티티마다 함수를 두면 새 엔티티를 추가할 때 검사를 빠뜨릴 수 있어서, 진입점을 하나로 두고 그걸 통과하지 않으면 데이터를 꺼낼 방법이 없게 만들었다. `apps/api` 는 훅으로 같은 일을 하지만 훅은 라우트 추가 시 빠뜨릴 수 있다.

없는 사이트와 남의 사이트는 **둘 다 `null`** 이다. 구분하면 "그 사이트가 존재한다"는 사실이 타 조직에 새기 때문이다.

`react` 의 `cache()` 로 요청 단위 메모이즈하므로, 레이아웃과 페이지가 같은 사이트를 각각 읽어도 쿼리는 한 번만 나간다.

### 쓰기 두 건

읽기와 같은 원칙이다 — 조직은 세션에서만 오고, 대조는 한 곳에서만 한다.

```
서버 액션
  └ createOrganizationSite()           apps/web/src/site-database.ts
      └ getCurrentProviderUser()       organizationId 는 폼이 아니라 여기서만 온다
      └ registerOrganizationSite()     INSERT ... ON CONFLICT DO NOTHING
  └ setWorkOrderStatus()
      └ updateOrganizationWorkOrderStatus()
            └ UPDATE ... WHERE id = $1 AND "organizationId" = $2   ← 조건이 문장 안에 있다
```

- **사이트 등록**은 `upsert` 가 아니라 `INSERT ... ON CONFLICT DO NOTHING` 이다. 같은 도메인을 두 번 등록해도 실패하지 않고 기존 행이 그대로 돌아오며(폼 두 번 제출·다른 담당자 선등록), 이름·업종을 덮어쓰지 않는다. 덤으로 `Site` 에 `UPDATE` 권한이 아예 필요 없어진다.
- **`Site.id` 는 DB 가 만든다.** 웹의 fixture 경로는 도메인에서 id 를 만들지만(`site_<domain>`) 그걸 저장하면 서로 다른 조직이 같은 도메인을 등록할 때 기본키가 충돌한다 — 도메인은 조직별로만 unique 하다.
- **지시서 상태 이동은 `update` 가 아니라 `updateMany` 다.** `update` 는 unique where 만 받아서 `organizationId` 를 조건에 넣을 수 없고, 결국 "먼저 읽어 조직을 확인하고 나서 쓴다" 가 된다 — 검사를 잊을 수 있는 코드다. `updateMany` 는 조직 조건이 `UPDATE` 문 자체에 들어가 잊을 수가 없다. 남의 것이면 0행이 바뀌고 `false` 가 돌아온다.
- 상태 문자열은 `WorkOrderStatusSchema` 로 파싱한 뒤에만 저장한다. DB 의 `status` 는 그냥 `text` 라 오타가 들어가면 보드의 어느 칼럼에도 안 잡히고 조용히 사라진다.

⚠️ **이 모드에서 안 되는 쓰기:** 재검수·리치리절트 검증·커넥터 동기화는 큐와 워커가 있어야 한다. 등록한 사이트의 크롤 데이터는 배치(GitHub Actions, 매일 03:00 KST)가 채운다 — 배치는 DB 에 등록된 모든 `Site` 를 크롤하므로 시크릿을 손댈 필요가 없다.

## 데이터 출처 3단계

| 조건 | 모드 | 화면 표시 |
|---|---|---|
| `SEARCHOPS_WEB_DATABASE_URL` 있음 | **직접 DB** | "실데이터 (DB 직접)" |
| `SEARCHOPS_API_BASE_URL` 있음 | API | "API 데이터" |
| 둘 다 없음 | fixture | "데모 데이터" 배너 |

## 로그인: custom access token hook 이 더 이상 필요 없다

원래 웹은 Supabase JWT 의 커스텀 클레임 `organization_id` / `user_role` 에 의존했고, 그건 **custom access token hook** 을 따로 설치해야 나온다. 웹이 DB 를 직접 읽는 지금은 그 훅 없이도 소속을 알 수 있다.

```
Supabase JWT 검증 (서명·sub 일치·role=authenticated)   ← 인증. 그대로 유지
  └ 클레임에 organization_id 가 있으면 그걸 쓴다        ← 기존 경로, 신뢰 모델 불변
  └ 없으면 검증된 email 로 User 테이블 조회             ← 새 경로, 훅 불필요
```

조회 키는 **Supabase 가 서버에서 재검증해 돌려준 사용자 레코드의 이메일**이고, 그 주소가 **확인된 상태(`email_confirmed_at`)** 일 때만 쓴다. 세션 쿠키의 email 이나 `user_metadata` 는 쓰지 않는다 — 확인 여부를 담지 않거나 사용자가 고칠 수 있다. 확인 안 된 주소를 받아주면 남의 주소로 가입해 그 조직을 통째로 가져갈 수 있다.

⚠️ 조회는 대소문자를 무시하지만 `%`·`_` 는 **와일드카드가 아니다.** Prisma 의 `mode: "insensitive"` 가 Postgres 에서 ILIKE 로 컴파일되기 때문에, 이스케이프하고 돌아온 행의 주소를 다시 정확히 대조한다. 이걸 빠뜨리면 `_____@victim.com` 같은 주소로 가입해 남의 조직 소속과 role 을 그대로 가져갈 수 있다(실증됨).

⚠️ `User.email` 은 조직별 unique 라 같은 이메일이 두 조직에 있을 수 있다. 그 경우 **실패로 닫는다**(어느 쪽인지 결정할 근거가 없는데 아무거나 고르면 그게 테넌트 유출이다). 그런 사용자는 토큰 클레임으로만 해결되므로 훅이 필요하다.

## 설정 절차

### 0. Supabase 인증 (아직 안 돼 있으면 여기부터)

2026-08-17 기준 배포된 웹의 `/login` 은 "현재 로그인을 사용할 수 없습니다" 를 띄운다 — Vercel 에 Supabase 인증 값이 없고 `auth.users` 도 비어 있다. 데이터 경로가 살아도 여기가 막히면 아무도 대시보드에 도달하지 못한다.

1. Vercel 에 아래 둘을 넣는다. 값은 Supabase 대시보드 → Project Settings → API.
   ```
   NEXT_PUBLIC_SUPABASE_URL              = https://hrgoypleelvcutndbhjm.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  = sb_publishable_...   (또는 ..._ANON_KEY)
   ```
2. Supabase 대시보드 → Authentication → Users 에서 사용자를 하나 만든다(이메일 + 비밀번호).
3. **같은 이메일로 `User` 행을 만든다** — 이게 조직 소속의 근거다. 없으면 로그인은 되지만 조직을 못 찾아 거부된다.
   ```sql
   insert into "User" (id, "organizationId", email, name, role)
   values (gen_random_uuid()::text, 'org_demo', '<2번에서 만든 이메일>', '<이름>', 'owner');
   ```
   기존 시드 행(`owner@example.com` / `org_demo`)을 그대로 쓰려면 2번에서 그 이메일로 만들면 된다.
4. custom access token hook 은 **설치하지 않아도 된다**(위 참고).

⚠️ 1번만 하고 `SEARCHOPS_WEB_DATABASE_URL` 을 안 넣으면 데모 데이터가, 그것만 넣고 1번을 안 하면 로그인 화면이 나온다. **둘 다 필요하다.**

### 1. 최소권한 역할 생성

`scripts/sql/web-role.sql` 을 실행한다. **비밀번호는 파일에 없다** — 실행 시점에 준다:

```bash
psql "<postgres 접속문자열>" -v web_password=직접지은비밀번호 -f scripts/sql/web-role.sql
```

⚠️ 파일에 기본 비밀번호를 두지 않는 이유: 이 레포는 공개다. 예전에는 `CHANGE_ME` 가 적혀 있었고, 재실행 시 비밀번호를 건너뛰는 버그까지 겹쳐 운영 역할이 실제로 그 값으로 남아 **읽기 노출**됐다. 지금은 변수를 안 주면 실행이 중단된다.

#### Supabase SQL Editor 에서 실행하기

SQL Editor 는 psql 변수(`\if`·`\gexec`)를 못 쓴다. 아래를 붙여넣고 **`<비밀번호>` 두 곳만** 직접 지은 값으로 바꿔라. 파일에 기본값을 두지 않는 것과 같은 이유로, 이 문서에도 실제 값을 적지 않는다.

```sql
reset role;  -- 역할 임시 전환 상태면 아래가 permission denied 로 막힌다

create role searchops_web login password '<비밀번호>';
alter  role searchops_web login password '<비밀번호>';  -- 이미 있던 경우까지 덮어쓴다

grant usage on schema public to searchops_web;
grant select on
  public."Site", public."CrawlRun", public."UrlRecord",
  public."SeoIssue", public."WorkOrder", public."SchemaRecommendation"
to searchops_web;
grant select ("id", "organizationId", "email", "role") on public."User" to searchops_web;
grant insert on public."Site" to searchops_web;
grant update ("status", "updatedAt") on public."WorkOrder" to searchops_web;
alter default privileges in schema public revoke all on tables from searchops_web;
```

`create role` 이 "already exists" 로 실패해도 그 줄만 건너뛰고 나머지를 실행하면 된다 — `alter role` 이 비밀번호를 어차피 다시 설정한다.

⚠️ `permission denied to alter role` 이 나면 에디터가 **역할 임시 전환(impersonation)** 상태다. `select current_user` 가 `authenticated` 를 돌려주면 그 상태이고, 위의 `reset role;` 이 그걸 푼다.

이 역할이 갖는 권한은 정확히 이만큼이다:

| | 대상 |
|---|---|
| `SELECT` | 대시보드 6개 테이블 + `User` 의 4개 컬럼(`id`·`organizationId`·`email`·`role`, 로그인 소속 확인용) |
| `INSERT` | `Site` — 사이트 등록 |
| `UPDATE` | `WorkOrder` 의 `status`·`updatedAt` 두 컬럼 — 지시서 상태 이동 |
| 없음 | `DELETE` 전부, 그 밖의 모든 쓰기, credential 테이블(`ProviderAccount`, `ConnectorOAuthCredential`, `SiteConnector` ...) 접근 |

`Site` 에 `UPDATE` 가 없으므로 이미 등록된 사이트의 도메인이나 소속 조직을 바꿔치기할 수 없다. `WorkOrder` 는 컬럼 단위라 제목·근거·수용기준을 조용히 고쳐 쓸 수 없다. 이 경계는 `pnpm smoke:web-db` 가 진짜 Postgres 에서 양방향으로 확인한다 — 막혀야 할 것이 막히는지와, 허용된 둘이 실제로 되는지 둘 다.

#### 예전 역할에서 넘어오기

`searchops_web_readonly` 를 쓰고 있었다면 이 스크립트는 그 역할을 **건드리지 않는다**(전환 중 운영이 끊기지 않게). 순서는:

1. 위 스크립트로 `searchops_web` 을 만든다.
2. Vercel 의 `SEARCHOPS_WEB_DATABASE_URL` 사용자명을 `searchops_web_readonly.<ref>` → `searchops_web.<ref>` 로 바꾸고 재배포한다.
3. `/api/deployment` 가 `"reachable": true` 인지 확인한다.
4. 확인된 뒤에 `drop role searchops_web_readonly;` — 남겨두면 아무도 안 쓰는데 살아 있는 자격증명이 된다.

### 2. Vercel 환경변수

```
SEARCHOPS_WEB_DATABASE_URL = postgresql://searchops_web:<비밀번호>@<host>:6543/postgres?pgbouncer=true
```

⚠️ **왜 `DATABASE_URL` 이 아닌가.** 그 이름은 마이그레이션·워커·호스팅 플랫폼 통합이 저마다 쓴다. 그걸 스위치로 삼으면 누가 주입한 **전권 연결 문자열**을 모르는 새 집어 쓰게 되고, 최소권한 역할을 쓰겠다는 설계가 조용히 무력화된다. 실제로 이 프로젝트의 Vercel 에는 이미 `DATABASE_URL` 이 있었다. 직접 DB 모드는 위 전용 변수를 명시적으로 넣었을 때만 켜지며, 기존 `DATABASE_URL` 은 **건드릴 필요가 없다.**

⚠️ **`SEARCHOPS_API_BASE_URL` 은 반드시 지워라.** 남아 있으면 아직 API 를 안 거치는 화면
(커넥터·컴플라이언스·콘텐츠·GEO)이 매 렌더마다 죽은 주소를 두드려 응답이 느려진다.
실제로 Railway 폐지 후 이 값이 남아 있어 사이트 등록이 원시 `404` 를 뱉었다
(그 자체는 코드에서 막았지만, 죽은 주소를 계속 두드릴 이유는 없다).

⚠️ **넣지 말아야 할 것:**

- 마이그레이션용 direct/session URL — 서버리스에서 쓰면 Supabase 커넥션 한도를 금방 먹는다. 포트 6543(풀러)를 써라.
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` — **절대.** 이게 Vercel 에 있으면 프론트 침해 한 번으로 전 테넌트의 BYOK credential 이 복호화된다. 그래서 이 경로로는 커넥터/Integrations 화면을 살릴 수 없고, 살리지도 않는다.

## 자격증명 경계 — 원래 규칙과의 관계

원래 운영 규칙은 "Vercel 에는 encryption key, DB/Redis, provider secret 을 두지 않는다" 였다. 직접 DB 모드는 이 중 **DB 를 명시적으로 예외 처리한다.** API 를 배포하지 않는 이상 웹이 실데이터를 그리려면 어떤 형태로든 자격증명이 필요하기 때문이다.

규칙의 취지(프론트 침해 시 폭발 반경 억제)는 다음으로 지킨다:

1. **encryption key 는 여전히 Vercel 에 없다.** 크라운 주얼은 그대로 보호된다.
2. **역할이 대시보드 테이블(+`User` 4개 컬럼) 읽기와 쓰기 두 건에만 붙는다.** 코드가 아니라 `GRANT` 로 막으므로 코드에 버그가 나도 권한은 남지 않는다. 코드에 새 쓰기를 추가해도 `GRANT` 가 없으면 그냥 거부된다 — 권한을 먼저 넓히지 않으면 실수로 넓어질 수 없다.
3. **새 테이블에 권한이 자동으로 새지 않는다** — `alter default privileges ... revoke all`.

남는 위험: Vercel 이 침해되면 **모든 조직의 SEO 데이터를 읽고, 아무 조직에나 사이트를 추가하고, 아무 지시서의 상태나 바꿀 수 있다**(조직 스코프는 애플리케이션 레벨이라 DB 역할로는 못 막는다). 다만 지우거나 내용을 위조할 수는 없고, credential 은 여전히 못 읽는다. 이걸 더 줄이려면 테이블마다 RLS 정책을 걸고 사용자 JWT 로 붙는 방식으로 가야 하는데, Prisma 관리 스키마 25개 테이블에 RLS 를 얹는 별도 작업이다. 현재 테넌트가 사실상 하나라 그 비용을 지금 낼 이유가 없다고 판단했다 — 테넌트가 늘면 재검토 대상이다.

## 배포 확인

대시보드가 전부 로그인 뒤에 있어서 밖에서는 "내 수정이 배포됐는지", "환경변수가 먹었는지"를 알 방법이 없다. 그래서 확인용 엔드포인트를 둔다:

```bash
curl -s https://<도메인>/api/deployment
```

```json
{
  "commit": "9ebbaff...",
  "database": { "reachable": true, "writable": true },
  "config": { "apiBaseUrl": false, "directDatabase": true, "supabaseAuth": true }
}
```

`writable` 는 `Site` 에 `INSERT` 권한이 있는지만 본다(쓰지는 않는다). **역할을 갈아끼울 때 이게 유일한 확인 수단이다** — `reachable` 은 `select 1` 이라 예전 읽기 전용 역할로도 `true` 가 나온다. 확인 없이 예전 역할을 지우면 대시보드가 통째로 죽는다. 역할명이 아니라 불리언만 내는 이유는 DB 사용자명이 자격증명의 절반이기 때문이다.

- `writable: false` + `reachable: true` → 접속은 되는데 아직 예전 역할이다. 환경변수를 바꾸고 재배포해라. **예전 역할을 지우면 안 되는 상태다.**

`database` 는 접속만 확인한다(`select 1`). 데이터도 호스트명도 사용자명도 내지 않고, 실패 사유만 분류해 낸다:

| reason | 뜻 | 처방 |
|---|---|---|
| `not_configured` | `SEARCHOPS_WEB_DATABASE_URL` 없음 | 변수 추가 후 재배포 |
| `auth_failed` | 사용자·비밀번호·CONNECT 권한 문제 | 역할 비밀번호와 URL 대조 |
| `unreachable` | 호스트·포트에 못 닿음 | 포트 6543(풀러) 확인 |
| `permission_denied` | 접속은 되는데 GRANT 누락 | `web-role.sql` 재실행 |
| `engine_missing` | 람다에 Prisma 엔진 없음 | `next.config.mjs` 트레이싱 설정 확인 |

- `directDatabase: false` → `SEARCHOPS_WEB_DATABASE_URL` 이 안 먹었다(변수명 오타 또는 재배포 전). 화면은 데모 데이터가 뜬다.
- `supabaseAuth: false` → 로그인 화면이 "사용할 수 없습니다" 로 뜬다.
- `apiBaseUrl: true` → 죽은 주소가 남아 있는지 확인하라. API 를 안 쓰면 지우는 게 맞다.
- `commit` 이 기대한 커밋과 다르면 재배포가 아직 안 된 것이다.

값이 아니라 불리언과 커밋 해시만 낸다 — 접속 문자열·키·호스트명은 내지 않는다.

## 검증

```bash
pnpm smoke:web-db
```

임시 Postgres 에 실제 마이그레이션을 적용하고, 두 조직을 심고, 39가지를 확인한다 — 실데이터 조회, 타 조직 차단, 존재 여부 미노출, 그리고 **운영에 쓸 역할 SQL 을 그대로 돌려** 권한 경계를 양방향으로 본다: credential 테이블·삭제·`WorkOrder` 의 다른 컬럼이 거부되는지와, 허용된 두 쓰기가 실제로 되는지 둘 다. CI(`credential-smoke` 잡)에서도 돈다.

## 아직 API 가 필요한 것

읽기 대시보드와 쓰기 두 건(사이트 등록·지시서 상태 이동)은 API 없이 돈다. 다음은 남아 있다:

- **커넥터 / Integrations** — credential 복호화가 필요하고, 그 키는 Vercel 에 두지 않는다. 설계상 API/워커 몫이다.
- **큐가 필요한 쓰기** — 재검수, 리치리절트 검증, 커넥터 동기화. 권한 문제가 아니라 큐와 워커가 없어서다. 등록한 사이트의 크롤 데이터는 배치(매일 03:00 KST)가 채운다.
- **GEO / 컴플라이언스 / 콘텐츠 브리프** — 이건 API 문제가 아니라 **데이터를 만드는 실행 주체가 없어서**다(배치는 크롤만 한다). 개요 화면의 GEO KPI 는 지어내지 않고 0 으로 표시한다. 만들어지기 시작하면 같은 스냅샷에 얹으면 된다.

## Vercel 번들링 주의

⚠️ **pg 드라이버 어댑터를 쓴다고 엔진 바이너리가 필요 없어지지 않는다.** 어댑터는 Rust 쿼리 엔진의 **접속 계층만** JS 드라이버로 바꾼다 — 쿼리 컴파일은 그대로 엔진이 한다. 한때 반대로 적어뒀고, 그 믿음으로 트레이싱 설정을 지웠다면 배포가 통째로 죽었을 것이다.

⚠️ **`packages/db/src/generated/prisma` 는 gitignore 대상이라 turbo `outputs` 에 반드시 들어 있어야 한다.** 빠지면 `packages/db` 빌드가 캐시 히트할 때 `dist/**` 만 복원되고 엔진이 사라지는데, 소스가 안 바뀐 커밋에서만 그렇게 되므로 **간헐적으로만** 재현된다(실제로 겪었다: web 만 캐시 미스인 커밋에서 터졌다). `apps/web/scripts/copy-prisma-engine.mjs` 가 엔진이 없으면 빌드를 세우므로, 같은 사고가 다시 조용히 배포되지는 않는다.

`next.config.mjs` 의 `serverExternalPackages` 와 `outputFileTracingIncludes` 를 지워선 안 된다. 둘 다 없으면 nft 트레이스가 `packages/db/dist/index.js` 에서 멈춰 **Prisma 쿼리 엔진 바이너리가 람다에 안 들어간다**. 그러면 `SEARCHOPS_WEB_DATABASE_URL` 을 켜는 순간 첫 쿼리에서 `PrismaClientInitializationError` 가 나고 사이트 라우트가 전부 500 이 된다. `externalPackages` 만으로는 부족했다 — 실제 빌드 산출물의 `.nft.json` 을 열어 `generated/prisma` 항목과 `*.node` 가 들어 있는지 확인하는 것이 유일하게 믿을 만한 검사다.
