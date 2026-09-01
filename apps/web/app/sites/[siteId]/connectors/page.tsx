import { redirect } from "next/navigation";

import type {
  ConnectorLiveSetupCheck,
  ProviderAccountSummary,
  SiteConnector,
  SiteConnectorProvider,
} from "@searchops/types";

import {
  mutedTextStyle,
  SectionHeader
} from "../../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle
} from "../../../../src/dashboard-table-styles";
import { formatBooleanLabel, formatStatusLabel } from "../../../../src/korean-labels";
import {
  formatConnectorLiveSetupStatus,
  findPageSpeedLiveSetupCheck,
  getConnectorLiveSetupTone,
  type ConnectorLiveSetupTone,
  type ProtectedConnectorLiveSetupData,
} from "../../../../src/connector-live-setup";
import { getApiBaseUrl } from "../../../../src/api-base-url";
import {
  createGoogleOAuthStartPath,
} from "../../../../src/connector-oauth";
import {
  connectorProviderOptions,
  formatConnectorProvider,
  formatConnectorProviders,
  formatSyncDuration,
  summarizeConnectorCommandCenter,
  summarizeConnectorOperations,
  getConnectorSyncTriggerFeedback,
  getConnectorSyncResultTone,
  getConnectorSyncRunErrorMessage,
  getConnectorSyncRunProviderErrorMessages,
  getConnectorSyncRunTone,
  getConnectorSyncProviderErrorMessage,
  summarizeConnectorSyncHistory,
  type ConnectorOperationGuidance,
  type ConnectorOperationTone,
  type ConnectorSyncResultTone,
  type ConnectorSyncRunTone
} from "../../../../src/connector-sync-history";
import { loadProtectedConnectorPageData } from "../../../../src/connector-page-data";
import {
  canManageProviderAccounts,
  canRunConnectorSync,
  filterGoogleProviderAccounts,
  formatProviderAccountProvider,
  getCurrentProviderUser,
} from "../../../../src/provider-accounts";
import {
  deleteSiteConnectorAction,
  runConnectorSyncAction,
  saveSiteConnectorAction,
} from "./actions";
import {
  ConnectorBindingSubmitButton,
  ConnectorSyncSubmitButton,
  ProviderSyncSubmitButton,
} from "./submit-button";
import bindingStyles from "./bindings.module.css";

interface ConnectorsPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams: Promise<{
    readonly binding?: string;
    readonly connectorOAuth?: string;
    readonly oauth?: string;
    readonly oauthReason?: string;
    readonly runId?: string;
    readonly sync?: string;
  }>;
}

export default async function ConnectorsPage({ params, searchParams }: ConnectorsPageProps) {
  const { siteId } = await params;
  const triggerSearchParams = await searchParams;
  let userContext;
  try {
    userContext = await getCurrentProviderUser();
  } catch {
    redirect(`/login?next=${encodeURIComponent(`/sites/${siteId}/connectors`)}`);
  }
  const pageData = await loadProtectedConnectorPageData(userContext, siteId);
  if (pageData.status === "site_unavailable") {
    return (
      <section aria-label="커넥터 접근 오류">
        <SectionHeader
          description="현재 계정으로 이 사이트의 커넥터 정보를 조회할 수 없습니다."
          eyebrow="커넥터"
          title="사이트 정보를 불러올 수 없습니다"
        />
        <p role="status" style={{ color: "#b91c1c", fontSize: 14 }}>
          사이트 접근 권한과 로그인 상태를 확인하세요.
        </p>
      </section>
    );
  }
  const { history, liveSetup: liveSetupData, oauth } = pageData;
  const summary = summarizeConnectorSyncHistory(history);
  const pageSpeedSetupCheck = findPageSpeedLiveSetupCheck(liveSetupData.report);
  const operationGuidance = summarizeConnectorOperations(history);
  const commandSummary = summarizeConnectorCommandCenter(operationGuidance);
  const allResults = Object.values(history.resultsByRunId).flat();
  const runsById = new Map(history.runs.map((run) => [run.id, run]));
  const triggerFeedback = getConnectorSyncTriggerFeedback(
    triggerSearchParams.sync,
    triggerSearchParams.runId,
  );
  const canManageBindings = canManageProviderAccounts(userContext.role);
  const canRunSync = canRunConnectorSync(userContext.role);

  return (
    <section aria-label="커넥터 커맨드 센터">
      <SectionHeader
        description="GSC, GA4, PageSpeed, Bing, CMS의 live 설정, 최신 provider 상태, 재실행 액션을 한 화면에서 제어합니다."
        eyebrow="커넥터"
        title="커넥터 커맨드 센터"
      />
      <ConnectorCommandCenterPanel
        commandSummary={commandSummary}
        historyErrorMessage={history.errorMessage}
        historySource={history.source}
        liveSetupData={liveSetupData}
        pageSpeedCheck={pageSpeedSetupCheck}
        summary={summary}
      />
      <ConnectorOperationsPanel
        canRunSync={canRunSync}
        operations={operationGuidance}
        siteId={siteId}
      />
      <ProviderBindingsPanel
        accounts={pageData.accounts}
        bindingStatus={triggerSearchParams.binding}
        canManage={canManageBindings}
        connectors={pageData.connectors}
        loadFailed={
          pageData.accountLoadFailed ||
          pageData.connectorLoadFailed ||
          oauth.errorMessage !== null
        }
        oauthReason={triggerSearchParams.oauthReason}
        oauthStatus={
          triggerSearchParams.connectorOAuth ??
          triggerSearchParams.oauth ??
          (oauth.credentials.length > 0 ? "connected" : undefined)
        }
        siteId={siteId}
      />
      <PageSpeedSetupPanel
        errorMessage={liveSetupData.errorMessage}
        pageSpeedCheck={pageSpeedSetupCheck}
        source={liveSetupData.source}
      />
      <ConnectorSyncTriggerPanel
        canRunSync={canRunSync}
        siteId={siteId}
        triggerFeedback={triggerFeedback}
      />
      <section aria-label="커넥터 동기화 실행" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 id="connector-sync-history-heading" style={{ fontSize: 18, margin: 0 }}>
              최근 커넥터 동기화
            </h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              최근 상태: {formatStatusLabel(summary.latestStatus)}; 정상 provider 결과 {summary.okResults}개.
            </p>
            {history.errorMessage ? (
              <p style={{ color: "#b91c1c", fontSize: 14, margin: "6px 0 0" }}>
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
        <div className="searchops-table-scroll">
          <table className="searchops-table" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th>실행</th>
                <th>상태</th>
                <th>시작</th>
                <th>소요 시간</th>
                <th>Provider</th>
                <th>기록</th>
                <th>Provider 결과</th>
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
                    <td>
                      <strong>{run.id}</strong>
                      <span style={{ ...codeTextStyle, color: "var(--so-muted)", display: "block", marginTop: 3 }}>
                        요청자 {run.requestedByUserId}
                      </span>
                    </td>
                    <td>
                      <RunStatusPill label={formatStatusLabel(run.status)} tone={getConnectorSyncRunTone(run.status)} />
                    </td>
                    <td>{formatDateTime(run.startedAt)}</td>
                    <td>{formatSyncDuration(run.startedAt, run.endedAt)}</td>
                    <td>{formatConnectorProviders(run.providers)}</td>
                    <td>{records}</td>
                    <td>
                      {errorMessage ? (
                        <span style={{ color: "#b91c1c" }}>{errorMessage}</span>
                      ) : results.length === 0 ? (
                        <span style={{ color: "var(--so-muted)" }}>대기 중</span>
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
                            <ul style={{ color: "#b91c1c", fontSize: 13, margin: "8px 0 0", paddingLeft: 18 }}>
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
      <section aria-label="Provider 결과 상세" className="searchops-table-section">
        <header className="searchops-table-head">
          <div>
            <h3 style={{ fontSize: 18, margin: 0 }}>Provider 결과 상세</h3>
            <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
              Provider 상태, 수집 시각, 저장된 기록 수를 확인합니다.
            </p>
          </div>
        </header>
        <div className="searchops-table-scroll">
          <table className="searchops-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Provider</th>
                <th>상태</th>
                <th>실행</th>
                <th>수집 시각</th>
                <th>기록</th>
                <th>데모 여부</th>
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
                    <td>{formatConnectorProvider(result.provider)}</td>
                    <td>
                      <ResultStatusPill
                        label={formatStatusLabel(result.status)}
                        tone={getConnectorSyncResultTone(result.status)}
                      />
                    </td>
                    <td className="searchops-code">{result.syncRunId}</td>
                    <td>{formatDateTime(result.fetchedAt)}</td>
                    <td>{result.recordCount}</td>
                    <td>
                      {formatBooleanLabel(result.fixture)}
                      {providerErrorMessage ? (
                        <span style={{ color: "#b91c1c", display: "block", fontSize: 13, marginTop: 6 }}>
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

function ConnectorCommandCenterPanel({
  commandSummary,
  historyErrorMessage,
  historySource,
  liveSetupData,
  pageSpeedCheck,
  summary
}: {
  readonly commandSummary: ReturnType<typeof summarizeConnectorCommandCenter>;
  readonly historyErrorMessage: string | null;
  readonly historySource: string;
  readonly liveSetupData: ProtectedConnectorLiveSetupData;
  readonly pageSpeedCheck: ConnectorLiveSetupCheck | null;
  readonly summary: ReturnType<typeof summarizeConnectorSyncHistory>;
}) {
  const liveModeLabel =
    liveSetupData.report === null
      ? "설정 조회 실패"
      : liveSetupData.report.liveExternalApis === "enabled"
      ? "Live external APIs"
      : "Fixture-safe mode";

  return (
    <section aria-label="커넥터 커맨드 센터 요약" style={commandCenterStyle}>
      <header style={commandCenterHeaderStyle}>
        <div>
          <p style={commandCenterEyebrowStyle}>provider command matrix</p>
          <h3 style={{ fontSize: 22, letterSpacing: 0, lineHeight: 1.15, margin: "6px 0 8px" }}>
            {commandSummary.readyProviders}/{commandSummary.totalProviders} providers ready.
          </h3>
          <p style={{ ...mutedTextStyle, fontSize: 14, maxWidth: 760 }}>
            최신 실행 기준 provider 상태를 먼저 보고, 필요한 provider만 단독 재실행할 수 있습니다.
          </p>
          {historyErrorMessage ? (
            <p style={{ color: "#b91c1c", fontSize: 14, margin: "8px 0 0" }}>
              API 연결 실패: {historyErrorMessage}
            </p>
          ) : null}
          {liveSetupData.errorMessage ? (
            <p style={{ color: "#b91c1c", fontSize: 14, margin: "8px 0 0" }}>
              Live setup 조회 실패: {liveSetupData.errorMessage}
            </p>
          ) : null}
        </div>
        <div style={commandCenterBadgeStackStyle}>
          <span
            style={{
              ...pillStyle,
              background: historySource === "api" ? "#ecfdf5" : "#eef2ff",
              color: historySource === "api" ? "#047857" : "#3730a3"
            }}
          >
            {historySource === "api" ? "Sync API 데이터" : "Sync 데모 데이터"}
          </span>
          <span
            style={{
              ...pillStyle,
              background: liveSetupData.source === "api" ? "#ecfdf5" : "#eef2ff",
              color: liveSetupData.source === "api" ? "#047857" : "#3730a3"
            }}
          >
            {liveSetupData.source === "api" ? "Setup API 데이터" : "Setup 데모 데이터"}
          </span>
          <span style={{ ...pillStyle, background: "#f8fafc", color: "var(--so-muted)" }}>
            {liveModeLabel}
          </span>
        </div>
      </header>
      <div style={commandMetricGridStyle}>
        <CommandMetric label="Ready providers" value={`${commandSummary.readyProviders}/${commandSummary.totalProviders}`} />
        <CommandMetric label="Action required" value={String(commandSummary.actionRequiredProviders)} />
        <CommandMetric label="Blocked" value={String(commandSummary.blockedProviders)} />
        <CommandMetric label="Current records" value={String(commandSummary.currentRecords)} />
        <CommandMetric label="History records" value={String(summary.totalRecords)} />
        <CommandMetric label="Latest run" value={commandSummary.latestRunId ?? "없음"} />
      </div>
      <div style={liveSetupStripStyle}>
        <div>
          <strong style={{ display: "block", fontSize: 14 }}>PageSpeed live setup</strong>
          <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 4 }}>
            {pageSpeedCheck?.summary ?? "PageSpeed 설정을 불러오지 못했습니다."}
          </span>
        </div>
        {pageSpeedCheck ? (
          <LiveSetupStatusPill
            label={formatConnectorLiveSetupStatus(pageSpeedCheck.status)}
            tone={getConnectorLiveSetupTone(pageSpeedCheck.status)}
          />
        ) : <LiveSetupStatusPill label="조회 실패" tone="risk" />}
      </div>
    </section>
  );
}

function ConnectorOperationsPanel({
  canRunSync,
  operations,
  siteId
}: {
  readonly canRunSync: boolean;
  readonly operations: readonly ConnectorOperationGuidance[];
  readonly siteId: string;
}) {
  const action = runConnectorSyncAction.bind(null, siteId);

  return (
    <section aria-label="Provider 운영 상태" style={providerCommandSectionStyle}>
      <header style={providerCommandHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>Provider command cards</h3>
          <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
            Provider별 최근 결과, 기록 수, 다음 조치를 확인하고 단독 실행합니다.
          </p>
        </div>
      </header>
      <div style={providerCommandGridStyle}>
        {operations.map((item) => (
          <article key={item.provider} style={providerCommandCardStyle}>
            <div style={providerCardHeaderStyle}>
              <strong>{formatConnectorProvider(item.provider)}</strong>
              <OperationStatusPill label={formatStatusLabel(item.status)} tone={item.tone} />
            </div>
            <dl style={providerCardMetaStyle}>
              <div>
                <dt style={providerCardMetaLabelStyle}>최근 실행</dt>
                <dd style={{ ...providerCardMetaValueStyle, ...codeTextStyle }}>
                  {item.latestRunId ?? "없음"}
                </dd>
              </div>
              <div>
                <dt style={providerCardMetaLabelStyle}>기록</dt>
                <dd style={providerCardMetaValueStyle}>{item.recordCount}</dd>
              </div>
            </dl>
            <p style={{ fontSize: 14, lineHeight: 1.45, margin: "12px 0 0" }}>{item.message}</p>
            <p style={{ color: "var(--so-muted)", fontSize: 13, lineHeight: 1.45, margin: "6px 0 0" }}>
              {item.nextAction}
            </p>
            {canRunSync ? (
              <form action={action} style={{ marginTop: 14 }}>
                <input name="providers" type="hidden" value={item.provider} />
                <ProviderSyncSubmitButton label={item.retryLabel} style={providerCardButtonStyle} />
              </form>
            ) : (
              <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 14 }}>
                조회 전용
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function CommandMetric({
  label,
  value
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <article style={commandMetricCardStyle}>
      <span style={commandMetricLabelStyle}>{label}</span>
      <strong style={commandMetricValueStyle}>{value}</strong>
    </article>
  );
}

function PageSpeedSetupPanel({
  errorMessage,
  pageSpeedCheck,
  source
}: {
  readonly errorMessage: string | null;
  readonly pageSpeedCheck: ConnectorLiveSetupCheck | null;
  readonly source: string;
}) {
  return (
    <section aria-label="PageSpeed live setup" style={liveSetupPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>PageSpeed live setup</h3>
        <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
          {pageSpeedCheck?.summary ?? "PageSpeed 설정을 불러오지 못했습니다."}
        </p>
        <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
          조치: {pageSpeedCheck?.nextAction ?? "권한과 API 연결 상태를 확인하세요."}
        </p>
        {errorMessage ? (
          <p style={{ color: "#b91c1c", fontSize: 14, marginTop: 8 }}>
            Live setup 조회 실패: {errorMessage}
          </p>
        ) : null}
      </div>
      <div style={liveSetupStatusBoxStyle}>
        {pageSpeedCheck ? (
          <LiveSetupStatusPill
            label={formatConnectorLiveSetupStatus(pageSpeedCheck.status)}
            tone={getConnectorLiveSetupTone(pageSpeedCheck.status)}
          />
        ) : <LiveSetupStatusPill label="조회 실패" tone="risk" />}
        <span style={{ ...codeTextStyle, color: "var(--so-muted)", marginTop: 8 }}>
          {pageSpeedCheck?.envKeys.join(", ") ?? "환경 정보 없음"}
        </span>
        <span
          style={{
            ...pillStyle,
            background: source === "api" ? "#ecfdf5" : "#eef2ff",
            color: source === "api" ? "#047857" : "#3730a3",
            marginTop: 8
          }}
        >
          {source === "api" ? "Live setup API 데이터" : "Live setup 데모 데이터"}
        </span>
      </div>
    </section>
  );
}

// Google 연결이 실패했을 때 "실패했습니다" 만 띄우면 운영자가 손댈 곳을 못 찾는다.
// API 가 돌려준 코드마다 고쳐야 할 자리를 바로 지목한다.
function describeOAuthFailure(reason: string | undefined): string {
  const suffix = reason === undefined ? "" : ` (코드: ${reason})`;
  const message = {
    api_unreachable: "SearchOps API 에 연결하지 못했습니다. API 배포 상태를 확인하세요.",
    forbidden: "현재 역할로는 provider 연결을 변경할 수 없습니다.",
    invalid_response: "API 응답 형식이 예상과 다릅니다. API 버전을 확인하세요.",
    oauth_service_unavailable:
      "API 에 Google OAuth 설정이 없습니다. SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI / _STATE_SECRET 과 자격증명 암호화 키를 확인하세요.",
    oauth_state_store_unavailable:
      "OAuth state 저장소(Redis)에 연결하지 못했습니다. API 의 REDIS_URL 을 확인하세요.",
    // 세션 만료로 단정하면 안 된다. API 가 토큰을 거절하는 이유는 만료 말고도
    // 클레임 부족(user_role 없음)·서명 키 불일치·issuer 불일치가 있고, 실제로
    // 걸린 건 Supabase 기본 토큰에 user_role 이 없던 경우였다.
    unauthorized:
      "API 가 로그인 토큰을 거부했습니다. 다시 로그인해도 같다면 토큰에 user_role 클레임이 없는 것입니다 — scripts/sql/supabase-access-token-hook.sql 을 적용하고 Supabase → Authentication → Hooks 에서 켜세요.",
    validation_error: "돌아갈 주소가 허용되지 않았습니다.",
  }[reason ?? ""];
  return message === undefined
    ? `Google 연결 요청이 실패했습니다.${suffix} 진단: https://api.totopapa.com/ops/deployment`
    : message + suffix;
}

function ProviderBindingsPanel({
  accounts,
  bindingStatus,
  canManage,
  connectors,
  loadFailed,
  oauthReason,
  oauthStatus,
  siteId,
}: {
  readonly accounts: readonly ProviderAccountSummary[];
  readonly bindingStatus: string | undefined;
  readonly canManage: boolean;
  readonly connectors: readonly SiteConnector[];
  readonly loadFailed: boolean;
  readonly oauthReason: string | undefined;
  readonly oauthStatus: string | undefined;
  readonly siteId: string;
}) {
  const connectorByProvider = new Map(connectors.map((item) => [item.provider, item]));
  const googleAccounts = accounts.filter((account) => account.provider === "google");
  const bingAccounts = accounts.filter((account) => account.provider === "bing");
  const geoAccounts = accounts.filter(
    (account) => account.provider.startsWith("geo_") && account.status === "connected",
  );
  const oauthPath = createGoogleOAuthStartPath(siteId, ["gsc", "ga4"]);
  // 커넥터 관련 읽기·쓰기는 전부 provider-accounts.ts 의 request() 를 지나고,
  // 거기서 API base URL 이 없으면 not_configured 로 즉시 던진다.
  const connectorsConfigured = getApiBaseUrl() !== null;
  const feedbackMessage = {
    deleted: "사이트 연결을 해제했습니다.",
    failed: "사이트 연결 요청을 처리하지 못했습니다.",
    saved: "사이트 연결을 저장했습니다.",
  }[bindingStatus ?? ""] ?? (
    oauthStatus === "connected" ? "Google 계정을 연결했습니다." : null
  );
  const oauthFailureMessage =
    oauthStatus === "failed" ? describeOAuthFailure(oauthReason) : null;

  return (
    <section aria-label="사이트 Provider 연결" style={bindingSectionStyle}>
      <header style={bindingHeaderStyle}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0 }}>사이트 Provider 연결</h3>
          <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
            현재 역할: {canManage ? "변경 가능" : "조회 전용"}
          </p>
          {/* 커넥터는 이 모드에서 동작할 수 없다. 그런데 화면은 비활성 버튼과
              ?oauth=not_configured 만 보여줘서 이유를 알 방법이 없었다. 되지 않는
              이유를 그 자리에서 말한다 — 죽은 컨트롤만 두는 것보다 낫다. */}
          {connectorsConfigured ? null : (
            <p style={bindingErrorStyle}>
              커넥터 연동은 이 모드(DB 직접 연결)에서 설정할 수 없습니다. SearchOps API,
              Google OAuth 설정, 자격증명 암호화 키가 모두 있어야 하는데, 암호화 키는
              프론트가 뚫리면 전 테넌트의 연동 토큰이 한 번에 풀리므로 Vercel 에 두지
              않습니다. 설계 근거와 대안은 docs/WEB_DIRECT_DB.md 에 있습니다.
            </p>
          )}
          {connectorsConfigured && loadFailed ? (
            <p style={bindingErrorStyle}>연결 정보를 불러오지 못했습니다.</p>
          ) : null}
          {oauthFailureMessage ? (
            <p role="status" style={bindingErrorStyle}>{oauthFailureMessage}</p>
          ) : null}
          {feedbackMessage ? <p aria-live="polite" style={bindingFeedbackStyle}>{feedbackMessage}</p> : null}
        </div>
        {canManage && oauthPath && connectorsConfigured ? (
          <a href={oauthPath} style={oauthLinkButtonStyle}>Google 연결 / 재연결</a>
        ) : null}
      </header>
      <div style={bindingRowsStyle}>
        <ConnectorBindingControl
          accounts={filterGoogleProviderAccounts(googleAccounts, "gsc")}
          canManage={canManage}
          connector={connectorByProvider.get("gsc") ?? null}
          label="GSC"
          placeholder="sc-domain:example.com 또는 URL-prefix"
          provider="gsc"
          siteId={siteId}
        />
        <ConnectorBindingControl
          accounts={filterGoogleProviderAccounts(googleAccounts, "ga4")}
          canManage={canManage}
          connector={connectorByProvider.get("ga4") ?? null}
          label="GA4"
          placeholder="123456789 또는 properties/123456789"
          provider="ga4"
          siteId={siteId}
        />
        <ConnectorBindingControl
          accounts={bingAccounts.filter((account) => account.status === "connected")}
          canManage={canManage}
          connector={connectorByProvider.get("bing") ?? null}
          label="Bing"
          placeholder="https://example.com/"
          provider="bing"
          siteId={siteId}
        />
        <ReadonlyBindingRow label="PageSpeed" status="SearchOps 플랫폼 관리" />
        <ReadonlyBindingRow
          label="GEO"
          status={
            geoAccounts.length > 0
              ? `조직 BYOK: ${geoAccounts.map((account) => formatProviderAccountProvider(account.provider)).join(", ")}`
              : "SearchOps 플랫폼"
          }
        />
      </div>
    </section>
  );
}

function ConnectorBindingControl({
  accounts,
  canManage,
  connector,
  label,
  placeholder,
  provider,
  siteId,
}: {
  readonly accounts: readonly ProviderAccountSummary[];
  readonly canManage: boolean;
  readonly connector: SiteConnector | null;
  readonly label: string;
  readonly placeholder: string;
  readonly provider: SiteConnectorProvider;
  readonly siteId: string;
}) {
  const saveAction = saveSiteConnectorAction.bind(null, siteId);
  const deleteAction = deleteSiteConnectorAction.bind(null, siteId);
  const selectedAccount = accounts.find((account) => account.id === connector?.providerAccountId);
  const status = connector?.status ?? "needs_configuration";

  return (
    <div className={bindingStyles.bindingRow}>
      <div>
        <strong>{label}</strong>
        <span style={{ ...mutedTextStyle, display: "block", fontSize: 13, marginTop: 4 }}>
          {formatSiteConnectorStatus(status)}
        </span>
      </div>
      {canManage ? (
        <form action={saveAction} className={bindingStyles.bindingForm}>
          <input name="provider" type="hidden" value={provider} />
          <label htmlFor={`${siteId}-${provider}-account`}>계정</label>
          <select
            defaultValue={selectedAccount?.id ?? ""}
            disabled={accounts.length === 0}
            id={`${siteId}-${provider}-account`}
            name="providerAccountId"
            required
            style={bindingInputStyle}
          >
            <option value="">선택</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}{account.accountEmail ? ` (${account.accountEmail})` : ""}
              </option>
            ))}
          </select>
          <label htmlFor={`${siteId}-${provider}-resource`}>리소스</label>
          {/* 계정이 없으면 저장이 불가능한데 입력만 살아 있었다. 타이핑은 되는데
              저장 버튼이 죽어 있으니 "왜 저장이 안 되냐" 로만 보인다. 같이 잠근다. */}
          <input
            defaultValue={connector?.externalResourceId ?? ""}
            disabled={accounts.length === 0}
            id={`${siteId}-${provider}-resource`}
            name="externalResourceId"
            placeholder={placeholder}
            required
            style={bindingInputStyle}
            type={provider === "bing" ? "url" : "text"}
          />
          <ConnectorBindingSubmitButton disabled={accounts.length === 0} label="저장" />
        </form>
      ) : (
        <div className={bindingStyles.bindingReadOnly}>
          <span>{selectedAccount?.displayName ?? "계정 미지정"}</span>
          <span>{connector?.externalResourceId ?? "리소스 미지정"}</span>
        </div>
      )}
      {canManage && connector ? (
        <form action={deleteAction}>
          <input name="provider" type="hidden" value={provider} />
          <ConnectorBindingSubmitButton label="해제" tone="danger" />
        </form>
      ) : <span />}
    </div>
  );
}

function ReadonlyBindingRow({ label, status }: { readonly label: string; readonly status: string }) {
  return (
    <div className={bindingStyles.bindingRow}>
      <strong>{label}</strong>
      <span className={bindingStyles.readonlyStatus}>{status}</span>
    </div>
  );
}

function formatSiteConnectorStatus(status: SiteConnector["status"]): string {
  return {
    connected: "연결됨",
    error: "확인 필요",
    expired: "만료",
    needs_configuration: "설정 필요",
    revoked: "해제됨",
  }[status];
}

function ConnectorSyncTriggerPanel({
  canRunSync,
  siteId,
  triggerFeedback
}: {
  readonly canRunSync: boolean;
  readonly siteId: string;
  readonly triggerFeedback: ReturnType<typeof getConnectorSyncTriggerFeedback>;
}) {
  const action = runConnectorSyncAction.bind(null, siteId);

  return (
    <section aria-label="커넥터 동기화 실행" style={triggerPanelStyle}>
      <div>
        <h3 style={{ fontSize: 18, margin: 0 }}>커넥터 동기화 실행</h3>
        <p style={{ ...mutedTextStyle, fontSize: 14, marginTop: 6 }}>
          선택한 provider에 대해 결정론적 데모 기반 동기화 작업을 대기열에 등록합니다.
        </p>
        {triggerFeedback ? (
          <p style={{ ...triggerFeedbackStyle[triggerFeedback.tone], margin: "10px 0 0" }}>
            {triggerFeedback.message}
          </p>
        ) : null}
      </div>
      {canRunSync ? (
        <>
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
          <div style={quickProviderActionsStyle}>
            {connectorProviderOptions.map((provider) => (
              <form action={action} key={provider}>
                <input name="providers" type="hidden" value={provider} />
                <ProviderSyncSubmitButton
                  label={`${formatConnectorProvider(provider)}만 실행`}
                  style={quickProviderButtonStyle}
                />
              </form>
            ))}
          </div>
        </>
      ) : (
        <p style={{ ...mutedTextStyle, fontSize: 14, margin: 0 }}>조회 전용</p>
      )}
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
    queued: { background: "#f8fafc", color: "var(--so-muted)" }
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
    partial: { background: "#fff7ed", color: "#c2410c" },
    setup: { background: "#fefce8", color: "#a16207" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function LiveSetupStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorLiveSetupTone;
}) {
  const toneStyle = {
    missing: { background: "#fefce8", color: "#a16207" },
    ready: { background: "#ecfdf5", color: "#047857" },
    risk: { background: "#fef2f2", color: "#b91c1c" },
    warning: { background: "#fff7ed", color: "#c2410c" }
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

function OperationStatusPill({
  label,
  tone
}: {
  readonly label: string;
  readonly tone: ConnectorOperationTone;
}) {
  const toneStyle = {
    failed: { background: "#fef2f2", color: "#b91c1c" },
    idle: { background: "#f8fafc", color: "var(--so-muted)" },
    ok: { background: "#ecfdf5", color: "#047857" },
    partial: { background: "#fff7ed", color: "#c2410c" },
    queued: { background: "#eef2ff", color: "#3730a3" },
    setup: { background: "#fefce8", color: "#a16207" }
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

const commandCenterStyle = {
  background: "#f8fafc",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  marginTop: 4,
  padding: 18
} as const;

const commandCenterHeaderStyle = {
  alignItems: "start",
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))"
} as const;

const commandCenterBadgeStackStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexDirection: "column",
  gap: 8
} as const;

const commandCenterEyebrowStyle = {
  color: "var(--so-muted)",
  fontSize: 13,
  fontWeight: 600,
  margin: 0,
  } as const;

const commandMetricGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  marginTop: 16
} as const;

const commandMetricCardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  minHeight: 82,
  padding: 12
} as const;

const commandMetricLabelStyle = {
  color: "var(--so-muted)",
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  } as const;

const commandMetricValueStyle = {
  display: "block",
  fontSize: 22,
  lineHeight: 1.05,
  marginTop: 8,
  overflowWrap: "anywhere"
} as const;

const liveSetupStripStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  marginTop: 12,
  padding: 12
} as const;

const providerCommandSectionStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  marginTop: 14,
  overflow: "hidden"
} as const;

const providerCommandHeaderStyle = {
  borderBottom: "1px solid #dbe4ef",
  padding: 16
} as const;

const providerCommandGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
  padding: 16
} as const;

const providerCommandCardStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  minHeight: 248,
  padding: 14
} as const;

const providerCardHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: 8,
  justifyContent: "space-between"
} as const;

const providerCardMetaStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "minmax(0, 1fr) auto",
  margin: "14px 0 0"
} as const;

const providerCardMetaLabelStyle = {
  color: "var(--so-muted)",
  fontSize: 13,
  margin: 0
} as const;

const providerCardMetaValueStyle = {
  fontSize: 14,
  fontWeight: 600,
  margin: "4px 0 0",
  overflowWrap: "anywhere"
} as const;

const bindingSectionStyle = {
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  marginTop: 14,
  overflow: "hidden",
} as const;

const bindingHeaderStyle = {
  alignItems: "center",
  borderBottom: "1px solid #dbe4ef",
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  padding: 16,
} as const;

const bindingRowsStyle = { display: "grid" } as const;

const bindingInputStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  minHeight: 38,
  minWidth: 0,
  padding: "8px 10px",
  width: "100%",
} as const;

const bindingErrorStyle = { color: "#b91c1c", fontSize: 14, margin: "8px 0 0" } as const;
const bindingFeedbackStyle = { color: "#047857", fontSize: 14, margin: "8px 0 0" } as const;

const liveSetupPanelStyle = {
  alignItems: "start",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const liveSetupStatusBoxStyle = {
  alignItems: "flex-start",
  display: "flex",
  flexDirection: "column",
  minWidth: 220
} as const;

const oauthLinkButtonStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "var(--so-ink)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  minHeight: 36,
  padding: "8px 14px",
  textDecoration: "none",
  whiteSpace: "nowrap" as const
} as const;

const triggerPanelStyle = {
  alignItems: "start",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  marginTop: 14,
  padding: 16
} as const;

const triggerFormStyle = {
  alignItems: "end",
  display: "grid",
  gap: 12,
  justifyItems: "end"
} as const;

const quickProviderActionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  gridColumn: "1 / -1",
  justifyContent: "end"
} as const;

const quickProviderButtonStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "var(--so-ink)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  minHeight: 32,
  padding: "6px 10px"
} as const;

const providerCardButtonStyle = {
  ...quickProviderButtonStyle,
  width: "100%"
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
  color: "var(--so-muted)",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 8,
  width: "100%"
} as const;

const providerOptionStyle = {
  alignItems: "center",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "var(--so-ink)",
  display: "inline-flex",
  fontSize: 14,
  fontWeight: 700,
  gap: 6,
  minHeight: 34,
  padding: "7px 9px"
} as const;

const triggerFeedbackStyle = {
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
