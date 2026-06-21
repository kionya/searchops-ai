import Link from "next/link";

import {
  AppWorkspaceFrame,
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  SectionHeader,
} from "../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle,
  tableHeaderStyle,
  tableScrollStyle,
  tableSectionStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../../../src/dashboard-table-styles";
import {
  formatProductizationArea,
  formatProductizationStatus,
  getProductizationTone,
  loadProductizationDashboard,
  type ProductizationTone,
} from "../../../src/productization-dashboard";

export const dynamic = "force-dynamic";

export default async function ProductizationPage() {
  const dashboard = await loadProductizationDashboard();
  const { productization } = dashboard;

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="Auth/RBAC, tenant isolation, invite, billing, domain, legal, onboarding launch blockers를 secret 없이 확인합니다."
      eyebrow="Productization"
      title="Productization readiness"
    >
      <section aria-labelledby="productization-heading">
        <SectionHeader
          description="Auth/RBAC, tenant isolation, invite, billing, domain, legal, onboarding launch blockers를 secret 없이 확인합니다."
          eyebrow="제품화"
          title="Productization readiness"
        />
        <div style={metricGridStyle}>
          <MetricCard label="전체 항목" value={String(productization.summary.total)} />
          <MetricCard label="설정됨" value={String(productization.summary.configured)} />
          <MetricCard label="프로비저닝 필요" value={String(productization.summary.needsProvisioning)} />
          <MetricCard label="수동 후속" value={String(productization.summary.manualFollowup)} />
        </div>

        <section aria-label="제품화 준비도" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="productization-heading" style={{ fontSize: 18, margin: 0 }}>
                Launch blockers
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                생성 시각: {productization.generatedAt.replace("T", " ").slice(0, 16)}
              </p>
              {dashboard.errorMessage ? (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                  API 연결 실패: {dashboard.errorMessage}
                </p>
              ) : null}
            </div>
            <span
              style={{
                ...pillStyle,
                background: productization.canLaunch ? "#ecfdf5" : "#fff7ed",
                color: productization.canLaunch ? "#047857" : "#c2410c",
              }}
            >
              {productization.canLaunch ? "출시 가능" : "출시 전 후속 필요"}
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={thStyle}>영역</th>
                  <th style={thStyle}>항목</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>필요 env</th>
                  <th style={thStyle}>근거</th>
                  <th style={thStyle}>다음 조치</th>
                </tr>
              </thead>
              <tbody>
                {productization.items.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{formatProductizationArea(item.area)}</td>
                    <td style={tdStyle}>
                      <strong>{item.title}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {item.summary}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <ProductizationStatusPill
                        label={formatProductizationStatus(item.status)}
                        tone={getProductizationTone(item.status)}
                      />
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>
                      {item.envKeys.length === 0 ? "정책 확정" : item.envKeys.join(", ")}
                    </td>
                    <td style={tdStyle}>{item.evidence.join(" ")}</td>
                    <td style={tdStyle}>{item.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppWorkspaceFrame>
  );
}

function ProductizationStatusPill({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: ProductizationTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" },
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}
