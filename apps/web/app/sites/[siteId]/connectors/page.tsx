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
import { formatBooleanLabel, formatStatusLabel } from "../../../../src/korean-labels";
import {
  connectorProviderOptions,
  formatConnectorProvider,
  formatConnectorProviders,
  formatSyncDuration,
  getConnectorSyncTriggerFeedback,
  getConnectorSyncResultTone,
  getConnectorSyncRunErrorMessage,
  getConnectorSyncRunProviderErrorMessages,
  getConnectorSyncRunTone,
  getConnectorSyncProviderErrorMessage,
  loadConnectorSyncHistory,
  summarizeConnectorSyncHistory,
  type ConnectorSyncResultTone,
  type ConnectorSyncRunTone
} from "../../../../src/connector-sync-history";
import { runConnectorSyncAction } from "./actions";
import { ConnectorSyncSubmitButton } from "./submit-button";

interface ConnectorsPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly runId?: string;
    readonly sync?: string;
  }>;
}

export default async function ConnectorsPage({ params, searchParams }: ConnectorsPageProps) {
  const { siteId } = await params;
  const triggerSearchParams = await searchParams;
  const history = await loadConnectorSyncHistory(siteId);
  const summary = summarizeConnectorSyncHistory(history);
  const allResults = Object.values(history.resultsByRunId).flat();
  const runsById = new Map(history.runs.map((run) => [run.id, run]));
  const triggerFeedback = getConnectorSyncTriggerFeedback(
    triggerSearchParams.sync,
    triggerSearchParams.runId,
  );

  return (
    <section aria-labelledby="connector-sync-history-heading">
      <SectionHeader
        description="GSC, GA4, PageSpeed, Bing, CMS 동기화 실행 상태와 저장된 provider 결과를 확인합니다."
        eyebrow="커넥터"
        title="커넥터 동기화 이력"
      />
      <div style={metricGridStyle}>
        <MetricCard label="동기화 실행" value={String(summary.total)} />
        <MetricCard label="완료" value={String(summary.completed)} />
        <MetricCard label="일부 완료/실패" value={String(summary.partial + summary.failed)} />
        <MetricCard label="동기화 기록" value={String(summary.totalRecords)} />
      </div>
      <ConnectorSyncTriggerPanel siteId={siteId} triggerFeedback={triggerFeedback} />
      <section aria-label="커넥터 동기화 실행" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 id="connector-sync-history-heading" style={{ fontSize: 18, margin: 0 }}>
              최근 커넥터 동기화
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              최근 상태: {formatStatusLabel(summary.latestStatus)}; 정상 provider 결과 {summary.okResults}개.
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
          <table style={{ ...tableStyle, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>실행</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>시작</th>
                <th style={thStyle}>소요 시간</th>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>기록</th>
                <th style={thStyle}>Provider 결과</th>
              </tr>
            </thead>
            <tbody>
              {history.runs.map((run) => {
                const results = history.resultsByRunId[run.id] ?? [];
                const records = results.reduce((total, result) => total + result.recordCount, 0);
                const errorMessage = getConnectorSyncRunErrorMessage(run);
                const providerErrorMessages = getConnectorSyncRunProviderErrorMessages(run);

                return (
                  <tr key={run.id}>
                    <td style={tdStyle}>
                      <strong>{run.id}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        요청자 {run.requestedByUserId}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <RunStatusPill label={formatStatusLabel(run.status)} tone={getConnectorSyncRunTone(run.status)} />
                    </td>
                    <td style={tdStyle}>{formatDateTime(run.startedAt)}</td>
                    <td style={tdStyle}>{formatSyncDuration(run.startedAt, run.endedAt)}</td>
                    <td style={tdStyle}>{formatConnectorProviders(run.providers)}</td>
                    <td style={tdStyle}>{records}</td>
                    <td style={tdStyle}>
                      {errorMessage ? (
                        <span style={{ color: "#b91c1c" }}>{errorMessage}</span>
                      ) : results.length === 0 ? (
                        <span style={{ color: "#64748b" }}>대기 중</span>
                      ) : (
                        <div>
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {results.map((result) => (
                              <ResultStatusPill
                                key={result.id}
                                label={`${formatConnectorProvider(result.provider)} ${formatStatusLabel(result.status)}`}
                                tone={getConnectorSyncResultTone(result.status)}
                              />
                            ))}
                          </span>
                          {providerErrorMessages.length > 0 ? (
                            <ul style={{ color: "#b91c1c", fontSize: 12, margin: "8px 0 0", paddingLeft: 18 }}>
                              {providerErrorMessages.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Provider 결과 상세" style={tableSectionStyle}>
        <header style={tableHeaderStyle}>
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>Provider 결과 상세</h3>
            <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
              Provider 상태, 수집 시각, 저장된 기록 수를 확인합니다.
            </p>
          </div>
        </header>
        <div style={tableScrollStyle}>
          <table style={{ ...tableStyle, minWidth: 860 }}>
            <thead>
              <tr>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>실행</th>
                <th style={thStyle}>수집 시각</th>
                <th style={thStyle}>기록</th>
                <th style={thStyle}>데모 여부</th>
              </tr>
            </thead>
            <tbody>
              {allResults.map((result) => {
                const providerErrorMessage = getConnectorSyncProviderErrorMessage(
                  runsById.get(result.syncRunId),
                  result.provider,
                );

                return (
                  <tr key={result.id}>
                    <td style={tdStyle}>{formatConnectorProvider(result.provider)}</td>
                    <td style={tdStyle}>
                      <ResultStatusPill
                        label={formatStatusLabel(result.status)}
                        tone={getConnectorSyncResultTone(result.status)}
                      />
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>{result.syncRunId}</td>
                    <td style={tdStyle}>{formatDateTime(result.fetchedAt)}</td>
                    <td style={tdStyle}>{result.recordCount}</td>
                    <td style={tdStyle}>
                      {formatBooleanLabel(result.fixture)}
                      {providerErrorMessage ? (
                        <span style={{ color: "#b91c1c", display: "block", fontSize: 12, marginTop: 6 }}>
                          {providerErrorMessage}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ConnectorSyncTriggerPanel({
  siteId,
  triggerFeedback
}: {
  readonly siteId: string;
  readonly triggerFeedback: ReturnType<typeof getConnectorSyncTriggerFeedback>;
}) {
  const action = runConnectorSyncAction.bind(null, siteId);

  return (
    <section aria-label="커넥터 동기화 실행" style={triggerPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>커넥터 동기화 실행</h3>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          선택한 provider에 대해 결정론적 데모 기반 동기화 작업을 대기열에 등록합니다.
        </p>
        {triggerFeedback ? (
          <p style={{ ...triggerFeedbackStyle[triggerFeedback.tone], margin: "10px 0 0" }}>
            {triggerFeedback.message}
          </p>
        ) : null}
      </div>
      <form action={action} style={triggerFormStyle}>
        <fieldset style={providerFieldsetStyle}>
          <legend style={providerLegendStyle}>Provider</legend>
          {connectorProviderOptions.map((provider) => (
            <label key={provider} style={providerOptionStyle}>
              <input defaultChecked name="providers" type="checkbox" value={provider} />
              <span>{formatConnectorProvider(provider)}</span>
            </label>
          ))}
        </fieldset>
        <ConnectorSyncSubmitButton />
      </form>
    </section>
  );
}

function RunStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorSyncRunTone;
}) {
  const toneStyle = {
    complete: { background: "#ecfdf5", color: "#047857" },
    failed: { background: "#fef2f2", color: "#b91c1c" },
    partial: { background: "#fff7ed", color: "#c2410c" },
    queued: { background: "#f8fafc", color: "#475569" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function ResultStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorSyncResultTone;
}) {
  const toneStyle = {
    failed: { background: "#fef2f2", color: "#b91c1c" },
    ok: { background: "#ecfdf5", color: "#047857" },
    partial: { background: "#fff7ed", color: "#c2410c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function formatDateTime(isoDate: string | null) {
  if (isoDate === null) {
    return "대기 중";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(isoDate));
}

const triggerPanelStyle = {
  alignItems: "start",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1fr) auto",
  marginTop: 14,
  padding: 16
} as const;

const triggerFormStyle = {
  alignItems: "end",
  display: "grid",
  gap: 12,
  justifyItems: "end"
} as const;

const providerFieldsetStyle = {
  border: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "end",
  margin: 0,
  maxWidth: 420,
  padding: 0
} as const;

const providerLegendStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 8,
  width: "100%"
} as const;

const providerOptionStyle = {
  alignItems: "center",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#172033",
  display: "inline-flex",
  fontSize: 13,
  fontWeight: 700,
  gap: 6,
  minHeight: 34,
  padding: "7px 9px"
} as const;

const triggerFeedbackStyle = {
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
