import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import type { Site } from "@searchops/types";

import { formatIndustryLabel } from "./korean-labels";
import { demoSite } from "./work-order-board";

export const dashboardFontStack =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

export const siteRouteItems = [
  { segment: "", label: "개요", summary: "사이트 상태 요약" },
  { segment: "crawls", label: "크롤링", summary: "크롤링 실행 이력" },
  { segment: "urls", label: "URL", summary: "URL 인벤토리" },
  { segment: "issues", label: "SEO 이슈", summary: "SEO 이슈 목록" },
  { segment: "schema", label: "스키마", summary: "JSON-LD 추천" },
  { segment: "workorders", label: "작업 지시서", summary: "실행 보드" },
  { segment: "connectors", label: "커넥터", summary: "동기화 이력" },
  { segment: "content", label: "콘텐츠", summary: "콘텐츠 브리프" },
  { segment: "geo", label: "GEO", summary: "AI 검색 노출 리포트" },
  { segment: "compliance", label: "컴플라이언스", summary: "의료광고 리스크 플래그" }
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
  Exclude<SiteRouteSegment, "" | "connectors" | "content" | "geo" | "schema" | "workorders">,
  PlaceholderPageContent
> = {
  crawls: {
    eyebrow: "크롤링 실행",
    title: "크롤링 이력",
    description: "실행 상태, 페이지 수, 실패 사유, 재검수 시점을 확인합니다.",
    metrics: [
      { label: "최근 실행", value: "대기 중" },
      { label: "성공률", value: "0%" },
      { label: "크롤링 페이지", value: "0" }
    ],
    emptyTitle: "크롤링 행이 없습니다"
  },
  urls: {
    eyebrow: "URL 인벤토리",
    title: "URL 인벤토리",
    description: "크롤링된 URL, 색인 가능성, 캐노니컬 상태, 콘텐츠 신호를 확인합니다.",
    metrics: [
      { label: "확인된 URL", value: "0" },
      { label: "색인 가능", value: "0%" },
      { label: "캐노니컬 이슈", value: "0" }
    ],
    emptyTitle: "URL 행이 없습니다"
  },
  issues: {
    eyebrow: "SEO 이슈",
    title: "SEO 이슈 목록",
    description: "규칙 기반 이슈를 심각도, 카테고리, 상태별로 확인합니다.",
    metrics: [
      { label: "긴급", value: "0" },
      { label: "열림", value: "0" },
      { label: "해결됨", value: "0" }
    ],
    emptyTitle: "이슈 행이 없습니다"
  },
  compliance: {
    eyebrow: "컴플라이언스",
    title: "의료광고 리스크 플래그",
    description: "URL, 표현, 상태별 의료광고 리스크 플래그를 확인합니다.",
    metrics: [
      { label: "열린 플래그", value: "0" },
      { label: "법무 검토", value: "0" },
      { label: "정리됨", value: "0" }
    ],
    emptyTitle: "컴플라이언스 플래그가 없습니다"
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
        사이트 목록으로
      </Link>
      <header style={siteHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>사이트 대시보드</p>
          <h1 style={pageTitleStyle}>{site.name}</h1>
          <p style={mutedTextStyle}>
            {site.domain} - {site.language}-{site.country} - {formatIndustryLabel(site.industry)}
          </p>
        </div>
        <div aria-label="사이트 로캘" style={headerMetaStyle}>
          <span style={metaLabelStyle}>로캘</span>
          <strong>
            {site.language}-{site.country}
          </strong>
        </div>
      </header>
      <nav aria-label="사이트 섹션" style={siteNavStyle}>
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
        <p style={{ ...mutedTextStyle, marginTop: 8 }}>결정론적 파이프라인 데이터가 들어오면 여기에 표시됩니다.</p>
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
