import Link from "next/link";

import { AccountBar } from "../app/account-bar";
import React, { Suspense, type CSSProperties, type ReactNode } from "react";

import { productName, SiteSchema, type Site } from "@searchops/types";

import { apiFetchAsUser } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import { formatIndustryLabel } from "./korean-labels";
import {
  ProviderAccountClientError,
  getCurrentProviderUser,
  type ProviderUserContext,
} from "./provider-accounts";
import { getSiteSnapshot, isDirectDatabaseMode } from "./site-database";
import { resolveSiteFromRegistrationId } from "./site-registry";
import { demoSite } from "./work-order-board";

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
  { href: "/ops/integrations", label: "Integrations", summary: "Provider 계정과 사이트 연결" },
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
  if (siteId === demoSite.id) {
    return demoSite;
  }

  return resolveSiteFromRegistrationId(siteId) ?? { ...demoSite, id: siteId, name: siteId };
}

export async function loadDashboardSite(siteId: string): Promise<Site> {
  const context = await getCurrentProviderUser();
  const site = await loadDashboardSiteAsUser(context, siteId);
  if (site !== null) {
    return site;
  }
  // 실데이터 경로(직접 DB 또는 API)가 살아 있는데 null 이면 없는 사이트이거나 남의
  // 사이트다 — fixture 로 덮으면 그 사실이 숨는다.
  if (isDirectDatabaseMode() || getApiBaseUrl() !== null) {
    throw new ProviderAccountClientError("request_failed");
  }
  // 실데이터 경로가 아예 없을 때만 fixture 폴백이다(레이아웃과 같은 이유).
  return resolveDashboardSite(siteId);
}

export async function loadDashboardSiteAsUser(
  context: ProviderUserContext,
  siteId: string,
): Promise<Site | null> {
  // 직접 DB 모드에서는 API 없이 사이트를 읽는다. 조직 대조는 조회 안에서 이뤄지므로
  // 남의 사이트는 여기서도 null 이고, 호출자는 그걸 404 로 바꾼다.
  if (isDirectDatabaseMode()) {
    const snapshot = await getSiteSnapshot(siteId);
    return snapshot?.site ?? null;
  }

  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return null;
  }

  try {
    const response = await apiFetchAsUser(
      `${apiBaseUrl}/sites/${encodeURIComponent(siteId)}`,
      context.accessToken,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return null;
    }

    const site = SiteSchema.parse(await response.json());
    return site.organizationId === context.organizationId ? site : null;
  } catch {
    return null;
  }
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
              <span className="searchops-site-nav-label">{item.label}</span>
              <span className="searchops-site-nav-summary">{item.summary}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="searchops-site-main">
        <Suspense fallback={<div className="searchops-account-bar" />}>
          <AccountBar />
        </Suspense>
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
  demo = false,
  site
}: {
  readonly children: ReactNode;
  // API 가 없어 fixture 로 그리는 중이라는 뜻. 색만으로 알리지 않고 문구를 함께 낸다.
  readonly demo?: boolean;
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
              <span className="searchops-site-nav-label">{item.label}</span>
              <span className="searchops-site-nav-summary">{item.summary}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="searchops-site-main">
        <Suspense fallback={<div className="searchops-account-bar" />}>
          <AccountBar />
        </Suspense>
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
        {demo ? <DemoDataBanner /> : null}
        <div className="searchops-site-content">{children}</div>
      </section>
    </main>
  );
}

// API 미배포 상태에서 이 화면 전체가 fixture 라는 사실을 숨기면 데모가 실적처럼 읽힌다.
// 색만으로는 알 수 없으므로 기호와 문구를 함께 낸다.
function DemoDataBanner() {
  return (
    <div
      role="status"
      style={{
        alignItems: "baseline",
        background: "var(--so-warn-soft)",
        border: "1px solid var(--so-warn)",
        borderRadius: 8,
        color: "var(--so-warn)",
        display: "flex",
        fontSize: 14,
        gap: 8,
        lineHeight: 1.5,
        margin: "16px 24px 0",
        padding: "10px 14px"
      }}
    >
      <span aria-hidden="true">⚠</span>
      <span>
        <strong>데모 데이터</strong>: SearchOps API가 배포되어 있지 않아 이 사이트 화면은 전부
        고정 예시로 그려집니다. 실제 크롤 결과는 연동된 콘솔에서 확인하세요.
      </span>
    </div>
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
      <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, margin: "4px 0 6px" }}>
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
      <strong style={{ display: "block", fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{value}</strong>
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
  margin: "0 auto",
  maxWidth: 1180,
  minHeight: "100vh",
  padding: "28px 24px"
};

export const mutedTextStyle: CSSProperties = {
  color: "var(--so-muted)",
  margin: 0
};

export const eyebrowStyle: CSSProperties = {
  color: "var(--so-muted)",
  fontSize: 14,
  fontWeight: 600,
  margin: 0
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
  color: "var(--so-muted)",
  display: "block",
  fontSize: 13,
  margin: 0
};

const metricCardStyle: CSSProperties = {
  background: "var(--so-paper)",
  border: "1px solid var(--so-line)",
  borderRadius: 8,
  padding: 14
};

const emptyStateStyle: CSSProperties = {
  background: "var(--so-paper)",
  border: "1px solid var(--so-line)",
  borderRadius: 8,
  marginTop: 14,
  padding: 18
};
