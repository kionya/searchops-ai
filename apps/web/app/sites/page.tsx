import Link from "next/link";

import { productName } from "@searchops/types";

import {
  AppWorkspaceFrame,
  metricGridStyle,
  mutedTextStyle
} from "../../src/dashboard-shell";
import { formatIndustryLabel } from "../../src/korean-labels";
import { demoSite, demoWorkOrders, summarizeWorkOrders } from "../../src/work-order-board";

const mockSites = [demoSite];
const workOrderSummary = summarizeWorkOrders(demoWorkOrders);

export default function SitesPage() {
  return (
    <AppWorkspaceFrame
      actions={
        <div className="searchops-action-row">
          <Link className="searchops-button secondary" href="/onboarding">
            온보딩
          </Link>
          <Link className="searchops-button" href="/ops">
            운영 콘솔
          </Link>
        </div>
      }
      description="사이트, 크롤링 상태, SEO 이슈, 작업 지시서, 재검수 진행 상황을 같은 운영 기준으로 확인합니다."
      eyebrow="Dashboard"
      title={productName}
    >
      <section aria-labelledby="sites-heading">
        <div className="searchops-panel">
          <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
            <div>
              <span className="searchops-label">managed properties</span>
              <h3 id="sites-heading" style={{ fontSize: 22, margin: "5px 0 0" }}>
                사이트
              </h3>
              <p style={{ ...mutedTextStyle, marginTop: 5 }}>{mockSites.length}개 설정됨</p>
            </div>
            <span className="searchops-status-pill ready">Fixture-safe</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {mockSites.map((site) => (
            <article className="searchops-card" key={site.id}>
              <div
                style={{
                  alignItems: "start",
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "minmax(0, 1fr) auto"
                }}
              >
                <div>
                  <span className="searchops-label">site workspace</span>
                  <h3 style={{ fontSize: 22, margin: "5px 0 6px" }}>{site.name}</h3>
                  <p style={{ color: "#475569", margin: 0 }}>{site.domain}</p>
                </div>
                <Link className="searchops-button" href={`/sites/${site.id}`}>
                  대시보드 열기
                </Link>
              </div>
              <dl style={{ ...metricGridStyle, margin: "18px 0 0" }}>
                <SiteFact label="업종" value={formatIndustryLabel(site.industry)} />
                <SiteFact label="로캘" value={`${site.language}-${site.country}`} />
                <SiteFact label="열린 작업" value={String(workOrderSummary.active)} />
                <SiteFact label="차단됨" value={String(workOrderSummary.blocked)} />
              </dl>
            </article>
          ))}
        </div>
      </section>
    </AppWorkspaceFrame>
  );
}

function SiteFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
      <dt style={{ color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{label}</dt>
      <dd style={{ fontWeight: 800, margin: "4px 0 0" }}>{value}</dd>
    </div>
  );
}
