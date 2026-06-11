import Link from "next/link";

import { productName } from "@searchops/types";

import {
  AppWorkspaceFrame,
  metricGridStyle,
  mutedTextStyle
} from "../../src/dashboard-shell";
import {
  createEasySetupGuide,
  summarizeEasySetupGuide,
  type EasySetupStep
} from "../../src/easy-setup";
import { formatIndustryLabel } from "../../src/korean-labels";
import { loadOperationalReadiness } from "../../src/operational-readiness";
import { loadProductizationDashboard } from "../../src/productization-dashboard";
import {
  type SiteRegistryData,
  type SiteRegistrationFeedback,
  type SiteRegistrationSearchParams,
  loadSiteRegistry
} from "../../src/site-registry";
import { demoWorkOrders, summarizeWorkOrders } from "../../src/work-order-board";
import { createSiteAction } from "./actions";

const workOrderSummary = summarizeWorkOrders(demoWorkOrders);

interface SitesPageProps {
  readonly searchParams?: Promise<SiteRegistrationSearchParams>;
}

export default async function SitesPage({ searchParams }: SitesPageProps) {
  const resolvedSearchParams = await searchParams;
  const [registry, readinessDashboard, productizationDashboard] = await Promise.all([
    loadSiteRegistry(resolvedSearchParams),
    loadOperationalReadiness(),
    loadProductizationDashboard()
  ]);
  const guide = createEasySetupGuide({
    productization: productizationDashboard.productization,
    readiness: readinessDashboard.readiness
  });
  const guideSummary = summarizeEasySetupGuide(guide);
  const nextStep = guide.find((group) => group.id === "available_now")?.steps[0] ?? null;

  return (
    <AppWorkspaceFrame
      actions={
        <div className="searchops-action-row">
          <a className="searchops-button secondary" href="#site-registration">
            신규 사이트
          </a>
          <Link className="searchops-button secondary" href="/onboarding">
            온보딩
          </Link>
          <Link className="searchops-button" href="/ops">
            운영 콘솔
          </Link>
        </div>
      }
      description="사이트, 크롤링 상태, SEO 이슈, 작업 지시서, 재검수 진행 상황을 같은 운영 기준으로 확인합니다."
      eyebrow="Dashboard"
      title={productName}
    >
      <section aria-labelledby="sites-heading">
        <div className="searchops-panel">
          <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
            <div>
              <span className="searchops-label">managed properties</span>
              <h3 id="sites-heading" style={{ fontSize: 22, margin: "5px 0 0" }}>
                사이트
              </h3>
              <p style={{ ...mutedTextStyle, marginTop: 5 }}>{registry.sites.length}개 설정됨</p>
            </div>
            <RegistryModePill registry={registry} />
          </div>
        </div>

        <div className="searchops-sites-command-grid">
          <SiteRegistrationPanel feedback={registry.feedback} />
          <SiteRegistrySummary
            nextStep={nextStep}
            registry={registry}
            setupSummary={guideSummary}
          />
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {registry.sites.map((site) => (
            <article className="searchops-card" key={site.id}>
              <div
                style={{
                  alignItems: "start",
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "minmax(0, 1fr) auto"
                }}
              >
                <div>
                  <span className="searchops-label">site workspace</span>
                  <h3 style={{ fontSize: 22, margin: "5px 0 6px" }}>{site.name}</h3>
                  <p style={{ color: "#475569", margin: 0 }}>{site.domain}</p>
                </div>
                <Link className="searchops-button" href={`/sites/${site.id}`}>
                  대시보드 열기
                </Link>
              </div>
              <dl style={{ ...metricGridStyle, margin: "18px 0 0" }}>
                <SiteFact label="업종" value={formatIndustryLabel(site.industry)} />
                <SiteFact label="로캘" value={`${site.language}-${site.country}`} />
                <SiteFact label="열린 작업" value={String(workOrderSummary.active)} />
                <SiteFact label="차단됨" value={String(workOrderSummary.blocked)} />
              </dl>
            </article>
          ))}
        </div>
      </section>
    </AppWorkspaceFrame>
  );
}

function RegistryModePill({ registry }: { readonly registry: SiteRegistryData }) {
  return (
    <span className={`searchops-status-pill ${registry.mode === "api" ? "ready" : "info"}`}>
      {registry.mode === "api" ? "API 저장소" : "Fixture preview"}
    </span>
  );
}

function SiteRegistrationPanel({
  feedback
}: {
  readonly feedback: SiteRegistrationFeedback | null;
}) {
  return (
    <section aria-labelledby="site-registration-heading" className="searchops-panel" id="site-registration">
      <div style={{ display: "grid", gap: 4 }}>
        <span className="searchops-label">new property</span>
        <h3 id="site-registration-heading" style={{ fontSize: 20, margin: 0 }}>
          사이트 등록
        </h3>
      </div>

      {feedback ? (
        <div className={`searchops-registration-feedback ${feedback.tone}`} role="status">
          <span>{feedback.message}</span>
          <Link href={feedback.href}>열기</Link>
        </div>
      ) : null}

      <form action={createSiteAction} className="searchops-registration-form">
        <label className="searchops-field">
          <span>사이트 이름</span>
          <input name="name" placeholder="리쥬엘의원 강남" />
        </label>
        <label className="searchops-field">
          <span>도메인</span>
          <input name="domain" placeholder="example-clinic.com" required />
        </label>
        <label className="searchops-field">
          <span>업종</span>
          <select defaultValue="medical" name="industry">
            <option value="medical">의료/병원</option>
            <option value="beauty">뷰티/피부관리</option>
            <option value="local_service">로컬 서비스</option>
            <option value="commerce">커머스</option>
            <option value="b2b">B2B</option>
          </select>
        </label>
        <div className="searchops-field-pair">
          <label className="searchops-field">
            <span>언어</span>
            <input defaultValue="ko" name="language" />
          </label>
          <label className="searchops-field">
            <span>국가</span>
            <input defaultValue="KR" name="country" />
          </label>
        </div>
        <div className="searchops-field-pair">
          <label className="searchops-field">
            <span>시작 URL</span>
            <input name="startUrl" placeholder="https://example-clinic.com/" />
          </label>
          <label className="searchops-field">
            <span>최대 페이지</span>
            <input defaultValue="10" max="100" min="1" name="maxPages" type="number" />
          </label>
        </div>
        <div className="searchops-option-grid" aria-label="초기 크롤링 옵션">
          <CheckboxField label="초기 crawl 실행" name="initialCrawlEnabled" />
          <CheckboxField label="robots.txt 준수" name="respectRobotsTxt" />
          <CheckboxField label="sitemap 탐색" name="discoverSitemap" />
        </div>
        <div className="searchops-option-grid" aria-label="자동 생성 옵션">
          <CheckboxField label="SEO issue 생성" name="generateSeoIssues" />
          <CheckboxField label="WorkOrder 생성" name="generateWorkOrders" />
          <CheckboxField label="Schema 추천 생성" name="generateSchemaRecommendations" />
        </div>
        <div className="searchops-option-grid" aria-label="커넥터 설정 필요 항목">
          <ConnectorField label="GSC" value="gsc" />
          <ConnectorField label="GA4" value="ga4" />
          <ConnectorField label="Bing" value="bing" />
          <ConnectorField label="CMS" value="cms" />
        </div>
        <button className="searchops-button" type="submit">
          사이트 추가
        </button>
      </form>
    </section>
  );
}

function CheckboxField({ label, name }: { readonly label: string; readonly name: string }) {
  return (
    <label className="searchops-checkbox-field">
      <input name={name} type="hidden" value="false" />
      <input defaultChecked name={name} type="checkbox" value="true" />
      <span>{label}</span>
    </label>
  );
}

function ConnectorField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <label className="searchops-checkbox-field">
      <input name="connectorProvider" type="checkbox" value={value} />
      <span>{label}</span>
    </label>
  );
}

function SiteRegistrySummary({
  nextStep,
  registry,
  setupSummary
}: {
  readonly nextStep: EasySetupStep | null;
  readonly registry: SiteRegistryData;
  readonly setupSummary: ReturnType<typeof summarizeEasySetupGuide>;
}) {
  const fixtureCount = registry.sites.filter((site) => site.id.startsWith("site_")).length;

  return (
    <aside className="searchops-panel" aria-label="사이트 등록 상태">
      <span className="searchops-label">easy setup</span>
      <h3 style={{ fontSize: 20, margin: "5px 0 8px" }}>지금 할 일</h3>
      {nextStep ? (
        <div className="searchops-easy-next-action">
          <strong>{nextStep.title}</strong>
          <p>{nextStep.description}</p>
          <Link className="searchops-button secondary" href={nextStep.href}>
            {nextStep.actionLabel}
          </Link>
        </div>
      ) : null}
      <dl className="searchops-registry-summary">
        <SiteFact label="저장 모드" value={registry.mode === "api" ? "API" : "Fixture"} />
        <SiteFact label="등록 사이트" value={String(registry.sites.length)} />
        <SiteFact label="대시보드 준비" value={String(fixtureCount)} />
        <SiteFact label="출시 전 연결" value={String(setupSummary.connectBeforeLaunch)} />
        <SiteFact label="나중에 결정" value={String(setupSummary.decideLater)} />
      </dl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <Link className="searchops-button" href="/onboarding">
          시작하기
        </Link>
        <Link className="searchops-button secondary" href="/ops/readiness">
          고급 준비도
        </Link>
      </div>
    </aside>
  );
}

function SiteFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
      <dt style={{ color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{label}</dt>
      <dd style={{ fontWeight: 800, margin: "4px 0 0" }}>{value}</dd>
    </div>
  );
}
