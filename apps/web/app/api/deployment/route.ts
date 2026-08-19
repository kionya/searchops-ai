import { getApiBaseUrl } from "../../../src/api-base-url";
import { apiFetchAsUser } from "../../../src/api-client";
import { probeDatabase } from "../../../src/site-database";
import { getSupabaseServerClient } from "../../../src/supabase-server";
import { isDirectDatabaseMode } from "../../../src/web-database-url";

// 배포된 빌드가 무엇이고 어떤 모드로 도는지 확인하는 엔드포인트.
//
// 왜 필요한가: 대시보드는 전부 로그인 뒤에 있어서, 밖에서는 "내 수정이 배포됐는지",
// "환경변수가 먹었는지"를 알 방법이 전혀 없었다. 실제로 이 질문에 세 번 막혔다.
//
// 값이 아니라 **불리언과 커밋 해시만** 낸다. 접속 문자열·키·호스트명은 절대 내지 않는다.
// 커밋 해시는 비밀이 아니고, 불리언은 공격에 쓸 정보가 없다.

export const dynamic = "force-dynamic";

// 로그인 토큰이 API 에서 거절될 때 화면에는 401 하나만 남는다. 만료인지, 클레임이
// 없는 건지, 서명 키가 안 맞는 건지 구분이 안 돼 실제로 이 자리에서 몇 시간을 썼다.
// 로그인한 사람이 이 주소를 열면 자기 토큰이 어떤 모양인지 그대로 보인다.
//
// ⚠️ 토큰 자체도, 서명도 내지 않는다. 서명 검증은 API 몫이고 여기서는 payload 의
// 클레임 유무만 본다 — 그것만으로 처방이 갈린다.
function describeToken(accessToken: string) {
  const [, payload] = accessToken.split(".");
  if (payload === undefined) {
    return { readable: false as const };
  }
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return { readable: false as const };
  }
  const expiresAt = typeof claims.exp === "number" ? claims.exp : null;
  return {
    readable: true as const,
    audience: typeof claims.aud === "string" ? claims.aud : null,
    issuer: typeof claims.iss === "string" ? claims.iss : null,
    // 훅이 먹었는지 여기서 갈린다. userRole 은 본인 역할이라 본인에게 보여도 된다.
    hasUserRole: typeof claims.user_role === "string",
    userRole: typeof claims.user_role === "string" ? claims.user_role : null,
    hasOrganizationId: typeof claims.organization_id === "string",
    role: typeof claims.role === "string" ? claims.role : null,
    expiresInSeconds: expiresAt === null ? null : expiresAt - Math.floor(Date.now() / 1000),
  };
}

async function probeAuth() {
  const supabase = await getSupabaseServerClient();
  const accessToken =
    supabase === null ? null : (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) {
    return { signedIn: false as const };
  }

  const apiBaseUrl = getApiBaseUrl();
  const token = describeToken(accessToken);
  if (apiBaseUrl === null) {
    return { signedIn: true as const, token };
  }

  try {
    const response = await apiFetchAsUser(`${apiBaseUrl}/auth/context`, accessToken, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    return {
      signedIn: true as const,
      token,
      api: {
        accepted: response.ok,
        status: response.status,
        // auth.ts 가 던지는 고정 문자열이다. 값이 아니라 사유라 그대로 내도 된다.
        ...(response.ok || typeof body?.message !== "string" ? {} : { message: body.message }),
      },
    };
  } catch {
    return { signedIn: true as const, token, api: { accepted: false, status: 0 } };
  }
}

export async function GET() {
  return Response.json({
    auth: await probeAuth(),
    // 접속만 확인한다(select 1). 데이터도, 호스트명도, 사용자명도 내지 않는다.
    database: await probeDatabase(),
    // Vercel 이 빌드 시점에 주입한다. 로컬/다른 호스팅에서는 null.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    config: {
      // 죽은 주소가 남아 있으면 화면들이 매 렌더마다 그걸 두드린다.
      apiBaseUrl: getApiBaseUrl() !== null,
      // 켜져 있어야 대시보드가 실데이터를 그린다.
      directDatabase: isDirectDatabaseMode(),
      // 꺼져 있으면 로그인 화면이 "사용할 수 없습니다" 로 뜬다.
      supabaseAuth: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
    }
  });
}
