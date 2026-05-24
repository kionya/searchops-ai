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
  formatSchemaJsonLdType,
  formatSchemaPriority,
  formatSchemaRecommendationDate,
  getSchemaRecommendationPriorityTone,
  getSchemaRecommendationStatusTone,
  getSchemaRecheckFeedback,
  getSchemaWorkOrderCreateFeedback,
  loadSchemaRecommendationDashboard,
  summarizeSchemaRecommendations,
  type SchemaRecommendationTone
} from "../../../../src/schema-recommendations";
import {
  createSchemaWorkOrderAction,
  recheckSchemaRecommendationAction
} from "./actions";

interface SchemaPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly recheck?: string;
    readonly recommendationId?: string;
    readonly schema?: string;
    readonly workOrderId?: string;
  }>;
}

export default async function SchemaPage({ params, searchParams }: SchemaPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const dashboard = await loadSchemaRecommendationDashboard(siteId);
  const summary = summarizeSchemaRecommendations(dashboard);
  const createFeedback = getSchemaWorkOrderCreateFeedback(
    createSearchParams.schema,
    createSearchParams.workOrderId,
    createSearchParams.recommendationId,
  );
  const recheckFeedback = getSchemaRecheckFeedback(
    createSearchParams.recheck,
    createSearchParams.workOrderId,
    createSearchParams.recommendationId,
  );

  return (
    <section aria-labelledby="schema-recommendation-heading">
      <SectionHeader
        description="Deterministic JSON-LD recommendations generated from crawled page snapshots and converted into executable work orders."
        eyebrow="Schema"
        title="JSON-LD recommendations"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Recommendations" value={String(summary.total)} />
        <MetricCard label="Open" value={String(summary.open)} />
        <MetricCard label="Converted" value={String(summary.converted)} />
        <MetricCard label="Resolved" value={String(summary.resolved)} />
      </div>
      <SchemaWorkOrderPanel createFeedback={createFeedback} recheckFeedback={recheckFeedback} />
      <section aria-label="Schema recommendations" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="schema-recommendation-heading" style={{ fontSize: 18, margin: 0 }}>
              Recommendation queue
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              {summary.totalRequiredFields} required JSON-LD fields are tracked; {summary.highPriority} recommendations are high priority.
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
          <table style={{ ...tableStyle, minWidth: 1080 }}>
            <thead>
              <tr>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Required fields</th>
                <th style={thStyle}>Evidence</th>
                <th style={thStyle}>Work order</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recommendations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, color: "#64748b" }}>
                    No schema recommendations yet.
                  </td>
                </tr>
              ) : (
                dashboard.recommendations.map((recommendation) => {
                  const createAction = createSchemaWorkOrderAction.bind(null, siteId, recommendation.id);
                  const recheckAction = recheckSchemaRecommendationAction.bind(null, siteId, recommendation);

                  return (
                    <tr key={recommendation.id}>
                      <td style={tdStyle}>
                        <strong>{recommendation.pageUrl}</strong>
                        <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                          {recommendation.id}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <strong>{formatSchemaJsonLdType(recommendation.type)}</strong>
                        <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                          {formatSchemaRecommendationDate(recommendation.updatedAt)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <TonePill
                          label={formatSchemaPriority(recommendation.priority)}
                          tone={getSchemaRecommendationPriorityTone(recommendation.priority)}
                        />
                      </td>
                      <td style={tdStyle}>
                        <TonePill
                          label={recommendation.status}
                          tone={getSchemaRecommendationStatusTone(recommendation.status)}
                        />
                      </td>
                      <td style={tdStyle}>
                        <FieldList values={recommendation.requiredFields} />
                      </td>
                      <td style={tdStyle}>
                        <span>{recommendation.reason}</span>
                        <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 5 }}>
                          Observed: {recommendation.evidence.observedTypes.join(", ") || "none"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {recommendation.status === "resolved" || recommendation.status === "dismissed" ? (
                          <span style={{ color: "#64748b" }}>
                            {recommendation.status === "resolved" ? "Resolved" : "No action"}
                          </span>
                        ) : (
                          <span style={actionStackStyle}>
                            {recommendation.status === "open" ? (
                              <form action={createAction}>
                                <button style={createButtonStyle} type="submit">
                                  Create work order
                                </button>
                              </form>
                            ) : null}
                            <form action={recheckAction}>
                              <button style={secondaryButtonStyle} type="submit">
                                Recheck
                              </button>
                            </form>
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
      </section>
      <section aria-label="JSON-LD draft preview" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>JSON-LD draft preview</h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Deterministic drafts are preserved as implementation references for developers and content reviewers.
            </p>
          </div>
        </header>
        <div style={previewGridStyle}>
          {dashboard.recommendations.slice(0, 2).map((recommendation) => (
            <article key={`${recommendation.id}-preview`} style={previewCardStyle}>
              <div style={previewHeaderStyle}>
                <strong>{formatSchemaJsonLdType(recommendation.type)}</strong>
                <TonePill
                  label={formatSchemaPriority(recommendation.priority)}
                  tone={getSchemaRecommendationPriorityTone(recommendation.priority)}
                />
              </div>
              <pre style={jsonPreviewStyle}>
                {JSON.stringify(recommendation.jsonLd, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function SchemaWorkOrderPanel({
  createFeedback,
  recheckFeedback
}: {
  readonly createFeedback: ReturnType<typeof getSchemaWorkOrderCreateFeedback>;
  readonly recheckFeedback: ReturnType<typeof getSchemaRecheckFeedback>;
}) {
  return (
    <section aria-label="Schema work order conversion" style={conversionPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>Convert to work order</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          Open schema recommendations can be converted into deterministic implementation tasks.
        </p>
        {createFeedback ? (
          <p style={{ ...feedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
        {recheckFeedback ? (
          <p style={{ ...feedbackStyle[recheckFeedback.tone], margin: "10px 0 0" }}>
            {recheckFeedback.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function FieldList({ values }: { readonly values: readonly string[] }) {
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {values.map((value) => (
        <span key={value} style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
          {value}
        </span>
      ))}
    </span>
  );
}

function TonePill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: SchemaRecommendationTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const conversionPanelStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
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
  minHeight: 38,
  padding: "9px 12px"
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

const actionStackStyle = {
  alignItems: "start",
  display: "flex",
  flexWrap: "wrap",
  gap: 8
} as const;

const previewGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  padding: 16
} as const;

const previewCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  minWidth: 0,
  padding: 14
} as const;

const previewHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: 8,
  justifyContent: "space-between"
} as const;

const jsonPreviewStyle = {
  ...codeTextStyle,
  background: "#0f172a",
  borderRadius: 8,
  color: "#e2e8f0",
  lineHeight: 1.45,
  margin: "12px 0 0",
  maxHeight: 320,
  overflow: "auto",
  padding: 12,
  whiteSpace: "pre-wrap"
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
