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
  getContentBriefCreateFeedback,
  getContentBriefStatusTone,
  loadContentBriefHistory,
  summarizeContentBriefHistory,
  type ContentBriefStatusTone
} from "../../../../src/content-brief-history";
import {
  formatAeoCheckId,
  formatAeoReadinessStatus,
  getAeoCheckTone,
  getAeoReadinessTone,
  getWeakAeoChecks,
  loadKeywordAeoDashboard,
  summarizeKeywordAeoDashboard,
  type AeoReadinessTone,
  type KeywordAeoDashboardData
} from "../../../../src/keyword-aeo-dashboard";
import { createContentBriefAction } from "./actions";

interface ContentPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly brief?: string;
    readonly briefId?: string;
    readonly keyword?: string;
  }>;
}

export default async function ContentPage({ params, searchParams }: ContentPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const [history, keywordAeoDashboard] = await Promise.all([
    loadContentBriefHistory(siteId),
    loadKeywordAeoDashboard(siteId)
  ]);
  const summary = summarizeContentBriefHistory(history);
  const keywordAeoSummary = summarizeKeywordAeoDashboard(keywordAeoDashboard);
  const createFeedback = getContentBriefCreateFeedback(
    createSearchParams.brief,
    createSearchParams.briefId,
    createSearchParams.keyword,
  );

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
      <KeywordAeoReadinessPanel
        dashboard={keywordAeoDashboard}
        summary={keywordAeoSummary}
      />
      <ContentBriefCreatePanel siteId={siteId} createFeedback={createFeedback} />
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

function KeywordAeoReadinessPanel({
  dashboard,
  summary
}: {
  readonly dashboard: KeywordAeoDashboardData;
  readonly summary: ReturnType<typeof summarizeKeywordAeoDashboard>;
}) {
  return (
    <section aria-label="Keyword AEO readiness" style={tableSectionStyle}>
      <header style={tableHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>Keyword/AEO readiness</h3>
          <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
            Deterministic readiness snapshot for target keywords, answer blocks, FAQ schema, citations, and content depth.
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
      <div style={keywordAeoMetricStyle}>
        <MetricCard label="Keywords" value={String(summary.total)} />
        <MetricCard label="Ready" value={String(summary.ready)} />
        <MetricCard label="Needs work" value={String(summary.needsWork + summary.notReady)} />
        <MetricCard label="Avg score" value={summary.averageScore} />
        <MetricCard label="Discovered" value={String(dashboard.keywordDiscoveries.length)} />
      </div>
      <div style={tableScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={thStyle}>Keyword</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Candidate page</th>
              <th style={thStyle}>Weak checks</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.reports.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: "#64748b" }}>
                  No Keyword/AEO readiness reports yet.
                </td>
              </tr>
            ) : (
              dashboard.reports.map((report) => {
                const weakChecks = getWeakAeoChecks(report);

                return (
                  <tr key={`${report.keyword.phrase}-${report.evaluatedAt}-${report.pageUrl ?? "none"}`}>
                    <td style={tdStyle}>
                      <strong>{report.keyword.phrase}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {report.keyword.locale}; {report.keyword.intent}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <TonePill
                        label={formatAeoReadinessStatus(report.status)}
                        tone={getAeoReadinessTone(report.status)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <strong>{report.score}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        deterministic
                      </span>
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>
                      {report.pageUrl ?? "No candidate page"}
                    </td>
                    <td style={tdStyle}>
                      {weakChecks.length === 0 ? (
                        <TonePill label="No weak checks" tone="good" />
                      ) : (
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {weakChecks.slice(0, 3).map((check) => (
                            <TonePill
                              key={`${report.keyword.phrase}-${check.checkId}`}
                              label={formatAeoCheckId(check.checkId)}
                              tone={getAeoCheckTone(check.status)}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div style={{ ...tableScrollStyle, marginTop: 12 }}>
        <table style={{ ...tableStyle, minWidth: 940 }}>
          <thead>
            <tr>
              <th style={thStyle}>Discovered keyword</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Candidate page</th>
              <th style={thStyle}>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.keywordDiscoveries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: "#64748b" }}>
                  No keyword discovery candidates yet.
                </td>
              </tr>
            ) : (
              dashboard.keywordDiscoveries.slice(0, 8).map((candidate) => (
                <tr key={candidate.id}>
                  <td style={tdStyle}>
                    <strong>{candidate.phrase}</strong>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                      {candidate.locale}; {candidate.intent ?? "unclassified"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
                      {candidate.source}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <strong>{candidate.score}</strong>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                      {candidate.generatedBy}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, ...codeTextStyle }}>
                    {candidate.pageUrl ?? "No candidate page"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13 }}>
                      {candidate.evidence.sourceField}; {candidate.evidence.impressions ?? candidate.evidence.title ?? "record"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContentBriefCreatePanel({
  siteId,
  createFeedback
}: {
  readonly siteId: string;
  readonly createFeedback: ReturnType<typeof getContentBriefCreateFeedback>;
}) {
  const action = createContentBriefAction.bind(null, siteId);

  return (
    <section aria-label="Create content brief" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>Create draft brief</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          Submit keyword and optional page signals to create a deterministic draft-only brief.
        </p>
        {createFeedback ? (
          <p style={{ ...createFeedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
      </div>
      <form action={action} style={createFormStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Primary keyword</span>
          <input
            name="phrase"
            placeholder="seo clinic price comparison"
            required
            style={inputStyle}
            type="text"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Intent</span>
          <select defaultValue="commercial" name="intent" style={inputStyle}>
            <option value="informational">Informational</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="navigational">Navigational</option>
            <option value="local">Local</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Candidate URL</span>
          <input
            name="candidateUrl"
            placeholder="https://example-clinic.com/service/seo"
            style={inputStyle}
            type="url"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Page title</span>
          <input name="pageTitle" placeholder="SEO clinic service" style={inputStyle} type="text" />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>Page summary</span>
          <textarea
            name="metaDescription"
            placeholder="Short page description used as an AEO signal."
            rows={2}
            style={textareaStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>H1</span>
          <input name="h1" placeholder="SEO clinic" style={inputStyle} type="text" />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Word count</span>
          <input min={0} name="wordCount" placeholder="320" style={inputStyle} type="number" />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Schema types</span>
          <input name="schemaTypes" placeholder="FAQPage, LocalBusiness" style={inputStyle} type="text" />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>Question headings</span>
          <textarea
            name="questionHeadings"
            placeholder={"What does SEO clinic include?\nHow much does SEO clinic cost?"}
            rows={3}
            style={textareaStyle}
          />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>H2 headings</span>
          <textarea
            name="h2"
            placeholder={"What does SEO clinic include?\nPricing and review workflow"}
            rows={3}
            style={textareaStyle}
          />
        </label>
        <div style={submitRowStyle}>
          <span style={{ ...mutedTextStyle, fontSize: 12 }}>
            Generated briefs stay draft-only until human review.
          </span>
          <button style={submitButtonStyle} type="submit">
            Create draft
          </button>
        </div>
      </form>
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

function TonePill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: AeoReadinessTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const createPanelStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const keywordAeoMetricStyle = {
  ...metricGridStyle,
  padding: 16
} as const;

const createFormStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
} as const;

const fieldStyle = {
  display: "grid",
  gap: 6
} as const;

const wideFieldStyle = {
  ...fieldStyle,
  gridColumn: "1 / -1"
} as const;

const labelStyle = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 700
} as const;

const inputStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#172033",
  fontFamily: "inherit",
  fontSize: 14,
  minHeight: 38,
  padding: "8px 10px"
} as const;

const textareaStyle = {
  ...inputStyle,
  lineHeight: 1.4,
  resize: "vertical"
} as const;

const submitRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: 12,
  gridColumn: "1 / -1",
  justifyContent: "space-between"
} as const;

const submitButtonStyle = {
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

const createFeedbackStyle = {
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
