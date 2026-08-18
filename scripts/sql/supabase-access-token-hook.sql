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
  select u."role"::text, u."organizationId"
    into found_role, found_org
    from public."User" u
   where u."id" = event->>'user_id';

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
grant usage on schema public to supabase_auth_admin;
grant execute on function public.searchops_access_token_hook(jsonb) to supabase_auth_admin;
grant select on table public."User" to supabase_auth_admin;

-- 일반 사용자가 직접 부를 이유가 없다.
revoke execute on function public.searchops_access_token_hook(jsonb) from authenticated, anon, public;
