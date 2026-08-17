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

## 데이터 출처 3단계

| 조건 | 모드 | 화면 표시 |
|---|---|---|
| `DATABASE_URL` 있음 | **직접 DB** | "실데이터 (DB 직접)" |
| `SEARCHOPS_API_BASE_URL` 있음 | API | "API 데이터" |
| 둘 다 없음 | fixture | "데모 데이터" 배너 |

## 로그인: custom access token hook 이 더 이상 필요 없다

원래 웹은 Supabase JWT 의 커스텀 클레임 `organization_id` / `user_role` 에 의존했고, 그건 **custom access token hook** 을 따로 설치해야 나온다. 웹이 DB 를 직접 읽는 지금은 그 훅 없이도 소속을 알 수 있다.

```
Supabase JWT 검증 (서명·sub 일치·role=authenticated)   ← 인증. 그대로 유지
  └ 클레임에 organization_id 가 있으면 그걸 쓴다        ← 기존 경로, 신뢰 모델 불변
  └ 없으면 검증된 email 로 User 테이블 조회             ← 새 경로, 훅 불필요
```

조회 키는 **검증된 클레임의 이메일**이다. `user_metadata` 처럼 사용자가 고칠 수 있는 값은 쓰지 않는다 — 쓰면 아무 조직이나 주장할 수 있다.

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

⚠️ 1번만 하고 `DATABASE_URL` 을 안 넣으면 데모 데이터가, `DATABASE_URL` 만 넣고 1번을 안 하면 로그인 화면이 나온다. **둘 다 필요하다.**

### 1. 최소권한 역할 생성

Supabase SQL Editor 에서 `scripts/sql/web-readonly-role.sql` 을 **비밀번호를 바꿔서** 실행한다.

이 역할은 대시보드 6개 테이블에 `SELECT` 만 갖는다. `ProviderAccount`, `ConnectorOAuthCredential` 같은 credential 테이블과 모든 쓰기는 권한 자체가 없다.

### 2. Vercel 환경변수

```
DATABASE_URL = postgresql://searchops_web_readonly:<비밀번호>@<host>:6543/postgres?pgbouncer=true
```

⚠️ **넣지 말아야 할 것:**

- `DIRECT_DATABASE_URL` — 마이그레이션 전용이다. 서버리스에서 쓰면 Supabase 커넥션 한도를 금방 먹는다. 포트 6543(풀러)를 써라.
- `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` — **절대.** 이게 Vercel 에 있으면 프론트 침해 한 번으로 전 테넌트의 BYOK credential 이 복호화된다. 그래서 이 경로로는 커넥터/Integrations 화면을 살릴 수 없고, 살리지도 않는다.

## 자격증명 경계 — 원래 규칙과의 관계

원래 운영 규칙은 "Vercel 에는 encryption key, DB/Redis, provider secret 을 두지 않는다" 였다. 직접 DB 모드는 이 중 **DB 를 명시적으로 예외 처리한다.** API 를 배포하지 않는 이상 웹이 실데이터를 그리려면 어떤 형태로든 자격증명이 필요하기 때문이다.

규칙의 취지(프론트 침해 시 폭발 반경 억제)는 다음으로 지킨다:

1. **encryption key 는 여전히 Vercel 에 없다.** 크라운 주얼은 그대로 보호된다.
2. **역할이 읽기 전용이고 대시보드 테이블에만 붙는다.** 코드가 아니라 `GRANT` 로 막으므로 코드에 버그가 나도 권한은 남지 않는다.
3. **새 테이블에 권한이 자동으로 새지 않는다** — `alter default privileges ... revoke all`.

남는 위험: Vercel 이 침해되면 **모든 조직의 SEO 데이터를 읽을 수 있다**(조직 스코프는 애플리케이션 레벨이라 DB 역할로는 못 막는다). 이걸 더 줄이려면 테이블마다 RLS 정책을 걸고 사용자 JWT 로 붙는 방식으로 가야 하는데, Prisma 관리 스키마 25개 테이블에 RLS 를 얹는 별도 작업이다. 현재 테넌트가 사실상 하나라 그 비용을 지금 낼 이유가 없다고 판단했다 — 테넌트가 늘면 재검토 대상이다.

## 검증

```bash
pnpm smoke:web-db
```

임시 Postgres 에 실제 마이그레이션을 적용하고, 두 조직을 심고, 16가지를 확인한다 — 실데이터 조회, 타 조직 차단, 존재 여부 미노출, 그리고 **운영에 쓸 역할 SQL 을 그대로 돌려** credential 테이블과 쓰기가 실제로 거부되는지까지. CI(`credential-smoke` 잡)에서도 돈다.

## 아직 API 가 필요한 것

읽기 대시보드는 전부 API 없이 돈다. 다음은 남아 있다:

- **커넥터 / Integrations** — credential 복호화가 필요하고, 그 키는 Vercel 에 두지 않는다. 설계상 API/워커 몫이다.
- **쓰기 전부** — 사이트 등록, 지시서 상태 변경, 재검수 큐잉. 읽기 전용 역할이라 막힌다. 필요해지면 별도 쓰기 역할과 함께 설계한다.
- **GEO / 컴플라이언스 / 콘텐츠 브리프** — 이건 API 문제가 아니라 **데이터를 만드는 실행 주체가 없어서**다(배치는 크롤만 한다). 만들어지기 시작하면 같은 스냅샷에 얹으면 된다.
