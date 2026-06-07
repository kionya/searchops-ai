import Link from "next/link";

import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  pageStyle,
  SectionHeader,
} from "../../src/dashboard-shell";
import {
  pillStyle,
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
    <main style={pageStyle}>
      <Link href="/sites" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>
        사이트 목록으로
      </Link>
      <section aria-labelledby="onboarding-heading" style={{ marginTop: 18 }}>
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
              <article key={step.id} style={stepStyle}>
                <span
                  style={{
                    ...pillStyle,
                    ...onboardingToneStyle[step.status],
                  }}
                >
                  {formatOnboardingStatus(step.status)}
                </span>
                <strong style={{ display: "block", fontSize: 17, marginTop: 12 }}>
                  {step.title}
                </strong>
                {step.href ? (
                  <Link href={step.href} style={stepLinkStyle}>
                    열기
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
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

const stepStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
} as const;

const stepLinkStyle = {
  color: "#2563eb",
  display: "inline-flex",
  fontSize: 14,
  fontWeight: 700,
  marginTop: 12,
  textDecoration: "none",
} as const;

const onboardingToneStyle = {
  available: { background: "#ecfdf5", color: "#047857" },
  blocked: { background: "#fff7ed", color: "#c2410c" },
  optional: { background: "#eff6ff", color: "#1d4ed8" },
} as const;
