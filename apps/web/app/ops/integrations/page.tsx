import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import type {
  ProviderAccountSummary,
} from "@searchops/types";

import {
  AppWorkspaceFrame,
  mutedTextStyle,
  SectionHeader,
} from "../../../src/dashboard-shell";
import {
  tableHeaderStyle,
  tableScrollStyle,
  tableSectionStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../../../src/dashboard-table-styles";
import {
  canManageProviderAccounts,
  formatProviderAccountProvider,
  geoProviderOptions,
  getCurrentProviderUser,
  loadOrganizationSites,
  loadProviderAccounts,
} from "../../../src/provider-accounts";
import {
  createProviderAccountAction,
} from "./actions";
import { ProviderAccountRows } from "./account-rows";
import { GoogleConnectForm } from "./google-connect-form";
import { IntegrationSubmitButton } from "./submit-button";

export const dynamic = "force-dynamic";

interface IntegrationsPageProps {
  readonly searchParams: Promise<{
    readonly connectorOAuth?: string;
    readonly status?: string;
  }>;
}

const feedback = {
  account_in_use: { color: "#b45309", message: "사이트 연결을 먼저 해제하세요." },
  deleted: { color: "#047857", message: "계정을 삭제했습니다." },
  failed: { color: "#b91c1c", message: "요청을 처리하지 못했습니다." },
  saved: { color: "#047857", message: "변경사항을 저장했습니다." },
} as const;

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  let context;
  try {
    context = await getCurrentProviderUser();
  } catch {
    redirect("/login?next=%2Fops%2Fintegrations");
  }

  const canManage = canManageProviderAccounts(context.role);
  const [accountResult, siteResult] = await Promise.allSettled([
    loadProviderAccounts(context),
    loadOrganizationSites(context),
  ]);
  const accounts = accountResult.status === "fulfilled" ? accountResult.value : [];
  const sites = siteResult.status === "fulfilled" ? siteResult.value : [];
  const siteLoadFailed = siteResult.status === "rejected";
  const resolvedSearchParams = await searchParams;
  const status = resolvedSearchParams.status;
  const statusFeedback = status && status in feedback
    ? feedback[status as keyof typeof feedback]
    : resolvedSearchParams.connectorOAuth === "connected"
      ? { color: "#047857", message: "Google 계정을 연결했습니다." }
      : null;

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="조직 Provider 계정과 사이트 연결 상태를 관리합니다."
      eyebrow="Operations"
      title="연동 관리"
    >
      <section aria-label="Provider 계정 연동">
        <SectionHeader
          description="계정 메타데이터와 사이트 연결 수만 표시합니다."
          eyebrow="연동"
          title="Provider 계정"
        />
        <div aria-live="polite" style={statusBarStyle}>
          <span>현재 역할: {context.role}</span>
          <strong style={{ color: statusFeedback?.color ?? "#475569" }}>
            {statusFeedback?.message ?? (canManage ? "변경 가능" : "조회 전용")}
          </strong>
        </div>
        {accountResult.status === "rejected" ? (
          <p role="status" style={errorStyle}>계정 정보를 불러오지 못했습니다.</p>
        ) : null}

        <ProviderSection
          accounts={accounts.filter((account) => account.provider === "google")}
          canManage={canManage}
          emptyLabel="연결된 Google 계정이 없습니다."
          loadFailed={accountResult.status === "rejected"}
          title="Google"
        >
          <GoogleConnectForm canManage={canManage} siteLoadFailed={siteLoadFailed} sites={sites} />
        </ProviderSection>

        <ProviderSection
          accounts={accounts.filter((account) => account.provider === "bing")}
          canManage={canManage}
          emptyLabel="연결된 Bing 계정이 없습니다."
          loadFailed={accountResult.status === "rejected"}
          title="Bing"
        >
          {canManage ? <ApiKeyCreateForm provider="bing" /> : null}
        </ProviderSection>

        <ProviderSection
          accounts={accounts.filter((account) => account.provider.startsWith("geo_"))}
          canManage={canManage}
          emptyLabel="등록된 GEO BYOK 계정이 없습니다."
          loadFailed={accountResult.status === "rejected"}
          title="GEO BYOK"
        >
          {canManage ? <GeoCreateForm /> : null}
        </ProviderSection>
      </section>
    </AppWorkspaceFrame>
  );
}

function ProviderSection({
  accounts,
  canManage,
  children,
  emptyLabel,
  loadFailed,
  title,
}: {
  readonly accounts: readonly ProviderAccountSummary[];
  readonly canManage: boolean;
  readonly children?: ReactNode;
  readonly emptyLabel: string;
  readonly loadFailed: boolean;
  readonly title: string;
}) {
  return (
    <section aria-label={`${title} 계정`} style={tableSectionStyle}>
      <header style={tableHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>{title}</h3>
          <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
            {accounts.length}개 계정
          </p>
        </div>
        {children}
      </header>
      <div style={tableScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 1120 }}>
          <thead>
            <tr>
              <th style={thStyle}>Provider</th>
              <th style={thStyle}>계정</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}>기본</th>
              <th style={thStyle}>사이트 연결</th>
              <th style={thStyle}>수정</th>
              <th style={thStyle}>키 교체</th>
              <th style={thStyle}>삭제</th>
            </tr>
          </thead>
          <tbody>
            <ProviderAccountRows accounts={accounts} canManage={canManage} />
            {accounts.length === 0 && !loadFailed ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, ...mutedTextStyle }}>{emptyLabel}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiKeyCreateForm({ provider }: { readonly provider: "bing" }) {
  return (
    <form action={createProviderAccountAction} style={headerFormStyle}>
      <input name="provider" type="hidden" value={provider} />
      <label style={srOnlyStyle} htmlFor={`${provider}-label`}>표시 이름</label>
      <input id={`${provider}-label`} name="displayName" placeholder="표시 이름" required style={inputStyle} />
      <label style={srOnlyStyle} htmlFor={`${provider}-key`}>API key</label>
      <input autoComplete="new-password" id={`${provider}-key`} name="apiKey" placeholder="API key" required style={inputStyle} type="password" />
      <IntegrationSubmitButton>추가</IntegrationSubmitButton>
    </form>
  );
}

function GeoCreateForm() {
  return (
    <form action={createProviderAccountAction} style={headerFormStyle}>
      <label style={srOnlyStyle} htmlFor="geo-provider">GEO provider</label>
      <select defaultValue="geo_chatgpt" id="geo-provider" name="provider" style={inputStyle}>
        {geoProviderOptions.map((provider) => (
          <option key={provider} value={provider}>{formatProviderAccountProvider(provider)}</option>
        ))}
      </select>
      <label style={srOnlyStyle} htmlFor="geo-label">표시 이름</label>
      <input id="geo-label" name="displayName" placeholder="표시 이름" required style={inputStyle} />
      <label style={srOnlyStyle} htmlFor="geo-key">API key</label>
      <input autoComplete="new-password" id="geo-key" name="apiKey" placeholder="API key" required style={inputStyle} type="password" />
      <label style={checkLabelStyle}><input name="isDefault" type="checkbox" value="true" /> 기본</label>
      <IntegrationSubmitButton>추가</IntegrationSubmitButton>
    </form>
  );
}

const statusBarStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  marginTop: 4,
  minHeight: 48,
  padding: "10px 14px",
} as const;
const errorStyle = { color: "#b91c1c", fontSize: 13, margin: "10px 0" } as const;
const headerFormStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 } as const;
const inputStyle = { border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, minHeight: 38, padding: "8px 10px" } as const;
const checkLabelStyle = { alignItems: "center", display: "inline-flex", fontSize: 13, gap: 5 } as const;
const srOnlyStyle = { height: 1, margin: -1, overflow: "hidden", padding: 0, position: "absolute", width: 1, clip: "rect(0 0 0 0)" } as const;
