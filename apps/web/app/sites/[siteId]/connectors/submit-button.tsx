"use client";

import type { CSSProperties } from "react";
import { useFormStatus } from "react-dom";

/**
 * Provider 단독 실행 등 임의의 동기화 버튼에 pending 피드백(비활성화 + "실행 중...")을
 * 붙이는 재사용 버튼. 서버 액션 in-flight 동안 클릭이 먹혔는지 시각적으로 보여준다.
 */
export function ProviderSyncSubmitButton({
  label,
  style,
}: {
  readonly label: string;
  readonly style: CSSProperties;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      disabled={pending}
      style={{ ...style, cursor: pending ? "wait" : "pointer", opacity: pending ? 0.65 : 1 }}
      type="submit"
    >
      {pending ? "실행 중..." : label}
    </button>
  );
}

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
