import { afterEach, describe, expect, it, vi } from "vitest";

import { createSiteInRegistry } from "./site-registry";

// 직접 DB 모드는 읽기 전용 역할을 쓴다. 그런데 SEARCHOPS_API_BASE_URL 이 죽은 주소로
// 남아 있으면(Railway 폐지 후 실제로 그랬다) 등록 폼이 거기로 POST 해서 사용자에게
// 원시 404 가 튄다. 쓸 수 없다는 사실을 그 자리에서 알려야 한다.
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

describe("직접 DB 모드의 사이트 등록", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("죽은 API 주소가 남아 있어도 네트워크를 건드리지 않고 database 모드를 돌려준다", async () => {
    vi.stubEnv("SEARCHOPS_WEB_DATABASE_URL", "postgresql://user@localhost:5432/db");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://dead-api.example.com");
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSiteInRegistry(registrationForm());

    expect(result.mode).toBe("database");
    expect(result.redirectPath).toBeNull();
    // 죽은 주소를 두드리지 않아야 404 가 사용자에게 튀지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("직접 DB 모드가 아니고 API 도 없으면 기존 fixture 동작을 유지한다", async () => {
    vi.stubEnv("SEARCHOPS_WEB_DATABASE_URL", "");
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "");

    const result = await createSiteInRegistry(registrationForm());

    expect(result.mode).toBe("fixture");
  });
});
