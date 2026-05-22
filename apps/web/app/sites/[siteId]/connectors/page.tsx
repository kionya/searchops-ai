import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
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
  formatConnectorProvider,
  formatConnectorProviders,
  formatSyncDuration,
  getConnectorSyncResultTone,
  getConnectorSyncRunTone,
  loadConnectorSyncHistory,
  summarizeConnectorSyncHistory,
  type ConnectorSyncResultTone,
  type ConnectorSyncRunTone
} from "../../../../src/connector-sync-history";

interface ConnectorsPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function ConnectorsPage({ params }: ConnectorsPageProps) {
  const { siteId } = await params;
  const history = await loadConnectorSyncHistory(siteId);
  const summary = summarizeConnectorSyncHistory(history);
  const allResults = Object.values(history.resultsByRunId).flat();

  return (
    <section aria-labelledby="connector-sync-history-heading">
      <SectionHeader
        description="GSC, GA4, PageSpeed, Bing, and CMS sync run status with persisted provider results."
        eyebrow="Connectors"
        title="Connector sync history"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Sync runs" value={String(summary.total)} />
        <MetricCard label="Completed" value={String(summary.completed)} />
        <MetricCard label="Partial or failed" value={String(summary.partial + summary.failed)} />
        <MetricCard label="Synced records" value={String(summary.totalRecords)} />
      </div>
      <section aria-label="Connector sync runs" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="connector-sync-history-heading" style={{ fontSize: 18, margin: 0 }}>
              Recent connector syncs
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Latest status: {summary.latestStatus}; {summary.okResults} provider results are healthy.
            </p>
            {history.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                API fallback: {history.errorMessage}
              </p>
            ) : null}
          </div>
          <span
            style={{
              ...pillStyle,
              background: history.source === "api" ? "#ecfdf5" : "#eef2ff",
              color: history.source === "api" ? "#047857" : "#3730a3"
            }}
          >
            {history.source === "api" ? "API data" : "Fixture data"}
          </span>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>Run</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Started</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Providers</th>
                <th style={thStyle}>Records</th>
                <th style={thStyle}>Provider results</th>
              </tr>
            </thead>
            <tbody>
              {history.runs.map((run) => {
                const results = history.resultsByRunId[run.id] ?? [];
                const records = results.reduce((total, result) => total + result.recordCount, 0);

                return (
                  <tr key={run.id}>
                    <td style={tdStyle}>
                      <strong>{run.id}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        requested by {run.requestedByUserId}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <RunStatusPill label={run.status} tone={getConnectorSyncRunTone(run.status)} />
                    </td>
                    <td style={tdStyle}>{formatDateTime(run.startedAt)}</td>
                    <td style={tdStyle}>{formatSyncDuration(run.startedAt, run.endedAt)}</td>
                    <td style={tdStyle}>{formatConnectorProviders(run.providers)}</td>
                    <td style={tdStyle}>{records}</td>
                    <td style={tdStyle}>
                      {results.length === 0 ? (
                        <span style={{ color: "#64748b" }}>Pending</span>
                      ) : (
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {results.map((result) => (
                            <ResultStatusPill
                              key={result.id}
                              label={`${formatConnectorProvider(result.provider)} ${result.status}`}
                              tone={getConnectorSyncResultTone(result.status)}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Provider result detail" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>Provider result detail</h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Provider status, fetched timestamp, and persisted record counts.
            </p>
          </div>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 860 }}>
            <thead>
              <tr>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Run</th>
                <th style={thStyle}>Fetched</th>
                <th style={thStyle}>Records</th>
                <th style={thStyle}>Fixture</th>
              </tr>
            </thead>
            <tbody>
              {allResults.map((result) => (
                <tr key={result.id}>
                  <td style={tdStyle}>{formatConnectorProvider(result.provider)}</td>
                  <td style={tdStyle}>
                    <ResultStatusPill
                      label={result.status}
                      tone={getConnectorSyncResultTone(result.status)}
                    />
                  </td>
                  <td style={{ ...tdStyle, ...codeTextStyle }}>{result.syncRunId}</td>
                  <td style={tdStyle}>{formatDateTime(result.fetchedAt)}</td>
                  <td style={tdStyle}>{result.recordCount}</td>
                  <td style={tdStyle}>{result.fixture ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function RunStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorSyncRunTone;
}) {
  const toneStyle = {
    complete: { background: "#ecfdf5", color: "#047857" },
    failed: { background: "#fef2f2", color: "#b91c1c" },
    partial: { background: "#fff7ed", color: "#c2410c" },
    queued: { background: "#f8fafc", color: "#475569" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function ResultStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorSyncResultTone;
}) {
  const toneStyle = {
    failed: { background: "#fef2f2", color: "#b91c1c" },
    ok: { background: "#ecfdf5", color: "#047857" },
    partial: { background: "#fff7ed", color: "#c2410c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function formatDateTime(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "Pending";
}
