import React from "react";

import { SectionHeader, mutedTextStyle } from "../../../../src/dashboard-shell";

export default function ConnectorsLoading() {
  return (
    <section aria-busy="true" aria-live="polite" style={{ minHeight: 520 }}>
      <SectionHeader
        description="사이트 권한과 커넥터 상태를 확인하고 있습니다."
        eyebrow="커넥터"
        title="커넥터 불러오는 중"
      />
      <div role="status" style={loadingPanelStyle}>연결 상태를 불러오는 중입니다.</div>
    </section>
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
