import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiKeyProviderAccount: vi.fn(),
  deleteProviderAccount: vi.fn(),
  getCurrentProviderUser: vi.fn(),
  loadOrganizationSites: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  revalidatePath: vi.fn(),
  replaceProviderAccountCredential: vi.fn(),
  updateProviderAccountMetadata: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../src/provider-accounts", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    createApiKeyProviderAccount: mocks.createApiKeyProviderAccount,
    deleteProviderAccount: mocks.deleteProviderAccount,
    getCurrentProviderUser: mocks.getCurrentProviderUser,
    loadOrganizationSites: mocks.loadOrganizationSites,
    replaceProviderAccountCredential: mocks.replaceProviderAccountCredential,
    updateProviderAccountMetadata: mocks.updateProviderAccountMetadata,
  };
});

import {
  createProviderAccountAction,
  deleteProviderAccountAction,
  startGoogleOAuthAction,
} from "./actions";

function user(role: "owner" | "editor" | "viewer" = "owner") {
  return {
    accessToken: "user-token",
    organizationId: "org_1",
    role,
    userId: "user_1",
  };
}

describe("integration provider account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentProviderUser.mockResolvedValue(user());
    mocks.loadOrganizationSites.mockResolvedValue([
      { id: "site_1", organizationId: "org_1", name: "Site 1" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never includes a submitted key in redirect, return data, or thrown errors", async () => {
    const formData = new FormData();
    formData.set("provider", "geo_chatgpt");
    formData.set("displayName", "Primary");
    formData.set("apiKey", "raw-key-sentinel");

    let caught: unknown;
    try {
      await createProviderAccountAction(formData);
    } catch (error) {
      caught = error;
    }

    expect(mocks.createApiKeyProviderAccount).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/ops/integrations?status=saved");
    expect(JSON.stringify(caught)).not.toContain("raw-key-sentinel");
    expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain("raw-key-sentinel");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ops/integrations");
  });

  it.each(["editor", "viewer"] as const)(
    "rejects %s credential mutations before the API client",
    async (role) => {
      mocks.getCurrentProviderUser.mockResolvedValue(user(role));
      const formData = new FormData();
      formData.set("provider", "bing");
      formData.set("displayName", "Bing");
      formData.set("apiKey", "raw-key-sentinel");

      await expect(createProviderAccountAction(formData)).rejects.toThrow(
        "NEXT_REDIRECT:/ops/integrations?status=failed",
      );

      expect(mocks.createApiKeyProviderAccount).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain("raw-key-sentinel");
    },
  );

  it("maps account-in-use deletion to the fixed account_in_use status", async () => {
    const { ProviderAccountClientError } = await import("../../../src/provider-accounts");
    mocks.deleteProviderAccount.mockRejectedValue(
      new ProviderAccountClientError("account_in_use"),
    );
    const formData = new FormData();
    formData.set("accountId", "pa_1");

    await expect(deleteProviderAccountAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/ops/integrations?status=account_in_use",
    );

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("starts Google OAuth only through a verified same-organization site", async () => {
    vi.stubEnv("SEARCHOPS_PUBLIC_APP_URL", "https://app.searchops.test");
    const formData = new FormData();
    formData.set("siteId", "site_1");

    await expect(startGoogleOAuthAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/sites\/site_1\/connectors\/google\/oauth\/start\?/,
    );
    const location = String(mocks.redirect.mock.calls[0]?.[0] ?? "");
    const url = new URL(location, "https://app.searchops.test");
    expect(url.searchParams.get("returnTo")).toBe(
      "https://app.searchops.test/ops/integrations",
    );
    expect(url.searchParams.get("providers")).toBe("gsc,ga4");
  });

  it("fails Google OAuth start for a site outside the verified organization", async () => {
    vi.stubEnv("SEARCHOPS_PUBLIC_APP_URL", "https://app.searchops.test");
    mocks.loadOrganizationSites.mockResolvedValue([]);
    const formData = new FormData();
    formData.set("siteId", "site_foreign");

    await expect(startGoogleOAuthAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/ops/integrations?status=failed",
    );
  });
});
