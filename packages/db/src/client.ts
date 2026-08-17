import { PrismaClient } from "./generated/prisma/index.js";

export type SearchOpsPrismaClient = PrismaClient;

export interface CreateSearchOpsPrismaClientOptions {
  /**
   * 접속 URL 을 명시한다. 생략하면 schema.prisma 의 `env("DATABASE_URL")` 을 쓴다.
   *
   * 웹은 이걸 반드시 넘긴다. `DATABASE_URL` 을 그대로 쓰면 호스팅 플랫폼의 통합이
   * 주입한 전권 연결 문자열을 모르는 새 집어 쓰게 된다 — 최소권한 역할을 쓰겠다는
   * 설계가 조용히 무력화된다.
   */
  readonly datasourceUrl?: string | undefined;
}

export function createSearchOpsPrismaClient(
  options: CreateSearchOpsPrismaClientOptions = {},
): SearchOpsPrismaClient {
  // Prisma 의 Subset 제네릭이 유니온을 거부하므로 분기해서 각각 호출한다.
  const datasourceUrl = options.datasourceUrl?.trim();
  return datasourceUrl ? new PrismaClient({ datasourceUrl }) : new PrismaClient();
}

/**
 * 네이티브 쿼리 엔진 대신 pg 드라이버 어댑터로 붙는 클라이언트.
 *
 * 왜 필요한가: 기본 클라이언트는 `libquery_engine-*.node` 바이너리를 런타임에 찾는다.
 * 서버리스 번들러(Next/Vercel)가 그 파일을 함수에 안 넣어주면 첫 쿼리에서
 * PrismaClientInitializationError 로 죽는데, 그걸 파일 트레이싱으로 해결하려다
 * 여러 번 실패했다(엔진이 어느 경로에도 안 들어갔다). 어댑터를 쓰면 **바이너리가
 * 아예 필요 없어서** 그 실패 모드가 통째로 사라진다.
 *
 * 상시 프로세스(워커·배치)는 기본 클라이언트를 그대로 쓴다 — 거기선 문제가 없다.
 */
export async function createSearchOpsPrismaClientWithPgAdapter(
  connectionString: string,
): Promise<SearchOpsPrismaClient> {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
