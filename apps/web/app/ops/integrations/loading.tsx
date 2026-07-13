import React from "react";

import { AppWorkspaceFrame, SectionHeader, mutedTextStyle } from "../../../src/dashboard-shell";

export default function IntegrationsLoading() {
  return (
    <AppWorkspaceFrame
      description="조직 Provider 계정과 사이트 연결 상태를 확인하고 있습니다."
      eyebrow="Operations"
      title="연동 관리"
    >
      <section aria-busy="true" aria-live="polite" style={{ minHeight: 520 }}>
        <SectionHeader
          description="계정과 사이트 목록을 안전하게 불러오고 있습니다."
          eyebrow="연동"
          title="연동 정보 불러오는 중"
        />
        <div role="status" style={loadingPanelStyle}>Provider 상태를 불러오는 중입니다.</div>
      </section>
    </AppWorkspaceFrame>
  );
}

const loadingPanelStyle = {
  ...mutedTextStyle,
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "flex",
  minHeight: 220,
  padding: 20,
} as const;
