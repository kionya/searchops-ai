import type { SearchOpsPrismaClient } from "./client.js";

// 크롤 뒤 할 일 정리. 이슈는 upsert 로만 쌓여서, 고쳐졌거나 주소가 사라진 문제가 닫힐 길이
// 없었다(2026-11-15 고운몸: 열린 지시서 57건 중 최신 크롤에서 실제로 보인 문제는 4건).
// 판정은 "이번 크롤이 그 URL 을 실제로 읽었는가"에만 기댄다 — 수집 한도(25쪽) 밖의 페이지를
// 해결로 치면 안 되기 때문이다.

export interface ReconcileWorkOrderRow {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly status: string;
}

export interface ReconcileIssueRow {
  readonly id: string;
  readonly ruleId: string;
  readonly status: string;
  readonly crawlRunId: string;
  readonly urlRecord: { readonly url: string; readonly crawlRunId: string; readonly statusCode: number } | null;
  readonly workOrders: readonly ReconcileWorkOrderRow[];
}

type AuditData = {
  eventType: string;
  message: string;
  metadata: Record<string, string>;
  organizationId: string;
  siteId: string | null;
  source: string;
  status: string;
  subjectId: string;
  subjectType: string;
  workOrderId: string;
};

export interface IssueReconcileClient {
  crawlRun: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; siteId: string; status: string; summary: unknown } | null>;
  };
  site: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; ignoredIssueKeys: string[] } | null>;
  };
  seoIssue: {
    findMany(args: {
      where: { urlRecord: { siteId: string; url?: { in: string[] } } };
      include: { urlRecord: true; workOrders: true };
    }): Promise<readonly ReconcileIssueRow[]>;
    update(args: { data: { status: string }; where: { id: string } }): Promise<unknown>;
  };
  workOrder: {
    update(args: { data: { status: string }; where: { id: string } }): Promise<unknown>;
  };
  closedLoopAuditEvent: {
    create(args: { data: AuditData }): Promise<unknown>;
  };
}

export function createPrismaIssueReconcileClient(prisma: SearchOpsPrismaClient): IssueReconcileClient {
  return prisma as unknown as IssueReconcileClient;
}

export function issueKey(ruleId: string, url: string): string {
  return `${ruleId}|${url}`;
}

const closableStatuses = new Set(["open", "in_progress", "in_review"]);
const SOURCE = "worker:reconcile";

export async function reconcileSiteIssues(
  client: IssueReconcileClient,
  input: { readonly siteId: string; readonly crawlRunId: string },
): Promise<{ readonly skipped: boolean; readonly resolved: number; readonly reopened: number; readonly ignored: number }> {
  const result = { ignored: 0, reopened: 0, resolved: 0, skipped: false };
  const crawl = await client.crawlRun.findUnique({ where: { id: input.crawlRunId } });
  if (crawl === null || crawl.siteId !== input.siteId || crawl.status !== "completed" || pagesProcessed(crawl.summary) <= 1) {
    return { ...result, skipped: true };
  }
  const site = await client.site.findUnique({ where: { id: input.siteId } });
  const ignored = new Set(site?.ignoredIssueKeys ?? []);
  const issues = await client.seoIssue.findMany({
    include: { urlRecord: true, workOrders: true },
    where: { urlRecord: { siteId: input.siteId } }
  });

  for (const row of issues) {
    if (row.urlRecord === null) {
      continue;
    }
    const url = row.urlRecord.url;
    if (ignored.has(issueKey(row.ruleId, url))) {
      if (row.status !== "ignored") {
        await client.seoIssue.update({ data: { status: "ignored" }, where: { id: row.id } });
      }
      for (const order of row.workOrders.filter((item) => item.status !== "done")) {
        await closeWorkOrder(client, order, `${row.ruleId} on ${url} marked as intended by the site owner.`, {
          crawlRunId: input.crawlRunId,
          reason: "intended"
        });
      }
      result.ignored += 1;
      continue;
    }

    const redetected = row.crawlRunId === input.crawlRunId;
    if (redetected) {
      for (const order of row.workOrders.filter((item) => item.status === "in_review" || item.status === "done")) {
        await client.workOrder.update({ data: { status: "open" }, where: { id: order.id } });
        await client.closedLoopAuditEvent.create({
          data: audit(order, {
            eventType: "work_order_reopened",
            message: `다시 확인 필요: ${row.ruleId} 가 ${url} 에서 다시 발견됐다.`,
            metadata: { crawlRunId: input.crawlRunId, reason: "redetected" },
            status: "open"
          })
        });
        result.reopened += 1;
      }
      continue;
    }

    // 이번 크롤이 이 URL 을 정상 응답(2xx)으로 읽었는데 같은 규칙이 다시 안 걸렸다 = 고쳐졌다.
    // 오류 페이지(429·5xx)를 읽은 날은 규칙이 엉뚱하게 빠지므로 판단하지 않는다.
    const readOk = row.urlRecord.statusCode >= 200 && row.urlRecord.statusCode < 300;
    if (row.urlRecord.crawlRunId === input.crawlRunId && readOk && row.status === "open") {
      await client.seoIssue.update({ data: { status: "resolved" }, where: { id: row.id } });
      for (const order of row.workOrders.filter((item) => closableStatuses.has(item.status))) {
        await closeWorkOrder(client, order, `${row.ruleId} no longer detected on ${url}.`, {
          crawlRunId: input.crawlRunId,
          reason: "not_redetected"
        });
      }
      result.resolved += 1;
    }
  }
  return result;
}

/** 옛 주소 점검에서 이미 다른 곳으로 넘어가거나 사라진 것으로 확인된 URL 의 문제를 닫는다. */
export async function closeIssuesForGoneUrls(
  client: IssueReconcileClient,
  input: { readonly siteId: string; readonly urls: readonly string[] },
): Promise<number> {
  if (input.urls.length === 0) {
    return 0;
  }
  const issues = await client.seoIssue.findMany({
    include: { urlRecord: true, workOrders: true },
    where: { urlRecord: { siteId: input.siteId, url: { in: [...input.urls] } } }
  });
  let closed = 0;
  for (const row of issues) {
    if (row.status === "open") {
      await client.seoIssue.update({ data: { status: "resolved" }, where: { id: row.id } });
    }
    for (const order of row.workOrders.filter((item) => item.status !== "done")) {
      await closeWorkOrder(client, order, `${row.urlRecord?.url ?? ""} 주소가 더 이상 쓰이지 않아 닫았다.`, { reason: "url_gone" });
      closed += 1;
    }
  }
  return closed;
}

async function closeWorkOrder(
  client: IssueReconcileClient,
  order: ReconcileWorkOrderRow,
  message: string,
  metadata: Record<string, string>,
): Promise<void> {
  await client.workOrder.update({ data: { status: "done" }, where: { id: order.id } });
  await client.closedLoopAuditEvent.create({
    data: audit(order, { eventType: "work_order_done", message, metadata, status: "done" })
  });
}

function audit(
  order: ReconcileWorkOrderRow,
  input: { eventType: string; message: string; metadata: Record<string, string>; status: string },
): AuditData {
  return {
    ...input,
    organizationId: order.organizationId,
    siteId: order.siteId,
    source: SOURCE,
    subjectId: order.id,
    subjectType: "work_order",
    workOrderId: order.id
  };
}

function pagesProcessed(summary: unknown): number {
  if (typeof summary === "object" && summary !== null && "pagesProcessed" in summary) {
    const value = (summary as { pagesProcessed: unknown }).pagesProcessed;
    return typeof value === "number" ? value : 0;
  }
  return 0;
}
