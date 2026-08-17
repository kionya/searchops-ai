import { afterEach, describe, expect, it, vi } from "vitest";

import { createSiteInRegistry } from "./site-registry";

// 직접 DB 모드의 등록 경로. 두 가지를 지킨다:
//   1. API 를 건드리지 않는다. SEARCHOPS_API_BASE_URL 이 죽은 주소로 남아 있으면
//      (Railway 폐지 후 실제로 그랬다) 폼이 거기로 POST 해서 원시 404 가 사용자에게 튄다.
//   2. 저장된 사이트를 그대로 돌려준다. 이미 같은 도메인이 있으면 기존 행이 온다.
function registrationForm(): FormData {
  const formData = new FormData();
  formData.set("domain", "new.example.com");
  formData.set("name", "새 사이트");
  formData.set("industry", "medical");
  formData.set("language", "ko");
  formData.set("country", "KR");
  formData.set("maxPages", "10");
  return formData;
}

vi.mock("./site-database", () => ({
  createOrganizationSite: vi.fn()
}));

const { createOrganizationSite } = await import("./site-database");
const createOrganizationSiteMock = vi.mocked(createOrganizationSite);

describe("직접 DB 모드의 사이트 등록", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.mocked(createOrganizationSiteMock).mockReset();
  });

  it("죽은 API 주소가 남아 있어도 네트워크를 건드리지 않고 DB 에 저장한다", async () => {
    vi.stubEnv("SEARCHOPS_WEB_DATABASE_URL", "postgresql://user@localhost:5432/db");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://dead-api.example.com");
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    createOrganizationSiteMock.mockResolvedValue({
      country: "KR",
      createdAt: "2026-08-17T00:00:00.000Z",
      domain: "new.example.com",
      id: "site_new_dot_example_dot_com",
      industry: "medical",
      language: "ko",
      name: "새 사이트",
      organizationId: "org_real"
    });

    const result = await createSiteInRegistry(registrationForm());

    expect(result.mode).toBe("database");
    // 죽은 주소를 두드리지 않아야 404 가 사용자에게 튀지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();
    // organizationId 는 폼이 아니라 검증된 세션에서만 온다 — 등록 입력에 실려서는 안 된다.
    expect(createOrganizationSiteMock.mock.calls[0]?.[0]).not.toHaveProperty("organizationId");
    // 저장된 행을 그대로 쓴다. 폼이 만든 초안이 아니라 DB 가 돌려준 조직이어야 한다.
    expect(result.site.organizationId).toBe("org_real");
  });

  it("저장이 거부되면(미인증 등) 조용히 성공하지 않고 던진다", async () => {
    vi.stubEnv("SEARCHOPS_WEB_DATABASE_URL", "postgresql://user@localhost:5432/db");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "");
    createOrganizationSiteMock.mockResolvedValue(null);

    await expect(createSiteInRegistry(registrationForm())).rejects.toThrow(/등록할 수 없습니다/);
  });

  it("직접 DB 모드가 아니고 API 도 없으면 기존 fixture 동작을 유지한다", async () => {
    vi.stubEnv("SEARCHOPS_WEB_DATABASE_URL", "");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "");

    const result = await createSiteInRegistry(registrationForm());

    expect(result.mode).toBe("fixture");
    expect(createOrganizationSiteMock).not.toHaveBeenCalled();
  });
});
