import type { TodayBoard } from "@searchops/db";
import type { WorkOrderStatus } from "@searchops/types";
import {
  buildAiInstruction,
  defaultProtectedRules,
  isChecklist,
  protectedRulesFromIgnoredKeys,
  rankTodayWorkOrders
} from "@searchops/workorders";

export interface TodayViewItem {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly isChecklist: boolean;
  readonly aiInstruction: string;
  /** [의도한 설정이에요] 가 Site.ignoredIssueKeys 에 넣을 키. 이슈에 매이지 않은 할 일은 null. */
  readonly intendedKey: string | null;
}

export interface TodayView {
  readonly items: readonly TodayViewItem[];
  readonly remaining: number;
  readonly searchLine: string | null;
  readonly changes: readonly string[];
}

const statusLabels: Partial<Record<WorkOrderStatus, string>> = {
  in_progress: "진행 중",
  in_review: "확인 대기 — 다음 크롤에서 확인",
  open: "할 일"
};

export function buildTodayView(board: TodayBoard): TodayView {
  const ranked = rankTodayWorkOrders(board.candidates, new Map(Object.entries(board.trafficByUrl)));
  const protectedRules = [...defaultProtectedRules, ...protectedRulesFromIgnoredKeys(board.site.ignoredIssueKeys)];
  return {
    changes: board.changes,
    items: ranked.map((candidate) => ({
      aiInstruction: buildAiInstruction(candidate, { protectedRules, siteName: board.site.name }),
      id: candidate.id,
      // @searchops/db 의 issueKey 와 같은 형식. 뷰모델이 Prisma 를 끌어오지 않도록 여기서 만든다.
      intendedKey: candidate.ruleId !== null && candidate.url !== null ? `${candidate.ruleId}|${candidate.url}` : null,
      isChecklist: isChecklist(candidate),
      statusLabel: statusLabels[candidate.status] ?? candidate.status,
      title: candidate.title
    })),
    remaining: Math.max(0, board.candidates.filter((item) => item.status !== "done" && item.status !== "blocked").length - ranked.length),
    searchLine:
      board.search === null
        ? null
        : `구글 4주: 노출 ${board.search.impressions.toLocaleString("ko-KR")} · 클릭 ${board.search.clicks.toLocaleString("ko-KR")}`
  };
}
