import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProviderAccountSummary } from "@searchops/types";

vi.mock("../../../src/provider-accounts", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getCurrentProviderUser: vi.fn(async () => ({
      accessToken: "current-user-token",
      organizationId: "org_1",
      role: "viewer",
      userId: "user_1",
    })),
    loadOrganizationSites: vi.fn(async () => []),
    loadProviderAccounts: vi.fn(async () => []),
  };
});
vi.stubGlobal("React", React);

import { ProviderAccountRows } from "./account-rows";
import { GoogleConnectForm } from "./google-connect-form";
import IntegrationsPage from "./page";
import IntegrationsLoading from "./loading";
import ConnectorsLoading from "../../sites/[siteId]/connectors/loading";

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

describe("integration route load states", () => {
  it("renders only resolvable aria-labelledby references", async () => {
    const html = renderToStaticMarkup(
      await IntegrationsPage({ searchParams: Promise.resolve({}) }),
    );
    const renderedIds = new Set(
      [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
    );
    const labelledByIds = [...html.matchAll(/\saria-labelledby="([^"]+)"/g)]
      .flatMap((match) => match[1]?.split(/\s+/) ?? []);

    expect(html).toContain('<section aria-label="Provider 계정 연동">');
    expect(labelledByIds.every((id) => renderedIds.has(id))).toBe(true);
  });

  it("distinguishes a fixed site-list failure from a true empty site list", () => {
    const failed = renderToStaticMarkup(createElement(GoogleConnectForm, {
      canManage: false,
      siteLoadFailed: true,
      sites: [],
    }));
    const empty = renderToStaticMarkup(createElement(GoogleConnectForm, {
      canManage: true,
      siteLoadFailed: false,
      sites: [],
    }));

    expect(failed).toContain("사이트 목록을 불러오지 못했습니다.");
    expect(failed).not.toContain("등록된 사이트가 없습니다.");
    expect(failed).not.toContain("<form");
    expect(empty).toContain("등록된 사이트가 없습니다.");
    expect(empty).not.toContain("사이트 목록을 불러오지 못했습니다.");
  });

  it.each([
    ["integrations", IntegrationsLoading],
    ["connectors", ConnectorsLoading],
  ] as const)("renders a stable %s route loading status", (_name, LoadingComponent) => {
    const html = renderToStaticMarkup(createElement(LoadingComponent));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("불러오는 중");
    expect(html).toContain("min-height");
  });
});
