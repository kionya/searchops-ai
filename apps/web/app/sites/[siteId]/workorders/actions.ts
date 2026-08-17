"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { WorkOrderStatusSchema } from "@searchops/types";

import { setWorkOrderStatus } from "../../../../src/site-database";

// 보드에서 지시서 상태를 옮긴다. API 없이 쓰는 두 개의 쓰기 경로 중 하나다.
//
// siteId 와 workOrderId 는 서버에서 bind 로 넣는다 — 폼 필드로 받으면 남의 지시서 id 를
// 넣어 제출할 수 있다. 그래도 최종 방어선은 UPDATE 문 안의 organizationId 조건이다
// (packages/db 의 updateOrganizationWorkOrderStatus). 여기서 조직을 다시 확인하지
// 않는 이유는, 검사를 두 군데 두면 한쪽만 고치는 사고가 나기 때문이다.
export async function updateWorkOrderStatusAction(
  siteId: string,
  workOrderId: string,
  formData: FormData,
) {
  const parsed = WorkOrderStatusSchema.safeParse(formData.get("status"));
  let result = "failed";

  if (parsed.success) {
    // 실패를 삼키지 않는다. 상태가 안 바뀌었는데 보드가 그대로면 사용자는 눌렀는지조차
    // 모른다. 바뀐 행이 0개면(남의 조직·삭제된 지시서) failed 로 되돌린다.
    try {
      result = (await setWorkOrderStatus(workOrderId, parsed.data)) ? "updated" : "failed";
    } catch {
      result = "failed";
    }
  }

  revalidatePath(`/sites/${siteId}/workorders`);
  redirect(`/sites/${siteId}/workorders?workOrder=${result}`);
}
