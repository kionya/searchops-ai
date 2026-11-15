import type { EstimatedEffort, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

// "오늘의 할 일" — 원장님이 휴대폰에서 보는 10개와, 그대로 AI 에게 붙여넣을 지시문.
// 순위·문구 모두 결정적이다(AGENTS.md). 같은 입력이면 매일 같은 순서가 나와야 한다.

export interface TodayCandidate {
  readonly id: string;
  readonly title: string;
  readonly status: WorkOrderStatus;
  readonly priority: WorkOrderPriority;
  readonly estimatedEffort: EstimatedEffort;
  /** DB 의 SeoIssue.ruleId 그대로(문자열). 이슈에 매이지 않은 지시서는 null. */
  readonly ruleId: string | null;
  readonly sourceKey: string | null;
  readonly url: string | null;
  readonly problem: string;
  readonly description: string | null;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export const todayLimit = 10;

const lossRuleIds = new Set(["NOINDEX_ON_IMPORTANT_PAGE"]);
const priorityRank: Record<WorkOrderPriority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const effortRank: Record<EstimatedEffort, number> = { l: 2, m: 1, s: 0 };

/** 안 하면 잃는 것(검색 제외·옛 주소 404). 하면 좋아지는 것보다 먼저 온다. */
export function isLossType(candidate: TodayCandidate): boolean {
  return (
    (candidate.ruleId !== null && lossRuleIds.has(candidate.ruleId)) ||
    (candidate.sourceKey?.endsWith(":broken") ?? false)
  );
}

/** 자동 확인이 불가능해 [했어요] 가 곧 완료인 일(사이트맵 제출 등). */
export function isChecklist(candidate: TodayCandidate): boolean {
  return candidate.sourceKey?.startsWith("checklist:") ?? false;
}

export function rankTodayWorkOrders(
  candidates: readonly TodayCandidate[],
  trafficByUrl: ReadonlyMap<string, number>,
  limit: number = todayLimit,
): readonly TodayCandidate[] {
  const traffic = (candidate: TodayCandidate) => (candidate.url === null ? 0 : (trafficByUrl.get(candidate.url) ?? 0));
  return candidates
    .filter((candidate) => candidate.status !== "done" && candidate.status !== "blocked")
    .sort(
      (left, right) =>
        Number(isLossType(right)) - Number(isLossType(left)) ||
        priorityRank[left.priority] - priorityRank[right.priority] ||
        traffic(right) - traffic(left) ||
        effortRank[left.estimatedEffort] - effortRank[right.estimatedEffort] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

export const defaultProtectedRules: readonly string[] = [
  "의료광고 관련 고지·주의 문구는 지우거나 바꾸지 마세요.",
  "이 요청과 관계없는 다른 페이지의 내용과 주소는 바꾸지 마세요.",
  "작업이 끝나면 바꾼 내용을 목록으로 정리해 알려 주세요."
];

const ruleLabels: Record<string, string> = {
  CANONICAL_MISSING: "canonical",
  IMAGE_ALT_MISSING: "이미지 대체 텍스트",
  META_DESC_MISSING: "메타 설명",
  NOINDEX_ON_IMPORTANT_PAGE: "검색 제외(noindex)"
};

export function protectedRulesFromIgnoredKeys(keys: readonly string[]): readonly string[] {
  return keys.flatMap((key) => {
    const separator = key.indexOf("|");
    if (separator <= 0) {
      return [];
    }
    const ruleId = key.slice(0, separator);
    const url = key.slice(separator + 1);
    return [`${url} 의 ${ruleLabels[ruleId] ?? ruleId} 설정은 의도된 것이니 그대로 두세요.`];
  });
}

export function buildAiInstruction(
  candidate: TodayCandidate,
  context: { readonly siteName: string; readonly protectedRules: readonly string[] },
): string {
  const lines = [`[${context.siteName} 홈페이지 수정 요청]`];
  if (candidate.url !== null) {
    lines.push(`대상 페이지: ${candidate.url}`);
  }
  lines.push(`지금 문제: ${candidate.problem}`);
  if (candidate.description !== null && candidate.description.trim() !== "") {
    lines.push(candidate.description);
  }
  if (candidate.instructions.length > 0) {
    lines.push("해야 할 일:", ...candidate.instructions.map((step, index) => `${index + 1}. ${step}`));
  }
  if (context.protectedRules.length > 0) {
    lines.push("지켜야 할 것:", ...context.protectedRules.map((rule) => `- ${rule}`));
  }
  if (candidate.acceptanceCriteria.length > 0) {
    lines.push("끝나면 확인할 것:", ...candidate.acceptanceCriteria.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
