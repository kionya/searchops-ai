import { getPublicSupabaseConfig } from "../../src/supabase-server";
import { loginAction } from "./actions";

interface LoginPageProps {
  readonly searchParams?: Promise<{ error?: string | string[] }>;
}

const pageStyle = {
  alignItems: "center",
  display: "grid",
  minHeight: "calc(100vh - 62px)",
  padding: "32px 16px",
} as const;

const panelStyle = { margin: "0 auto", maxWidth: 420, padding: 28, width: "100%" } as const;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = getPublicSupabaseConfig() !== null;
  const error = Array.isArray(params?.error) ? params.error[0] : params?.error;
  const errorMessage =
    error === "configuration"
      ? "로그인 설정을 확인할 수 없습니다. 관리자에게 문의하세요."
      : error === "authentication"
        ? "이메일 또는 비밀번호를 확인하세요."
        : null;

  return (
    <main style={pageStyle}>
      <section aria-labelledby="login-heading" className="searchops-panel" style={panelStyle}>
        <p className="searchops-label" style={{ margin: "0 0 8px" }}>
          SearchOps AI
        </p>
        <h1 id="login-heading" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          계정 로그인
        </h1>
        <p style={{ color: "var(--so-muted)", lineHeight: 1.5, margin: "10px 0 22px" }}>
          운영 대시보드에 등록된 이메일로 로그인하세요.
        </p>

        {!configured ? (
          <p role="status" className="searchops-registration-feedback warning">
            현재 로그인을 사용할 수 없습니다. 관리자에게 문의하세요.
          </p>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="searchops-registration-feedback risk">
            {errorMessage}
          </p>
        ) : null}

        <form action={loginAction} style={{ display: "grid", gap: 16 }}>
          <label className="searchops-field">
            <span>이메일</span>
            <input autoComplete="email" disabled={!configured} name="email" required type="email" />
          </label>
          <label className="searchops-field">
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              disabled={!configured}
              name="password"
              required
              type="password"
            />
          </label>
          <button className="searchops-button" disabled={!configured} type="submit">
            로그인
          </button>
        </form>
      </section>
    </main>
  );
}
