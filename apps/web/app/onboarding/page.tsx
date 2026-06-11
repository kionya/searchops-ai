import Link from "next/link";

import {
  AppWorkspaceFrame,
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  SectionHeader,
} from "../../src/dashboard-shell";
import {
  tableHeaderStyle,
  tableSectionStyle,
} from "../../src/dashboard-table-styles";
import {
  createEasySetupGuide,
  summarizeEasySetupGuide,
  type EasySetupGroup,
  type EasySetupStep,
} from "../../src/easy-setup";
import { loadOperationalReadiness } from "../../src/operational-readiness";
import { loadProductizationDashboard } from "../../src/productization-dashboard";

export default async function OnboardingPage() {
  const [readinessDashboard, productizationDashboard] = await Promise.all([
    loadOperationalReadiness(),
    loadProductizationDashboard(),
  ]);
  const guide = createEasySetupGuide({
    productization: productizationDashboard.productization,
    readiness: readinessDashboard.readiness,
  });
  const summary = summarizeEasySetupGuide(guide);
  const sourceLabel =
    readinessDashboard.source === "api" && productizationDashboard.source === "api"
      ? "API 데이터"
      : "데모/혼합 데이터";

  return (
    <AppWorkspaceFrame
      actions={
        <div className="searchops-action-row">
          <Link className="searchops-button secondary" href="/sites">
            사이트 목록
          </Link>
          <Link className="searchops-button secondary" href="/ops/readiness">
            고급 준비도
          </Link>
        </div>
      }
      description="복잡한 출시 준비 항목을 지금 할 일, 출시 전 연결할 일, 나중에 결정할 일로 나눠 확인합니다."
      eyebrow="Productization"
      title="시작하기"
    >
      <section aria-labelledby="onboarding-heading">
        <SectionHeader
          description="기술 설정값 대신 실제 다음 행동을 먼저 보여줍니다. 상세 설정은 고급 준비도 화면에서 확인할 수 있습니다."
          eyebrow="제품화"
          title="쉬운 설정 마법사"
        />
        <div style={metricGridStyle}>
          <MetricCard label="전체 항목" value={String(summary.total)} />
          <MetricCard label="지금 가능" value={String(summary.availableNow)} />
          <MetricCard label="출시 전 연결" value={String(summary.connectBeforeLaunch)} />
          <MetricCard label="나중에 결정" value={String(summary.decideLater)} />
        </div>

        <section aria-label="쉬운 설정 요약" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="onboarding-heading" style={{ fontSize: 18, margin: 0 }}>
                다음 행동
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                원시 환경변수와 provider 세부 설정은 숨기고, 실제로 눌러야 할 작업만 우선 표시합니다.
              </p>
            </div>
            <span className={`searchops-status-pill ${sourceLabel === "API 데이터" ? "ready" : "info"}`}>
              {sourceLabel}
            </span>
          </header>
          <div style={setupGroupListStyle}>
            {guide.map((group) => (
              <EasySetupGroupSection group={group} key={group.id} />
            ))}
          </div>
        </section>
      </section>
    </AppWorkspaceFrame>
  );
}

function EasySetupGroupSection({ group }: { readonly group: EasySetupGroup }) {
  return (
    <section aria-labelledby={`${group.id}-heading`} style={setupGroupStyle}>
      <div style={setupGroupHeaderStyle}>
        <div>
          <span className="searchops-label">{group.steps.length}개 항목</span>
          <h4 id={`${group.id}-heading`} style={{ fontSize: 18, margin: "5px 0 0" }}>
            {group.title}
          </h4>
          <p style={{ ...mutedTextStyle, fontSize: 13, margin: "6px 0 0" }}>{group.description}</p>
        </div>
      </div>
      <div style={stepGridStyle}>
        {group.steps.map((step) => (
          <EasySetupStepCard key={step.id} step={step} />
        ))}
      </div>
    </section>
  );
}

function EasySetupStepCard({ step }: { readonly step: EasySetupStep }) {
  return (
    <article className="searchops-card">
      <span className={`searchops-status-pill ${step.tone}`}>{step.title}</span>
      <p style={{ color: "#334155", fontSize: 14, lineHeight: 1.45, margin: "12px 0 0" }}>
        {step.description}
      </p>
      <p style={{ ...mutedTextStyle, fontSize: 13, lineHeight: 1.42, margin: "8px 0 0" }}>
        {step.reason}
      </p>
      <Link className="searchops-button secondary" href={step.href} style={{ marginTop: 12 }}>
        {step.actionLabel}
      </Link>
    </article>
  );
}

const setupGroupListStyle = {
  display: "grid",
  gap: 14,
  padding: 16,
} as const;

const setupGroupStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  overflow: "hidden",
} as const;

const setupGroupHeaderStyle = {
  background: "#f8fafc",
  borderBottom: "1px solid #dbe4ef",
  padding: 14,
} as const;

const stepGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  padding: 14,
} as const;
