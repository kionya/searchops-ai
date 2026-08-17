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
