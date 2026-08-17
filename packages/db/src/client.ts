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
 * 접속을 pg 드라이버로 하는 클라이언트. 서버리스(Vercel)의 웹이 쓴다.
 *
 * ⚠️ **엔진 바이너리는 여전히 필요하다.** 한때 "어댑터를 쓰면 libquery_engine 이
 * 아예 필요 없다" 고 적어뒀는데 틀렸다. 드라이버 어댑터는 Rust 쿼리 엔진의 **접속
 * 계층만** JS 드라이버로 바꾼다 — 쿼리 컴파일은 그대로 엔진이 한다(engineType 을
 * "client" 로 바꾸는 queryCompiler 를 켜야 엔진이 없어진다). 그래서
 * `next.config.mjs` 의 트레이싱 설정과 `scripts/copy-prisma-engine.mjs` 는
 * 어댑터를 쓰든 말든 지워선 안 된다. 지우면 첫 쿼리에서
 * PrismaClientInitializationError 로 죽는다.
 *
 * 그럼 어댑터를 왜 쓰나: 풀러 뒤에서 커넥션 수명을 pg 쪽 설정으로 다룰 수 있고,
 * 엔진의 자체 커넥션 풀을 우회한다. 서버리스에서 커넥션이 폭발하는 것을 줄인다.
 *
 * 상시 프로세스(워커·배치)는 기본 클라이언트를 그대로 쓴다 — 거기선 문제가 없다.
 */
export async function createSearchOpsPrismaClientWithPgAdapter(
  connectionString: string,
): Promise<SearchOpsPrismaClient> {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
