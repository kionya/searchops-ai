"use client";

import { useFormStatus } from "react-dom";

export function ConnectorSyncSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div style={submitWrapperStyle}>
      <button aria-busy={pending} disabled={pending} style={getButtonStyle(pending)} type="submit">
        {pending ? "동기화 등록 중..." : "동기화 실행"}
      </button>
      <span aria-live="polite" role="status" style={statusTextStyle}>
        {pending ? "요청을 보내고 있습니다. 완료되면 동기화 이력으로 돌아옵니다." : ""}
      </span>
    </div>
  );
}

const submitWrapperStyle = {
  alignItems: "end",
  display: "grid",
  gap: 6,
  justifyItems: "end"
} as const;

const buttonBaseStyle = {
  border: 0,
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 800,
  minHeight: 40,
  padding: "10px 14px"
} as const;

const statusTextStyle = {
  color: "#475569",
  fontSize: 12,
  minHeight: 16,
  textAlign: "right"
} as const;

function getButtonStyle(pending: boolean) {
  return {
    ...buttonBaseStyle,
    background: pending ? "#94a3b8" : "#2563eb",
    cursor: pending ? "wait" : "pointer"
  } as const;
}
