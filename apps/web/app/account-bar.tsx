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
    <div style={barStyle}>
      {email === null ? (
        <Link href="/login" style={linkStyle}>
          로그인
        </Link>
      ) : (
        <>
          <span style={emailStyle}>{email}</span>
          <form action={signOutAction}>
            <button type="submit" style={buttonStyle}>
              로그아웃
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const barStyle = {
  alignItems: "center",
  borderBottom: "1px solid var(--so-line)",
  display: "flex",
  fontSize: 14,
  gap: 12,
  justifyContent: "flex-end",
  padding: "10px 16px",
} as const;

const emailStyle = { color: "var(--so-muted)" } as const;

const linkStyle = {
  color: "var(--so-accent)",
  fontWeight: 600,
  textDecoration: "none",
} as const;

const buttonStyle = {
  background: "var(--so-paper)",
  border: "1px solid var(--so-line)",
  borderRadius: 8,
  color: "var(--so-ink)",
  cursor: "pointer",
  fontSize: 14,
  padding: "5px 12px",
} as const;
