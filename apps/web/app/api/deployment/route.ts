import { getApiBaseUrl } from "../../../src/api-base-url";
import { probeDatabase } from "../../../src/site-database";
import { isDirectDatabaseMode } from "../../../src/web-database-url";

// 배포된 빌드가 무엇이고 어떤 모드로 도는지 확인하는 엔드포인트.
//
// 왜 필요한가: 대시보드는 전부 로그인 뒤에 있어서, 밖에서는 "내 수정이 배포됐는지",
// "환경변수가 먹었는지"를 알 방법이 전혀 없었다. 실제로 이 질문에 세 번 막혔다.
//
// 값이 아니라 **불리언과 커밋 해시만** 낸다. 접속 문자열·키·호스트명은 절대 내지 않는다.
// 커밋 해시는 비밀이 아니고, 불리언은 공격에 쓸 정보가 없다.

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
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
