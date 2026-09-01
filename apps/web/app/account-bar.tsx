import Link from "next/link";

import { getSupabaseServerClient } from "../src/supabase-server";
import { signOutAction } from "./login/actions";

// 로그아웃할 방법이 화면에 아예 없었다. signOutAction 은 처음부터 있었는데 어디에도
// 연결돼 있지 않아서, 다른 계정으로 바꾸거나 토큰을 새로 받으려면 쿠키를 직접 지우거나
// 시크릿 창을 여는 수밖에 없었다 — 실제로 그것 때문에 진단이 몇 번 막혔다.
export async function AccountBar() {
  const supabase = await getSupabaseServerClient();
  const claims =
    supabase === null ? null : (await supabase.auth.getClaims().catch(() => null))?.data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;

  return (
    <div className="searchops-account-bar">
      {email === null ? (
        <Link href="/login">로그인</Link>
      ) : (
        <>
          <span className="searchops-muted">{email}</span>
          <form action={signOutAction}>
            <button className="searchops-button secondary" type="submit">
              로그아웃
            </button>
          </form>
        </>
      )}
    </div>
  );
}




