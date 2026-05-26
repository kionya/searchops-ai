import Link from "next/link";

import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  pageStyle,
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
  formatOperationalDate,
  formatUptime,
  getObservabilityAlertTone,
  loadObservabilityDashboard,
  type ObservabilityAlertTone,
} from "../../../src/observability-dashboard";

export default async function ObservabilityPage() {
  const dashboard = await loadObservabilityDashboard();

  return (
    <main style={pageStyle}>
      <Link href="/sites" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>
        Back to sites
      </Link>
      <section aria-labelledby="observability-heading" style={{ marginTop: 18 }}>
        <SectionHeader
          description="Operations metrics export, worker failure summary, and deterministic alert routing signals."
          eyebrow="Operations"
          title="Observability"
        />
        <div style={metricGridStyle}>
          <MetricCard label="Requests" value={String(dashboard.summary.requestTotal)} />
          <MetricCard label="5xx responses" value={String(dashboard.summary.serverErrorCount)} />
          <MetricCard label="Dead-letter jobs" value={String(dashboard.summary.deadLetterTotal)} />
          <MetricCard label="Critical alerts" value={String(dashboard.summary.criticalAlertCount)} />
        </div>

        <section aria-label="Operational metrics export" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="observability-heading" style={{ fontSize: 18, margin: 0 }}>
                Metrics export
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                Generated {formatOperationalDate(dashboard.metrics.generatedAt)} after{" "}
                {formatUptime(dashboard.summary.uptimeSeconds)} uptime.
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
                color: dashboard.source === "api" ? "#047857" : "#3730a3",
              }}
            >
              {dashboard.source === "api" ? "API data" : "Fixture data"}
            </span>
          </header>

          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Metric</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Source</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboard.metrics.requests.byStatus).map(([status, count]) => (
                  <tr key={status}>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>http.status.{status}</td>
                    <td style={tdStyle}>{count}</td>
                    <td style={tdStyle}>api</td>
                  </tr>
                ))}
                {Object.entries(dashboard.metrics.workers.deadLetterJobs.byQueue).map(
                  ([queue, count]) => (
                    <tr key={queue}>
                      <td style={{ ...tdStyle, ...codeTextStyle }}>
                        worker.dead_letter.{queue}
                      </td>
                      <td style={tdStyle}>{count}</td>
                      <td style={tdStyle}>worker</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="Operational alerts" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>Alert routing</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                Alerts are derived from the exported metrics payload and routed by severity/source.
              </p>
            </div>
            <span style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
              {dashboard.summary.alertCount} alerts
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Alert</th>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Message</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.metrics.alerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={tdStyle}>
                      No alert signals in this export.
                    </td>
                  </tr>
                ) : (
                  dashboard.metrics.alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td style={{ ...tdStyle, ...codeTextStyle }}>{alert.id}</td>
                      <td style={tdStyle}>
                        <AlertTonePill
                          label={alert.severity}
                          tone={getObservabilityAlertTone(alert)}
                        />
                      </td>
                      <td style={tdStyle}>{alert.source}</td>
                      <td style={tdStyle}>{alert.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function AlertTonePill({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: ObservabilityAlertTone;
}) {
  const toneStyle = {
    critical: { background: "#fef2f2", color: "#b91c1c" },
    info: { background: "#eff6ff", color: "#1d4ed8" },
    warning: { background: "#fffbeb", color: "#92400e" },
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}
