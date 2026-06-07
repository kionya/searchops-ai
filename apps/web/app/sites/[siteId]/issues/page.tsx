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
import { formatCategoryLabel, formatOwnerLabel, formatStatusLabel } from "../../../../src/korean-labels";
import {
  loadSiteIssueDashboard,
  summarizeIssues
} from "../../../../src/site-detail-views";

interface IssuesPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function IssuesPage({ params }: IssuesPageProps) {
  const { siteId } = await params;
  const site = resolveDashboardSite(siteId);
  const issueList = await loadSiteIssueDashboard(site);
  const issueListRows = issueList.rows;
  const summary = summarizeIssues(issueListRows);

  return (
    <section aria-labelledby="seo-issue-list-heading">
      <SectionHeader
        description="규칙 기반 SEO 이슈를 우선순위, 심각도, 카테고리, 상태, 담당 유형별로 확인합니다."
        eyebrow="SEO 이슈"
        title="SEO 이슈 목록"
      />
      <div style={metricGridStyle}>
        <MetricCard label="총 이슈" value={String(summary.total)} />
        <MetricCard label="열림" value={String(summary.open)} />
        <MetricCard label="P0/P1" value={String(summary.critical)} />
        <MetricCard label="해결됨" value={String(summary.resolved)} />
      </div>
      <section aria-label="감지된 SEO 이슈" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="seo-issue-list-heading" style={{ fontSize: 18, margin: 0 }}>
              감지된 이슈
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              이슈 {summary.inReview}개가 결정론적 재검수를 기다리고 있습니다.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>{site.domain}</span>
        </header>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>이슈</th>
                <th style={thStyle}>우선순위</th>
                <th style={thStyle}>심각도</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>카테고리</th>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>담당</th>
              </tr>
            </thead>
            <tbody>
              {issueListRows.map((issue) => (
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
                  <td style={tdStyle}>{formatStatusLabel(issue.severity)}</td>
                  <td style={tdStyle}>
                    <StatusPill status={issue.status} />
                  </td>
                  <td style={tdStyle}>{formatCategoryLabel(issue.category)}</td>
                  <td style={{ ...tdStyle, ...codeTextStyle }}>{issue.url}</td>
                  <td style={tdStyle}>{formatOwnerLabel(issue.ownerHint)}</td>
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
