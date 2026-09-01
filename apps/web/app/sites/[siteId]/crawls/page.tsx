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
import { formatStatusLabel } from "../../../../src/korean-labels";
import {
  formatDateTime,
  formatDuration,
  getCrawlRunTone,
  loadSiteCrawlRunDashboard,
  summarizeCrawlRuns
} from "../../../../src/site-detail-views";

interface CrawlsPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function CrawlsPage({ params }: CrawlsPageProps) {
  const { siteId } = await params;
  const site = await loadDashboardSite(siteId);
  const crawlRunDashboard = await loadSiteCrawlRunDashboard(site);
  const crawlRunRows = crawlRunDashboard.rows;
  const summary = summarizeCrawlRuns(crawlRunRows);

  return (
    <section aria-labelledby="crawl-history-heading">
      <SectionHeader
        description="실행 상태, 페이지 수, 실패 사유, 최근 결정론적 재검수 시도를 확인합니다."
        eyebrow="크롤링 실행"
        title="크롤링 이력"
      />
      <div style={metricGridStyle}>
        <MetricCard label="총 실행" value={String(summary.total)} />
        <MetricCard label="완료" value={String(summary.completed)} />
        <MetricCard label="실패" value={String(summary.failed)} />
        <MetricCard label="크롤링 페이지" value={String(summary.pagesCrawled)} />
      </div>
      <section aria-label="최근 크롤링 실행" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 id="crawl-history-heading" style={{ fontSize: 18, margin: 0 }}>
              최근 크롤링 실행
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              최근 상태: {formatStatusLabel(summary.latestStatus)}
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>{site.domain}</span>
        </header>
        <div className="searchops-table-scroll">
          <table className="searchops-table">
            <thead>
              <tr>
                <th>실행</th>
                <th>상태</th>
                <th>시작</th>
                <th>소요 시간</th>
                <th>페이지</th>
                <th>URLs</th>
                <th>이슈</th>
                <th>실패 사유</th>
              </tr>
            </thead>
            <tbody>
              {crawlRunRows.map((crawlRun) => (
                <tr key={crawlRun.id}>
                  <td>
                    <strong>{crawlRun.label}</strong>
                    <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 3 }}>
                      {crawlRun.id}
                    </span>
                  </td>
                  <td>
                    <StatusPill label={formatStatusLabel(crawlRun.status)} tone={getCrawlRunTone(crawlRun.status)} />
                  </td>
                  <td>{formatDateTime(crawlRun.startedAt)}</td>
                  <td>{formatDuration(crawlRun.durationSeconds)}</td>
                  <td>{crawlRun.pagesCrawled}</td>
                  <td>{crawlRun.urlsDiscovered}</td>
                  <td>{crawlRun.issuesFound}</td>
                  <td style={{ color: crawlRun.failureReason ? "#b91c1c" : "var(--so-muted)" }}>
                    {crawlRun.failureReason ?? "없음"}
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

function StatusPill({ label, tone }: { readonly label: string; readonly tone: "complete" | "failed" | "queued" }) {
  const toneStyle = {
    complete: { background: "#ecfdf5", color: "#047857" },
    failed: { background: "#fef2f2", color: "#b91c1c" },
    queued: { background: "#f8fafc", color: "var(--so-muted)" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}
