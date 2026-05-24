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
  formatGeoDate,
  formatGeoProvider,
  formatGeoStatus,
  getGeoVisibilityCreateFeedback,
  getGeoVisibilityStatusTone,
  loadGeoVisibilityDashboard,
  summarizeGeoVisibilityDashboard,
  type GeoVisibilityTone
} from "../../../../src/geo-visibility-dashboard";
import { createGeoVisibilityReportAction } from "./actions";

interface GeoPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly geo?: string;
    readonly reportId?: string;
  }>;
}

export default async function GeoPage({ params, searchParams }: GeoPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const site = resolveDashboardSite(siteId);
  const dashboard = await loadGeoVisibilityDashboard(site);
  const summary = summarizeGeoVisibilityDashboard(dashboard);
  const createFeedback = getGeoVisibilityCreateFeedback(
    createSearchParams.geo,
    createSearchParams.reportId,
  );

  return (
    <section aria-labelledby="geo-visibility-heading">
      <SectionHeader
        description="Deterministic AI visibility monitoring from stored answer observations, brand mentions, and owned URL citations."
        eyebrow="GEO Monitor"
        title="AI visibility report"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Reports" value={String(summary.total)} />
        <MetricCard label="Mention rate" value={summary.averageMentionRate} />
        <MetricCard label="Citation rate" value={summary.averageCitationRate} />
        <MetricCard label="Weak or missing" value={String(summary.weakOrMissing)} />
      </div>
      <GeoCreatePanel siteId={siteId} createFeedback={createFeedback} />
      <section aria-label="GEO visibility reports" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="geo-visibility-heading" style={{ fontSize: 18, margin: 0 }}>
              Visibility history
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Latest status: {formatGeoStatus(summary.latestStatus)}. {summary.strong} reports are strong.
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
          <table style={{ ...tableStyle, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={thStyle}>Report</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Mention</th>
                <th style={thStyle}>Citation</th>
                <th style={thStyle}>Queries</th>
                <th style={thStyle}>Providers</th>
                <th style={thStyle}>Competitor risk</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.reports.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, color: "#64748b" }}>
                    No GEO visibility reports yet.
                  </td>
                </tr>
              ) : (
                dashboard.reports.map((report) => (
                  <tr key={report.id}>
                    <td style={tdStyle}>
                      <strong>{report.brandName}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {report.id} - {formatGeoDate(report.evaluatedAt)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <TonePill
                        label={`${formatGeoStatus(report.status)} ${report.score}`}
                        tone={getGeoVisibilityStatusTone(report.status)}
                      />
                    </td>
                    <td style={tdStyle}>{report.mentionRate}%</td>
                    <td style={tdStyle}>{report.citationRate}%</td>
                    <td style={tdStyle}>{report.queryCount}</td>
                    <td style={tdStyle}>{report.providerCount}</td>
                    <td style={tdStyle}>{report.competitorCitationRate}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="GEO observation detail" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>Observation detail</h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Provider, query, answer evidence, and cited URL ownership for the latest report.
            </p>
          </div>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>Query</th>
                <th style={thStyle}>Answer evidence</th>
                <th style={thStyle}>Cited URLs</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.reports[0]?.observations ?? []).map((observation) => (
                <tr key={`${observation.provider}-${observation.query}`}>
                  <td style={tdStyle}>{formatGeoProvider(observation.provider)}</td>
                  <td style={tdStyle}>{observation.query}</td>
                  <td style={{ ...tdStyle, maxWidth: 340 }}>{observation.answerText || "No answer text"}</td>
                  <td style={{ ...tdStyle, ...codeTextStyle, maxWidth: 320 }}>
                    {observation.citedUrls.length === 0
                      ? "No citations"
                      : observation.citedUrls.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function GeoCreatePanel({
  createFeedback,
  siteId
}: {
  readonly createFeedback: ReturnType<typeof getGeoVisibilityCreateFeedback>;
  readonly siteId: string;
}) {
  const action = createGeoVisibilityReportAction.bind(null, siteId);

  return (
    <section aria-label="Create GEO visibility report" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>Run GEO monitor</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          Store a deterministic visibility report from fixture answer observations.
        </p>
        {createFeedback ? (
          <p style={{ ...feedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
      </div>
      <form action={action}>
        <button style={createButtonStyle} type="submit">
          Run monitor
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
  readonly tone: GeoVisibilityTone;
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
