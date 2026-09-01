import React from "react";

import type { Site } from "@searchops/types";

import { startGoogleOAuthAction } from "./actions";
import { IntegrationSubmitButton } from "./submit-button";

export function GoogleConnectForm({
  canManage,
  siteLoadFailed,
  sites,
}: {
  readonly canManage: boolean;
  readonly siteLoadFailed: boolean;
  readonly sites: readonly Site[];
}) {
  const disabled = siteLoadFailed || sites.length === 0;
  return (
    <div>
      {canManage ? (
        <form action={startGoogleOAuthAction} style={headerFormStyle}>
          <label htmlFor="google-site">사이트</label>
          <select disabled={disabled} id="google-site" name="siteId" required style={inputStyle}>
            <option value="">선택</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
          <IntegrationSubmitButton disabled={disabled}>연결 / 재연결</IntegrationSubmitButton>
        </form>
      ) : null}
      {siteLoadFailed ? (
        <p role="status" style={errorStyle}>사이트 목록을 불러오지 못했습니다.</p>
      ) : sites.length === 0 ? (
        <p role="status" style={emptyStyle}>등록된 사이트가 없습니다.</p>
      ) : null}
    </div>
  );
}

const headerFormStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 } as const;
const inputStyle = { border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, minHeight: 38, padding: "8px 10px" } as const;
const errorStyle = { color: "#b91c1c", fontSize: 14, margin: "6px 0 0" } as const;
const emptyStyle = { color: "var(--so-muted)", fontSize: 14, margin: "6px 0 0" } as const;
