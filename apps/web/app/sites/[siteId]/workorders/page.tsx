import type { CSSProperties } from "react";

import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

import {
  MetricCard,
  metricGridStyle,
  SectionHeader
} from "../../../../src/dashboard-shell";
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
  open: "Open",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  blocked: "Blocked"
};

export default function WorkOrdersPage() {
  const workOrders = demoWorkOrders;
  const groupedWorkOrders = groupWorkOrdersByStatus(workOrders);
  const summary = summarizeWorkOrders(workOrders);

  return (
    <>
      <SectionHeader
        description="Kanban and list views for generated SEO work orders, owner handoff, due dates, and recheck actions."
        eyebrow="Work Orders"
        title="Work order board"
      />
      <section
        aria-label="Work order metrics"
        style={metricGridStyle}
      >
        <MetricCard label="Total" value={String(summary.total)} />
        <MetricCard label="Urgent" value={String(summary.urgent)} />
        <MetricCard label="In review" value={String(summary.inReview)} />
        <MetricCard label="Blocked" value={String(summary.blocked)} />
      </section>

      <section aria-labelledby="board-heading" style={{ marginTop: 28 }}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 id="board-heading" style={{ fontSize: 22, margin: 0 }}>
              Kanban board
            </h2>
            <p style={{ ...mutedText, marginTop: 4 }}>{summary.active} active work orders</p>
          </div>
          <span style={{ color: "#475569", fontSize: 14 }}>{summary.inProgress} in progress</span>
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
              aria-label={`${column.label} work orders`}
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
              List
            </h2>
            <p style={{ ...mutedText, marginTop: 4 }}>{summary.total} total work orders</p>
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {["Work order", "Status", "Owner", "Due", "Evidence", "Verification"].map(
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
                  <td style={tableCellStyle}>{workOrder.ownerType}</td>
                  <td style={tableCellStyle}>{formatDate(workOrder.dueDate)}</td>
                  <td style={{ ...tableCellStyle, maxWidth: 230 }}>
                    {workOrder.evidence?.url ?? "No URL evidence"}
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
        <span style={{ color: "#64748b", fontSize: 12 }}>{workOrder.ownerType}</span>
      </div>
      <h4 style={{ fontSize: 15, lineHeight: 1.35, margin: "0 0 8px" }}>{workOrder.title}</h4>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.45, margin: "0 0 10px" }}>
        {workOrder.problem}
      </p>
      <dl style={{ display: "grid", gap: 8, margin: 0 }}>
        <div>
          <dt style={{ color: "#64748b", fontSize: 11, marginBottom: 3 }}>Due</dt>
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
            {workOrder.evidence?.url ?? "No URL evidence"}
          </dd>
        </div>
      </dl>
      <button
        aria-label={`Recheck ${workOrder.title}`}
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
        {workOrder.status === "done" ? "Resolved" : "Recheck"}
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
