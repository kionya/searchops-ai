import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteSiteConnector: vi.fn(),
  getCurrentProviderUser: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  revalidatePath: vi.fn(),
  saveSiteConnector: vi.fn(),
  triggerSiteConnectorSync: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../../src/provider-accounts", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    deleteSiteConnector: mocks.deleteSiteConnector,
    getCurrentProviderUser: mocks.getCurrentProviderUser,
    saveSiteConnector: mocks.saveSiteConnector,
    triggerSiteConnectorSync: mocks.triggerSiteConnectorSync,
  };
});

import { runConnectorSyncAction, saveSiteConnectorAction } from "./actions";

function user(role: "owner" | "editor" | "viewer") {
  return {
    accessToken: "user-token",
    organizationId: "org_1",
    role,
    userId: "user_1",
  };
}

describe("site connector actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows an editor to enqueue sync with the current user context", async () => {
    mocks.getCurrentProviderUser.mockResolvedValue(user("editor"));
    mocks.triggerSiteConnectorSync.mockResolvedValue({ connectorSyncRunId: "run_1" });
    const formData = new FormData();
    formData.append("providers", "gsc");
    formData.append("providers", "ga4");

    await expect(runConnectorSyncAction("site_1", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/sites/site_1/connectors?sync=queued&runId=run_1",
    );

    expect(mocks.triggerSiteConnectorSync).toHaveBeenCalledWith(
      expect.objectContaining({ role: "editor", accessToken: "user-token" }),
      "site_1",
      ["gsc", "ga4"],
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sites/site_1/connectors");
  });

  it("rejects viewer sync before the API client", async () => {
    mocks.getCurrentProviderUser.mockResolvedValue(user("viewer"));
    const formData = new FormData();
    formData.append("providers", "gsc");

    await expect(runConnectorSyncAction("site_1", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/sites/site_1/connectors?sync=failed",
    );
    expect(mocks.triggerSiteConnectorSync).not.toHaveBeenCalled();
  });

  it("rejects editor binding mutation before the API client", async () => {
    mocks.getCurrentProviderUser.mockResolvedValue(user("editor"));
    const formData = new FormData();
    formData.set("provider", "ga4");
    formData.set("providerAccountId", "pa_google");
    formData.set("externalResourceId", "123456789");

    await expect(saveSiteConnectorAction("site_1", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/sites/site_1/connectors?binding=failed",
    );
    expect(mocks.saveSiteConnector).not.toHaveBeenCalled();
  });
});
