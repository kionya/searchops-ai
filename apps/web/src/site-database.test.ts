import { afterEach, describe, expect, it, vi } from "vitest";

import { isDirectDatabaseMode } from "./site-database";

// 직접 DB 모드 판정은 세 갈래 분기(직접 DB / API / fixture)의 첫 관문이다. 여기가 틀리면
// 실데이터가 있는데 데모를 그리거나, 반대로 없는 DB 를 붙잡고 페이지가 죽는다.
describe("isDirectDatabaseMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when DATABASE_URL is unset", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(isDirectDatabaseMode()).toBe(false);
  });

  it("is off when DATABASE_URL is only whitespace", () => {
    // 빈 문자열이 아니라 공백이 들어오는 사고가 잦다. trim 하지 않으면 Prisma 가
    // 요청 시점에야 죽어서 페이지 전체가 500 이 된다.
    vi.stubEnv("DATABASE_URL", "   ");
    expect(isDirectDatabaseMode()).toBe(false);
  });

  it("is on when DATABASE_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user@localhost:5432/db");
    expect(isDirectDatabaseMode()).toBe(true);
  });
});
