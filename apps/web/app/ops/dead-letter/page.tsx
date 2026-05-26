import Link from "next/link";

import {
  MetricCard,
  metricGridStyle,
  mutedTextStyle,
  pageStyle,
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
  getDeadLetterStatusTone,
  loadDeadLetterOperations,
  type DeadLetterStatusTone,
} from "../../../src/dead-letter-operations";
import { clearDeadLetterJobAction } from "./actions";

interface DeadLetterPageProps {
  readonly searchParams: Promise<{
    readonly clear?: string;
    readonly jobId?: string;
  }>;
}

export default async function DeadLetterOperationsPage({
  searchParams,
}: DeadLetterPageProps) {
  const params = await searchParams;
  const operations = await loadDeadLetterOperations();
  const feedback = getDeadLetterClearFeedback(params.clear, params.jobId);

  return (
    <main style={pageStyle}>
      <Link href="/sites" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none" }}>
        사이트 목록으로
      </Link>
      <section aria-labelledby="실패 작업-heading" style={{ marginTop: 18 }}>
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
                      <form action={clearDeadLetterJobAction}>
                        <input name="id" type="hidden" value={job.id} />
                        <button style={clearButtonStyle} type="submit">
                          정리
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
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
  background: "#172033",
  border: 0,
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  minHeight: 34,
  padding: "8px 12px",
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
