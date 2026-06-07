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
import {
  demoWorkOrders,
  summarizeWorkOrders
} from "../../../src/work-order-board";

interface SiteOverviewPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
}

export default async function SiteOverviewPage({ params }: SiteOverviewPageProps) {
  const { siteId } = await params;
  const kpis = calculateSiteOverviewKpis(demoSiteOverviewInput);
  const summary = summarizeSiteOverview(demoSiteOverviewInput);
  const workOrderSummary = summarizeWorkOrders(demoWorkOrders);

  return (
    <section aria-labelledby="site-overview-heading">
      <SectionHeader
        description="크롤링 상태, 색인 가능성, 열린 이슈, 작업 지시서, 재검수, AI 검색 노출(GEO) 지표를 한눈에 확인합니다."
        eyebrow="개요"
        title="사이트 상태 요약"
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
      <section className="searchops-panel" style={{ marginTop: 16 }}>
        <h3 id="site-overview-heading" style={{ fontSize: 18, margin: "0 0 8px" }}>
          다음 작업
        </h3>
        <p style={{ color: "#64748b", margin: "0 0 14px" }}>
          열린 작업 지시서 {summary.activeWorkOrders}개, 열린 이슈 {summary.openIssues}개, 검수 중인 재검수 {summary.rechecksInReview}개가 있습니다.
        </p>
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
          }}
        >
          <ActionLink href={getSiteDashboardPath(siteId, "issues")} label="SEO 이슈 검토" />
          <ActionLink href={getSiteDashboardPath(siteId, "workorders")} label="작업 보드 열기" />
          <ActionLink href={getSiteDashboardPath(siteId, "crawls")} label="크롤링 이력 확인" />
          <ActionLink href={getSiteDashboardPath(siteId, "connectors")} label="커넥터 동기화 보기" />
        </div>
      </section>
      <WorkOrderSummaryBand siteId={siteId} summary={workOrderSummary} />
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 14 }}>
        실시간 API 조회가 연결되기 전까지 KPI 값은 결정론적 데모 데이터를 사용합니다.
      </p>
    </section>
  );
}

function WorkOrderSummaryBand({
  siteId,
  summary
}: {
  readonly siteId: string;
  readonly summary: ReturnType<typeof summarizeWorkOrders>;
}) {
  const stats = [
    { label: "진행 대상", value: summary.active },
    { label: "긴급", value: summary.urgent },
    { label: "검수 중", value: summary.inReview },
    { label: "차단됨", value: summary.blocked }
  ] as const;

  return (
    <section
      aria-labelledby="work-order-summary-heading"
      className="searchops-panel"
      style={{ marginTop: 18 }}
    >
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: 14,
          gridTemplateColumns: "minmax(0, 1fr) auto"
        }}
      >
        <div>
          <h3 id="work-order-summary-heading" style={{ fontSize: 18, margin: "0 0 6px" }}>
            작업 지시서 요약
          </h3>
          <p style={{ color: "#64748b", margin: 0 }}>
            개요 화면은 판단에 필요한 요약만 보여주며, 전체 칸반과 목록은 작업 보드에서 관리합니다.
          </p>
        </div>
        <ActionLink href={getSiteDashboardPath(siteId, "workorders")} label="작업 보드 열기" />
      </div>
      <dl
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          margin: "14px 0 0"
        }}
      >
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt style={{ color: "#64748b", fontSize: 12 }}>{stat.label}</dt>
            <dd style={{ fontSize: 24, fontWeight: 800, margin: "5px 0 0" }}>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function kpiCards(kpis: SiteOverviewKpis) {
  return [
    {
      label: "크롤링 성공률",
      value: kpis.crawlSuccessRate,
      detail: "최근 시도 중 완료된 크롤링 실행 비율입니다.",
      tone: "positive"
    },
    {
      label: "색인 가능 URL 비율",
      value: kpis.indexableUrlRatio,
      detail: "현재 색인 대상이 될 수 있는 URL 비율입니다.",
      tone: "positive"
    },
    {
      label: "긴급 이슈 수",
      value: kpis.criticalIssueCount,
      detail: "우선 확인이 필요한 열린 P0/P1 이슈 수입니다.",
      tone: "risk"
    },
    {
      label: "작업 지시서 완료율",
      value: kpis.workOrderCompletionRate,
      detail: "생성된 작업 지시서 중 완료된 비율입니다.",
      tone: "neutral"
    },
    {
      label: "해결 이슈 비율",
      value: kpis.resolvedIssueRate,
      detail: "재검수 후 해결됨으로 확인된 이슈 비율입니다.",
      tone: "neutral"
    },
    {
      label: "비브랜드 쿼리 커버리지",
      value: kpis.nonBrandQueryCoverage,
      detail: "AEO/GEO 쿼리 커버리지 연결 전까지의 자리표시자입니다.",
      tone: "placeholder"
    },
    {
      label: "AI 언급률",
      value: kpis.aiMentionRate,
      detail: "AI 답변 내 브랜드 언급률 자리표시자입니다.",
      tone: "placeholder"
    },
    {
      label: "AI 인용률",
      value: kpis.aiCitationRate,
      detail: "AI 답변 내 URL 인용률 자리표시자입니다.",
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
      className="searchops-button secondary"
    >
      {label}
    </Link>
  );
}

const kpiCardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  borderTop: "4px solid #94a3b8",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)",
  minHeight: 132,
  padding: 14
};

const toneColors = {
  neutral: "#64748b",
  placeholder: "#2563eb",
  positive: "#059669",
  risk: "#dc2626"
} as const;
