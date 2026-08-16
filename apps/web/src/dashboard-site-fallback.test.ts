import { afterEach, describe, expect, it, vi } from "vitest";

import { loadDashboardSite } from "./dashboard-shell";
import { ProviderAccountClientError, type ProviderUserContext } from "./provider-accounts";
import type * as ProviderAccountsModule from "./provider-accounts";

const context: ProviderUserContext = {
  accessToken: "current-user-token",
  organizationId: "org_a",
  role: "viewer",
  userId: "user_a"
};

vi.mock("./provider-accounts", async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderAccountsModule>()),
  getCurrentProviderUser: async () => context
}));

// loadDashboardSite 의 null 처리는 두 상황을 구분해야 한다. 구분이 무너지면
// 한쪽은 사이트 라우트 10개가 통째로 죽고, 다른 한쪽은 테넌트 격리가 뚫린다.
describe("loadDashboardSite fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("falls back to a fixture site when no API is deployed", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const site = await loadDashboardSite("site_anything");

    expect(site.id).toBe("site_anything");
    // API 가 없다고 판단했으면 네트워크를 건드릴 이유가 없다.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still fails when the API is deployed and denies the site", async () => {
    vi.stubEnv("SEARCHOPS_API_BASE_URL", "https://api.searchops.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 }))
    );

    await expect(loadDashboardSite("site_other_tenant")).rejects.toBeInstanceOf(
      ProviderAccountClientError
    );
  });
});
