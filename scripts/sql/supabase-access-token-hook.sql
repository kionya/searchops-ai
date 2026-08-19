-- Supabase Custom Access Token Hook — 로그인 토큰에 SearchOps 역할을 실어 보낸다.
--
-- 왜 필요한가: API 는 토큰의 클레임만 보고 권한을 정한다(apps/api/src/auth.ts,
-- resolveJwtAuthRole). Supabase 가 기본으로 발급하는 토큰에는 role="authenticated"
-- 만 있고 user_role 이 없어서, 검증기가
--   "Bearer token is missing a valid user_role."
-- 로 전부 401 을 낸다. 로그인은 되는데 API 호출만 모조리 거절당하는 상태가 된다.
-- 실제로 커넥터 연결이 여기서 막혔다.
--
-- 적용: Supabase 대시보드 → Authentication → Hooks → Customize Access Token (JWT) Claims
--       → 이 함수를 선택하고 Enable. 이 SQL 만 돌려서는 아무 일도 일어나지 않는다.
-- 해제: 대시보드에서 Disable. 함수만 지우면 훅이 켜진 채로 남아 로그인이 깨진다 —
--       반드시 Disable 이 먼저다.

create or replace function public.searchops_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  found_role text;
  found_org text;
  claims jsonb;
begin
  -- id 와 이메일 **둘 다** 본다.
  --
  -- 왜 이메일도 보나: 초대 수락(acceptInvitation)이 User 행을 만들 때 id 를 지정하지
  -- 않아 Prisma 가 cuid 를 붙인다. 그 값은 Supabase auth 의 UUID 와 절대 같을 수 없다.
  -- 그래서 id 로만 찾으면 초대받은 사용자는 전원 user_role 없이 401 을 맞는다 —
  -- 첫 사용자에게서 실제로 그랬고 손으로 id 를 맞춰 넘겼다. 초대는 이메일로 발행되고
  -- 앱의 소속 조회(provider-accounts.ts)도 이미 이메일을 키로 쓴다.
  --
  -- ⚠️ email_confirmed_at 검사를 빼지 마라. 확인되지 않은 이메일로도 매칭되면
  -- 아무나 초대받은 주소로 가입해 그 역할을 가져갈 수 있다.
  select u."role"::text, u."organizationId"
    into found_role, found_org
    from auth.users a
    join public."User" u
      on u."id" = a.id::text
      or (a.email_confirmed_at is not null and lower(u."email") = lower(a.email))
   where a.id::text = event->>'user_id'
   -- id 가 맞는 행이 있으면 그쪽이 우선이다.
   order by (u."id" = a.id::text) desc
   limit 1;

  if found_role is null then
    -- 아직 User 행이 없는 계정이다. 클레임 없이 그대로 내보낸다 — 로그인은 되고
    -- API 호출만 401 이 된다. 여기서 예외를 던지면 토큰 발급 자체가 실패해
    -- 그 계정은 로그인조차 못 한다.
    return event;
  end if;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_role}', to_jsonb(found_role));
  claims := jsonb_set(claims, '{organization_id}', to_jsonb(found_org));
  return jsonb_set(event, '{claims}', claims);
exception
  when others then
    -- ⚠️ 의도적으로 삼킨다. 훅이 던지면 Supabase 는 토큰을 발급하지 못하고
    -- 전 사용자가 로그인 불가가 된다. 클레임이 빠지면 API 만 401 이다 —
    -- 지금과 같은 상태로 후퇴할 뿐이라 훨씬 가볍다.
    return event;
end;
$$;

-- 훅은 supabase_auth_admin 이 호출한다. 필요한 만큼만 준다.
--
-- ⚠️ 여기에 "grant usage on schema public to supabase_auth_admin" 을 넣지 마라.
-- 스키마 자체에 대한 GRANT 는 소유자(pg_database_owner)만 할 수 있어서 SQL Editor 의
-- postgres 로는 42501 permission denied for schema public 이 나고, 한 트랜잭션이라
-- 함수 생성까지 통째로 롤백된다. 그리고 애초에 필요 없다 — supabase_auth_admin 은
-- 이미 public 에 USAGE 를 갖고 있다. 확인:
--   select has_schema_privilege('supabase_auth_admin','public','USAGE');
grant execute on function public.searchops_access_token_hook(jsonb) to supabase_auth_admin;
grant select on table public."User" to supabase_auth_admin;
-- auth.users 는 supabase_auth_admin 소유라 따로 줄 것이 없다.

-- 일반 사용자가 직접 부를 이유가 없다.
revoke execute on function public.searchops_access_token_hook(jsonb) from authenticated, anon, public;

-- 적용 확인. 세 값이 모두 true / owner 여야 한다.
select
  has_function_privilege('supabase_auth_admin',
    'public.searchops_access_token_hook(jsonb)', 'EXECUTE')       as auth_admin_can_execute,
  has_table_privilege('supabase_auth_admin','public."User"','SELECT') as auth_admin_can_read_user,
  public.searchops_access_token_hook(
    jsonb_build_object(
      'user_id', (select "id" from public."User" order by "email" limit 1),
      'claims', jsonb_build_object('role','authenticated')
    )
  )->'claims'->>'user_role'                                        as sample_user_role;
