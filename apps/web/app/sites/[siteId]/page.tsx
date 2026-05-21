import Link from "next/link";

import {
  getSiteDashboardPath,
  MetricCard,
  metricGridStyle,
  SectionHeader
} from "../../../src/dashboard-shell";
import { demoSite, demoWorkOrders, summarizeWorkOrders } from "../../../src/work-order-board";

interface SiteOverviewPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteOverviewPage({ params }: SiteOverviewPageProps) {
  const { siteId } = await params;
  const summary = summarizeWorkOrders(demoWorkOrders);

  return (
    <section aria-labelledby="site-overview-heading">
      <SectionHeader
        description="Decision summary for crawl health, open issues, work orders, and recheck progress."
        eyebrow="Overview"
        title="Site status summary"
      />
      <div style={metricGridStyle}>
        <MetricCard label="Crawl success rate" value="0%" />
        <MetricCard label="Indexable URL ratio" value="0%" />
        <MetricCard label="Critical issue count" value={String(summary.urgent)} />
        <MetricCard label="Work order completion" value={`${summary.total - summary.active}/${summary.total}`} />
        <MetricCard label="Resolved issue rate" value="0%" />
        <MetricCard label="AI mention rate" value="0%" />
      </div>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 16, padding: 18 }}>
        <h3 id="site-overview-heading" style={{ fontSize: 18, margin: "0 0 8px" }}>
          Next actions
        </h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <ActionLink href={getSiteDashboardPath(siteId, "issues")} label="Review SEO issues" />
          <ActionLink href={getSiteDashboardPath(siteId, "workorders")} label="Open work board" />
          <ActionLink href={getSiteDashboardPath(siteId, "crawls")} label="Check crawl history" />
        </div>
      </section>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 14 }}>
        Demo source: {demoSite.domain}
      </p>
    </section>
  );
}

function ActionLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Link
      href={href}
      style={{
        border: "1px solid #dbe4ef",
        borderRadius: 8,
        color: "#172033",
        fontWeight: 700,
        minHeight: 42,
        padding: "11px 12px",
        textDecoration: "none"
      }}
    >
      {label}
    </Link>
  );
}
