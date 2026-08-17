import { cache } from "react";

import type { SiteDashboardSnapshot } from "@searchops/db";
import type { Site } from "@searchops/types";

import { getCurrentProviderUser } from "./provider-accounts";
import { getWebDatabaseUrl, isDirectDatabaseMode } from "./web-database-url";

// 스위치는 web-database-url.ts 가 정본이다. 기존 호출자를 위해 여기서도 내보낸다.
export { getWebDatabaseUrl, isDirectDatabaseMode } from "./web-database-url";

// SearchOps API 를 배포하지 않고도 대시보드가 실데이터를 그리게 하는 경로.
//
// API 가 웹에 더해주던 것은 사실상 데이터 접근 하나뿐이었다. 인증과 테넌트 스코프는
// 웹이 이미 스스로 한다 — getCurrentProviderUser() 가 Supabase JWT 를 검증해
// organizationId 와 role 을 얻는다(provider-accounts.ts). 그래서 같은 Prisma 계층을
// 서버 컴포넌트에서 직접 부르면 HTTP 한 겹이 통째로 없어진다.
//
// ⚠️ 자격증명 경계: 이 경로는 Vercel 에 DB 접속 정보를 둔다. 원래 운영 규칙은
// "Vercel 에는 encryption key, DB/Redis, provider secret 을 두지 않는다" 였다.
// 규칙의 취지(프론트 침해 시 폭발 반경 억제)를 지키려고 두 가지를 강제한다:
//   1. credential encryption key 는 절대 Vercel 에 두지 않는다. 그래서 이 경로로는
//      ProviderAccount/커넥터 화면을 살릴 수 없고, 살리지도 않는다.
//   2. 여기 쓰는 역할은 대시보드 테이블에 SELECT 만 가진 전용 역할이어야 한다.
//      생성 SQL 은 docs/WEB_DIRECT_DB.md 에 있다. 코드가 아니라 GRANT 로 막는 이유는
//      코드에 버그가 나도 권한은 남기 때문이다.
//
// @searchops/db 는 정적으로 임포트하지 않는다. 정적 임포트면 DATABASE_URL 이 없는
// 환경(단위 테스트, 픽스처 모드)에서도 Prisma 엔진을 끌고 온다.

// 서버리스에서 요청마다 새 클라이언트를 만들면 커넥션이 폭발하므로 모듈 스코프에 캐시한다.
// URL 은 반드시 풀러(pgbouncer) 쪽이어야 한다 — direct/session URL 을 서버리스에서
// 쓰면 Supabase 커넥션 한도를 금방 먹는다.
let cachedPrisma: unknown = null;

async function getDb() {
  const db = await import("@searchops/db");
  const datasourceUrl = getWebDatabaseUrl();
  cachedPrisma ??= db.createSearchOpsPrismaClient(
    datasourceUrl === null ? {} : { datasourceUrl },
  );
  return { db, prisma: cachedPrisma as Parameters<typeof db.loadSiteDashboardSnapshot>[0] };
}

/**
 * 검증된 사용자의 조직으로만 스코프해 사이트 스냅샷을 읽는다. 직접 DB 모드가 아니거나
 * 미인증이면 null.
 *
 * 조직 대조는 @searchops/db 의 loadSiteDashboardSnapshot 안에서 일어난다 — 여기서
 * 한 번 더 하지 않는 이유는, 검사를 두 군데 두면 한쪽만 고치는 사고가 나기 때문이다.
 * 없는 사이트와 남의 사이트를 똑같이 null 로 돌려주는 것도 그쪽 계약이다.
 *
 * react cache 로 요청 단위 메모이즈한다. 레이아웃과 페이지가 같은 사이트를 각각
 * 읽어도 쿼리는 한 번만 나간다.
 */
export const getSiteSnapshot = cache(
  async (siteId: string): Promise<SiteDashboardSnapshot | null> => {
    if (!isDirectDatabaseMode()) {
      return null;
    }
    let organizationId: string;
    try {
      organizationId = (await getCurrentProviderUser()).organizationId;
    } catch {
      return null;
    }
    const { db, prisma } = await getDb();
    return db.loadSiteDashboardSnapshot(prisma, { organizationId, siteId });
  },
);

export const getOrganizationSites = cache(async (): Promise<readonly Site[] | null> => {
  if (!isDirectDatabaseMode()) {
    return null;
  }
  let organizationId: string;
  try {
    organizationId = (await getCurrentProviderUser()).organizationId;
  } catch {
    return null;
  }
  const { db, prisma } = await getDb();
  return db.listOrganizationSites(prisma, organizationId);
});
