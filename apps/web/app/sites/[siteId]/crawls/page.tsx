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
import { formatStatusLabel } from "../../../../src/korean-labels";
import {
  demoCrawlRunRows,
  formatDateTime,
  formatDuration,
  getCrawlRunTone,
  summarizeCrawlRuns
} from "../../../../src/site-detail-views";

export default function CrawlsPage() {
  const summary = summarizeCrawlRuns(demoCrawlRunRows);

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
      <section aria-label="최근 크롤링 실행" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="crawl-history-heading" style={{ fontSize: 18, margin: 0 }}>
              최근 크롤링 실행
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              최근 상태: {formatStatusLabel(summary.latestStatus)}
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>데모 데이터</span>
        </header>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>실행</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>시작</th>
                <th style={thStyle}>소요 시간</th>
                <th style={thStyle}>페이지</th>
                <th style={thStyle}>URLs</th>
                <th style={thStyle}>이슈</th>
                <th style={thStyle}>실패 사유</th>
              </tr>
            </thead>
            <tbody>
              {demoCrawlRunRows.map((crawlRun) => (
                <tr key={crawlRun.id}>
                  <td style={tdStyle}>
                    <strong>{crawlRun.label}</strong>
                    <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                      {crawlRun.id}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <StatusPill label={formatStatusLabel(crawlRun.status)} tone={getCrawlRunTone(crawlRun.status)} />
                  </td>
                  <td style={tdStyle}>{formatDateTime(crawlRun.startedAt)}</td>
                  <td style={tdStyle}>{formatDuration(crawlRun.durationSeconds)}</td>
                  <td style={tdStyle}>{crawlRun.pagesCrawled}</td>
                  <td style={tdStyle}>{crawlRun.urlsDiscovered}</td>
                  <td style={tdStyle}>{crawlRun.issuesFound}</td>
                  <td style={{ ...tdStyle, color: crawlRun.failureReason ? "#b91c1c" : "#64748b" }}>
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
    queued: { background: "#f8fafc", color: "#475569" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}
