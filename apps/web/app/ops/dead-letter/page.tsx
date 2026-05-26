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
        Back to sites
      </Link>
      <section aria-labelledby="dead-letter-heading" style={{ marginTop: 18 }}>
        <SectionHeader
          description="Failed worker job metadata across crawl, connector, GEO, and schema validation queues."
          eyebrow="Operations"
          title="Dead-letter jobs"
        />
        <div style={metricGridStyle}>
          <MetricCard label="Dead-letter entries" value={String(operations.summary.total)} />
          <MetricCard label="Queues affected" value={String(operations.summary.queueCount)} />
          <MetricCard label="Waiting" value={String(operations.summary.waiting)} />
          <MetricCard label="Failed entries" value={String(operations.summary.failed)} />
        </div>
        <section aria-label="Dead-letter status" style={tableSectionStyle}>
          <header style={tableHeaderStyle}>
            <div>
              <h3 id="dead-letter-heading" style={{ fontSize: 18, margin: 0 }}>
                Worker failure queue
              </h3>
              <p style={{ ...mutedTextStyle, fontSize: 13, marginTop: 6 }}>
                Latest failure: {formatDeadLetterDate(operations.summary.latestFailure)}
              </p>
              {operations.errorMessage ? (
                <p style={{ color: "#b91c1c", fontSize: 13, margin: "6px 0 0" }}>
                  API fallback: {operations.errorMessage}
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
              {operations.source === "api" ? "API data" : "Fixture data"}
            </span>
          </header>
          <div style={tableScrollStyle}>
            <table style={{ ...tableStyle, minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Original job</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Original queue</th>
                  <th style={thStyle}>Attempts</th>
                  <th style={thStyle}>Failed at</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Operation</th>
                </tr>
              </thead>
              <tbody>
                {operations.deadLetterJobs.map((job) => (
                  <tr key={job.id}>
                    <td style={tdStyle}>
                      <strong>{job.payload.originalJobName}</strong>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        {job.payload.originalJobId ?? "unknown original id"}
                      </span>
                      <span style={{ ...codeTextStyle, color: "#64748b", display: "block", marginTop: 3 }}>
                        dead-letter {job.jobId ?? "unknown"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <DeadLetterStatusPill
                        label={job.status}
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
                          Clear
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
