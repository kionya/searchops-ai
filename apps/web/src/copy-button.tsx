"use client";

import { useState } from "react";

/** AI 지시문 복사. 휴대폰에서 클립보드가 막히면 길게 눌러 고르라고 알려 준다. */
export function CopyButton({ text }: { readonly text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      className="searchops-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
          setTimeout(() => setState("idle"), 2000);
        } catch {
          setState("failed");
        }
      }}
      type="button"
    >
      {state === "copied" ? "복사됨" : state === "failed" ? "복사 실패 — 길게 눌러 선택하세요" : "AI 지시문 복사"}
    </button>
  );
}
