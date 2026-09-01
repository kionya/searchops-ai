import type { CSSProperties } from "react";

import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

import {
  loadDashboardSite,
  MetricCard,
  metricGridStyle,
  SectionHeader
} from "../../../../src/dashboard-shell";
import { formatOwnerLabel } from "../../../../src/korean-labels";
import {
  formatDate,
  formatPriority,
  groupWorkOrdersByStatus,
  loadSiteWorkOrderBoard,
  summarizeWorkOrders,
  workOrderColumns
} from "../../../../src/work-order-board";
import { updateWorkOrderStatusAction } from "./actions";

const mutedText: CSSProperties = {
  color: "var(--so-muted)",
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
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1,
  padding: "7px 9px",
  whiteSpace: "nowrap"
};

const statusBadgeStyles: Record<WorkOrderStatus, CSSProperties> = {
  open: { background: "#eff6ff", color: "#1d4ed8" },
  in_progress: { background: "#ecfdf5", color: "#047857" },
  in_review: { background: "#fefce8", color: "#a16207" },
  done: { background: "#f1f5f9", color: "var(--so-muted)" },
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

interface WorkOrdersPageProps {
  readonly params: Promise<{
    readonly siteId: string;
  }>;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkOrdersPage({ params, searchParams }: WorkOrdersPageProps) {
  const { siteId } = await params;
  const statusChange = readStatusChange(await searchParams);
  const site = await loadDashboardSite(siteId);
  const board = await loadSiteWorkOrderBoard(site);
  const workOrders = board.workOrders;
  const groupedWorkOrders = groupWorkOrdersByStatus(workOrders);
  const summary = summarizeWorkOrders(workOrders);

  return (
    <>
      <SectionHeader
        description="생성된 SEO 작업 지시서의 칸반/목록, 담당 인계, 마감일, 재검수 액션을 관리합니다."
        eyebrow="작업 지시서"
        title="작업 지시서 보드"
      />
      {/* 이 보드는 오래 데모 픽스처를 실데이터처럼 보여줬다. 출처를 항상 밝힌다. */}
      <p
        style={{
          ...badgeBaseStyle,
          background: board.source === "database" ? "#ecfdf5" : "#eef2ff",
          color: board.source === "database" ? "#047857" : "#3730a3",
          marginBottom: 14
        }}
      >
        {board.source === "database" ? "실데이터 (DB 직접)" : "데모 데이터"}
      </p>
      {statusChange === null ? null : (
        <p
          role="status"
          style={{
            background: statusChange === "updated" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${statusChange === "updated" ? "#a7f3d0" : "#fecaca"}`,
            borderRadius: 8,
            color: statusChange === "updated" ? "#047857" : "#b91c1c",
            fontSize: 14,
            margin: "0 0 14px",
            padding: "10px 12px"
          }}
        >
          {statusChange === "updated"
            ? "지시서 상태를 변경했습니다."
            : "지시서 상태를 변경하지 못했습니다. 데모 데이터이거나 권한이 없습니다."}
        </p>
      )}
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
            <p style={{ ...mutedText, marginTop: 4 }}>{site.domain} 진행 대상 작업 지시서 {summary.active}개</p>
          </div>
          <span style={{ color: "var(--so-muted)", fontSize: 14 }}>진행 중 {summary.inProgress}개</span>
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
                <span style={{ color: "var(--so-muted)", fontSize: 13 }}>
                  {groupedWorkOrders[column.status].length}
                </span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {groupedWorkOrders[column.status].map((workOrder) => (
                  <WorkOrderCard
                    canEdit={board.source === "database"}
                    key={workOrder.id}
                    siteId={siteId}
                    workOrder={workOrder}
                  />
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

        <div style={{ background: "#ffffff", border: "1px solid #dbe4ef", borderRadius: 8, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%" }}>
            <thead style={{ background: "#f1f5f9" }}>
              <tr>
                {["작업 지시서", "상태", "담당", "마감", "근거", "검수 방법"].map(
                  (heading) => (
                    <th
                      key={heading}
                      style={{
                        borderBottom: "1px solid #dbe4ef",
                        color: "var(--so-muted)",
                        fontSize: 13,
                        padding: "11px 12px",
                        textAlign: "left",
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
                    <span style={{ color: "var(--so-muted)", fontSize: 14 }}>
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

function readStatusChange(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): "failed" | "updated" | null {
  const raw = searchParams?.["workOrder"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "updated" || value === "failed" ? value : null;
}

const tableCellStyle: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  color: "var(--so-ink)",
  fontSize: 14,
  padding: 12,
  verticalAlign: "top"
};

function WorkOrderCard({
  canEdit,
  siteId,
  workOrder
}: {
  readonly canEdit: boolean;
  readonly siteId: string;
  readonly workOrder: WorkOrder;
}) {
  return (
    <article style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 10 }}>
        <Badge style={priorityBadgeStyles[workOrder.priority]}>
          {formatPriority(workOrder.priority)}
        </Badge>
        <span style={{ color: "var(--so-muted)", fontSize: 13 }}>{formatOwnerLabel(workOrder.ownerType)}</span>
      </div>
      <h4 style={{ fontSize: 15, lineHeight: 1.35, margin: "0 0 8px" }}>{workOrder.title}</h4>
      <p style={{ color: "var(--so-muted)", fontSize: 14, lineHeight: 1.45, margin: "0 0 10px" }}>
        {workOrder.problem}
      </p>
      <dl style={{ display: "grid", gap: 8, margin: 0 }}>
        <div>
          <dt style={{ color: "var(--so-muted)", fontSize: 13, marginBottom: 3 }}>마감</dt>
          <dd style={{ fontSize: 14, margin: 0 }}>{formatDate(workOrder.dueDate)}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--so-muted)", fontSize: 13, marginBottom: 3 }}>URL</dt>
          <dd
            style={{
              color: "#334155",
              fontSize: 13,
              margin: 0,
              overflowWrap: "anywhere"
            }}
          >
            {workOrder.evidence?.url ?? "URL 근거 없음"}
          </dd>
        </div>
      </dl>
      {/* 여기 오래 아무것도 안 하는 "재검수" 버튼이 있었다. 재검수는 큐와 워커가 있어야
          하는데 둘 다 없다. 대신 실제로 할 수 있는 일(상태 이동)을 놓는다 — 눌리는데
          아무 일도 안 일어나는 버튼보다 낫다. */}
      <form
        action={updateWorkOrderStatusAction.bind(null, siteId, workOrder.id)}
        style={{ display: "flex", gap: 6, marginTop: 12 }}
      >
        <label style={{ flex: 1 }}>
          <span style={visuallyHidden}>{workOrder.title} 상태</span>
          <select
            defaultValue={workOrder.status}
            disabled={!canEdit}
            name="status"
            style={{
              background: canEdit ? "#ffffff" : "#f1f5f9",
              border: "1px solid #cbd5f5",
              borderRadius: 6,
              color: "var(--so-ink)",
              fontSize: 14,
              minHeight: 34,
              padding: "6px 8px",
              width: "100%"
            }}
          >
            {workOrderColumns.map((column) => (
              <option key={column.status} value={column.status}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label={`${workOrder.title} 상태 변경`}
          disabled={!canEdit}
          style={{
            background: canEdit ? "#2563eb" : "#e2e8f0",
            border: 0,
            borderRadius: 6,
            color: canEdit ? "#ffffff" : "var(--so-muted)",
            cursor: canEdit ? "pointer" : "not-allowed",
            fontSize: 14,
            fontWeight: 700,
            minHeight: 34,
            padding: "8px 10px"
          }}
          type="submit"
        >
          변경
        </button>
      </form>
    </article>
  );
}

// 카드마다 select 가 있어서 보이는 라벨을 붙이면 화면이 라벨로 뒤덮인다. 스크린리더에는
// 남기고 눈에만 안 보이게 한다 — display:none 은 읽어주지도 않으므로 쓰면 안 된다.
const visuallyHidden: CSSProperties = {
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1
};

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
