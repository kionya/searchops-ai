// T8 워크오더 재검수 후처리. 재크롤(crawl 잡, recheckWorkOrderId 동반)이 끝난 뒤 룰 재평가 결과로
// 워크오더 상태를 옮기고 ClosedLoopAuditEvent 를 남긴다. 멱등: 이미 done 이면 아무것도 안 한다.

import type { SearchOpsPrismaClient } from "./client.js";

export interface WorkOrderRecheckPersistenceClient {
  workOrder: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      organizationId: string;
      siteId: string | null;
      seoIssueId: string | null;
      status: string;
    } | null>;
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
  seoIssue: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      ruleId: string;
      urlRecord: { url: string } | null;
    } | null>;
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
  closedLoopAuditEvent: {
    create(args: {
      data: {
        eventType: string;
        message: string;
        metadata: { crawlRunId: string; outcome: string };
        organizationId: string;
        siteId: string | null;
        source: string;
        status: string;
        subjectId: string;
        subjectType: string;
        workOrderId: string;
      };
    }): Promise<unknown>;
  };
}

export interface ApplyWorkOrderRecheckInput {
  readonly workOrderId: string;
  readonly crawlRunId: string;
  /** 재크롤에서 다시 검출된 이슈 (ruleId + url). */
  readonly detectedIssues: readonly { readonly ruleId: string; readonly url: string }[];
}

export type WorkOrderRecheckOutcome = "resolved" | "still_open" | "skipped";

export interface ApplyWorkOrderRecheckOutput {
  readonly outcome: WorkOrderRecheckOutcome;
  readonly workOrderId: string;
}

export function createPrismaWorkOrderRecheckPersistenceClient(
  prisma: Pick<SearchOpsPrismaClient, "closedLoopAuditEvent" | "seoIssue" | "workOrder">,
): WorkOrderRecheckPersistenceClient {
  return {
    closedLoopAuditEvent: {
      create: (args) => prisma.closedLoopAuditEvent.create(args)
    },
    seoIssue: {
      findUnique: (args) =>
        prisma.seoIssue.findUnique({
          select: { id: true, ruleId: true, urlRecord: { select: { url: true } } },
          where: args.where
        }),
      update: (args) => prisma.seoIssue.update(args)
    },
    workOrder: {
      findUnique: (args) =>
        prisma.workOrder.findUnique({
          select: { id: true, organizationId: true, seoIssueId: true, siteId: true, status: true },
          where: args.where
        }),
      update: (args) => prisma.workOrder.update(args)
    }
  };
}

export async function applyWorkOrderRecheck(
  client: WorkOrderRecheckPersistenceClient,
  input: ApplyWorkOrderRecheckInput,
): Promise<ApplyWorkOrderRecheckOutput> {
  const workOrder = await client.workOrder.findUnique({ where: { id: input.workOrderId } });
  if (workOrder === null || workOrder.status === "done" || workOrder.seoIssueId === null) {
    return { outcome: "skipped", workOrderId: input.workOrderId };
  }
  const issue = await client.seoIssue.findUnique({ where: { id: workOrder.seoIssueId } });
  if (issue === null || issue.urlRecord === null) {
    return { outcome: "skipped", workOrderId: input.workOrderId };
  }
  const issueUrl = issue.urlRecord.url;
  const stillDetected = input.detectedIssues.some(
    (detected) => detected.ruleId === issue.ruleId && detected.url === issueUrl,
  );
  const outcome: WorkOrderRecheckOutcome = stillDetected ? "still_open" : "resolved";

  await client.workOrder.update({
    data: { status: stillDetected ? "open" : "done" },
    where: { id: workOrder.id }
  });
  if (!stillDetected) {
    await client.seoIssue.update({ data: { status: "resolved" }, where: { id: issue.id } });
  }
  await client.closedLoopAuditEvent.create({
    data: {
      eventType: stillDetected ? "work_order_recheck" : "work_order_done",
      message: stillDetected
        ? `Work order ${workOrder.id} rechecked: ${issue.ruleId} still detected on ${issueUrl}.`
        : `Work order ${workOrder.id} resolved by recheck: ${issue.ruleId} no longer detected on ${issueUrl}.`,
      metadata: { crawlRunId: input.crawlRunId, outcome },
      organizationId: workOrder.organizationId,
      siteId: workOrder.siteId,
      source: "worker:recheck",
      status: stillDetected ? "open" : "done",
      subjectId: workOrder.id,
      subjectType: "work_order",
      workOrderId: workOrder.id
    }
  });
  return { outcome, workOrderId: workOrder.id };
}
