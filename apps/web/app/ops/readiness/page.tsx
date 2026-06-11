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
  createEasySetupGuide,
  summarizeEasySetupGuide,
  type EasySetupGroup,
} from "../../../src/easy-setup";
import {
  formatReadinessCategory,
  formatReadinessStatus,
  getReadinessTone,
  groupReadinessByCategory,
  loadOperationalReadiness,
  type OperationalReadinessCategory,
  type OperationalReadinessTone,
} from "../../../src/operational-readiness";
import { loadProductizationDashboard } from "../../../src/productization-dashboard";

export default async function OperationalReadinessPage() {
  const [dashboard, productizationDashboard] = await Promise.all([
    loadOperationalReadiness(),
    loadProductizationDashboard(),
  ]);
  const { readiness } = dashboard;
  const grouped = groupReadinessByCategory(readiness.items);
  const easyGuide = createEasySetupGuide({
    productization: productizationDashboard.productization,
    readiness,
  });
  const easySummary = summarizeEasySetupGuide(easyGuide);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="Phase 6-11과 제품화 잔여 항목을 provider credential, 운영 자동화, 문서, 수동 정책 확정 상태로 추적합니다."
      eyebrow="Operations"
      title="출시 준비도"
    >
      <section aria-labelledby="readiness-heading">
        <SectionHeader
          description="Phase 6-11과 제품화 잔여 항목을 provider credential, 운영 자동화, 문서, 수동 정책 확정 상태로 추적합니다."
          eyebrow="운영"
          title="출시 준비도"
        />
        <div style={metricGridStyle}>
          <MetricCard label="전체 항목" value={String(readiness.summary.total)} />
          <MetricCard label="설정됨" value={String(readiness.summary.configured + readiness.summary.ready)} />
          <MetricCard label="프로비저닝 필요" value={String(readiness.summary.needsProvisioning)} />
          <MetricCard label="수동 후속" value={String(readiness.summary.manualFollowup)} />
        </div>

        <section aria-label="쉬운 출시 준비 요약" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>쉬운 요약</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                자세한 설정값을 보기 전에 지금 가능한 일과 출시 전 연결할 일을 먼저 확인합니다.
              </p>
            </div>
            <Link className="searchops-button secondary" href="/onboarding">
              시작하기
            </Link>
          </header>
          <div style={easySummaryGridStyle}>
            <EasyReadinessSummaryCard label="지금 가능" value={easySummary.availableNow} tone="ready" />
            <EasyReadinessSummaryCard label="출시 전 연결" value={easySummary.connectBeforeLaunch} tone="warning" />
            <EasyReadinessSummaryCard label="나중에 결정" value={easySummary.decideLater} tone="info" />
          </div>
          <div style={easyGroupGridStyle}>
            {easyGuide.map((group) => (
              <EasyReadinessGroupCard group={group} key={group.id} />
            ))}
          </div>
        </section>

        <section aria-label="출시 준비도 요약" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="readiness-heading" style={{ fontSize: 18, margin: 0 }}>
                남은 작업 추적
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                생성 시각: {readiness.generatedAt.replace("T", " ").slice(0, 16)}
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
                background: dashboard.source === "api" ? "#ecfdf5" : "#eef2ff",
                color: dashboard.source === "api" ? "#047857" : "#3730a3",
              }}
            >
              {dashboard.source === "api" ? "API 데이터" : "데모 데이터"}
            </span>
          </header>

          <div style={categoryGridStyle}>
            {Object.entries(grouped).map(([category, items]) => (
              <article key={category} style={categoryCardStyle}>
                <h4 style={{ fontSize: 16, margin: 0 }}>
                  {formatReadinessCategory(category as OperationalReadinessCategory)}
                </h4>
                <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 4 }}>
                  {items.length}개 항목
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="출시 준비도 상세" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>고급 상세 항목</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                실제 credential 값은 표시하지 않고, 필요한 env key와 다음 조치만 보여줍니다.
              </p>
            </div>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={thStyle}>범주</th>
                  <th style={thStyle}>항목</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>필요 env</th>
                  <th style={thStyle}>다음 조치</th>
                </tr>
              </thead>
              <tbody>
                {readiness.items.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{formatReadinessCategory(item.category)}</td>
                    <td style={tdStyle}>
                      <strong>{item.title}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {item.summary}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <ReadinessStatusPill
                        label={formatReadinessStatus(item.status)}
                        tone={getReadinessTone(item.status)}
                      />
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>
                      {item.envKeys.length === 0 ? "정책 확정" : item.envKeys.join(", ")}
                    </td>
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

function EasyReadinessSummaryCard({
  label,
  tone,
  value,
}: {
  readonly label: string;
  readonly tone: "info" | "ready" | "warning";
  readonly value: number;
}) {
  return (
    <article style={easySummaryCardStyle}>
      <span className={`searchops-status-pill ${tone}`}>{label}</span>
      <strong style={{ display: "block", fontSize: 28, marginTop: 10 }}>{value}</strong>
    </article>
  );
}

function EasyReadinessGroupCard({ group }: { readonly group: EasySetupGroup }) {
  const previewSteps = group.steps.slice(0, 4);

  return (
    <article style={categoryCardStyle}>
      <h4 style={{ fontSize: 16, margin: 0 }}>{group.title}</h4>
      <p style={{ ...mutedTextStyle, fontSize: 13, lineHeight: 1.42, marginTop: 4 }}>{group.description}</p>
      <ul style={{ display: "grid", gap: 7, margin: "12px 0 0", padding: 0 }}>
        {previewSteps.map((step) => (
          <li key={step.id} style={{ display: "grid", gap: 2, listStyle: "none" }}>
            <strong style={{ fontSize: 13 }}>{step.title}</strong>
            <span style={{ color: "#64748b", fontSize: 12 }}>{step.actionLabel}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ReadinessStatusPill({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: OperationalReadinessTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" },
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const categoryGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  padding: 16,
} as const;

const categoryCardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  padding: 14,
} as const;

const easySummaryGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  padding: 16,
} as const;

const easySummaryCardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  padding: 14,
} as const;

const easyGroupGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  padding: "0 16px 16px",
} as const;
