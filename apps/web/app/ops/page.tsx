import Link from "next/link";

import {
  AppWorkspaceFrame,
  mutedTextStyle,
  SectionHeader
} from "../../src/dashboard-shell";
import { pillStyle } from "../../src/dashboard-table-styles";
import { loadDeadLetterOperations } from "../../src/dead-letter-operations";
import { loadObservabilityDashboard } from "../../src/observability-dashboard";
import {
  createOperatorConsoleSignals,
  summarizeOperatorConsoleSignals,
  type OperatorConsoleSignal,
  type OperatorConsoleSignalTone
} from "../../src/operator-console";
import { loadOperationalReadiness } from "../../src/operational-readiness";
import { loadOperationsHardeningDashboard } from "../../src/operations-hardening-dashboard";
import { loadProductizationDashboard } from "../../src/productization-dashboard";

export default async function OperationsHubPage() {
  const [readiness, observability, deadLetter, hardening, productization] = await Promise.all([
    loadOperationalReadiness(),
    loadObservabilityDashboard(),
    loadDeadLetterOperations(),
    loadOperationsHardeningDashboard(),
    loadProductizationDashboard()
  ]);
  const signals = createOperatorConsoleSignals({
    canLaunch: productization.productization.canLaunch,
    deadLetterSummary: deadLetter.summary,
    hardeningSummary: hardening.summary,
    observabilitySummary: observability.summary,
    productizationSummary: productization.productization.summary,
    readinessSummary: readiness.readiness.summary
  });
  const signalSummary = summarizeOperatorConsoleSignals(signals);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/sites">
          사이트 목록으로
        </Link>
      }
      description="배포 전후 운영자가 확인해야 하는 readiness, metrics, failed jobs, hardening, productization 신호를 한 화면에서 스캔합니다."
      eyebrow="Operations"
      title="운영 관제 콘솔"
    >
      <section>
        <SectionHeader
          description="배포 전후 운영자가 확인해야 하는 readiness, metrics, failed jobs, hardening, productization 신호를 한 화면에서 스캔합니다."
          eyebrow="운영"
          title="운영 관제 콘솔"
        />
        <section aria-label="운영 상태 요약" style={consoleHeroStyle}>
          <div>
            <p style={consoleLabelStyle}>operator console</p>
            <h3 style={{ fontSize: 22, letterSpacing: 0, lineHeight: 1.15, margin: "6px 0 8px" }}>
              Launch blockers first, then connector and worker follow-up.
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, maxWidth: 720 }}>
              실제 secret 값은 노출하지 않고 API fallback, fixture fallback, 운영 queue 상태를 같은 기준으로 정렬합니다.
            </p>
          </div>
          <div style={summaryGridStyle}>
            <SummaryTile label="Risk" tone="risk" value={String(signalSummary.risk)} />
            <SummaryTile label="Warning" tone="warning" value={String(signalSummary.warning)} />
            <SummaryTile label="Ready" tone="ready" value={String(signalSummary.ready)} />
            <SummaryTile label="Signals" tone="neutral" value={String(signalSummary.total)} />
          </div>
        </section>

        <section aria-label="운영 상태 행렬" style={signalMatrixStyle}>
          {signals.map((signal, index) => (
            <OperatorSignalCard
              index={index + 1}
              key={signal.id}
              signal={signal}
            />
          ))}
        </section>

        <div style={sourceRowStyle}>
          <SourceBadge label="readiness" source={readiness.source} />
          <SourceBadge label="metrics" source={observability.source} />
          <SourceBadge label="dead-letter" source={deadLetter.source} />
          <SourceBadge label="hardening" source={hardening.source} />
          <SourceBadge label="productization" source={productization.source} />
        </div>
      </section>
    </AppWorkspaceFrame>
  );
}

function OperatorSignalCard({
  index,
  signal
}: {
  readonly index: number;
  readonly signal: OperatorConsoleSignal;
}) {
  return (
    <Link href={signal.href} style={signalCardStyle}>
      <div style={signalCardHeaderStyle}>
        <span style={stepNumberStyle}>{String(index).padStart(2, "0")}</span>
        <TonePill tone={signal.tone} />
      </div>
      <strong style={{ display: "block", fontSize: 17, marginTop: 14 }}>{signal.title}</strong>
      <span style={{ color: "#475569", display: "block", fontSize: 13, lineHeight: 1.45, marginTop: 7 }}>
        {signal.summary}
      </span>
      <span style={signalMetricStyle}>{signal.value}</span>
      <span style={{ ...mutedTextStyle, display: "block", fontSize: 12, marginTop: 7 }}>
        {signal.detail}
      </span>
    </Link>
  );
}

function SummaryTile({
  label,
  tone,
  value
}: {
  readonly label: string;
  readonly tone: OperatorConsoleSignalTone;
  readonly value: string;
}) {
  const toneStyle = consoleToneStyles[tone];

  return (
    <article style={{ ...summaryTileStyle, borderColor: toneStyle.border }}>
      <span style={{ ...consoleLabelStyle, color: toneStyle.color }}>{label}</span>
      <strong style={{ display: "block", fontSize: 28, lineHeight: 1, marginTop: 7 }}>{value}</strong>
    </article>
  );
}

function TonePill({ tone }: { readonly tone: OperatorConsoleSignalTone }) {
  const toneStyle = consoleToneStyles[tone];
  const label = {
    neutral: "정보",
    ready: "준비됨",
    risk: "위험",
    warning: "주의"
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function SourceBadge({
  label,
  source
}: {
  readonly label: string;
  readonly source: string;
}) {
  return (
    <span
      style={{
        ...pillStyle,
        background: source === "api" ? "#ecfdf5" : "#eef2ff",
        color: source === "api" ? "#047857" : "#3730a3"
      }}
    >
      {label}: {source === "api" ? "API" : "demo"}
    </span>
  );
}

const consoleHeroStyle = {
  alignItems: "start",
  background: "#f8fafc",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  padding: 18
} as const;

const summaryGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
} as const;

const summaryTileStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  minHeight: 78,
  padding: 12
} as const;

const signalMatrixStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  marginTop: 14
} as const;

const signalCardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#172033",
  display: "block",
  minHeight: 214,
  padding: 15,
  textDecoration: "none"
} as const;

const signalCardHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: 10,
  justifyContent: "space-between"
} as const;

const stepNumberStyle = {
  color: "#64748b",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  fontWeight: 700
} as const;

const signalMetricStyle = {
  borderTop: "1px solid #eef2f7",
  display: "block",
  fontSize: 20,
  fontWeight: 800,
  lineHeight: 1,
  marginTop: 14,
  paddingTop: 13
} as const;

const sourceRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 14
} as const;

const consoleLabelStyle = {
  color: "#64748b",
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  margin: 0,
  textTransform: "uppercase"
} as const;

const consoleToneStyles = {
  neutral: { background: "#f8fafc", border: "#dbe4ef", color: "#475569" },
  ready: { background: "#ecfdf5", border: "#bbf7d0", color: "#047857" },
  risk: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
  warning: { background: "#fffbeb", border: "#fde68a", color: "#92400e" }
} as const;
