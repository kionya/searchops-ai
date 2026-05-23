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
  formatContentBriefDate,
  formatContentBriefIntent,
  getContentBriefStatusTone,
  loadContentBriefHistory,
  summarizeContentBriefHistory,
  type ContentBriefStatusTone
} from "../../../../src/content-brief-history";

interface ContentPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function ContentPage({ params }: ContentPageProps) {
  const { siteId } = await params;
  const history = await loadContentBriefHistory(siteId);
  const summary = summarizeContentBriefHistory(history);

  return (
    <section aria-labelledby="content-brief-history-heading">
      <SectionHeader
        description="Deterministic draft-only content briefs generated from Keyword/AEO signals and persisted for human review."
        eyebrow="Content Briefs"
        title="Content brief history"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Briefs" value={String(summary.total)} />
        <MetricCard label="Drafts" value={String(summary.draft)} />
        <MetricCard label="FAQ questions" value={String(summary.totalFaqQuestions)} />
        <MetricCard label="Archived" value={String(summary.archived)} />
      </div>
      <section aria-label="Content brief records" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="content-brief-history-heading" style={{ fontSize: 18, margin: 0 }}>
              Recent content briefs
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Latest created: {formatContentBriefDate(summary.latestCreatedAt)}. All generated briefs stay draft-only.
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
          <table style={{ ...tableStyle, minWidth: 940 }}>
            <thead>
              <tr>
                <th style={thStyle}>Brief</th>
                <th style={thStyle}>Keyword</th>
                <th style={thStyle}>Intent</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Output</th>
              </tr>
            </thead>
            <tbody>
              {history.briefs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, color: "#64748b" }}>
                    No content briefs yet.
                  </td>
                </tr>
              ) : (
                history.briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td style={tdStyle}>
                      <strong>{brief.title}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {brief.id}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <strong>{brief.primaryKeyword}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {brief.locale}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatContentBriefIntent(brief.intent)}</td>
                    <td style={tdStyle}>
                      <StatusPill label={brief.status} tone={getContentBriefStatusTone(brief.status)} />
                    </td>
                    <td style={tdStyle}>{formatContentBriefDate(brief.createdAt)}</td>
                    <td style={tdStyle}>
                      {brief.outline?.length ?? 0} sections, {brief.faqQuestions.length} FAQs
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {brief.generationMode}; {brief.publishPolicy}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function StatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ContentBriefStatusTone;
}) {
  const toneStyle = {
    archived: { background: "#f8fafc", color: "#475569" },
    draft: { background: "#ecfdf5", color: "#047857" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}
