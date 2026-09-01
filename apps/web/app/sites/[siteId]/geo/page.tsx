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
import { loadConnectorSyncHistory } from "../../../../src/connector-sync-history";
import {
  buildDefaultGeoQueryStrings,
  extractGscQueriesFromHistory,
  mergeGeoQueryDefaults,
  defaultGeoAnswerMonitorProviders,
  formatGeoDate,
  formatGeoProvider,
  formatGeoStatus,
  formatGeoWorkOrderCandidatePriority,
  geoAnswerMonitorProviderOptions,
  getGeoAnswerMonitorQueueFeedback,
  getGeoVisibilityCreateFeedback,
  getGeoVisibilityStatusTone,
  getGeoVisibilityWorkOrderFeedback,
  loadGeoVisibilityDashboard,
  summarizeGeoWorkOrderBatchPreview,
  summarizeGeoVisibilityDashboard,
  type GeoVisibilityTone
} from "../../../../src/geo-visibility-dashboard";
import {
  createGeoVisibilityReportAction,
  createGeoWorkOrderAction,
  queueGeoAnswerMonitorAction
} from "./actions";

interface GeoPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly geo?: string;
    readonly jobId?: string;
    readonly monitor?: string;
    readonly providers?: string;
    readonly queryCount?: string;
    readonly reportId?: string;
    readonly workOrder?: string;
    readonly workOrderId?: string;
  }>;
}

export default async function GeoPage({ params, searchParams }: GeoPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const site = await loadDashboardSite(siteId);
  const dashboard = await loadGeoVisibilityDashboard(site);
  const connectorHistory = await loadConnectorSyncHistory(site);
  const gscSuggestion = extractGscQueriesFromHistory(connectorHistory);
  const useGscQueries = gscSuggestion.hasGscData && !gscSuggestion.fixture;
  const defaultQueries = (
    useGscQueries
      ? mergeGeoQueryDefaults(site, gscSuggestion.queries)
      : buildDefaultGeoQueryStrings(site)
  ).join("\n");
  const gscSyncedAt = gscSuggestion.fetchedAt ? formatGeoDate(gscSuggestion.fetchedAt) : "-";
  const gscNote = useGscQueries
    ? `Search Console에서 검색어 ${gscSuggestion.queries.length}개 자동 반영 (동기화: ${gscSyncedAt}). 편집 가능.`
    : gscSuggestion.fixture
      ? "GSC 데모 데이터 — 실제 Search Console 연결 시 실 검색어가 자동 반영됩니다. 지금은 템플릿."
      : "GSC 미연결 — 커넥터에서 Search Console를 연결·동기화하면 실 검색어가 여기에 자동 반영됩니다. 지금은 템플릿.";
  const summary = summarizeGeoVisibilityDashboard(dashboard);
  const workOrderPreview = summarizeGeoWorkOrderBatchPreview(dashboard.reports);
  const createFeedback = getGeoVisibilityCreateFeedback(
    createSearchParams.geo,
    createSearchParams.reportId,
  );
  const monitorFeedback = getGeoAnswerMonitorQueueFeedback(
    createSearchParams.monitor,
    createSearchParams.jobId,
    createSearchParams.providers,
    createSearchParams.queryCount,
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
        defaultQueries={defaultQueries}
        gscNote={gscNote}
        createFeedback={createFeedback}
        monitorFeedback={monitorFeedback}
        workOrderPreview={workOrderPreview}
        workOrderFeedback={workOrderFeedback}
      />
      <section aria-label="GEO 노출 리포트" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 id="geo-visibility-heading" style={{ fontSize: 18, margin: 0 }}>
              노출 이력
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              최근 상태: {formatGeoStatus(summary.latestStatus)}. 강한 리포트 {summary.strong}개.
            </p>
            {dashboard.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 14, margin: "6px 0 0" }}>
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
        <div className="searchops-table-scroll">
          <table className="searchops-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>리포트</th>
                <th>상태</th>
                <th>언급</th>
                <th>인용</th>
                <th>질의</th>
                <th>Provider</th>
                <th>경쟁사 리스크</th>
                <th>작업 지시서</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="searchops-muted">
                    아직 GEO 노출 리포트가 없습니다.
                  </td>
                </tr>
              ) : (
                dashboard.reports.map((report) => {
                  const workOrderAction = createGeoWorkOrderAction.bind(null, siteId, report.id);

                  return (
                    <tr key={report.id}>
                      <td>
                        <strong>{report.brandName}</strong>
                        <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 3 }}>
                          {report.id} - {formatGeoDate(report.evaluatedAt)}
                        </span>
                      </td>
                      <td>
                        <TonePill
                          label={`${formatGeoStatus(report.status)} ${report.score}`}
                          tone={getGeoVisibilityStatusTone(report.status)}
                        />
                      </td>
                      <td>{report.mentionRate}%</td>
                      <td>{report.citationRate}%</td>
                      <td>{report.queryCount}</td>
                      <td>{report.providerCount}</td>
                      <td>{report.competitorCitationRate}%</td>
                      <td>
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
      <GeoWorkOrderPreviewSection workOrderPreview={workOrderPreview} />
      <section aria-label="GEO 관측 상세" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>관측 상세</h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              최근 리포트의 provider, 질의, 답변 근거, 인용 URL 소유 여부를 확인합니다.
            </p>
          </div>
        </header>
        <div className="searchops-table-scroll">
          <table className="searchops-table" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>소스</th>
                <th>질의</th>
                <th>답변 근거</th>
                <th>인용 URL</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.reports[0]?.observations ?? []).map((observation) => (
                <tr key={`${observation.provider}-${observation.query}`}>
                  <td>{formatGeoProvider(observation.provider)}</td>
                  <td>{formatGeoObservationSource(observation.source)}</td>
                  <td>{observation.query}</td>
                  <td style={{ maxWidth: 340 }}>{observation.answerText || "답변 텍스트 없음"}</td>
                  <td className="searchops-code" style={{ maxWidth: 320 }}>
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
  monitorFeedback,
  workOrderPreview,
  workOrderFeedback,
  siteId,
  defaultQueries,
  gscNote
}: {
  readonly createFeedback: ReturnType<typeof getGeoVisibilityCreateFeedback>;
  readonly monitorFeedback: ReturnType<typeof getGeoAnswerMonitorQueueFeedback>;
  readonly workOrderPreview: ReturnType<typeof summarizeGeoWorkOrderBatchPreview>;
  readonly workOrderFeedback: ReturnType<typeof getGeoVisibilityWorkOrderFeedback>;
  readonly siteId: string;
  readonly defaultQueries: string;
  readonly gscNote: string;
}) {
  const createAction = createGeoVisibilityReportAction.bind(null, siteId);
  const monitorAction = queueGeoAnswerMonitorAction.bind(null, siteId);

  return (
    <section aria-label="GEO 노출 리포트 생성" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>GEO 모니터 실행</h3>
        <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
          fixture 관측 저장과 provider 배치 관측 큐 등록을 분리해 추적합니다.
        </p>
        <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 8 }}>
          작업 후보 {workOrderPreview.candidateCount}개, 강한 리포트 제외 {workOrderPreview.excludedStrongCount}개.
        </p>
        {createFeedback ? (
          <p style={{ ...feedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
        {monitorFeedback ? (
          <p style={{ ...feedbackStyle[monitorFeedback.tone], margin: "10px 0 0" }}>
            {monitorFeedback.message}
          </p>
        ) : null}
        {workOrderFeedback ? (
          <p style={{ ...feedbackStyle[workOrderFeedback.tone], margin: "10px 0 0" }}>
            {workOrderFeedback.message}
          </p>
        ) : null}
      </div>
      <div style={createPanelActionGridStyle}>
        <form action={createAction} style={monitorFormStyle}>
          <strong style={panelActionTitleStyle}>Fixture 리포트</strong>
          <span style={panelActionDescriptionStyle}>저장 가능한 결정론적 관측 3건</span>
          <button style={createButtonStyle} type="submit">
            리포트 생성
          </button>
        </form>
        <form action={monitorAction} style={monitorFormStyle}>
          <strong style={panelActionTitleStyle}>Provider 배치 관측</strong>
          <label style={queryFieldLabelStyle}>
            타겟 질의 — 환자가 AI 답변엔진에 실제로 묻는 검색어 (한 줄에 하나, 최대 12개)
            <textarea
              defaultValue={defaultQueries}
              name="queries"
              rows={7}
              style={queryTextareaStyle}
            />
          </label>
          <span style={gscNoteStyle}>📊 {gscNote}</span>
          <span style={queryHelpStyle}>
            시술 × 지역 × 의도로 작성. 예시는 이 병원 실제 키워드(가능하면 Search Console 검색어)로 교체하세요.
            ⚠️ 질의 × provider = OpenAI 호출(과금) · 의료광고법: 결과의 마케팅 노출 전 컴플라이언스 점검.
          </span>
          <div style={providerGridStyle}>
            {geoAnswerMonitorProviderOptions.map((provider) => (
              <label key={provider} style={providerOptionStyle}>
                <input
                  defaultChecked={defaultGeoAnswerMonitorProviders.includes(provider)}
                  name="providers"
                  type="checkbox"
                  value={provider}
                />
                <span>{formatGeoProvider(provider)}</span>
              </label>
            ))}
          </div>
          <button style={secondaryButtonStyle} type="submit">
            큐 등록
          </button>
        </form>
      </div>
    </section>
  );
}

function GeoWorkOrderPreviewSection({
  workOrderPreview
}: {
  readonly workOrderPreview: ReturnType<typeof summarizeGeoWorkOrderBatchPreview>;
}) {
  return (
    <section aria-label="GEO 작업 지시서 후보" className="searchops-table-section">
      <header className="searchops-table-head">
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>작업 지시서 후보 미리보기</h3>
          <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
            strong 상태를 제외한 리포트 {workOrderPreview.candidateCount}개를 우선순위별로 검토합니다.
          </p>
        </div>
        <span style={{ ...pillStyle, background: "#f8fafc", color: "var(--so-ink)" }}>
          후보 {workOrderPreview.candidateCount}
        </span>
      </header>
      <div className="searchops-table-scroll">
        <table className="searchops-table" style={{ minWidth: 840 }}>
          <thead>
            <tr>
              <th>우선순위</th>
              <th>리포트</th>
              <th>상태</th>
              <th>점수</th>
              <th>근거</th>
              <th>체크</th>
            </tr>
          </thead>
          <tbody>
            {workOrderPreview.candidates.length === 0 ? (
              <tr>
                <td colSpan={6} className="searchops-muted">
                  작업 지시서 후보가 없습니다.
                </td>
              </tr>
            ) : (
              workOrderPreview.candidates.map((candidate) => (
                <tr key={candidate.reportId}>
                  <td>
                    <span style={{ ...pillStyle, ...priorityToneStyle[candidate.priority] }}>
                      {formatGeoWorkOrderCandidatePriority(candidate.priority)}
                    </span>
                  </td>
                  <td className="searchops-code">{candidate.reportId}</td>
                  <td>
                    <TonePill
                      label={formatGeoStatus(candidate.status)}
                      tone={getGeoVisibilityStatusTone(candidate.status)}
                    />
                  </td>
                  <td>{candidate.score}</td>
                  <td>{candidate.reason}</td>
                  <td className="searchops-code">
                    {candidate.failingChecks.length === 0
                      ? "부분 노출"
                      : candidate.failingChecks.join(", ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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

function formatGeoObservationSource(source: "manual" | "fixture" | "connector") {
  const labels = {
    connector: "Connector",
    fixture: "Fixture",
    manual: "수동"
  } as const satisfies Record<"manual" | "fixture" | "connector", string>;

  return labels[source];
}

const createPanelStyle = {
  alignItems: "start",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const createPanelActionGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
} as const;

const monitorFormStyle = {
  alignItems: "start",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  display: "grid",
  gap: 10,
  padding: 12
} as const;

const panelActionTitleStyle = {
  color: "var(--so-ink)",
  fontSize: 14
} as const;

const panelActionDescriptionStyle = {
  color: "var(--so-muted)",
  fontSize: 14
} as const;

const queryFieldLabelStyle = {
  color: "var(--so-ink)",
  display: "grid",
  fontSize: 14,
  fontWeight: 600,
  gap: 6
} as const;

const queryTextareaStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.5,
  padding: "8px 10px",
  resize: "vertical",
  width: "100%"
} as const;

const queryHelpStyle = {
  color: "var(--so-muted)",
  fontSize: 13,
  lineHeight: 1.5
} as const;

const gscNoteStyle = {
  background: "#eff6ff",
  borderRadius: 6,
  color: "#1d4ed8",
  fontSize: 13,
  lineHeight: 1.5,
  padding: "6px 8px"
} as const;

const providerGridStyle = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))"
} as const;

const providerOptionStyle = {
  alignItems: "center",
  color: "var(--so-ink)",
  display: "flex",
  fontSize: 14,
  gap: 7
} as const;

const createButtonStyle = {
  background: "#2563eb",
  border: 0,
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  minHeight: 40,
  padding: "10px 14px"
} as const;

const secondaryButtonStyle = {
  background: "#f8fafc",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "var(--so-ink)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  minHeight: 38,
  padding: "9px 12px"
} as const;

const priorityToneStyle = {
  p0: { background: "#fef2f2", color: "#b91c1c" },
  p1: { background: "#fff7ed", color: "#c2410c" },
  p2: { background: "#eef2ff", color: "#3730a3" }
} as const;

const feedbackStyle = {
  info: {
    color: "#3730a3",
    fontSize: 14
  },
  success: {
    color: "#047857",
    fontSize: 14
  },
  warning: {
    color: "#b91c1c",
    fontSize: 14
  }
} as const;
