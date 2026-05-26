import Link from "next/link";
import type { CSSProperties } from "react";

import { productName } from "@searchops/types";

import {
  dashboardFontStack,
  metricGridStyle,
  mutedTextStyle,
  pageStyle
} from "../../src/dashboard-shell";
import { formatIndustryLabel } from "../../src/korean-labels";
import { demoSite, demoWorkOrders, summarizeWorkOrders } from "../../src/work-order-board";

const mock사이트 = [demoSite];
const workOrderSummary = summarizeWorkOrders(demoWorkOrders);

export default function 사이트Page() {
  return (
    <main style={pageStyle}>
      <header style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 28, paddingBottom: 20 }}>
        <p style={{ ...mutedTextStyle, fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>
          대시보드
        </p>
        <div style={{ alignItems: "start", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 34, letterSpacing: 0, lineHeight: 1.1, margin: "4px 0 8px" }}>
            {productName}
          </h1>
          <Link href="/ops" style={secondaryLinkStyle}>
            운영 대시보드
          </Link>
        </div>
        <p style={{ ...mutedTextStyle, fontFamily: dashboardFontStack }}>
          사이트, 크롤링 상태, SEO 이슈, 작업 지시서, 재검수 진행 상황을 확인합니다.
        </p>
      </header>

      <section aria-labelledby="sites-heading">
        <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
          <div>
            <h2 id="sites-heading" style={{ fontSize: 24, margin: 0 }}>
              사이트
            </h2>
            <p style={{ ...mutedTextStyle, marginTop: 4 }}>{mock사이트.length}개 설정됨</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {mock사이트.map((site) => (
            <article
              key={site.id}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}
            >
              <div
                style={{
                  alignItems: "start",
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "minmax(0, 1fr) auto"
                }}
              >
                <div>
                  <h3 style={{ fontSize: 20, margin: "0 0 6px" }}>{site.name}</h3>
                  <p style={{ color: "#475569", margin: 0 }}>{site.domain}</p>
                </div>
                <Link href={`/sites/${site.id}`} style={openLinkStyle}>
                  대시보드 열기
                </Link>
              </div>
              <dl style={{ ...metricGridStyle, margin: "16px 0 0" }}>
                <SiteFact label="업종" value={formatIndustryLabel(site.industry)} />
                <SiteFact label="로캘" value={`${site.language}-${site.country}`} />
                <SiteFact label="열린 작업" value={String(workOrderSummary.active)} />
                <SiteFact label="차단됨" value={String(workOrderSummary.blocked)} />
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SiteFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
      <dt style={{ color: "#64748b", fontSize: 12 }}>{label}</dt>
      <dd style={{ fontWeight: 700, margin: "4px 0 0" }}>{value}</dd>
    </div>
  );
}

const openLinkStyle: CSSProperties = {
  alignItems: "center",
  background: "#2563eb",
  borderRadius: 6,
  color: "#ffffff",
  display: "inline-flex",
  fontSize: 14,
  fontWeight: 700,
  minHeight: 36,
  padding: "8px 12px",
  textDecoration: "none",
  whiteSpace: "nowrap"
};

const secondaryLinkStyle: CSSProperties = {
  alignItems: "center",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#0f172a",
  display: "inline-flex",
  fontSize: 14,
  fontWeight: 700,
  minHeight: 36,
  padding: "8px 12px",
  textDecoration: "none",
  whiteSpace: "nowrap"
};
