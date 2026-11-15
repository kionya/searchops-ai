import type { EstimatedEffort, WorkOrderOwnerType, WorkOrderPriority } from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";

// 리뉴얼 뒤 옛 주소 점검(단계 0). 2026-11-14 고운몸 리뉴얼 오픈 직후 옛 주소 90개 중 32개가
// 404 였고, 구글 노출 상위 페이지 거의 전부가 옛 주소였다. 후보는 검색·분석 기록에 남은 주소와
// 예전에 크롤한 주소 중 지금 크롤에 없는 것이다.

export interface LegacyUrlClient {
  site: { findUnique(args: { where: { id: string } }): Promise<{ id: string; domain: string } | null> };
  crawlRun: {
    findFirst(args: {
      where: { siteId: string; status: "completed" };
      orderBy: { startedAt: "desc" };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  urlRecord: {
    findMany(args: { where: { siteId: string }; select: { url: true; crawlRunId: true } }): Promise<readonly { url: string; crawlRunId: string }[]>;
  };
  connectorSyncResult: {
    findMany(args: {
      where: {
        fixture: false;
        status: "ok";
        provider: { in: string[] };
        fetchedAt: { gte: Date };
        syncRun: { siteId: string };
      };
      select: { provider: true; records: true };
    }): Promise<readonly { provider: string; records: unknown }[]>;
  };
}

export function createPrismaLegacyUrlClient(prisma: SearchOpsPrismaClient): LegacyUrlClient {
  return prisma as unknown as LegacyUrlClient;
}

/** 사이트 주소를 비교용 한 형태로. 상대경로·apex 는 https://www.<domain> 로, # 은 버리고 쿼리는 남긴다. */
export function normalizeSiteUrl(raw: string, domain: string): string | null {
  const bare = domain.replace(/^www\./, "");
  let url: URL;
  try {
    url = new URL(raw, `https://www.${bare}`);
  } catch {
    return null;
  }
  if (raw.trim() === "" || url.hostname.replace(/^www\./, "") !== bare) {
    return null;
  }
  url.hostname = `www.${bare}`;
  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

export async function loadLegacyUrlCandidates(
  client: LegacyUrlClient,
  input: { readonly siteId: string; readonly since: Date },
): Promise<readonly { readonly url: string; readonly traffic: number }[]> {
  const site = await client.site.findUnique({ where: { id: input.siteId } });
  if (site === null) {
    return [];
  }
  const latest = await client.crawlRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { id: true },
    where: { siteId: input.siteId, status: "completed" }
  });
  const records = await client.urlRecord.findMany({ select: { crawlRunId: true, url: true }, where: { siteId: input.siteId } });
  const current = new Set(
    records.filter((record) => record.crawlRunId === latest?.id).map((record) => normalizeSiteUrl(record.url, site.domain)),
  );

  // 스냅샷은 지난 28일 합계라 서로 겹친다. 스냅샷 안에서는 더하고, 스냅샷끼리는 최댓값을 쓴다.
  const impressions = new Map<string, number>();
  const sessions = new Map<string, number>();
  const snapshots = await client.connectorSyncResult.findMany({
    select: { provider: true, records: true },
    where: { fetchedAt: { gte: input.since }, fixture: false, provider: { in: ["gsc", "ga4"] }, status: "ok", syncRun: { siteId: input.siteId } }
  });
  for (const snapshot of snapshots) {
    const field = snapshot.provider === "gsc" ? "page" : "pagePath";
    const metric = snapshot.provider === "gsc" ? "impressions" : "sessions";
    const target = snapshot.provider === "gsc" ? impressions : sessions;
    const totals = new Map<string, number>();
    for (const row of Array.isArray(snapshot.records) ? (snapshot.records as Record<string, unknown>[]) : []) {
      const url = typeof row[field] === "string" ? normalizeSiteUrl(row[field], site.domain) : null;
      if (url !== null) {
        totals.set(url, (totals.get(url) ?? 0) + (typeof row[metric] === "number" ? row[metric] : 0));
      }
    }
    for (const [url, total] of totals) {
      target.set(url, Math.max(target.get(url) ?? 0, total));
    }
  }

  const all = new Set<string>([...impressions.keys(), ...sessions.keys()]);
  for (const record of records) {
    const url = normalizeSiteUrl(record.url, site.domain);
    if (url !== null) {
      all.add(url);
    }
  }
  return [...all]
    .filter((url) => !current.has(url))
    .map((url) => ({ traffic: (impressions.get(url) ?? 0) + (sessions.get(url) ?? 0), url }))
    .sort((left, right) => right.traffic - left.traffic || left.url.localeCompare(right.url));
}

export interface SourceWorkOrderDraft {
  readonly title: string;
  readonly problem: string;
  readonly description: string | null;
  readonly impact: string;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationMethod: string;
  readonly priority: WorkOrderPriority;
  readonly ownerType: WorkOrderOwnerType;
  readonly estimatedEffort: EstimatedEffort;
}

export interface SourceWorkOrderClient {
  workOrder: {
    findUnique(args: { where: { sourceKey: string } }): Promise<{ id: string; status: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { data: Record<string, unknown>; where: { id: string } }): Promise<unknown>;
  };
  closedLoopAuditEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export function createPrismaSourceWorkOrderClient(prisma: SearchOpsPrismaClient): SourceWorkOrderClient {
  return prisma as unknown as SourceWorkOrderClient;
}

/**
 * 이슈 하나에 매이지 않는 지시서를 sourceKey 로 관리한다.
 * - track: draft 가 있으면 열어 두고(내용 갱신, done 이었으면 다시 열기), null 이면 닫는다.
 * - create_once: 없을 때 한 번만 만든다(체크리스트 — 원장님이 [했어요] 로 닫으면 끝).
 */
export async function upsertSourceWorkOrder(
  client: SourceWorkOrderClient,
  input: {
    readonly organizationId: string;
    readonly siteId: string;
    readonly sourceKey: string;
    readonly draft: SourceWorkOrderDraft | null;
    readonly mode: "track" | "create_once";
  },
): Promise<"created" | "updated" | "reopened" | "closed" | "unchanged"> {
  const existing = await client.workOrder.findUnique({ where: { sourceKey: input.sourceKey } });
  if (input.draft === null) {
    if (input.mode === "create_once" || existing === null || existing.status === "done") {
      return "unchanged";
    }
    await client.workOrder.update({ data: { status: "done" }, where: { id: existing.id } });
    await audit(client, input, existing.id, "work_order_done", "done", `${input.sourceKey} 해결 확인 — 닫았다.`);
    return "closed";
  }
  const content = {
    acceptanceCriteria: [...input.draft.acceptanceCriteria],
    description: input.draft.description,
    estimatedEffort: input.draft.estimatedEffort,
    impact: input.draft.impact,
    instructions: [...input.draft.instructions],
    ownerType: input.draft.ownerType,
    priority: input.draft.priority,
    problem: input.draft.problem,
    title: input.draft.title,
    verificationMethod: input.draft.verificationMethod
  };
  if (existing === null) {
    await client.workOrder.create({
      data: { ...content, organizationId: input.organizationId, siteId: input.siteId, sourceKey: input.sourceKey, status: "open" }
    });
    return "created";
  }
  if (input.mode === "create_once") {
    return "unchanged";
  }
  if (existing.status === "done") {
    await client.workOrder.update({ data: { ...content, status: "open" }, where: { id: existing.id } });
    await audit(client, input, existing.id, "work_order_reopened", "open", `다시 확인 필요: ${input.sourceKey} 문제가 다시 보인다.`);
    return "reopened";
  }
  await client.workOrder.update({ data: content, where: { id: existing.id } });
  return "updated";
}

async function audit(
  client: SourceWorkOrderClient,
  input: { readonly organizationId: string; readonly siteId: string; readonly sourceKey: string },
  workOrderId: string,
  eventType: string,
  status: string,
  message: string,
): Promise<void> {
  await client.closedLoopAuditEvent.create({
    data: {
      eventType,
      message,
      metadata: { sourceKey: input.sourceKey },
      organizationId: input.organizationId,
      siteId: input.siteId,
      source: "worker:redirect-check",
      status,
      subjectId: workOrderId,
      subjectType: "work_order",
      workOrderId
    }
  });
}
