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
  demoUrlInventoryRows,
  summarizeUrlInventory
} from "../../../../src/site-detail-views";

export default function UrlsPage() {
  const summary = summarizeUrlInventory(demoUrlInventoryRows);

  return (
    <section aria-labelledby="url-inventory-heading">
      <SectionHeader
        description="Crawled URL inventory with indexability, metadata presence, and linked issue counts."
        eyebrow="URL Inventory"
        title="URL inventory"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Known URLs" value={String(summary.total)} />
        <MetricCard label="Indexable" value={String(summary.indexable)} />
        <MetricCard label="Non-indexable" value={String(summary.nonIndexable)} />
        <MetricCard label="URLs with issues" value={String(summary.withIssues)} />
      </div>
      <section aria-label="Crawled URLs" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="url-inventory-heading" style={{ fontSize: 18, margin: 0 }}>
              Crawled URLs
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              {summary.healthy} indexable URLs currently have no open URL-level issues.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>Fixture data</span>
        </header>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>HTTP</th>
                <th style={thStyle}>Indexability</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Meta description</th>
                <th style={thStyle}>Issues</th>
                <th style={thStyle}>Primary signal</th>
              </tr>
            </thead>
            <tbody>
              {demoUrlInventoryRows.map((urlRecord) => (
                <tr key={urlRecord.id}>
                  <td style={tdStyle}>
                    <strong>{urlRecord.path}</strong>
                    <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                      {urlRecord.url}
                    </span>
                  </td>
                  <td style={tdStyle}>{urlRecord.statusCode}</td>
                  <td style={tdStyle}>
                    <IndexabilityPill indexable={urlRecord.indexable} />
                    <span style={{ color: "#64748b", display: "block", fontSize: 12, marginTop: 5 }}>
                      {urlRecord.indexabilityReason}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: urlRecord.title ? "#172033" : "#b91c1c" }}>
                    {urlRecord.title ?? "Missing"}
                  </td>
                  <td style={{ ...tdStyle, color: urlRecord.metaDescription ? "#172033" : "#b91c1c" }}>
                    {urlRecord.metaDescription ?? "Missing"}
                  </td>
                  <td style={tdStyle}>{urlRecord.issueCount}</td>
                  <td style={tdStyle}>{urlRecord.primarySignal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function IndexabilityPill({ indexable }: { readonly indexable: boolean }) {
  return (
    <span
      style={{
        ...pillStyle,
        background: indexable ? "#ecfdf5" : "#fff7ed",
        color: indexable ? "#047857" : "#c2410c"
      }}
    >
      {indexable ? "Indexable" : "Noindex"}
    </span>
  );
}
