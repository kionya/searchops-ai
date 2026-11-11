import type { CSSProperties } from "react";

import { formatKstDateTime, formatRelative, summarizeDataFreshness, type FreshnessTone } from "./data-freshness";
import { getSiteDataFreshness } from "./site-database";

// 상태색은 예약 토큰만 쓰고, 색만으로 알리지 않도록 기호+문구를 함께 낸다.
const toneStyle: Record<FreshnessTone, { readonly color: string; readonly background: string; readonly mark: string; readonly text: string }> = {
  failed: { background: "var(--so-risk-soft)", color: "var(--so-risk)", mark: "✕", text: "실패" },
  missing: { background: "var(--so-subtle)", color: "var(--so-muted)", mark: "–", text: "기록 없음" },
  ok: { background: "var(--so-ready-soft)", color: "var(--so-ready)", mark: "✓", text: "정상" },
  stale: { background: "var(--so-warn-soft)", color: "var(--so-warn)", mark: "!", text: "지연" }
};

/** 사이트 화면 상단 "데이터 반영 현황". 직접 DB 모드가 아니면 아무것도 그리지 않는다. */
export async function DataFreshnessPanel({ siteId }: { readonly siteId: string }) {
  let freshness;
  try {
    freshness = await getSiteDataFreshness(siteId);
  } catch {
    // GRANT 누락 등. 이 패널만 실패로 그리고 화면 나머지는 살린다.
    return (
      <p role="status" style={{ color: "var(--so-risk)", fontSize: 14, margin: "0 0 14px" }}>
        데이터 반영 현황을 불러오지 못했습니다. 웹 DB 역할의 읽기 권한(scripts/sql/web-role.sql)을 확인하세요.
      </p>
    );
  }
  if (freshness === null) {
    return null;
  }
  const now = new Date();
  const items = summarizeDataFreshness(freshness, now);

  return (
    <section aria-label="데이터 반영 현황" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>데이터 반영 현황</h3>
      <div style={gridStyle}>
        {items.map((item) => {
          const tone = toneStyle[item.tone];
          return (
            <div key={item.key} style={tileStyle}>
              <span style={{ color: "var(--so-muted)", fontSize: 13 }}>{item.label}</span>
              <strong style={{ fontSize: 17 }}>
                {item.at === null ? "—" : formatRelative(item.at, now)}
              </strong>
              <span style={{ color: "var(--so-muted)", fontSize: 13 }}>
                {item.at === null ? item.detail : `${formatKstDateTime(item.at)} · ${item.detail}`}
              </span>
              <span style={{ alignItems: "center", display: "flex", gap: 6, justifyContent: "space-between" }}>
                <span
                  style={{
                    background: tone.background,
                    borderRadius: 999,
                    color: tone.color,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 8px"
                  }}
                >
                  {tone.mark} {tone.text}
                </span>
                <span style={{ color: "var(--so-muted)", fontSize: 12 }}>{item.cadence}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
};

const tileStyle: CSSProperties = {
  background: "var(--so-paper)",
  border: "1px solid var(--so-line-soft)",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "12px 14px"
};
