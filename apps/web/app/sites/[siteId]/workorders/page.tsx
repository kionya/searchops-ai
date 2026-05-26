import type { CSSProperties } from "react";

import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

import {
  MetricCard,
  metricGridStyle,
  SectionHeader
} from "../../../../src/dashboard-shell";
import { formatOwnerLabel } from "../../../../src/korean-labels";
import {
  canRecheckWorkOrder,
  demoWorkOrders,
  formatDate,
  formatPriority,
  groupWorkOrdersByStatus,
  summarizeWorkOrders,
  workOrderColumns
} from "../../../../src/work-order-board";

const mutedText: CSSProperties = {
  color: "#64748b",
  margin: 0
};

const sectionHeaderStyle: CSSProperties = {
  alignItems: "end",
  display: "flex",
  gap: 16,
  justifyContent: "space-between",
  marginBottom: 14
};

const badgeBaseStyle: CSSProperties = {
  borderRadius: 999,
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  padding: "7px 9px",
  whiteSpace: "nowrap"
};

const statusBadgeStyles: Record<WorkOrderStatus, CSSProperties> = {
  open: { background: "#eff6ff", color: "#1d4ed8" },
  in_progress: { background: "#ecfdf5", color: "#047857" },
  in_review: { background: "#fefce8", color: "#a16207" },
  done: { background: "#f1f5f9", color: "#475569" },
  blocked: { background: "#fef2f2", color: "#b91c1c" }
};

const priorityBadgeStyles: Record<WorkOrderPriority, CSSProperties> = {
  p0: { background: "#111827", color: "#ffffff" },
  p1: { background: "#fee2e2", color: "#b91c1c" },
  p2: { background: "#ffedd5", color: "#c2410c" },
  p3: { background: "#eef2ff", color: "#4338ca" }
};

const statusLabels: Record<WorkOrderStatus, string> = {
  open: "열림",
  in_progress: "진행 중",
  in_review: "검수 중",
  done: "완료",
  blocked: "차단됨"
};

export default function WorkOrdersPage() {
  const workOrders = demoWorkOrders;
  const groupedWorkOrders = groupWorkOrdersByStatus(workOrders);
  const summary = summarizeWorkOrders(workOrders);

  return (
    <>
      <SectionHeader
        description="생성된 SEO 작업 지시서의 칸반/목록, 담당 인계, 마감일, 재검수 액션을 관리합니다."
        eyebrow="작업 지시서"
        title="작업 지시서 보드"
      />
      <section
        aria-label="작업 지시서 지표"
        style={metricGridStyle}
      >
        <MetricCard label="전체" value={String(summary.total)} />
        <MetricCard label="긴급" value={String(summary.urgent)} />
        <MetricCard label="검수 중" value={String(summary.inReview)} />
        <MetricCard label="차단됨" value={String(summary.blocked)} />
      </section>

      <section aria-labelledby="board-heading" style={{ marginTop: 28 }}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 id="board-heading" style={{ fontSize: 22, margin: 0 }}>
              칸반 보드
            </h2>
            <p style={{ ...mutedText, marginTop: 4 }}>진행 대상 작업 지시서 {summary.active}개</p>
          </div>
          <span style={{ color: "#475569", fontSize: 14 }}>진행 중 {summary.inProgress}개</span>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(5, minmax(180px, 1fr))",
            overflowX: "auto",
            paddingBottom: 4
          }}
        >
          {workOrderColumns.map((column) => (
            <section
              aria-label={`${column.label} 작업 지시서`}
              key={column.status}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                minHeight: 280,
                minWidth: 180,
                padding: 12
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12
                }}
              >
                <h3 style={{ fontSize: 14, margin: 0 }}>{column.label}</h3>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  {groupedWorkOrders[column.status].length}
                </span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {groupedWorkOrders[column.status].map((workOrder) => (
                  <WorkOrderCard key={workOrder.id} workOrder={workOrder} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="list-heading" style={{ marginTop: 32 }}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 id="list-heading" style={{ fontSize: 22, margin: 0 }}>
              목록
            </h2>
            <p style={{ ...mutedText, marginTop: 4 }}>총 작업 지시서 {summary.total}개</p>
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {["작업 지시서", "상태", "담당", "마감", "근거", "검수 방법"].map(
                  (heading) => (
                    <th
                      key={heading}
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        color: "#475569",
                        fontSize: 12,
                        padding: "11px 12px",
                        textAlign: "left",
                        textTransform: "uppercase"
                      }}
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sortForList(workOrders).map((workOrder) => (
                <tr key={workOrder.id}>
                  <td style={tableCellStyle}>
                    <strong style={{ display: "block", marginBottom: 4 }}>{workOrder.title}</strong>
                    <span style={{ color: "#64748b", fontSize: 13 }}>
                      {formatPriority(workOrder.priority)} - {workOrder.estimatedEffort.toUpperCase()}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    <Badge style={statusBadgeStyles[workOrder.status]}>
                      {statusLabels[workOrder.status]}
                    </Badge>
                  </td>
                  <td style={tableCellStyle}>{formatOwnerLabel(workOrder.ownerType)}</td>
                  <td style={tableCellStyle}>{formatDate(workOrder.dueDate)}</td>
                  <td style={{ ...tableCellStyle, maxWidth: 230 }}>
                    {workOrder.evidence?.url ?? "URL 근거 없음"}
                  </td>
                  <td style={{ ...tableCellStyle, maxWidth: 260 }}>
                    {workOrder.verificationMethod}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const tableCellStyle: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  color: "#172033",
  fontSize: 14,
  padding: 12,
  verticalAlign: "top"
};

function WorkOrderCard({ workOrder }: { readonly workOrder: WorkOrder }) {
  return (
    <article style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 10 }}>
        <Badge style={priorityBadgeStyles[workOrder.priority]}>
          {formatPriority(workOrder.priority)}
        </Badge>
        <span style={{ color: "#64748b", fontSize: 12 }}>{formatOwnerLabel(workOrder.ownerType)}</span>
      </div>
      <h4 style={{ fontSize: 15, lineHeight: 1.35, margin: "0 0 8px" }}>{workOrder.title}</h4>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.45, margin: "0 0 10px" }}>
        {workOrder.problem}
      </p>
      <dl style={{ display: "grid", gap: 8, margin: 0 }}>
        <div>
          <dt style={{ color: "#64748b", fontSize: 11, marginBottom: 3 }}>마감</dt>
          <dd style={{ fontSize: 13, margin: 0 }}>{formatDate(workOrder.dueDate)}</dd>
        </div>
        <div>
          <dt style={{ color: "#64748b", fontSize: 11, marginBottom: 3 }}>URL</dt>
          <dd
            style={{
              color: "#334155",
              fontSize: 12,
              margin: 0,
              overflowWrap: "anywhere"
            }}
          >
            {workOrder.evidence?.url ?? "URL 근거 없음"}
          </dd>
        </div>
      </dl>
      <button
        aria-label={`${workOrder.title} 재검수`}
        disabled={!canRecheckWorkOrder(workOrder)}
        style={{
          background: canRecheckWorkOrder(workOrder) ? "#2563eb" : "#e2e8f0",
          border: 0,
          borderRadius: 6,
          color: canRecheckWorkOrder(workOrder) ? "#ffffff" : "#64748b",
          cursor: canRecheckWorkOrder(workOrder) ? "pointer" : "not-allowed",
          fontSize: 13,
          fontWeight: 700,
          marginTop: 12,
          minHeight: 34,
          padding: "8px 10px",
          width: "100%"
        }}
        type="button"
      >
        {workOrder.status === "done" ? "해결됨" : "재검수"}
      </button>
    </article>
  );
}

function Badge({
  children,
  style
}: {
  readonly children: string;
  readonly style: CSSProperties;
}) {
  return <span style={{ ...badgeBaseStyle, ...style }}>{children}</span>;
}

function sortForList(workOrders: readonly WorkOrder[]) {
  return [...workOrders].sort((left, right) => left.status.localeCompare(right.status));
}
