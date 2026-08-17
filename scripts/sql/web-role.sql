-- 웹(Vercel)이 API 없이 대시보드를 그리고 두 가지 쓰기를 하기 위해 쓰는 전용 DB 역할.
--
-- 원래 운영 규칙은 "Vercel 에는 DB 자격증명을 두지 않는다" 였다. API 를 배포하지 않는
-- 이상 웹이 실데이터를 다루려면 어떤 형태로든 자격증명이 필요하므로, 규칙의 취지
-- (프론트 침해 시 폭발 반경 억제)를 GRANT 로 강제한다. 코드가 아니라 권한으로 막는
-- 이유는 코드에 버그가 나도 권한은 남기 때문이다.
--
-- 이 역할이 할 수 있는 것:
--   읽기  대시보드 6개 테이블 + User 의 4개 컬럼(로그인 소속 확인)
--   쓰기  Site INSERT (사이트 등록) / WorkOrder 의 status·updatedAt UPDATE (지시서 상태 이동)
-- 할 수 없는 것:
--   DELETE 전부, 위 둘을 제외한 모든 UPDATE·INSERT,
--   credential 을 담은 테이블 접근 전부(ProviderAccount, ConnectorOAuthCredential, SiteConnector ...)
--
-- 실행:
--   psql "<postgres 접속문자열>" -v web_password=직접지은비밀번호 -f scripts/sql/web-role.sql
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
--
-- ⚠️ 예전 역할 searchops_web_readonly 를 쓰고 있었다면: 이 스크립트는 그 역할을 건드리지
-- 않는다(전환 중에 운영이 끊기지 않게 하려고). Vercel 환경변수를 searchops_web 으로 바꾸고
-- 배포가 정상인 걸 확인한 뒤 `drop role searchops_web_readonly;` 로 지워라. 남겨두면
-- 아무도 안 쓰는데 살아 있는 자격증명이 된다.
\if :{?web_password}
\else
\echo '중단: -v web_password=<비밀번호> 를 주고 실행해라. 기본 비밀번호는 제공하지 않는다.'
\quit
\endif

-- DO 블록 안에서는 psql 변수가 치환되지 않으므로 \gexec 로 문장을 만들어 실행한다.
-- 없으면 만들고, 있으면 비밀번호를 다시 설정한다 — 재실행이 항상 같은 결과를 낸다.
select 'create role searchops_web login password ' || quote_literal(:'web_password')
where not exists (select from pg_roles where rolname = 'searchops_web')
\gexec

select 'alter role searchops_web login password ' || quote_literal(:'web_password')
\gexec

grant usage on schema public to searchops_web;

-- ── 읽기 ────────────────────────────────────────────────────────────────────
-- 대시보드가 읽는 테이블만. 새 화면을 붙일 때 여기 추가하지 않으면 그 화면은 그냥
-- 안 뜬다 — 조용히 더 많은 데이터에 접근하게 되는 것보다 낫다.
grant select on
  public."Site",
  public."CrawlRun",
  public."UrlRecord",
  public."SeoIssue",
  public."WorkOrder",
  public."SchemaRecommendation"
to searchops_web;

-- 로그인한 사용자의 조직 소속을 확인하는 데만 쓴다(findUserMembershipByEmail).
-- 이게 있어야 Supabase custom access token hook 없이 로그인이 동작한다.
-- 컬럼 단위로 준다 — 이름·가입일까지 열 이유가 없다.
grant select ("id", "organizationId", "email", "role") on public."User"
to searchops_web;

-- ── 쓰기 ────────────────────────────────────────────────────────────────────
-- 사이트 등록. INSERT 만 준다 — UPDATE 가 없으므로 이미 등록된 사이트의 도메인이나
-- 소속 조직을 바꿔치기할 수 없다. 등록 코드도 그래서 upsert 대신
-- `INSERT ... ON CONFLICT DO NOTHING` 을 쓴다(packages/db 의 registerOrganizationSite).
-- 컬럼을 나열하지 않는 이유: Site 의 모든 컬럼이 등록 폼에서 정당하게 채워지는 값이라
-- 좁혀도 얻는 게 없고, Prisma 가 어떤 컬럼을 명시할지에 따라 런타임에 깨지기만 한다.
grant insert on public."Site" to searchops_web;

-- 지시서 상태 이동. 컬럼을 좁히는 게 여기서는 실제로 의미가 있다 — 제목·근거·수용기준을
-- 조용히 고쳐 쓰는 것을 막는다. updatedAt 은 Prisma 의 @updatedAt 이 같이 쓴다.
grant update ("status", "updatedAt") on public."WorkOrder" to searchops_web;

-- DELETE 는 어느 테이블에도 주지 않는다. 웹에서 지우는 기능이 없고, 없어야 한다.

-- 앞으로 만들어질 테이블에 기본 권한이 새지 않게 한다. Prisma 마이그레이션이 새 테이블을
-- 만들어도 이 역할은 자동으로 접근권을 얻지 않는다.
alter default privileges in schema public revoke all on tables from searchops_web;

do $$
begin
  if exists (select from pg_roles where rolname = 'searchops_web_readonly') then
    raise notice '예전 역할 searchops_web_readonly 가 아직 있다. Vercel 을 searchops_web 으로 바꾼 뒤 drop role 로 지워라.';
  end if;
end
$$;

-- 확인용. set role 로 바꾼 뒤 아래가 각각 성공/거부여야 정상이다.
--   select count(*) from "Site";                        -- 동작
--   select count(*) from "ProviderAccount";             -- 거부
--   insert into "Site" ... ;                            -- 동작
--   update "WorkOrder" set status = 'done' where ...;   -- 동작
--   update "WorkOrder" set title = 'x' where ...;       -- 거부
--   delete from "Site";                                 -- 거부
