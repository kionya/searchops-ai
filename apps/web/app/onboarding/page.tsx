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
  onboardingSteps,
  summarizeOnboardingSteps,
} from "../../src/productization-dashboard";

export default function OnboardingPage() {
  const summary = summarizeOnboardingSteps(onboardingSteps);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/sites">
          사이트 목록으로
        </Link>
      }
      description="첫 사이트, 첫 크롤링, 첫 작업 지시서까지의 초기 운영 흐름과 선택 설정을 확인합니다."
      eyebrow="Productization"
      title="온보딩"
    >
      <section aria-labelledby="onboarding-heading">
        <SectionHeader
          description="첫 사이트, 첫 크롤링, 첫 작업 지시서까지의 초기 운영 흐름과 선택 설정을 확인합니다."
          eyebrow="제품화"
          title="온보딩"
        />
        <div style={metricGridStyle}>
          <MetricCard label="전체 단계" value={String(summary.total)} />
          <MetricCard label="바로 가능" value={String(summary.available)} />
          <MetricCard label="선택 설정" value={String(summary.optional)} />
          <MetricCard label="후속 필요" value={String(summary.blocked)} />
        </div>

        <section aria-label="온보딩 단계" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="onboarding-heading" style={{ fontSize: 18, margin: 0 }}>
                초기 설정 흐름
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                live connector와 billing은 credential/providing 전까지 선택 또는 후속 단계로 분리합니다.
              </p>
            </div>
          </header>
          <div style={stepGridStyle}>
            {onboardingSteps.map((step) => (
              <article className="searchops-card" key={step.id}>
                <span className={`searchops-status-pill ${onboardingToneClass[step.status]}`}>
                  {formatOnboardingStatus(step.status)}
                </span>
                <strong style={{ display: "block", fontSize: 17, marginTop: 12 }}>
                  {step.title}
                </strong>
                {step.href ? (
                  <Link className="searchops-button secondary" href={step.href} style={{ marginTop: 12 }}>
                    열기
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>
    </AppWorkspaceFrame>
  );
}

function formatOnboardingStatus(status: "available" | "blocked" | "optional") {
  const labels = {
    available: "바로 가능",
    blocked: "후속 필요",
    optional: "선택 설정",
  };

  return labels[status];
}

const stepGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  padding: 16,
} as const;

const onboardingToneClass = {
  available: "ready",
  blocked: "warning",
  optional: "info",
} as const;
