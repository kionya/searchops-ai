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
  const site = await loadDashboardSite(siteId);
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
      <section aria-label="감지된 SEO 이슈" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 id="seo-issue-list-heading" style={{ fontSize: 18, margin: 0 }}>
              감지된 이슈
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              이슈 {summary.inReview}개가 결정론적 재검수를 기다리고 있습니다.
            </p>
          </div>
          <span style={{ ...pillStyle, background: "#eef2ff", color: "#3730a3" }}>{site.domain}</span>
        </header>
        <div className="searchops-table-scroll">
          <table className="searchops-table">
            <thead>
              <tr>
                <th>이슈</th>
                <th>우선순위</th>
                <th>심각도</th>
                <th>상태</th>
                <th>카테고리</th>
                <th>URL</th>
                <th>담당</th>
              </tr>
            </thead>
            <tbody>
              {issueListRows.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <strong>{issue.title}</strong>
                    <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 3 }}>
                      {issue.ruleId}
                    </span>
                  </td>
                  <td>
                    <PriorityPill priority={issue.priority} />
                  </td>
                  <td>{formatStatusLabel(issue.severity)}</td>
                  <td>
                    <StatusPill status={issue.status} />
                  </td>
                  <td>{formatCategoryLabel(issue.category)}</td>
                  <td className="searchops-code">{issue.url}</td>
                  <td>{formatOwnerLabel(issue.ownerHint)}</td>
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
        color: riskTone ? "#b91c1c" : "var(--so-muted)",
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
        color: resolved ? "#047857" : inReview ? "#c2410c" : "var(--so-muted)"
      }}
    >
      {status}
    </span>
  );
}
