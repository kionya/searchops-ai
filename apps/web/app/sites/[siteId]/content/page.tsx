import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
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
  formatContentBriefDate,
  formatContentBriefGenerationMode,
  formatContentBriefIntent,
  formatContentBriefPublishPolicy,
  formatContentBriefStatus,
  getContentBriefCreateFeedback,
  getContentBriefStatusTone,
  loadContentBriefHistory,
  summarizeContentBriefHistory,
  type ContentBriefStatusTone
} from "../../../../src/content-brief-history";
import {
  formatAeoCheckId,
  formatAeoReadinessStatus,
  findLatestGscKeywordDiscoveryRun,
  getAeoCheckTone,
  getAeoReadinessTone,
  getKeywordDiscoveryCreateFeedback,
  getWeakAeoChecks,
  loadKeywordAeoDashboard,
  summarizeKeywordAeoDashboard,
  type AeoReadinessTone,
  type KeywordAeoDashboardData
} from "../../../../src/keyword-aeo-dashboard";
import { loadConnectorSyncHistory } from "../../../../src/connector-sync-history";
import { createContentBriefAction, createKeywordDiscoveryAction } from "./actions";

interface ContentPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly brief?: string;
    readonly briefId?: string;
    readonly candidates?: string;
    readonly connectorSyncRunId?: string;
    readonly keywordDiscovery?: string;
    readonly keyword?: string;
  }>;
}

export default async function ContentPage({ params, searchParams }: ContentPageProps) {
  const { siteId } = await params;
  const createSearchParams = await searchParams;
  const [history, keywordAeoDashboard, connectorSyncHistory] = await Promise.all([
    loadContentBriefHistory(siteId),
    loadKeywordAeoDashboard(siteId),
    loadConnectorSyncHistory(siteId)
  ]);
  const summary = summarizeContentBriefHistory(history);
  const keywordAeoSummary = summarizeKeywordAeoDashboard(keywordAeoDashboard);
  const latestGscRun = findLatestGscKeywordDiscoveryRun(connectorSyncHistory);
  const createFeedback = getContentBriefCreateFeedback(
    createSearchParams.brief,
    createSearchParams.briefId,
    createSearchParams.keyword,
  );
  const keywordDiscoveryFeedback = getKeywordDiscoveryCreateFeedback(
    createSearchParams.keywordDiscovery,
    createSearchParams.candidates,
    createSearchParams.keyword,
  );

  return (
    <section aria-labelledby="content-brief-history-heading">
      <SectionHeader
        description="키워드/AEO 신호로 생성되고 사람 검토를 위해 저장되는 결정론적 초안 전용 콘텐츠 브리프입니다."
        eyebrow="콘텐츠 브리프"
        title="콘텐츠 브리프 이력"
      />
      <div style={metricGridStyle}>
        <MetricCard label="브리프" value={String(summary.total)} />
        <MetricCard label="초안" value={String(summary.draft)} />
        <MetricCard label="FAQ 질문" value={String(summary.totalFaqQuestions)} />
        <MetricCard label="보관됨" value={String(summary.archived)} />
      </div>
      <KeywordAeoReadinessPanel
        dashboard={keywordAeoDashboard}
        keywordDiscoveryFeedback={keywordDiscoveryFeedback}
        latestGscRunId={latestGscRun?.id ?? null}
        summary={keywordAeoSummary}
        siteId={siteId}
      />
      <ContentBriefCreatePanel siteId={siteId} createFeedback={createFeedback} />
      <section aria-label="콘텐츠 브리프 기록" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="content-brief-history-heading" style={{ fontSize: 18, margin: 0 }}>
              최근 콘텐츠 브리프
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              최근 생성: {formatContentBriefDate(summary.latestCreatedAt)}. 생성된 모든 브리프는 초안 전용으로 유지됩니다.
            </p>
            {history.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                API 연결 실패: {history.errorMessage}
              </p>
            ) : null}
          </div>
          <span
            style={{
              ...pillStyle,
              background: history.source === "api" ? "#ecfdf5" : "#eef2ff",
              color: history.source === "api" ? "#047857" : "#3730a3"
            }}
          >
            {history.source === "api" ? "API 데이터" : "데모 데이터"}
          </span>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 940 }}>
            <thead>
              <tr>
                <th style={thStyle}>브리프</th>
                <th style={thStyle}>키워드</th>
                <th style={thStyle}>의도</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>생성일</th>
                <th style={thStyle}>산출물</th>
              </tr>
            </thead>
            <tbody>
              {history.briefs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, color: "#64748b" }}>
                    아직 콘텐츠 브리프가 없습니다.
                  </td>
                </tr>
              ) : (
                history.briefs.map((brief) => (
                  <tr key={brief.id}>
                    <td style={tdStyle}>
                      <strong>{brief.title}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {brief.id}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <strong>{brief.primaryKeyword}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {brief.locale}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatContentBriefIntent(brief.intent)}</td>
                    <td style={tdStyle}>
                      <StatusPill label={formatContentBriefStatus(brief.status)} tone={getContentBriefStatusTone(brief.status)} />
                    </td>
                    <td style={tdStyle}>{formatContentBriefDate(brief.createdAt)}</td>
                    <td style={tdStyle}>
                      섹션 {brief.outline?.length ?? 0}개, FAQ {brief.faqQuestions.length}개
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {formatContentBriefGenerationMode(brief.generationMode)}; {formatContentBriefPublishPolicy(brief.publishPolicy)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function KeywordAeoReadinessPanel({
  dashboard,
  keywordDiscoveryFeedback,
  latestGscRunId,
  siteId,
  summary
}: {
  readonly dashboard: KeywordAeoDashboardData;
  readonly keywordDiscoveryFeedback: ReturnType<typeof getKeywordDiscoveryCreateFeedback>;
  readonly latestGscRunId: string | null;
  readonly siteId: string;
  readonly summary: ReturnType<typeof summarizeKeywordAeoDashboard>;
}) {
  const discoveryAction = createKeywordDiscoveryAction.bind(null, siteId);
  const briefAction = createContentBriefAction.bind(null, siteId);

  return (
    <section aria-label="키워드/AEO 준비도" style={tableSectionStyle}>
      <header style={tableHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>키워드/AEO 준비도</h3>
          <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
            타깃 키워드, 답변 블록, FAQ 스키마, 인용, 콘텐츠 깊이를 기준으로 한 결정론적 준비도 진단입니다.
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
      <div style={keywordAeoMetricStyle}>
        <MetricCard label="키워드" value={String(summary.total)} />
        <MetricCard label="준비 완료" value={String(summary.ready)} />
        <MetricCard label="개선 필요" value={String(summary.needsWork + summary.notReady)} />
        <MetricCard label="평균 점수" value={summary.averageScore} />
        <MetricCard label="발견됨" value={String(dashboard.keywordDiscoveries.length)} />
      </div>
      <form action={discoveryAction} style={keywordDiscoveryFormStyle}>
        <div>
          <strong>GSC 기반 키워드 발견</strong>
          <p style={{ ...mutedTextStyle, fontSize: 12, margin: "5px 0 0" }}>
            최근 GSC sync run: {latestGscRunId ?? "없음"}
          </p>
          {keywordDiscoveryFeedback ? (
            <p style={{ ...createFeedbackStyle[keywordDiscoveryFeedback.tone], margin: "7px 0 0" }}>
              {keywordDiscoveryFeedback.message}
            </p>
          ) : null}
        </div>
        <input name="connectorSyncRunId" type="hidden" value={latestGscRunId ?? ""} />
        <label style={compactFieldStyle}>
          <span style={labelStyle}>최소 impressions</span>
          <input defaultValue={1} min={0} name="minImpressions" style={inputStyle} type="number" />
        </label>
        <label style={compactFieldStyle}>
          <span style={labelStyle}>최대 후보</span>
          <input defaultValue={25} min={1} name="maxCandidates" style={inputStyle} type="number" />
        </label>
        <button disabled={latestGscRunId === null} style={submitButtonStyle} type="submit">
          GSC 후보 갱신
        </button>
      </form>
      <div style={tableScrollStyle}>
        <table style={{ ...tableStyle, minWidth: 980 }}>
          <thead>
            <tr>
              <th style={thStyle}>키워드</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}>점수</th>
              <th style={thStyle}>후보 페이지</th>
              <th style={thStyle}>약한 검사</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.reports.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: "#64748b" }}>
                  아직 키워드/AEO 준비도 리포트가 없습니다.
                </td>
              </tr>
            ) : (
              dashboard.reports.map((report) => {
                const weakChecks = getWeakAeoChecks(report);

                return (
                  <tr key={`${report.keyword.phrase}-${report.evaluatedAt}-${report.pageUrl ?? "none"}`}>
                    <td style={tdStyle}>
                      <strong>{report.keyword.phrase}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        {report.keyword.locale}; {formatContentBriefIntent(report.keyword.intent)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <TonePill
                        label={formatAeoReadinessStatus(report.status)}
                        tone={getAeoReadinessTone(report.status)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <strong>{report.score}</strong>
                      <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                        deterministic
                      </span>
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>
                      {report.pageUrl ?? "후보 페이지 없음"}
                    </td>
                    <td style={tdStyle}>
                      {weakChecks.length === 0 ? (
                        <TonePill label="약한 검사 없음" tone="good" />
                      ) : (
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {weakChecks.slice(0, 3).map((check) => (
                            <TonePill
                              key={`${report.keyword.phrase}-${check.checkId}`}
                              label={formatAeoCheckId(check.checkId)}
                              tone={getAeoCheckTone(check.status)}
                            />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div style={{ ...tableScrollStyle, marginTop: 12 }}>
        <table style={{ ...tableStyle, minWidth: 940 }}>
          <thead>
            <tr>
              <th style={thStyle}>발견 키워드</th>
              <th style={thStyle}>출처</th>
              <th style={thStyle}>점수</th>
              <th style={thStyle}>후보 페이지</th>
              <th style={thStyle}>근거</th>
              <th style={thStyle}>브리프</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.keywordDiscoveries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, color: "#64748b" }}>
                  아직 키워드 발견 후보가 없습니다.
                </td>
              </tr>
            ) : (
              dashboard.keywordDiscoveries.slice(0, 8).map((candidate) => (
                <tr key={candidate.id}>
                  <td style={tdStyle}>
                    <strong>{candidate.phrase}</strong>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                      {candidate.locale}; {formatContentBriefIntent(candidate.intent)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...pillStyle, background: "#f8fafc", color: "#475569" }}>
                      {candidate.source}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <strong>{candidate.score}</strong>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13, marginTop: 3 }}>
                      {formatContentBriefGenerationMode(candidate.generatedBy)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, ...codeTextStyle }}>
                    {candidate.pageUrl ?? "후보 페이지 없음"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#64748b", display: "block", fontSize: 13 }}>
                      {candidate.evidence.sourceField}; {candidate.evidence.impressions ?? candidate.evidence.title ?? "기록"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <form action={briefAction}>
                      <input name="phrase" type="hidden" value={candidate.phrase} />
                      <input name="intent" type="hidden" value={candidate.intent ?? "informational"} />
                      <input name="candidateUrl" type="hidden" value={candidate.pageUrl ?? ""} />
                      <button style={secondaryButtonStyle} type="submit">
                        초안 생성
                      </button>
                    </form>
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

function ContentBriefCreatePanel({
  siteId,
  createFeedback
}: {
  readonly siteId: string;
  readonly createFeedback: ReturnType<typeof getContentBriefCreateFeedback>;
}) {
  const action = createContentBriefAction.bind(null, siteId);

  return (
    <section aria-label="콘텐츠 브리프 생성" style={createPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>초안 브리프 생성</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          키워드와 선택 페이지 신호를 입력해 결정론적 초안 전용 브리프를 생성합니다.
        </p>
        {createFeedback ? (
          <p style={{ ...createFeedbackStyle[createFeedback.tone], margin: "10px 0 0" }}>
            {createFeedback.message}
          </p>
        ) : null}
      </div>
      <form action={action} style={createFormStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>주요 키워드</span>
          <input
            name="phrase"
            placeholder="SEO 클리닉 가격 비교"
            required
            style={inputStyle}
            type="text"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>의도</span>
          <select defaultValue="commercial" name="intent" style={inputStyle}>
            <option value="informational">정보 탐색</option>
            <option value="commercial">비교/검토</option>
            <option value="transactional">전환</option>
            <option value="navigational">탐색</option>
            <option value="local">지역</option>
            <option value="mixed">복합</option>
          </select>
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>후보 URL</span>
          <input
            name="candidateUrl"
            placeholder="https://example-clinic.com/service/seo"
            style={inputStyle}
            type="url"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>페이지 title</span>
          <input name="pageTitle" placeholder="SEO 클리닉 서비스" style={inputStyle} type="text" />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>페이지 요약</span>
          <textarea
            name="metaDescription"
            placeholder="AEO 신호로 쓰는 짧은 페이지 설명입니다."
            rows={2}
            style={textareaStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>H1</span>
          <input name="h1" placeholder="SEO 클리닉" style={inputStyle} type="text" />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>단어 수</span>
          <input min={0} name="wordCount" placeholder="320" style={inputStyle} type="number" />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>스키마 유형</span>
          <input name="schemaTypes" placeholder="FAQPage, LocalBusiness" style={inputStyle} type="text" />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>질문형 헤딩</span>
          <textarea
            name="questionHeadings"
            placeholder={"SEO 클리닉에는 무엇이 포함되나요?\nSEO 클리닉 비용은 얼마인가요?"}
            rows={3}
            style={textareaStyle}
          />
        </label>
        <label style={wideFieldStyle}>
          <span style={labelStyle}>H2 헤딩</span>
          <textarea
            name="h2"
            placeholder={"SEO 클리닉에는 무엇이 포함되나요?\n가격과 검토 흐름"}
            rows={3}
            style={textareaStyle}
          />
        </label>
        <div style={submitRowStyle}>
          <span style={{ ...mutedTextStyle, fontSize: 12 }}>
            생성된 브리프는 사람 검토 전까지 초안 전용으로 유지됩니다.
          </span>
          <button style={submitButtonStyle} type="submit">
            초안 생성
          </button>
        </div>
      </form>
    </section>
  );
}

function StatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ContentBriefStatusTone;
}) {
  const toneStyle = {
    archived: { background: "#f8fafc", color: "#475569" },
    draft: { background: "#ecfdf5", color: "#047857" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function TonePill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: AeoReadinessTone;
}) {
  const toneStyle = {
    good: { background: "#ecfdf5", color: "#047857" },
    neutral: { background: "#fff7ed", color: "#c2410c" },
    risk: { background: "#fef2f2", color: "#b91c1c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const createPanelStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const keywordAeoMetricStyle = {
  ...metricGridStyle,
  padding: 16
} as const;

const keywordDiscoveryFormStyle = {
  alignItems: "end",
  borderTop: "1px solid #dbe4ef",
  display: "grid",
  gap: 12,
  gridTemplateColumns: "minmax(240px, 1fr) repeat(2, minmax(140px, 180px)) auto",
  padding: 16
} as const;

const createFormStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
} as const;

const fieldStyle = {
  display: "grid",
  gap: 6
} as const;

const compactFieldStyle = {
  ...fieldStyle,
  minWidth: 140
} as const;

const wideFieldStyle = {
  ...fieldStyle,
  gridColumn: "1 / -1"
} as const;

const labelStyle = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 700
} as const;

const inputStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#172033",
  fontFamily: "inherit",
  fontSize: 14,
  minHeight: 38,
  padding: "8px 10px"
} as const;

const textareaStyle = {
  ...inputStyle,
  lineHeight: 1.4,
  resize: "vertical"
} as const;

const submitRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: 12,
  gridColumn: "1 / -1",
  justifyContent: "space-between"
} as const;

const submitButtonStyle = {
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
  ...submitButtonStyle,
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  color: "#172033",
  minHeight: 36,
  padding: "8px 12px"
} as const;

const createFeedbackStyle = {
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
