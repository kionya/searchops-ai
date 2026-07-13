"use client";

import React from "react";
import { useFormStatus } from "react-dom";

export function IntegrationSubmitButton({
  children,
  disabled = false,
  tone = "primary",
}: {
  readonly children: string;
  readonly disabled?: boolean;
  readonly tone?: "danger" | "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const inactive = disabled || pending;
  const colors = {
    danger: { background: "#ffffff", border: "#fecaca", color: "#b91c1c" },
    primary: { background: "#111827", border: "#111827", color: "#ffffff" },
    secondary: { background: "#ffffff", border: "#cbd5e1", color: "#172033" },
  }[tone];

  return (
    <button
      aria-busy={pending}
      disabled={inactive}
      style={{
        ...buttonStyle,
        ...colors,
        cursor: inactive ? "not-allowed" : "pointer",
        opacity: inactive ? 0.55 : 1,
      }}
      type="submit"
    >
      {pending ? "처리 중" : children}
    </button>
  );
}

const buttonStyle = {
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 800,
  minHeight: 38,
  padding: "8px 12px",
  whiteSpace: "nowrap",
} as const;
