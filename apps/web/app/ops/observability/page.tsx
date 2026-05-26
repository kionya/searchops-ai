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
  formatOperationalSeverity,
  formatOperationalSource,
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
        사이트 목록으로
      </Link>
      <section aria-labelledby="observability-heading" style={{ marginTop: 18 }}>
        <SectionHeader
          description="운영 지표 export, 워커 실패 요약, 결정론적 알림 라우팅 신호를 확인합니다."
          eyebrow="운영"
          title="운영 지표"
        />
        <div style={metricGridStyle}>
          <MetricCard label="요청" value={String(dashboard.summary.requestTotal)} />
          <MetricCard label="5xx 응답" value={String(dashboard.summary.serverErrorCount)} />
          <MetricCard label="실패 작업" value={String(dashboard.summary.deadLetterTotal)} />
          <MetricCard label="긴급 알림" value={String(dashboard.summary.criticalAlertCount)} />
        </div>

        <section aria-label="운영 지표 export" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="observability-heading" style={{ fontSize: 18, margin: 0 }}>
                지표 export
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                {formatOperationalDate(dashboard.metrics.generatedAt)}에 생성됨. 업타임 {formatUptime(dashboard.summary.uptimeSeconds)} 기준입니다.
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

          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>지표</th>
                  <th style={thStyle}>값</th>
                  <th style={thStyle}>출처</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(dashboard.metrics.requests.byStatus).map(([status, count]) => (
                  <tr key={status}>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>http.status.{status}</td>
                    <td style={tdStyle}>{count}</td>
                    <td style={tdStyle}>API</td>
                  </tr>
                ))}
                {Object.entries(dashboard.metrics.workers.deadLetterJobs.byQueue).map(
                  ([queue, count]) => (
                    <tr key={queue}>
                      <td style={{ ...tdStyle, ...codeTextStyle }}>
                        worker.dead_letter.{queue}
                      </td>
                      <td style={tdStyle}>{count}</td>
                      <td style={tdStyle}>워커</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-label="운영 알림" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 style={{ fontSize: 18, margin: 0 }}>알림 라우팅</h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                알림은 export된 지표 payload에서 파생되며 심각도/출처에 따라 라우팅됩니다.
              </p>
            </div>
            <span style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
              알림 {dashboard.summary.alertCount}개
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={thStyle}>알림</th>
                  <th style={thStyle}>심각도</th>
                  <th style={thStyle}>출처</th>
                  <th style={thStyle}>메시지</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.metrics.alerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={tdStyle}>
                      이번 export에는 알림 신호가 없습니다.
                    </td>
                  </tr>
                ) : (
                  dashboard.metrics.alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td style={{ ...tdStyle, ...codeTextStyle }}>{alert.id}</td>
                      <td style={tdStyle}>
                        <AlertTonePill
                          label={formatOperationalSeverity(alert.severity)}
                          tone={getObservabilityAlertTone(alert)}
                        />
                      </td>
                      <td style={tdStyle}>{formatOperationalSource(alert.source)}</td>
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
