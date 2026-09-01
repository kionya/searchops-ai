import React from "react";

import type { ProviderAccountSummary } from "@searchops/types";

import { mutedTextStyle } from "../../../src/dashboard-shell";
import { codeTextStyle, pillStyle } from "../../../src/dashboard-table-styles";
import { formatProviderAccountProvider } from "../../../src/provider-accounts";
import {
  deleteProviderAccountAction,
  replaceProviderCredentialAction,
  updateProviderAccountAction,
} from "./actions";
import { IntegrationSubmitButton } from "./submit-button";

export function ProviderAccountRows({
  accounts,
  canManage,
}: {
  readonly accounts: readonly ProviderAccountSummary[];
  readonly canManage: boolean;
}) {
  return accounts.map((account) => {
    const canSetDefault = account.provider.startsWith("geo_") && !account.isDefault;
    return (
      <tr key={account.id}>
        <td>{formatProviderAccountProvider(account.provider)}</td>
        <td>
          <strong>{account.displayName}</strong>
          <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 4 }}>
            {account.accountEmail ?? account.externalAccountId ?? "API key 계정"}
          </span>
          <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 4 }}>
            {account.id}
          </span>
        </td>
        <td><StatusPill status={account.status} /></td>
        <td>
          {account.isDefault ? (
            <span style={{ ...pillStyle, background: "#ecfdf5", color: "#047857" }}>기본</span>
          ) : canManage && canSetDefault ? (
            <form action={updateProviderAccountAction}>
              <input name="accountId" type="hidden" value={account.id} />
              <input name="isDefault" type="hidden" value="true" />
              <IntegrationSubmitButton tone="secondary">기본 지정</IntegrationSubmitButton>
            </form>
          ) : "-"}
        </td>
        <td>
          <strong>{account.bindingCount}</strong>
          {account.bindingCount > 0 ? (
            <span style={{ color: "#b45309", display: "block", fontSize: 13, marginTop: 4 }}>
              사용 중
            </span>
          ) : null}
        </td>
        <td>
          {canManage ? (
            <form action={updateProviderAccountAction} style={compactFormStyle}>
              <input name="accountId" type="hidden" value={account.id} />
              <label style={srOnlyStyle} htmlFor={`display-${account.id}`}>표시 이름</label>
              <input
                defaultValue={account.displayName}
                id={`display-${account.id}`}
                maxLength={120}
                name="displayName"
                required
                style={compactInputStyle}
              />
              <IntegrationSubmitButton tone="secondary">저장</IntegrationSubmitButton>
            </form>
          ) : <span style={mutedTextStyle}>조회 전용</span>}
        </td>
        <td>
          {canManage && account.authType === "api_key" ? (
            <form action={replaceProviderCredentialAction} style={compactFormStyle}>
              <input name="accountId" type="hidden" value={account.id} />
              <label style={srOnlyStyle} htmlFor={`key-${account.id}`}>새 API key</label>
              <input
                autoComplete="new-password"
                id={`key-${account.id}`}
                name="apiKey"
                placeholder="새 API key"
                required
                style={compactInputStyle}
                type="password"
              />
              <IntegrationSubmitButton tone="secondary">교체</IntegrationSubmitButton>
            </form>
          ) : account.authType === "oauth2" ? "OAuth" : <span style={mutedTextStyle}>조회 전용</span>}
        </td>
        <td>
          {canManage ? (
            <form action={deleteProviderAccountAction}>
              <input name="accountId" type="hidden" value={account.id} />
              <IntegrationSubmitButton disabled={account.bindingCount > 0} tone="danger">
                삭제
              </IntegrationSubmitButton>
            </form>
          ) : "-"}
        </td>
      </tr>
    );
  });
}

function StatusPill({ status }: { readonly status: ProviderAccountSummary["status"] }) {
  const styles = status === "connected"
    ? { background: "#ecfdf5", color: "#047857" }
    : { background: "#fef2f2", color: "#b91c1c" };
  const labels = { connected: "연결됨", expired: "만료", invalid: "확인 필요", revoked: "해제됨" };
  return <span style={{ ...pillStyle, ...styles }}>{labels[status]}</span>;
}

const compactFormStyle = { alignItems: "center", display: "flex", gap: 6, minWidth: 240 } as const;
const compactInputStyle = { border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, minHeight: 38, minWidth: 130, padding: "8px 10px", width: 150 } as const;
const srOnlyStyle = { height: 1, margin: -1, overflow: "hidden", padding: 0, position: "absolute", width: 1, clip: "rect(0 0 0 0)" } as const;
