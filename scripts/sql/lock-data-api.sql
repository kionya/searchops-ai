-- 공개 키(anon·authenticated)로 Supabase Data API(REST) 를 통해 운영 DB 를 읽고 쓰는 길을 막는다.
--
-- 2026-11-22 실측: Supabase 기본 권한 때문에 anon·authenticated 가 public 의 24개 테이블 전부에
-- SELECT/INSERT/UPDATE/DELETE 를 갖고 있었고 RLS 는 하나도 켜져 있지 않았다. 웹 번들에 들어가는
-- 공개 키(NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)로 https://<ref>.supabase.co/rest/v1/CrawlRun 이
-- 200 을 돌려줬다 — 자격증명 테이블(ProviderAccount 등)까지 같은 길로 열려 있었다는 뜻이다.
--
-- 이 레포는 Data API 를 쓰지 않는다. 웹의 supabase-js 는 로그인(auth)에만 쓰고, 데이터는
--   postgres            Prisma(API·워커·배치·마이그레이션) — BYPASSRLS 라 영향 없음
--   searchops_web       웹 직접 DB 모드 — 아래 정책으로 통과, 실제 범위는 web-role.sql GRANT 가 정한다
--   supabase_auth_admin access token hook 의 User 조회 — 아래 정책으로 통과
-- 로만 다룬다. 그래서 anon·authenticated 권한을 걷어내고, 모든 테이블에 RLS 를 켠다(이중 잠금).
--
-- 실행: Supabase SQL Editor 에 통째로 붙여 실행(역할은 postgres). 여러 번 실행해도 같은 결과.
-- 새 테이블이 생기면 다시 실행해라 — RLS 와 searchops_web 정책이 그 테이블에도 붙는다.

begin;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on function public.searchops_access_token_hook(jsonb) to supabase_auth_admin;

-- Prisma 마이그레이션(postgres)이 새로 만드는 테이블에 공개 키 권한이 다시 붙지 않게 한다.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

-- searchops_web 정책은 행을 거르지 않는다(using true). 이 역할이 무엇을 읽고 쓰는지는 GRANT 가 이미
-- 테이블·컬럼 단위로 정하므로, 정책까지 테이블별로 나누면 같은 목록을 두 곳에서 관리하게 된다.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('drop policy if exists searchops_web_all on public.%I', t.relname);
    execute format('create policy searchops_web_all on public.%I to searchops_web using (true) with check (true)', t.relname);
  end loop;
end
$$;

drop policy if exists auth_hook_read on public."User";
create policy auth_hook_read on public."User" for select to supabase_auth_admin using (true);

commit;

-- 확인(전부 기대값이어야 정상):
--   select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;          -- 0
--   select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r' and has_table_privilege('anon', c.oid, 'SELECT');  -- 0
--   웹 대시보드가 평소처럼 뜨고 로그인이 되는지 본다.
