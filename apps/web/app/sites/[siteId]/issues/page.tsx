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
  demoIssueListRows,
  summarizeIssues
} from "../../../../src/site-detail-views";

export default function IssuesPage() {
  const summary = summarizeIssues(demoIssueListRows);

  return (
    <section aria-labelledby="seo-issue-list-heading">
      <SectionHeader
        description="Rule-based SEO issues grouped by priority, severity, category, status, and owner handoff."
        eyebrow="SEO Issues"
        title="SEO issue list"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Total issues" value={String(summary.total)} />
        <MetricCard label="Open" value={String(summary.open)} />
        <MetricCard label="P0/P1" value={String(summary.critical)} />
        <MetricCard label="Resolved" value={String(summary.resolved)} />
      </div>
      <section aria-label="Detected SEO issues" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="seo-issue-list-heading" style={{ fontSize: 18, margin: 0 }}>
              Detected issues
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              {summary.inReview} issue is waiting for deterministic recheck.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>Fixture data</span>
        </header>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Issue</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {demoIssueListRows.map((issue) => (
                <tr key={issue.id}>
                  <td style={tdStyle}>
                    <strong>{issue.title}</strong>
                    <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                      {issue.ruleId}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <PriorityPill priority={issue.priority} />
                  </td>
                  <td style={tdStyle}>{issue.severity}</td>
                  <td style={tdStyle}>
                    <StatusPill status={issue.status} />
                  </td>
                  <td style={tdStyle}>{issue.category}</td>
                  <td style={{ ...tdStyle, ...codeTextStyle }}>{issue.url}</td>
                  <td style={tdStyle}>{issue.ownerHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function PriorityPill({ priority }: { readonly priority: string }) {
  const riskTone = priority === "p0" || priority === "p1";

  return (
    <span
      style={{
        ...pillStyle,
        background: riskTone ? "#fef2f2" : "#f8fafc",
        color: riskTone ? "#b91c1c" : "#475569",
        textTransform: "uppercase"
      }}
    >
      {priority}
    </span>
  );
}

function StatusPill({ status }: { readonly status: string }) {
  const resolved = status === "resolved";
  const inReview = status === "in_review";

  return (
    <span
      style={{
        ...pillStyle,
        background: resolved ? "#ecfdf5" : inReview ? "#fff7ed" : "#f8fafc",
        color: resolved ? "#047857" : inReview ? "#c2410c" : "#475569"
      }}
    >
      {status}
    </span>
  );
}
