import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProviderUser: vi.fn(),
  loadOperationalReadiness: vi.fn(),
}));

vi.mock("../../../src/provider-accounts", () => ({
  getCurrentProviderUser: mocks.getCurrentProviderUser,
}));
vi.mock("../../../src/operational-readiness", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, loadOperationalReadiness: mocks.loadOperationalReadiness };
});
vi.stubGlobal("React", React);

import OperationalReadinessPage from "./page";

describe("operational readiness page authorization boundary", () => {
  beforeEach(() => {
    mocks.getCurrentProviderUser.mockReset();
    mocks.loadOperationalReadiness.mockReset();
  });

  it("resolves the verified current user and forwards that principal to the API loader", async () => {
    const context = {
      accessToken: "current-user-token",
      organizationId: "org_a",
      role: "owner",
      userId: "user_a",
    };
    mocks.getCurrentProviderUser.mockResolvedValue(context);
    mocks.loadOperationalReadiness.mockResolvedValue({
      errorMessage: "준비도 저장소를 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
      readiness: null,
      source: "api",
      status: "store_unavailable",
    });

    const html = renderToStaticMarkup(await OperationalReadinessPage());

    expect(mocks.loadOperationalReadiness).toHaveBeenCalledWith(context);
    expect(html).toContain("준비도 저장소를 사용할 수 없습니다.");
    expect(html).not.toContain("데모 데이터");
  });

  it("fails closed without calling the API loader when current-user verification fails", async () => {
    mocks.getCurrentProviderUser.mockRejectedValue(new Error("not authenticated"));

    const html = renderToStaticMarkup(await OperationalReadinessPage());

    expect(mocks.loadOperationalReadiness).not.toHaveBeenCalled();
    expect(html).toContain("인증 정보를 확인할 수 없습니다.");
    expect(html).not.toContain("남은 작업 추적");
  });
});
