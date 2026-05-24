import type { ComplianceFlagStatus } from "@searchops/types";

import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  resolveDashboardSite,
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
  getComplianceReviewCreateFeedback,
  getComplianceRiskTone,
  getComplianceStatusUpdateFeedback,
  getComplianceWorkOrderFeedback,
  loadComplianceDashboard,
  summarizeComplianceDashboard,
  type ComplianceTone
} from "../../../../src/compliance-dashboard";
import {
  createComplianceReviewAction,
  createComplianceWorkOrderAction,
  updateComplianceFlagStatusAction
} from "./actions";

interface CompliancePageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly flagCount?: string;
    readonly flagId?: string;
    readonly review?: string;
    readonly statusUpdate?: string;
    readonly workOrder?: string;
    readonly workOrderId?: string;
  }>;
}

export default async function CompliancePage({ params, searchParams }: CompliancePageProps) {
  const { siteId } = await params;
  const actionSearchParams = await searchParams;
  const site = resolveDashboardSite(siteId);
  const dashboard = await loadComplianceDashboard(site);
  const summary = summarizeComplianceDashboard(dashboard);
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

  return (
    <section aria-labelledby="compliance-heading">
      <SectionHeader
        description="Deterministic medical advertising risk flags with draft-only publishing safeguards and legal review workflow."
        eyebrow="Compliance"
        title="Medical ad risk flags"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Flags" value={String(summary.total)} />
        <MetricCard label="Open" value={String(summary.open)} />
        <MetricCard label="Blocked risk" value={String(summary.blocked)} />
        <MetricCard label="Approved" value={String(summary.approved)} />
      </div>
      <ComplianceCreatePanel
        createFeedback={createFeedback}
        siteId={siteId}
        statusFeedback={statusFeedback}
        workOrderFeedback={workOrderFeedback}
      />
      <section aria-label="Compliance flags" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="compliance-heading" style={{ fontSize: 18, margin: 0 }}>
              Flag history
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              {summary.open} open flags need legal review before medical content can publish.
            </p>
            {dashboard.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                API fallback: {dashboard.errorMessage}
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
            {dashboard.source === "api" ? "API data" : "Fixture data"}
          </span>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={thStyle}>Flag</th>
                <th style={thStyle}>Risk</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Evidence</th>
                <th style={thStyle}>Recommendation</th>
                <th style={thStyle}>Review</th>
                <th style={thStyle}>Work order</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.flags.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, color: "#64748b" }}>
                    No compliance flags yet.
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

                  return (
                    <tr key={flag.id}>
                      <td style={tdStyle}>
                        <strong>{flag.title ?? flag.ruleId ?? "Compliance flag"}</strong>
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
                      <td style={tdStyle}>{flag.status}</td>
                      <td style={{ ...tdStyle, maxWidth: 260 }}>
                        {flag.evidence?.excerpt ?? flag.message}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 280 }}>
                        {flag.recommendation ?? "Route to legal review."}
                      </td>
                      <td style={tdStyle}>
                        <div style={buttonRowStyle}>
                          <form action={approveAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              Approve
                            </button>
                          </form>
                          <form action={dismissAction}>
                            <button style={secondaryButtonStyle} type="submit">
                              Dismiss
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
                              Create task
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

function ComplianceCreatePanel({
  createFeedback,
  siteId,
  statusFeedback,
  workOrderFeedback
}: {
  readonly createFeedback: ReturnType<typeof getComplianceReviewCreateFeedback>;
  readonly siteId: string;
  readonly statusFeedback: ReturnType<typeof getComplianceStatusUpdateFeedback>;
  readonly workOrderFeedback: ReturnType<typeof getComplianceWorkOrderFeedback>;
}) {
  const action = createComplianceReviewAction.bind(null, siteId);

  return (
    <section aria-label="Create compliance review" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>Run compliance review</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          Store deterministic medical ad flags from fixture review copy.
        </p>
        {[createFeedback, workOrderFeedback, statusFeedback].map((feedback) =>
          feedback ? (
            <p key={feedback.message} style={{ ...feedbackStyle[feedback.tone], margin: "10px 0 0" }}>
              {feedback.message}
            </p>
          ) : null,
        )}
      </div>
      <form action={action}>
        <button style={createButtonStyle} type="submit">
          Run review
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

const createPanelStyle = {
  alignItems: "center",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "flex",
  gap: 16,
  justifyContent: "space-between",
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
