import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  loadDashboardSite,
  SectionHeader
} from "../../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle
} from "../../../../src/dashboard-table-styles";
import {
  loadSiteUrlInventoryDashboard,
  summarizeUrlInventory
} from "../../../../src/site-detail-views";

interface UrlsPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function UrlsPage({ params }: UrlsPageProps) {
  const { siteId } = await params;
  const site = await loadDashboardSite(siteId);
  const urlInventory = await loadSiteUrlInventoryDashboard(site);
  const urlInventoryRows = urlInventory.rows;
  const summary = summarizeUrlInventory(urlInventoryRows);

  return (
    <section aria-labelledby="url-inventory-heading">
      <SectionHeader
        description="크롤링된 URL 인벤토리와 색인 가능성, 메타데이터 존재 여부, 연결된 이슈 수를 확인합니다."
        eyebrow="URL 인벤토리"
        title="URL 인벤토리"
      />
      <div style={metricGridStyle}>
        <MetricCard label="확인된 URL" value={String(summary.total)} />
        <MetricCard label="색인 가능" value={String(summary.indexable)} />
        <MetricCard label="색인 제외" value={String(summary.nonIndexable)} />
        <MetricCard label="이슈 있는 URL" value={String(summary.withIssues)} />
      </div>
      <section aria-label="크롤링된 URL" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 id="url-inventory-heading" style={{ fontSize: 18, margin: 0 }}>
              크롤링된 URL
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              현재 색인 가능한 URL 중 {summary.healthy}개는 열린 URL 단위 이슈가 없습니다.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>{site.domain}</span>
        </header>
        <div className="searchops-table-scroll">
          <table className="searchops-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>HTTP</th>
                <th>색인 상태</th>
                <th>title</th>
                <th>meta description</th>
                <th>이슈</th>
                <th>주요 신호</th>
              </tr>
            </thead>
            <tbody>
              {urlInventoryRows.map((urlRecord) => (
                <tr key={urlRecord.id}>
                  <td>
                    <strong>{urlRecord.path}</strong>
                    <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 3 }}>
                      {urlRecord.url}
                    </span>
                  </td>
                  <td>{urlRecord.statusCode}</td>
                  <td>
                    <IndexabilityPill indexable={urlRecord.indexable} />
                    <span style={{ color: "var(--so-muted)", display: "block", fontSize: 13, marginTop: 5 }}>
                      {urlRecord.indexabilityReason}
                    </span>
                  </td>
                  <td style={{ color: urlRecord.title ? "var(--so-ink)" : "#b91c1c" }}>
                    {urlRecord.title ?? "누락"}
                  </td>
                  <td style={{ color: urlRecord.metaDescription ? "var(--so-ink)" : "#b91c1c" }}>
                    {urlRecord.metaDescription ?? "누락"}
                  </td>
                  <td>{urlRecord.issueCount}</td>
                  <td>{urlRecord.primarySignal}</td>
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
      {indexable ? "색인 가능" : "noindex"}
    </span>
  );
}
