import Link from "next/link";

import {
  AppWorkspaceFrame,
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  SectionHeader,
} from "../../../src/dashboard-shell";
import {
  codeTextStyle,
  pillStyle,
  tableHeaderStyle,
  tableScrollStyle,
  tableSectionStyle,
  tableStyle,
  tdStyle,
  thStyle,
} from "../../../src/dashboard-table-styles";
import { formatStatusLabel } from "../../../src/korean-labels";
import {
  formatDeadLetterDate,
  getDeadLetterClearFeedback,
  getDeadLetterReplayFeedback,
  getDeadLetterStatusTone,
  loadDeadLetterReplayPlan,
  loadDeadLetterOperations,
  type DeadLetterStatusTone,
} from "../../../src/dead-letter-operations";
import { clearDeadLetterJobAction, planDeadLetterReplayAction } from "./actions";

interface DeadLetterPageProps {
  readonly searchParams: Promise<{
    readonly clear?: string;
    readonly jobId?: string;
    readonly planId?: string;
    readonly replay?: string;
    readonly replayJobId?: string;
  }>;
}

export default async function DeadLetterOperationsPage({
  searchParams,
}: DeadLetterPageProps) {
  const params = await searchParams;
  const operations = await loadDeadLetterOperations();
  const feedback = getDeadLetterClearFeedback(params.clear, params.jobId);
  const replayFeedback = getDeadLetterReplayFeedback(
    params.replay,
    params.replayJobId,
    params.planId,
  );
  const replayPlan =
    params.replayJobId === undefined ? null : await loadDeadLetterReplayPlan(params.replayJobId);

  return (
    <AppWorkspaceFrame
      actions={
        <Link className="searchops-button secondary" href="/ops">
          운영 콘솔로
        </Link>
      }
      description="크롤링, 커넥터, GEO, 스키마 검증 큐에서 실패한 워커 작업 메타데이터를 확인합니다."
      eyebrow="Operations"
      title="실패 작업 관리"
    >
      <section aria-labelledby="실패 작업-heading">
        <SectionHeader
          description="크롤링, 커넥터, GEO, 스키마 검증 큐에서 실패한 워커 작업 메타데이터를 확인합니다."
          eyebrow="운영"
          title="실패 작업 관리"
        />
        <div style={metricGridStyle}>
          <MetricCard label="실패 작업 항목" value={String(operations.summary.total)} />
          <MetricCard label="영향받은 큐" value={String(operations.summary.queueCount)} />
          <MetricCard label="대기 중" value={String(operations.summary.waiting)} />
          <MetricCard label="실패 항목" value={String(operations.summary.failed)} />
        </div>
        <section aria-label="실패 작업 상태" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="실패 작업-heading" style={{ fontSize: 18, margin: 0 }}>
                워커 실패 큐
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                최근 실패: {formatDeadLetterDate(operations.summary.latestFailure)}
              </p>
              {operations.errorMessage ? (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                  API 연결 실패: {operations.errorMessage}
                </p>
              ) : null}
              {feedback ? (
                <p style={{ ...feedbackStyle[feedback.tone], margin: "8px 0 0" }}>
                  {feedback.message}
                </p>
              ) : null}
              {replayFeedback ? (
                <p style={{ ...feedbackStyle[replayFeedback.tone], margin: "8px 0 0" }}>
                  {replayFeedback.message}
                </p>
              ) : null}
            </div>
            <span
              style={{
                ...pillStyle,
                background: operations.source === "api" ? "#ecfdf5" : "#eef2ff",
                color: operations.source === "api" ? "#047857" : "#3730a3",
              }}
            >
              {operations.source === "api" ? "API 데이터" : "데모 데이터"}
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={thStyle}>원본 작업</th>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>원본 큐</th>
                  <th style={thStyle}>시도 횟수</th>
                  <th style={thStyle}>실패 시각</th>
                  <th style={thStyle}>사유</th>
                  <th style={thStyle}>작업</th>
                </tr>
              </thead>
              <tbody>
                {operations.deadLetterJobs.map((job) => (
                  <tr key={job.id}>
                    <td style={tdStyle}>
                      <strong>{job.payload.originalJobName}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {job.payload.originalJobId ?? "알 수 없는 원본 ID"}
                      </span>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        실패 작업 {job.jobId ?? "알 수 없음"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <DeadLetterStatusPill
                        label={formatStatusLabel(job.status)}
                        tone={getDeadLetterStatusTone(job.status)}
                      />
                    </td>
                    <td style={{ ...tdStyle, ...codeTextStyle }}>{job.payload.originalQueue}</td>
                    <td style={tdStyle}>{job.payload.attemptsMade}</td>
                    <td style={tdStyle}>{formatDeadLetterDate(job.payload.failedAt)}</td>
                    <td style={tdStyle}>{job.payload.failedReason}</td>
                    <td style={tdStyle}>
                      <div style={actionGroupStyle}>
                        <form action={planDeadLetterReplayAction}>
                          <input name="id" type="hidden" value={job.id} />
                          <button style={secondaryButtonStyle} type="submit">
                            재실행 계획
                          </button>
                        </form>
                        <form action={clearDeadLetterJobAction}>
                          <input name="id" type="hidden" value={job.id} />
                          <button style={clearButtonStyle} type="submit">
                            정리
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {replayPlan?.plan ? (
          <section aria-label="재실행 계획" style={tableSectionStyle}>
            <header style={tableHeaderStyle}>
              <div>
                <h3 style={{ fontSize: 18, margin: 0 }}>재실행 계획</h3>
                <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                  dead-letter metadata만으로는 고객/provider payload를 재구성하지 않습니다.
                </p>
                {replayPlan.errorMessage ? (
                  <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                    계획 조회 실패: {replayPlan.errorMessage}
                  </p>
                ) : null}
              </div>
              <span
                style={{
                  ...pillStyle,
                  background: replayPlan.plan.status === "ready" ? "#ecfdf5" : "#fff7ed",
                  color: replayPlan.plan.status === "ready" ? "#047857" : "#c2410c",
                }}
              >
                {replayPlan.plan.status === "ready" ? "준비됨" : "차단됨"}
              </span>
            </header>
            <div style={tableScrollStyle}>
              <table style={{ ...tableStyle, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>단계</th>
                    <th style={thStyle}>상태</th>
                    <th style={thStyle}>설명</th>
                    <th style={thStyle}>명령</th>
                  </tr>
                </thead>
                <tbody>
                  {replayPlan.plan.steps.map((step) => (
                    <tr key={step.id}>
                      <td style={tdStyle}>
                        <strong>{step.title}</strong>
                        <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                          {step.id}
                        </span>
                      </td>
                      <td style={tdStyle}>{step.status}</td>
                      <td style={tdStyle}>{step.description}</td>
                      <td style={{ ...tdStyle, ...codeTextStyle }}>{step.command ?? "수동 확인"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </AppWorkspaceFrame>
  );
}

function DeadLetterStatusPill({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: DeadLetterStatusTone;
}) {
  const toneStyle = {
    done: { background: "#ecfdf5", color: "#047857" },
    failed: { background: "#fef2f2", color: "#b91c1c" },
    queued: { background: "#f8fafc", color: "#475569" },
    running: { background: "#eff6ff", color: "#1d4ed8" },
  }[tone];

  return <span style={{ ...pillStyle, ...toneStyle }}>{label}</span>;
}

const clearButtonStyle = {
  background: "#111827",
  border: "1px solid #111827",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 34,
  padding: "8px 12px",
} as const;

const secondaryButtonStyle = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  color: "#0f172a",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 34,
  padding: "8px 12px",
} as const;

const actionGroupStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

const feedbackStyle = {
  info: {
    color: "#3730a3",
    fontSize: 13,
  },
  success: {
    color: "#047857",
    fontSize: 13,
  },
  warning: {
    color: "#b91c1c",
    fontSize: 13,
  },
} as const;
