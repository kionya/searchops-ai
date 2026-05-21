import Link from "next/link";
import type { CSSProperties } from "react";

import {
  getSiteDashboardPath,
  metricGridStyle,
  SectionHeader
} from "../../../src/dashboard-shell";
import {
  calculateSiteOverviewKpis,
  demoSiteOverviewInput,
  summarizeSiteOverview,
  type SiteOverviewKpis
} from "../../../src/site-overview-kpis";

interface SiteOverviewPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteOverviewPage({ params }: SiteOverviewPageProps) {
  const { siteId } = await params;
  const kpis = calculateSiteOverviewKpis(demoSiteOverviewInput);
  const summary = summarizeSiteOverview(demoSiteOverviewInput);

  return (
    <section aria-labelledby="site-overview-heading">
      <SectionHeader
        description="Decision summary for crawl health, indexability, open issues, work orders, rechecks, and AI visibility placeholders."
        eyebrow="Overview"
        title="Site status summary"
      />
      <div style={metricGridStyle}>
        {kpiCards(kpis).map((card) => (
          <OverviewKpiCard
            detail={card.detail}
            key={card.label}
            label={card.label}
            tone={card.tone}
            value={card.value}
          />
        ))}
      </div>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 16, padding: 18 }}>
        <h3 id="site-overview-heading" style={{ fontSize: 18, margin: "0 0 8px" }}>
          Next actions
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px" }}>
          {summary.activeWorkOrders} active work orders, {summary.openIssues} open issues, and{" "}
          {summary.rechecksInReview} recheck in review.
        </p>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
          }}
        >
          <ActionLink href={getSiteDashboardPath(siteId, "issues")} label="Review SEO issues" />
          <ActionLink href={getSiteDashboardPath(siteId, "workorders")} label="Open work board" />
          <ActionLink href={getSiteDashboardPath(siteId, "crawls")} label="Check crawl history" />
        </div>
      </section>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 14 }}>
        KPI values use deterministic dashboard fixtures until live API fetching is wired.
      </p>
    </section>
  );
}

function kpiCards(kpis: SiteOverviewKpis) {
  return [
    {
      label: "Crawl success rate",
      value: kpis.crawlSuccessRate,
      detail: "Completed crawl runs across recent attempts.",
      tone: "positive"
    },
    {
      label: "Indexable URL ratio",
      value: kpis.indexableUrlRatio,
      detail: "URLs currently eligible for indexing.",
      tone: "positive"
    },
    {
      label: "Critical issue count",
      value: kpis.criticalIssueCount,
      detail: "Open P0/P1 issues that need attention.",
      tone: "risk"
    },
    {
      label: "Work order completion",
      value: kpis.workOrderCompletionRate,
      detail: "Closed work orders out of all generated tasks.",
      tone: "neutral"
    },
    {
      label: "Resolved issue rate",
      value: kpis.resolvedIssueRate,
      detail: "Issues verified as resolved after recheck.",
      tone: "neutral"
    },
    {
      label: "Non-brand query coverage",
      value: kpis.nonBrandQueryCoverage,
      detail: "Placeholder until AEO/GEO query coverage lands.",
      tone: "placeholder"
    },
    {
      label: "AI mention rate",
      value: kpis.aiMentionRate,
      detail: "Placeholder for AI answer brand mentions.",
      tone: "placeholder"
    },
    {
      label: "AI citation rate",
      value: kpis.aiCitationRate,
      detail: "Placeholder for AI answer URL citations.",
      tone: "placeholder"
    }
  ] as const;
}

function OverviewKpiCard({
  detail,
  label,
  tone,
  value
}: {
  readonly detail: string;
  readonly label: string;
  readonly tone: "neutral" | "placeholder" | "positive" | "risk";
  readonly value: string;
}) {
  return (
    <article style={{ ...kpiCardStyle, borderTopColor: toneColors[tone] }}>
      <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>{label}</p>
      <strong style={{ display: "block", fontSize: 28, lineHeight: 1, marginTop: 8 }}>{value}</strong>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.4, margin: "10px 0 0" }}>{detail}</p>
    </article>
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

const kpiCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  borderTop: "4px solid #94a3b8",
  minHeight: 132,
  padding: 14
};

const toneColors = {
  neutral: "#64748b",
  placeholder: "#7c3aed",
  positive: "#059669",
  risk: "#dc2626"
} as const;
