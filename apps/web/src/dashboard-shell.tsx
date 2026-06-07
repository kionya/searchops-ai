import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { productName, type Site } from "@searchops/types";

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

export const appRouteItems = [
  { href: "/sites", label: "Sites", summary: "사이트 운영 현황" },
  { href: "/ops", label: "Ops", summary: "운영 관제 콘솔" },
  { href: "/onboarding", label: "Onboarding", summary: "초기 설정 흐름" },
  { href: "/sites/site_demo_rejuel/connectors", label: "Connectors", summary: "live 동기화 제어" }
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

export function AppWorkspaceFrame({
  actions,
  children,
  description,
  eyebrow = "SearchOps AI",
  title
}: {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly description: string;
  readonly eyebrow?: string;
  readonly title: string;
}) {
  return (
    <main className="searchops-site-shell">
      <aside className="searchops-site-rail" aria-label="SearchOps AI 내비게이션">
        <Link href="/sites" className="searchops-rail-back">
          SearchOps AI
        </Link>
        <div className="searchops-rail-brand">
          <p className="searchops-rail-kicker">deterministic operations</p>
          <h1 className="searchops-rail-title">{productName}</h1>
          <p className="searchops-rail-domain">
            SEO/AEO/GEO 진단, 커넥터, 컴플라이언스, 작업 지시서를 하나의 운영 콘솔로 관리합니다.
          </p>
          <div className="searchops-rail-meta">
            <div className="searchops-rail-meta-item">
              <span className="searchops-rail-meta-label">Mode</span>
              <strong>Draft-safe</strong>
            </div>
            <div className="searchops-rail-meta-item">
              <span className="searchops-rail-meta-label">Rules</span>
              <strong>Deterministic</strong>
            </div>
          </div>
        </div>
        <nav aria-label="앱 섹션" className="searchops-site-nav">
          {appRouteItems.map((item) => (
            <Link className="searchops-site-nav-link" href={item.href} key={item.href}>
              <span style={{ fontWeight: 800 }}>{item.label}</span>
              <span className="searchops-site-nav-summary">{item.summary}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="searchops-site-main">
        <header className="searchops-site-topbar">
          <div>
            <p className="searchops-site-eyebrow">{eyebrow}</p>
            <h2 className="searchops-site-title">{title}</h2>
            <p className="searchops-site-subtitle">{description}</p>
          </div>
          {actions ? <div className="searchops-site-status">{actions}</div> : null}
        </header>
        <div className="searchops-site-content">{children}</div>
      </section>
    </main>
  );
}

export function SiteDashboardFrame({
  children,
  site
}: {
  readonly children: ReactNode;
  readonly site: Site;
}) {
  return (
    <main className="searchops-site-shell">
      <aside className="searchops-site-rail" aria-label="사이트 대시보드 내비게이션">
        <Link href="/sites" className="searchops-rail-back">
          사이트 목록으로
        </Link>
        <div className="searchops-rail-brand">
          <p className="searchops-rail-kicker">SearchOps AI command workspace</p>
          <h1 className="searchops-rail-title">{site.name}</h1>
          <p className="searchops-rail-domain">{site.domain}</p>
          <div className="searchops-rail-meta">
            <div className="searchops-rail-meta-item">
              <span className="searchops-rail-meta-label">Locale</span>
              <strong>
                {site.language}-{site.country}
              </strong>
            </div>
            <div className="searchops-rail-meta-item">
              <span className="searchops-rail-meta-label">Industry</span>
              <strong>{formatIndustryLabel(site.industry)}</strong>
            </div>
          </div>
        </div>
        <nav aria-label="사이트 섹션" className="searchops-site-nav">
          {siteRouteItems.map((item) => (
            <Link
              className="searchops-site-nav-link"
              key={item.segment}
              href={getSiteDashboardPath(site.id, item.segment)}
            >
              <span style={{ fontWeight: 800 }}>{item.label}</span>
              <span className="searchops-site-nav-summary">{item.summary}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="searchops-site-main">
        <header className="searchops-site-topbar">
          <div>
            <p className="searchops-site-eyebrow">사이트 대시보드</p>
            <h2 className="searchops-site-title">{site.name}</h2>
            <p className="searchops-site-subtitle">
              {site.domain} - {site.language}-{site.country} - {formatIndustryLabel(site.industry)}
            </p>
          </div>
          <div className="searchops-site-status" aria-label="사이트 운영 상태">
            <span className="searchops-site-status-pill">Deterministic-first</span>
            <div className="searchops-site-locale">
              <span style={metaLabelStyle}>현재 작업 영역</span>
              <strong>SEO / AEO / GEO / Compliance</strong>
            </div>
          </div>
        </header>
        <div className="searchops-site-content">{children}</div>
      </section>
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
    <header style={sectionHeaderStyle}>
      <p style={eyebrowStyle}>{eyebrow}</p>
      <h2 style={{ fontSize: 27, letterSpacing: 0, lineHeight: 1.1, margin: "4px 0 8px" }}>
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
  background:
    "linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(238, 243, 248, 0.96))",
  color: "#172033",
  fontFamily: dashboardFontStack,
  margin: "0 auto",
  maxWidth: 1180,
  minHeight: "100vh",
  padding: "32px 24px"
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

const sectionHeaderStyle: CSSProperties = {
  marginBottom: 18,
  padding: "2px 0"
};

const metaLabelStyle: CSSProperties = {
  color: "#64748b",
  display: "block",
  fontSize: 12,
  margin: 0
};

const metricCardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)",
  minHeight: 86,
  padding: 14
};

const emptyStateStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  marginTop: 14,
  minHeight: 130,
  padding: 18
};
