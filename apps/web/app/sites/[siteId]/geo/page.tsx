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
import {
  formatGeoDate,
  formatGeoProvider,
  formatGeoStatus,
  getGeoVisibilityCreateFeedback,
  getGeoVisibilityStatusTone,
  getGeoVisibilityWorkOrderFeedback,
  loadGeoVisibilityDashboard,
  summarizeGeoVisibilityDashboard,
  type GeoVisibilityTone
} from "../../../../src/geo-visibility-dashboard";
import { createGeoVisibilityReportAction, createGeoWorkOrderAction } from "./actions";

interface GeoPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly geo?: string;
    readonly reportId?: string;
    readonly workOrder?: string;
    readonly workOrderId?: string;
  }>;
}

export default async function GeoPage({ params, searchParams }: GeoPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const site = resolveDashboardSite(siteId);
  const dashboard = await loadGeoVisibilityDashboard(site);
  const summary = summarizeGeoVisibilityDashboard(dashboard);
  const createFeedback = getGeoVisibilityCreateFeedback(
    createSearchParams.geo,
    createSearchParams.reportId,
  );
  const workOrderFeedback = getGeoVisibilityWorkOrderFeedback(
    createSearchParams.workOrder,
    createSearchParams.workOrderId,
    createSearchParams.reportId,
  );

  return (
    <section aria-labelledby="geo-visibility-heading">
      <SectionHeader
        description="저장된 답변 관측, 브랜드 언급, 소유 URL 인용을 기준으로 AI 검색 노출(GEO)을 결정론적으로 모니터링합니다."
        eyebrow="GEO 모니터"
        title="AI 검색 노출 리포트"
      />
      <div style={metricGridStyle}>
        <MetricCard label="리포트" value={String(summary.total)} />
        <MetricCard label="언급률" value={summary.averageMentionRate} />
        <MetricCard label="인용률" value={summary.averageCitationRate} />
        <MetricCard label="약함/미노출" value={String(summary.weakOrMissing)} />
      </div>
      <GeoCreatePanel
        siteId={siteId}
        createFeedback={createFeedback}
        workOrderFeedback={workOrderFeedback}
      />
      <section aria-label="GEO 노출 리포트" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="geo-visibility-heading" style={{ fontSize: 18, margin: 0 }}>
              노출 이력
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              최근 상태: {formatGeoStatus(summary.latestStatus)}. 강한 리포트 {summary.strong}개.
            </p>
            {dashboard.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                API 연결 실패: {dashboard.errorMessage}
              </p>
            ) : null}
          </div>
          <span
            style={{
              ...pillStyle,
              background: dashboard.source === "api" ? "#ecfdf5" : "#eef2ff",
              color: dashboard.source === "api" ? "#047857" : "#3730a3"
            }}
          >
            {dashboard.source === "api" ? "API 데이터" : "데모 데이터"}
          </span>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 980 }}>
            <thead>
              <tr>
                <th style={thStyle}>리포트</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>언급</th>
                <th style={thStyle}>인용</th>
                <th style={thStyle}>질의</th>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>경쟁사 리스크</th>
                <th style={thStyle}>작업 지시서</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.reports.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, color: "#64748b" }}>
                    아직 GEO 노출 리포트가 없습니다.
                  </td>
                </tr>
              ) : (
                dashboard.reports.map((report) => {
                  const workOrderAction = createGeoWorkOrderAction.bind(null, siteId, report.id);

                  return (
                    <tr key={report.id}>
                      <td style={tdStyle}>
                        <strong>{report.brandName}</strong>
                        <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                          {report.id} - {formatGeoDate(report.evaluatedAt)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <TonePill
                          label={`${formatGeoStatus(report.status)} ${report.score}`}
                          tone={getGeoVisibilityStatusTone(report.status)}
                        />
                      </td>
                      <td style={tdStyle}>{report.mentionRate}%</td>
                      <td style={tdStyle}>{report.citationRate}%</td>
                      <td style={tdStyle}>{report.queryCount}</td>
                      <td style={tdStyle}>{report.providerCount}</td>
                      <td style={tdStyle}>{report.competitorCitationRate}%</td>
                      <td style={tdStyle}>
                        <form action={workOrderAction}>
                          <button style={secondaryButtonStyle} type="submit">
                            작업 생성
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="GEO 관측 상세" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>관측 상세</h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              최근 리포트의 provider, 질의, 답변 근거, 인용 URL 소유 여부를 확인합니다.
            </p>
          </div>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>질의</th>
                <th style={thStyle}>답변 근거</th>
                <th style={thStyle}>인용 URL</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.reports[0]?.observations ?? []).map((observation) => (
                <tr key={`${observation.provider}-${observation.query}`}>
                  <td style={tdStyle}>{formatGeoProvider(observation.provider)}</td>
                  <td style={tdStyle}>{observation.query}</td>
                  <td style={{ ...tdStyle, maxWidth: 340 }}>{observation.answerText || "답변 텍스트 없음"}</td>
                  <td style={{ ...tdStyle, ...codeTextStyle, maxWidth: 320 }}>
                    {observation.citedUrls.length === 0
                      ? "인용 없음"
                      : observation.citedUrls.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function GeoCreatePanel({
  createFeedback,
  workOrderFeedback,
  siteId
}: {
  readonly createFeedback: ReturnType<typeof getGeoVisibilityCreateFeedback>;
  readonly workOrderFeedback: ReturnType<typeof getGeoVisibilityWorkOrderFeedback>;
  readonly siteId: string;
}) {
  const action = createGeoVisibilityReportAction.bind(null, siteId);

  return (
    <section aria-label="GEO 노출 리포트 생성" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>GEO 모니터 실행</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          데모 답변 관측으로 결정론적 노출 리포트를 저장합니다.
        </p>
        {createFeedback ? (
          <p style={{ ...feedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
        {workOrderFeedback ? (
          <p style={{ ...feedbackStyle[workOrderFeedback.tone], margin: "10px 0 0" }}>
            {workOrderFeedback.message}
          </p>
        ) : null}
      </div>
      <form action={action}>
        <button style={createButtonStyle} type="submit">
          모니터 실행
        </button>
      </form>
    </section>
  );
}

function TonePill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: GeoVisibilityTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const createPanelStyle = {
  alignItems: "center",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "flex",
  gap: 16,
  justifyContent: "space-between",
  marginTop: 14,
  padding: 16
} as const;

const createButtonStyle = {
  background: "#2563eb",
  border: 0,
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  minHeight: 40,
  padding: "10px 14px"
} as const;

const secondaryButtonStyle = {
  background: "#f8fafc",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#172033",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  minHeight: 38,
  padding: "9px 12px"
} as const;

const feedbackStyle = {
  info: {
    color: "#3730a3",
    fontSize: 13
  },
  success: {
    color: "#047857",
    fontSize: 13
  },
  warning: {
    color: "#b91c1c",
    fontSize: 13
  }
} as const;
