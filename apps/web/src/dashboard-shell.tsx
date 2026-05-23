import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import type { Site } from "@searchops/types";

import { demoSite } from "./work-order-board";

export const dashboardFontStack =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

export const siteRouteItems = [
  { segment: "", label: "Overview", summary: "Site status summary" },
  { segment: "crawls", label: "Crawls", summary: "Crawl run history" },
  { segment: "urls", label: "URLs", summary: "URL inventory" },
  { segment: "issues", label: "Issues", summary: "SEO issue list" },
  { segment: "schema", label: "Schema", summary: "JSON-LD recommendations" },
  { segment: "workorders", label: "Work orders", summary: "Execution board" },
  { segment: "connectors", label: "Connectors", summary: "Sync history" },
  { segment: "content", label: "Content", summary: "Content briefs" },
  { segment: "geo", label: "GEO", summary: "AI visibility report" },
  { segment: "compliance", label: "Compliance", summary: "Medical ad risk flags" }
] as const;

export type SiteRouteSegment = (typeof siteRouteItems)[number]["segment"];

export interface PlaceholderMetric {
  readonly label: string;
  readonly value: string;
}

export interface PlaceholderPageContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly metrics: readonly PlaceholderMetric[];
  readonly emptyTitle: string;
}

export const dashboardPlaceholders: Record<
  Exclude<SiteRouteSegment, "" | "connectors" | "content" | "schema" | "workorders">,
  PlaceholderPageContent
> = {
  crawls: {
    eyebrow: "Crawl Runs",
    title: "Crawl history",
    description: "Run status, page counts, failures, and recheck timing.",
    metrics: [
      { label: "Latest run", value: "Queued" },
      { label: "Success rate", value: "0%" },
      { label: "Pages crawled", value: "0" }
    ],
    emptyTitle: "No crawl rows"
  },
  urls: {
    eyebrow: "URL Inventory",
    title: "URL inventory",
    description: "Crawled URLs, indexability, canonical state, and content signals.",
    metrics: [
      { label: "Known URLs", value: "0" },
      { label: "Indexable", value: "0%" },
      { label: "Canonical issues", value: "0" }
    ],
    emptyTitle: "No URL rows"
  },
  issues: {
    eyebrow: "SEO Issues",
    title: "SEO issue list",
    description: "Rule-based issues grouped by severity, category, and status.",
    metrics: [
      { label: "Critical", value: "0" },
      { label: "Open", value: "0" },
      { label: "Resolved", value: "0" }
    ],
    emptyTitle: "No issue rows"
  },
  geo: {
    eyebrow: "GEO Monitor",
    title: "AI visibility report",
    description: "AI mention, citation, and non-brand query coverage.",
    metrics: [
      { label: "Mention rate", value: "0%" },
      { label: "Citation rate", value: "0%" },
      { label: "Query coverage", value: "0%" }
    ],
    emptyTitle: "No GEO rows"
  },
  compliance: {
    eyebrow: "Compliance",
    title: "Medical ad risk flags",
    description: "Medical advertising risk flags by URL, claim, and status.",
    metrics: [
      { label: "Open flags", value: "0" },
      { label: "Legal review", value: "0" },
      { label: "Cleared", value: "0" }
    ],
    emptyTitle: "No compliance flags"
  }
};

export function getSiteDashboardPath(siteId: string, segment: SiteRouteSegment) {
  return segment === "" ? `/sites/${siteId}` : `/sites/${siteId}/${segment}`;
}

export function resolveDashboardSite(siteId: string): Site {
  return siteId === demoSite.id ? demoSite : { ...demoSite, id: siteId, name: siteId };
}

export function SiteDashboardFrame({
  children,
  site
}: {
  readonly children: ReactNode;
  readonly site: Site;
}) {
  return (
    <main style={pageStyle}>
      <Link href="/sites" style={backLinkStyle}>
        Back to sites
      </Link>
      <header style={siteHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>Site dashboard</p>
          <h1 style={pageTitleStyle}>{site.name}</h1>
          <p style={mutedTextStyle}>
            {site.domain} - {site.language}-{site.country} - {site.industry}
          </p>
        </div>
        <div aria-label="Site locale" style={headerMetaStyle}>
          <span style={metaLabelStyle}>Locale</span>
          <strong>
            {site.language}-{site.country}
          </strong>
        </div>
      </header>
      <nav aria-label="Site sections" style={siteNavStyle}>
        {siteRouteItems.map((item) => (
          <Link key={item.segment} href={getSiteDashboardPath(site.id, item.segment)} style={navLinkStyle}>
            <span style={{ fontWeight: 700 }}>{item.label}</span>
            <span style={{ color: "#64748b", fontSize: 12 }}>{item.summary}</span>
          </Link>
        ))}
      </nav>
      <div style={{ marginTop: 28 }}>{children}</div>
    </main>
  );
}

export function SectionHeader({
  description,
  eyebrow,
  title
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle}>{eyebrow}</p>
      <h2 style={{ fontSize: 26, letterSpacing: 0, lineHeight: 1.12, margin: "4px 0 8px" }}>
        {title}
      </h2>
      <p style={{ ...mutedTextStyle, maxWidth: 720 }}>{description}</p>
    </header>
  );
}

export function MetricCard({ label, value }: PlaceholderMetric) {
  return (
    <article style={metricCardStyle}>
      <p style={metaLabelStyle}>{label}</p>
      <strong style={{ display: "block", fontSize: 26, lineHeight: 1, marginTop: 8 }}>{value}</strong>
    </article>
  );
}

export function PlaceholderPage({ content }: { readonly content: PlaceholderPageContent }) {
  return (
    <section aria-labelledby={`${content.title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <SectionHeader
        description={content.description}
        eyebrow={content.eyebrow}
        title={content.title}
      />
      <div style={metricGridStyle}>
        {content.metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      <section aria-label={content.emptyTitle} style={emptyStateStyle}>
        <h3 id={`${content.title.toLowerCase().replaceAll(" ", "-")}-heading`} style={{ margin: 0 }}>
          {content.emptyTitle}
        </h3>
        <p style={{ ...mutedTextStyle, marginTop: 8 }}>Awaiting deterministic pipeline data.</p>
      </section>
    </section>
  );
}

export const pageStyle: CSSProperties = {
  color: "#172033",
  fontFamily: dashboardFontStack,
  margin: "32px auto",
  maxWidth: 1180,
  padding: 24
};

export const mutedTextStyle: CSSProperties = {
  color: "#64748b",
  margin: 0
};

export const eyebrowStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 0,
  margin: 0,
  textTransform: "uppercase"
};

export const metricGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
};

const backLinkStyle: CSSProperties = {
  color: "#2563eb",
  display: "inline-flex",
  fontSize: 14,
  marginBottom: 18,
  textDecoration: "none"
};

const siteHeaderStyle: CSSProperties = {
  alignItems: "start",
  borderBottom: "1px solid #e5e7eb",
  display: "grid",
  gap: 18,
  gridTemplateColumns: "minmax(0, 1fr) auto",
  paddingBottom: 22
};

const pageTitleStyle: CSSProperties = {
  fontSize: 34,
  letterSpacing: 0,
  lineHeight: 1.1,
  margin: "4px 0 10px"
};

const headerMetaStyle: CSSProperties = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  minWidth: 156,
  padding: 14
};

const metaLabelStyle: CSSProperties = {
  color: "#64748b",
  display: "block",
  fontSize: 12,
  margin: 0
};

const siteNavStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  marginTop: 18
};

const navLinkStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#172033",
  display: "grid",
  gap: 4,
  minHeight: 62,
  padding: 12,
  textDecoration: "none"
};

const metricCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  minHeight: 86,
  padding: 14
};

const emptyStateStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  marginTop: 14,
  minHeight: 130,
  padding: 18
};
