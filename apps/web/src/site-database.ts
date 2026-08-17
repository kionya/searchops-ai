import { cache } from "react";

import type { SiteDashboardSnapshot } from "@searchops/db";
import type { Site, WorkOrderStatus } from "@searchops/types";

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
  // ⚠️ 반드시 pg 드라이버 어댑터를 쓴다. 기본 클라이언트는 libquery_engine-*.node
  // 바이너리를 런타임에 찾는데, Vercel 람다에는 그 파일이 들어가지 않았다
  // (outputFileTracingIncludes 를 여러 경로로 시도했지만 함수 안에 아무것도 안 들어갔다).
  // 어댑터는 바이너리가 아예 필요 없어서 그 실패 모드가 통째로 사라진다.
  cachedPrisma ??= await db.createSearchOpsPrismaClientWithPgAdapter(datasourceUrl ?? "");
  return { db, prisma: cachedPrisma as Parameters<typeof db.loadSiteDashboardSnapshot>[0] };
}

export type DatabaseProbeResult =
  | {
      readonly reachable: true;
      // 쓰기 권한이 붙었는지. `select 1` 은 예전 읽기 전용 역할로도 통과하므로
      // 이게 없으면 "역할을 바꾸고 재배포했는가" 를 로그인 없이 알 방법이 없다.
      readonly writable: boolean;
    }
  | {
      readonly reachable: false;
      readonly reason: DatabaseProbeFailure;
      // 엔진/모듈 문제일 때만 채운다. 이 두 경우의 메시지에는 접속 문자열이나
      // 사용자명이 들어가지 않고 탐색 경로만 들어간다 — 그게 진단에 필요한 전부다.
      readonly detail?: string;
      readonly url?: Record<string, unknown>;
    };

// 원문 오류를 그대로 내보내지 않는다 — 호스트명과 사용자명이 들어 있다.
export type DatabaseProbeFailure =
  | "not_configured"
  | "auth_failed"
  | "unreachable"
  | "permission_denied"
  | "engine_missing"
  | "unknown";

/**
 * 접속만 확인한다. 데이터는 읽지 않는다.
 *
 * 대시보드가 전부 로그인 뒤에 있어서, DB URL 이 틀렸는지 권한이 없는지 엔진이 없는지를
 * 밖에서 구분할 방법이 없었다. 이 함수는 그 구분만 해준다.
 */
export async function probeDatabase(): Promise<DatabaseProbeResult> {
  if (!isDirectDatabaseMode()) {
    return { reachable: false, reason: "not_configured" };
  }
  try {
    const { prisma } = await getDb();
    await prisma.$queryRaw`select 1`;
    return { reachable: true, writable: await probeWritable(prisma) };
  } catch (error) {
    const reason = classifyDatabaseFailure(error);
    if (reason !== "engine_missing" && reason !== "unknown") {
      return { reachable: false, reason };
    }
    const text = error instanceof Error ? error.message : String(error);
    return {
      detail: text.replace(/\s+/g, " ").slice(0, 2000),
      reachable: false,
      reason,
      url: describeConnectionString(getWebDatabaseUrl())
    };
  }
}

/**
 * 이 접속이 `Site` 에 INSERT 할 수 있는지만 본다. 쓰지는 않는다.
 *
 * 왜 필요한가: 읽기 전용 역할에서 쓰기 가능 역할로 갈아끼울 때, 환경변수를 바꾸고
 * 재배포했는지 확인할 방법이 밖에서 없었다 — `select 1` 은 양쪽 다 통과한다. 확인
 * 없이 예전 역할을 지우면 대시보드가 통째로 죽는다.
 *
 * 역할명이 아니라 **불리언만** 낸다. DB 사용자명은 자격증명의 절반이라, 공개
 * 엔드포인트에서 그걸 알려줄 이유가 없다.
 */
async function probeWritable(prisma: {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw`
      select has_table_privilege('public."Site"', 'INSERT') as writable
    `;
    const [first] = rows as ReadonlyArray<{ readonly writable?: unknown }>;
    return first?.writable === true;
  } catch {
    // 권한 조회 자체가 실패해도 접속은 성공한 것이다. 여기서 던지면 reachable 이
    // false 로 뒤집혀서 원래 문제(권한)를 접속 문제로 오진하게 만든다.
    return false;
  }
}

/**
 * 접속 문자열의 **형태만** 보고한다. 값은 절대 내지 않는다.
 *
 * "Invalid URL" 같은 오류는 원인이 눈에 안 보인다 — 플레이스홀더를 안 바꿨거나,
 * 비밀번호에 퍼센트 인코딩이 필요한 문자가 들어갔거나, 따옴표가 붙어 있거나.
 * 그 셋을 값 노출 없이 구분한다.
 */
function describeConnectionString(value: string | null): Record<string, unknown> {
  if (value === null) {
    return { present: false };
  }
  const shape: Record<string, unknown> = {
    present: true,
    length: value.length,
    // 플레이스홀더를 그대로 붙여넣는 사고가 잦다.
    hasAngleBrackets: /[<>]/.test(value),
    hasWhitespace: /\s/.test(value),
    hasQuotes: /^["']|["']$/.test(value),
    startsWithPostgres: /^postgres(ql)?:\/\//.test(value)
  };
  try {
    const parsed = new URL(value);
    shape.parses = true;
    shape.protocol = parsed.protocol;
    shape.port = parsed.port || "(기본값)";
    shape.database = parsed.pathname.replace(/^\//, "") || "(없음)";
    shape.hasUsername = parsed.username.length > 0;
    shape.hasPassword = parsed.password.length > 0;
    // 인코딩이 필요한 문자가 원문 비밀번호 자리에 있는지만 본다. 값은 내지 않는다.
    shape.passwordNeedsEncoding =
      parsed.password.length > 0 && parsed.password !== encodeURIComponent(decodeURIComponent(parsed.password));
    shape.searchParams = [...parsed.searchParams.keys()];
  } catch (error) {
    shape.parses = false;
    shape.parseError = error instanceof Error ? error.message.slice(0, 80) : "unknown";
    // 파싱이 실패했을 때만, 글자를 전부 x 로 덮은 뼈대를 보여준다. 구두점과 길이만
    // 남으므로 호스트가 빠졌는지 포트가 이상한지 바로 보인다. 값은 복원할 수 없다.
    shape.skeleton = value.replace(/[^:/@?&=.\-_]/g, "x");
  }
  return shape;
}

function classifyDatabaseFailure(error: unknown): DatabaseProbeFailure {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/query engine|libquery_engine|PrismaClientInitializationError.*platform/i.test(text)) {
    return "engine_missing";
  }
  // 테이블 단위 거부가 먼저다 — 접속은 됐는데 GRANT 가 빠진 경우라 처방이 다르다.
  if (/permission denied for/i.test(text)) {
    return "permission_denied";
  }
  // P1000 = 비밀번호 불일치, P1010 = "User was denied access on the database".
  // 운영자 관점에서는 둘 다 "자격증명이 틀렸다" 로 수렴한다(사용자·비밀번호·CONNECT 권한).
  if (/authentication failed|denied access|P1000|P1010/i.test(text)) {
    return "auth_failed";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|reach database server|P1001|P1002/i.test(text)) {
    return "unreachable";
  }
  return "unknown";
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

// ── 쓰기 ────────────────────────────────────────────────────────────────────
//
// 쓰기는 cache() 로 감싸지 않는다. react cache 는 같은 요청 안의 중복 호출을 합치는데,
// 폼을 두 번 제출한 것을 한 번으로 만들어 버리면 두 번째가 성공한 것처럼 보인다.
//
// 여기서 허용하는 쓰기는 두 가지뿐이고, DB 역할도 딱 그만큼만 GRANT 받았다
// (scripts/sql/web-role.sql). 코드에 새 쓰기를 추가해도 GRANT 가 없으면 그냥 거부된다 —
// 그게 의도한 순서다. 권한을 먼저 넓히지 않으면 실수로 넓어질 수 없다.

/**
 * 로그인한 사용자의 조직으로 사이트를 등록한다. 직접 DB 모드가 아니거나 미인증이면 null.
 *
 * organizationId 는 폼이 아니라 검증된 세션에서만 온다. 폼에서 받으면 남의 조직에
 * 사이트를 만들어 넣을 수 있다.
 */
export async function createOrganizationSite(input: {
  readonly country: string;
  readonly domain: string;
  readonly industry?: string | null | undefined;
  readonly language: string;
  readonly name?: string | null | undefined;
}): Promise<Site | null> {
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
  return db.registerOrganizationSite(prisma, { ...input, organizationId });
}

/**
 * 작업 지시서 상태를 바꾼다. 남의 조직 것이거나 없는 id 면 false(조직 대조는
 * UPDATE 문 안에서 일어난다). 직접 DB 모드가 아니거나 미인증이어도 false.
 */
export async function setWorkOrderStatus(
  workOrderId: string,
  status: WorkOrderStatus,
): Promise<boolean> {
  if (!isDirectDatabaseMode()) {
    return false;
  }
  let organizationId: string;
  try {
    organizationId = (await getCurrentProviderUser()).organizationId;
  } catch {
    return false;
  }
  const { db, prisma } = await getDb();
  return db.updateOrganizationWorkOrderStatus(prisma, { organizationId, status, workOrderId });
}
