import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProviderAccountSummary } from "@searchops/types";

import { ProviderAccountRows } from "./account-rows";

const account: ProviderAccountSummary = {
  id: "pa_bing",
  organizationId: "org_1",
  provider: "bing",
  authType: "api_key",
  externalAccountId: null,
  accountEmail: null,
  displayName: "Bing primary",
  status: "connected",
  scopes: [],
  tokenExpiresAt: null,
  isDefault: false,
  legacyCredentialId: null,
  connectedByUserId: "user_1",
  connectedAt: "2026-07-14T00:00:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  credentialSource: "encrypted",
  bindingCount: 2,
};

function renderRows(canManage: boolean) {
  return renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        createElement(ProviderAccountRows, { accounts: [account], canManage }),
      ),
    ),
  );
}

describe("provider account rows", () => {
  it("renders metadata and fixed in-use status without mutation controls for viewers", () => {
    const html = renderRows(false);

    expect(html).toContain("Bing primary");
    expect(html).toContain("사용 중");
    expect(html).toContain("조회 전용");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("credentialCiphertext");
    expect(html).not.toContain("apiKey");
    expect(html).not.toContain("accessToken");
  });

  it("renders an empty password input and disables deletion while the account is in use", () => {
    const html = renderRows(true);

    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/type="password"[^>]*(?:value|defaultValue)=/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>삭제<\/button>/);
  });
});
