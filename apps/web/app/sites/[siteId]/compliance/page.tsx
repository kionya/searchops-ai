import type { ComplianceFlagStatus } from "@searchops/types";

import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  loadDashboardSite,
  SectionHeader
} from "../../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle,
  tableHeaderStyle,
  tableScrollStyle,
  tableSectionStyle,
  tableStyle,
  tdStyle,
  thStyle
} from "../../../../src/dashboard-table-styles";
import {
  formatComplianceDate,
  formatComplianceRisk,
  formatComplianceStatus,
  getComplianceReviewCreateFeedback,
  getComplianceRiskTone,
  getComplianceRecheckFeedback,
  getComplianceStatusUpdateFeedback,
  getComplianceWorkOrderFeedback,
  loadComplianceDashboard,
  summarizeComplianceDashboard,
  summarizeComplianceHardeningWorkflow,
  type ComplianceTone
} from "../../../../src/compliance-dashboard";
import {
  createComplianceReviewAction,
  createComplianceWorkOrderAction,
  recheckComplianceFlagAction,
  updateComplianceFlagStatusAction
} from "./actions";

interface CompliancePageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly flagCount?: string;
    readonly flagId?: string;
    readonly recheck?: string;
    readonly review?: string;
    readonly statusUpdate?: string;
    readonly workOrder?: string;
    readonly workOrderId?: string;
  }>;
}

export default async function CompliancePage({ params, searchParams }: CompliancePageProps) {
  const { siteId } = await params;
  const actionSearchParams = await searchParams;
  const site = await loadDashboardSite(siteId);
  const dashboard = await loadComplianceDashboard(site);
  const summary = summarizeComplianceDashboard(dashboard);
  const hardeningWorkflow = summarizeComplianceHardeningWorkflow(dashboard);
  const createFeedback = getComplianceReviewCreateFeedback(
    actionSearchParams.review,
    actionSearchParams.flagCount,
  );
  const workOrderFeedback = getComplianceWorkOrderFeedback(
    actionSearchParams.workOrder,
    actionSearchParams.workOrderId,
    actionSearchParams.flagId,
  );
  const statusFeedback = getComplianceStatusUpdateFeedback(
    actionSearchParams.statusUpdate,
    actionSearchParams.flagId,
  );
  const recheckFeedback = getComplianceRecheckFeedback(
    actionSearchParams.recheck,
    actionSearchParams.flagId,
  );

  return (
    <section aria-labelledby="compliance-heading">
      <SectionHeader
        description="의료광고 리스크 플래그를 결정론적으로 감지하고 초안 전용 게시 보호와 법무 검토 흐름을 제공합니다."
        eyebrow="컴플라이언스"
        title="의료광고 리스크 플래그"
      />
      <div style={metricGridStyle}>
        <MetricCard label="플래그" value={String(summary.total)} />
        <MetricCard label="열림" value={String(summary.open)} />
        <MetricCard label="차단 리스크" value={String(summary.blocked)} />
        <MetricCard label="승인됨" value={String(summary.approved)} />
      </div>
      <ComplianceCreatePanel
        createFeedback={createFeedback}
        siteId={siteId}
        recheckFeedback={recheckFeedback}
        statusFeedback={statusFeedback}
        workOrderFeedback={workOrderFeedback}
      />
      <ComplianceHardeningWorkflowPanel hardeningWorkflow={hardeningWorkflow} />
      <section aria-label="컴플라이언스 플래그" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="compliance-heading" style={{ fontSize: 18, margin: 0 }}>
              플래그 이력
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              열린 플래그 {summary.open}개는 의료 콘텐츠 게시 전 법무 검토가 필요합니다.
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
              color: dashboard.source === "api" ? "#047857" : "#3730a3"
            }}
          >
            {dashboard.source === "api" ? "API 데이터" : "데모 데이터"}
          </span>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={thStyle}>플래그</th>
                <th style={thStyle}>리스크</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>근거</th>
                <th style={thStyle}>권장 조치</th>
                <th style={thStyle}>검토</th>
                <th style={thStyle}>작업 지시서</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.flags.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, color: "#64748b" }}>
                    아직 컴플라이언스 플래그가 없습니다.
                  </td>
                </tr>
              ) : (
                dashboard.flags.map((flag) => {
                  const approveAction = updateComplianceFlagStatusAction.bind(
                    null,
                    siteId,
                    flag.id,
                    "approved" satisfies ComplianceFlagStatus,
                  );
                  const dismissAction = updateComplianceFlagStatusAction.bind(
                    null,
                    siteId,
                    flag.id,
                    "dismissed" satisfies ComplianceFlagStatus,
                  );
                  const workOrderAction = createComplianceWorkOrderAction.bind(
                    null,
                    siteId,
                    flag.id,
                  );
                  const recheckAction = recheckComplianceFlagAction.bind(null, siteId, flag.id);

                  return (
                    <tr key={flag.id}>
                      <td style={tdStyle}>
                        <strong>{flag.title ?? flag.ruleId ?? "컴플라이언스 플래그"}</strong>
                        <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                          {flag.id} - {formatComplianceDate(flag.createdAt)}
                        </span>
                        {flag.url ? (
                          <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                            {flag.url}
                          </span>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <TonePill
                          label={formatComplianceRisk(flag.riskLevel)}
                          tone={getComplianceRiskTone(flag.riskLevel)}
                        />
                      </td>
                      <td style={tdStyle}>{formatComplianceStatus(flag.status)}</td>
                      <td style={{ ...tdStyle, maxWidth: 260 }}>
                        {flag.evidence?.excerpt ?? flag.message}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 280 }}>
                        {flag.recommendation ?? "법무 검토로 전달하세요."}
                      </td>
                      <td style={tdStyle}>
                        <div style={buttonRowStyle}>
                          <form action={approveAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              승인
                            </button>
                          </form>
                          <form action={dismissAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              기각
                            </button>
                          </form>
                          <form action={recheckAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              재검수
                            </button>
                          </form>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {flag.workOrderId ? (
                          <span style={{ ...codeTextStyle, color: "#047857" }}>
                            {flag.workOrderId}
                          </span>
                        ) : (
                          <form action={workOrderAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              작업 생성
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ComplianceHardeningWorkflowPanel({
  hardeningWorkflow
}: {
  readonly hardeningWorkflow: ReturnType<typeof summarizeComplianceHardeningWorkflow>;
}) {
  return (
    <section aria-label="컴플라이언스 hardening workflow" style={tableSectionStyle}>
      <header style={tableHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>Hardening workflow</h3>
          <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
            {hardeningWorkflow.rulePackId} rule pack {hardeningWorkflow.deterministicRuleCount}개 룰, native signature provider {hardeningWorkflow.nativeSignatureProviders.join(", ")}.
          </p>
        </div>
        <span style={{ ...pillStyle, background: "#fef2f2", color: "#b91c1c" }}>
          auto-publish off
        </span>
      </header>
      <div style={tableScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={thStyle}>단계</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}>상세</th>
              <th style={thStyle}>다음 조치</th>
            </tr>
          </thead>
          <tbody>
            {hardeningWorkflow.stages.map((stage) => (
              <tr key={stage.id}>
                <td style={tdStyle}>
                  <strong>{stage.title}</strong>
                  <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                    {stage.id}
                  </span>
                </td>
                <td style={tdStyle}>
                  <WorkflowStatusPill status={stage.status} />
                </td>
                <td style={{ ...tdStyle, maxWidth: 300 }}>{stage.detail}</td>
                <td style={{ ...tdStyle, maxWidth: 300 }}>{stage.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComplianceCreatePanel({
  createFeedback,
  recheckFeedback,
  siteId,
  statusFeedback,
  workOrderFeedback
}: {
  readonly createFeedback: ReturnType<typeof getComplianceReviewCreateFeedback>;
  readonly recheckFeedback: ReturnType<typeof getComplianceRecheckFeedback>;
  readonly siteId: string;
  readonly statusFeedback: ReturnType<typeof getComplianceStatusUpdateFeedback>;
  readonly workOrderFeedback: ReturnType<typeof getComplianceWorkOrderFeedback>;
}) {
  const action = createComplianceReviewAction.bind(null, siteId);

  return (
    <section aria-label="컴플라이언스 검토 생성" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>컴플라이언스 검토 실행</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          데모 검토 문구에서 결정론적 의료광고 플래그를 저장합니다.
        </p>
        {[createFeedback, workOrderFeedback, statusFeedback, recheckFeedback].map((feedback) =>
          feedback ? (
            <p key={feedback.message} style={{ ...feedbackStyle[feedback.tone], margin: "10px 0 0" }}>
              {feedback.message}
            </p>
          ) : null,
        )}
      </div>
      <form action={action}>
        <button style={createButtonStyle} type="submit">
          검토 실행
        </button>
      </form>
    </section>
  );
}

function TonePill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ComplianceTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function WorkflowStatusPill({ status }: { readonly status: "needs_owner" | "ready" }) {
  const statusStyle = {
    needs_owner: { background: "#fff7ed", color: "#c2410c" },
    ready: { background: "#ecfdf5", color: "#047857" }
  }[status];
  const label = status === "ready" ? "준비됨" : "owner 필요";

  return <span style={{ ...pillStyle, ...statusStyle }}>{label}</span>;
}

const createPanelStyle = {
  alignItems: "start",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const createButtonStyle = {
  background: "#2563eb",
  border: 0,
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  minHeight: 40,
  padding: "10px 14px"
} as const;

const secondaryButtonStyle = {
  background: "#f8fafc",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#172033",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  minHeight: 38,
  padding: "9px 12px"
} as const;

const buttonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8
} as const;

const feedbackStyle = {
  info: {
    color: "#3730a3",
    fontSize: 13
  },
  success: {
    color: "#047857",
    fontSize: 13
  },
  warning: {
    color: "#b91c1c",
    fontSize: 13
  }
} as const;
