"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markIssueIntended, setWorkOrderStatus } from "../../../../src/site-database";

// siteId·workOrderId·key 는 서버에서 bind 로 넣는다(폼 필드 금지 — workorders/actions.ts 주석 참고).
// 최종 방어선은 @searchops/db 쪽 조직 조건이다.

/** [했어요]. 자동 확인이 안 되는 체크리스트는 바로 완료, 나머지는 다음 크롤이 확인할 때까지 대기. */
export async function markDoneAction(siteId: string, workOrderId: string, isChecklist: boolean) {
  let result = "failed";
  try {
    result = (await setWorkOrderStatus(workOrderId, isChecklist ? "done" : "in_review")) ? "updated" : "failed";
  } catch {
    result = "failed";
  }
  revalidatePath(`/sites/${siteId}/today`);
  redirect(`/sites/${siteId}/today?today=${result}`);
}

/** [의도한 설정이에요]. 다음 크롤 정리에서 그 이슈를 닫고 다시 열지 않는다. */
export async function markIntendedAction(siteId: string, key: string) {
  let result = "failed";
  try {
    result = (await markIssueIntended(siteId, key)) ? "updated" : "failed";
  } catch {
    result = "failed";
  }
  revalidatePath(`/sites/${siteId}/today`);
  redirect(`/sites/${siteId}/today?today=${result}`);
}
