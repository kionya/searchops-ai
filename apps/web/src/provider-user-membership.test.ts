import { describe, expect, it } from "vitest";

import { ProviderAccountClientError, resolveVerifiedProviderUser } from "./provider-accounts";

// DB 소속 폴백은 custom access token hook 없이도 로그인이 동작하게 해준다. 다만
// 그건 "어느 조직 소속인가"만 채울 뿐, 인증 자체를 느슨하게 만들면 안 된다.
const validClaims = {
  email: "owner@example.com",
  role: "authenticated",
  sub: "user_1"
};

const base = {
  accessToken: "token",
  sessionUserId: "user_1"
};

describe("resolveVerifiedProviderUser + DB 소속", () => {
  it("클레임에 조직이 있으면 DB 소속을 무시한다", () => {
    const context = resolveVerifiedProviderUser(
      {
        ...base,
        claims: { ...validClaims, organization_id: "org_from_claim", user_role: "owner" }
      },
      { organizationId: "org_from_db", role: "viewer" },
    );

    // 기존 API 경로의 신뢰 모델을 바꾸지 않는다 — 토큰이 우선이다.
    expect(context.organizationId).toBe("org_from_claim");
    expect(context.role).toBe("owner");
  });

  it("클레임에 조직이 없으면 DB 소속으로 채운다", () => {
    const context = resolveVerifiedProviderUser(
      { ...base, claims: validClaims },
      { organizationId: "org_from_db", role: "editor" },
    );

    expect(context).toEqual({
      accessToken: "token",
      organizationId: "org_from_db",
      role: "editor",
      userId: "user_1"
    });
  });

  it("클레임에도 DB 에도 조직이 없으면 거부한다", () => {
    expect(() => resolveVerifiedProviderUser({ ...base, claims: validClaims }, null)).toThrow(
      ProviderAccountClientError,
    );
  });

  it("DB 소속이 있어도 세션 사용자가 다르면 거부한다", () => {
    // 소속은 인증을 우회하는 통로가 아니다.
    expect(() =>
      resolveVerifiedProviderUser(
        { ...base, claims: validClaims, sessionUserId: "someone_else" },
        { organizationId: "org_from_db", role: "owner" },
      ),
    ).toThrow(ProviderAccountClientError);
  });

  it("DB 소속이 있어도 authenticated 토큰이 아니면 거부한다", () => {
    expect(() =>
      resolveVerifiedProviderUser(
        { ...base, claims: { ...validClaims, role: "anon" } },
        { organizationId: "org_from_db", role: "owner" },
      ),
    ).toThrow(ProviderAccountClientError);
  });

  it("DB 소속의 role 만 있고 조직이 비면 거부한다", () => {
    // membership 이 부분적으로만 채워진 경우에도 열리면 안 된다.
    expect(() =>
      resolveVerifiedProviderUser({ ...base, claims: validClaims }, { organizationId: "  ", role: "owner" }),
    ).toThrow(ProviderAccountClientError);
  });

  it("DB 역할이 허용 값이 아니면 거부한다", () => {
    expect(() =>
      resolveVerifiedProviderUser(
        { ...base, claims: validClaims },
        { organizationId: "org_from_db", role: "superuser" },
      ),
    ).toThrow(ProviderAccountClientError);
  });
});
