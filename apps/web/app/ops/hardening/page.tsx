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
  getBackupRestoreDrillRunFeedback,
  loadOperationsHardeningDashboard,
} from "../../../src/operations-hardening-dashboard";
import { runBackupRestoreDrillAction } from "./actions";

interface OperationsHardeningPageProps {
  readonly searchParams: Promise<{
    readonly planId?: string;
    readonly restore?: string;
  }>;
}

export default async function OperationsHardeningPage({
  searchParams,
}: OperationsHardeningPageProps) {
  const params = await searchParams;
  const dashboard = await loadOperationsHardeningDashboard();
  const feedback = getBackupRestoreDrillRunFeedback(params.restore, params.planId);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="Redis rate limit, migration deploy gate, backup/restore drill을 운영 환경에 연결하기 전 안전한 계획으로 확인합니다."
      eyebrow="Operations"
      title="Production hardening"
    >
      <section aria-labelledby="ops-hardening-heading">
        <SectionHeader
          description="Redis rate limit, migration deploy gate, backup/restore drill을 운영 환경에 연결하기 전 안전한 계획으로 확인합니다."
          eyebrow="운영"
          title="Production hardening"
        />
        <div style={metricGridStyle}>
          <MetricCard label="Restore drill 단계" value={String(dashboard.summary.restoreSteps)} />
          <MetricCard label="Migration gate 단계" value={String(dashboard.summary.migrationSteps)} />
          <MetricCard label="필수 입력" value={String(dashboard.summary.requiredInputs)} />
          <MetricCard label="데이터 출처" value={dashboard.source === "api" ? "API" : "데모"} />
        </div>

        <section aria-label="Restore drill" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="ops-hardening-heading" style={{ fontSize: 18, margin: 0 }}>
                Backup/restore drill
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                계획 ID {dashboard.backupRestorePlan.id}. 실제 DB에는 이 화면이 직접 연결하지 않습니다.
              </p>
              {dashboard.errorMessage ? (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                  API 연결 실패: {dashboard.errorMessage}
                </p>
              ) : null}
              {feedback ? (
                <p style={{ ...feedbackStyle[feedback.tone], margin: "8px 0 0" }}>
                  {feedback.message}
                </p>
              ) : null}
            </div>
            <form action={runBackupRestoreDrillAction}>
              <input name="environment" type="hidden" value="production" />
              <input name="dryRun" type="hidden" value="true" />
              <button style={primaryButtonStyle} type="submit">
                Dry-run dispatch
              </button>
            </form>
          </header>
          <RunbookStepTable steps={dashboard.backupRestorePlan.steps} />
        </section>

        <section aria-label="Migration deploy gate" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>Migration deploy gate</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                GitHub Actions의 임시 PostgreSQL service에서 migrate deploy/status를 검증합니다.
              </p>
            </div>
            <span style={{ ...pillStyle, background: "#ecfdf5", color: "#047857" }}>
              {dashboard.migrationGatePlan.status === "ready" ? "준비됨" : "차단됨"}
            </span>
          </header>
          <RunbookStepTable steps={dashboard.migrationGatePlan.steps} />
        </section>
      </section>
    </AppWorkspaceFrame>
  );
}

function RunbookStepTable({
  steps,
}: {
  readonly steps: readonly {
    readonly command: string | null;
    readonly description: string;
    readonly id: string;
    readonly status: string;
    readonly title: string;
  }[];
}) {
  return (
    <div style={tableScrollStyle}>
      <table style={{ ...tableStyle, minWidth: 900 }}>
        <thead>
          <tr>
            <th style={thStyle}>단계</th>
            <th style={thStyle}>상태</th>
            <th style={thStyle}>설명</th>
            <th style={thStyle}>명령</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id}>
              <td style={tdStyle}>
                <strong>{step.title}</strong>
                <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                  {step.id}
                </span>
              </td>
              <td style={tdStyle}>{step.status}</td>
              <td style={tdStyle}>{step.description}</td>
              <td style={{ ...tdStyle, ...codeTextStyle }}>{step.command ?? "수동 확인"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const primaryButtonStyle = {
  background: "#111827",
  border: "1px solid #111827",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 36,
  padding: "8px 12px",
} as const;

const feedbackStyle = {
  info: {
    color: "#3730a3",
    fontSize: 13,
  },
  success: {
    color: "#047857",
    fontSize: 13,
  },
  warning: {
    color: "#b91c1c",
    fontSize: 13,
  },
} as const;
