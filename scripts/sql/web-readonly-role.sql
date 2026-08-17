-- 웹(Vercel)이 API 없이 대시보드를 그리기 위해 쓰는 전용 DB 역할.
--
-- 원래 운영 규칙은 "Vercel 에는 DB 자격증명을 두지 않는다" 였다. API 를 배포하지 않는
-- 이상 웹이 실데이터를 그리려면 어떤 형태로든 자격증명이 필요하므로, 규칙의 취지
-- (프론트 침해 시 폭발 반경 억제)를 GRANT 로 강제한다. 코드가 아니라 권한으로 막는
-- 이유는 코드에 버그가 나도 권한은 남기 때문이다.
--
-- 이 역할이 할 수 있는 것: 대시보드 6개 테이블 SELECT + User 의 4개 컬럼(로그인 소속 확인).
-- 할 수 없는 것: 쓰기 전부, credential 을 담은 테이블 접근 전부
--                (ProviderAccount, ConnectorOAuthCredential, SiteConnector ...).
--
-- 실행:
--   psql "<postgres 접속문자열>" -v web_password=직접지은비밀번호 -f scripts/sql/web-readonly-role.sql
--
-- 그 뒤 Vercel 의 SEARCHOPS_WEB_DATABASE_URL 을 이 역할 + 풀러(6543)로 설정한다.
-- 풀러는 사용자명이 `역할명.프로젝트ref` 형식이다. 마이그레이션용 direct URL 은
-- Vercel 에 넣지 마라 — 서버리스에서 쓰면 커넥션 한도를 금방 먹는다.
--
-- ⚠️ 기본 비밀번호를 파일에 두지 않는다. 이 레포는 공개라, 예전처럼 'CHANGE_ME' 를
-- 적어두면 그게 곧 공개된 자격증명이 된다 — 실제로 그렇게 남아 운영 DB 가 읽기
-- 노출됐다(재실행이 비밀번호를 건너뛰는 버그까지 겹쳤다). 변수를 안 주면 중단한다.
--
-- ⚠️ 권한: 실행 역할에 CREATEROLE 과 대상 역할의 ADMIN 옵션이 둘 다 있어야 한다(PG16+).
-- Supabase SQL Editor 에서 "permission denied to alter role" 이 나면 역할 임시 전환
-- (impersonation) 상태다 — 쿼리 앞에 `reset role;` 을 붙이거나 postgres 로 바꿔라.
\if :{?web_password}
\else
\echo '중단: -v web_password=<비밀번호> 를 주고 실행해라. 기본 비밀번호는 제공하지 않는다.'
\quit
\endif

-- DO 블록 안에서는 psql 변수가 치환되지 않으므로 \gexec 로 문장을 만들어 실행한다.
-- 없으면 만들고, 있으면 비밀번호를 다시 설정한다 — 재실행이 항상 같은 결과를 낸다.
select 'create role searchops_web_readonly login password ' || quote_literal(:'web_password')
where not exists (select from pg_roles where rolname = 'searchops_web_readonly')
\gexec

select 'alter role searchops_web_readonly login password ' || quote_literal(:'web_password')
\gexec

grant usage on schema public to searchops_web_readonly;

-- 대시보드가 읽는 테이블만. 새 화면을 붙일 때 여기 추가하지 않으면 그 화면은 그냥
-- 안 뜬다 — 조용히 더 많은 데이터에 접근하게 되는 것보다 낫다.
grant select on
  public."Site",
  public."CrawlRun",
  public."UrlRecord",
  public."SeoIssue",
  public."WorkOrder",
  public."SchemaRecommendation"
to searchops_web_readonly;

-- 로그인한 사용자의 조직 소속을 확인하는 데만 쓴다(findUserMembershipByEmail).
-- 이게 있어야 Supabase custom access token hook 없이 로그인이 동작한다.
-- 컬럼 단위로 준다 — 이름·가입일까지 열 이유가 없다.
grant select ("id", "organizationId", "email", "role") on public."User"
to searchops_web_readonly;

-- 앞으로 만들어질 테이블에 기본 권한이 새지 않게 한다. Prisma 마이그레이션이 새 테이블을
-- 만들어도 이 역할은 자동으로 접근권을 얻지 않는다.
alter default privileges in schema public revoke all on tables from searchops_web_readonly;

-- 확인용. 아래 두 줄은 각각 0 행과 permission denied 가 나와야 정상이다.
--   set role searchops_web_readonly; select count(*) from "Site";              -- 동작
--   set role searchops_web_readonly; select count(*) from "ProviderAccount";   -- 거부
--   set role searchops_web_readonly; insert into "Site" default values;        -- 거부
