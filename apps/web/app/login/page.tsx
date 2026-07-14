import { getPublicSupabaseConfig } from "../../src/supabase-server";
import { loginAction } from "./actions";

interface LoginPageProps {
  readonly searchParams?: Promise<{ error?: string | string[] }>;
}

const pageStyle = {
  alignItems: "center",
  color: "#172033",
  display: "grid",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  minHeight: "calc(100vh - 62px)",
  padding: "32px 16px",
} as const;

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
  margin: "0 auto",
  maxWidth: 420,
  padding: "28px",
  width: "100%",
} as const;

const fieldStyle = {
  display: "grid",
  fontSize: 14,
  fontWeight: 700,
  gap: 7,
} as const;

const inputStyle = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#172033",
  font: "inherit",
  minHeight: 44,
  padding: "10px 12px",
  width: "100%",
} as const;

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
      <section aria-labelledby="login-heading" style={panelStyle}>
        <p
          style={{
            color: "#0f766e",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0,
            margin: "0 0 8px",
          }}
        >
          SEARCHOPS AI
        </p>
        <h1 id="login-heading" style={{ fontSize: 26, letterSpacing: 0, margin: 0 }}>
          계정 로그인
        </h1>
        <p style={{ color: "#64748b", lineHeight: 1.5, margin: "10px 0 22px" }}>
          운영 대시보드에 등록된 이메일로 로그인하세요.
        </p>

        {!configured ? (
          <p
            role="status"
            style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 6,
              color: "#9a3412",
              fontSize: 14,
              lineHeight: 1.45,
              padding: "11px 12px",
            }}
          >
            현재 로그인을 사용할 수 없습니다. 관리자에게 문의하세요.
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              color: "#b91c1c",
              fontSize: 14,
              lineHeight: 1.45,
              padding: "11px 12px",
            }}
          >
            {errorMessage}
          </p>
        ) : null}

        <form action={loginAction} style={{ display: "grid", gap: 16 }}>
          <label style={fieldStyle}>
            이메일
            <input
              autoComplete="email"
              disabled={!configured}
              name="email"
              required
              style={inputStyle}
              type="email"
            />
          </label>
          <label style={fieldStyle}>
            비밀번호
            <input
              autoComplete="current-password"
              disabled={!configured}
              name="password"
              required
              style={inputStyle}
              type="password"
            />
          </label>
          <button
            disabled={!configured}
            style={{
              background: configured ? "#0f766e" : "#94a3b8",
              border: 0,
              borderRadius: 6,
              color: "#ffffff",
              cursor: configured ? "pointer" : "not-allowed",
              font: "inherit",
              fontWeight: 800,
              minHeight: 44,
              padding: "10px 16px",
            }}
            type="submit"
          >
            로그인
          </button>
        </form>
      </section>
    </main>
  );
}
