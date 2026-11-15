import {
  EstimatedEffortSchema,
  WorkOrderPrioritySchema,
  WorkOrderStatusSchema,
  type EstimatedEffort,
  type WorkOrderPriority,
  type WorkOrderStatus
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import { normalizeSiteUrl } from "./legacy-urls.js";

// 오늘의 할 일 화면(/today)과 텔레그램 아침 요약이 같이 쓰는 데이터.
// 후보의 모양은 @searchops/workorders 의 TodayCandidate 와 같다 — db 가 workorders 에
// 의존하지 않도록 같은 모양을 여기서 다시 적는다(구조적 타입이라 그대로 넘겨진다).

export interface TodayBoardCandidate {
  readonly id: string;
  readonly title: string;
  readonly status: WorkOrderStatus;
  readonly priority: WorkOrderPriority;
  readonly estimatedEffort: EstimatedEffort;
  readonly ruleId: string | null;
  readonly sourceKey: string | null;
  readonly url: string | null;
  readonly problem: string;
  readonly description: string | null;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface TodayBoard {
  readonly site: { readonly id: string; readonly domain: string; readonly name: string; readonly ignoredIssueKeys: readonly string[] };
  readonly candidates: readonly TodayBoardCandidate[];
  readonly trafficByUrl: Readonly<Record<string, number>>;
  readonly search: { readonly clicks: number; readonly impressions: number; readonly fetchedAt: string } | null;
  readonly changes: readonly string[];
}

export interface GscRow {
  readonly query: string;
  readonly country: string;
  readonly impressions: number;
  readonly position: number;
}

interface WorkOrderRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly estimatedEffort: string;
  readonly sourceKey: string | null;
  readonly problem: string;
  readonly description: string | null;
  readonly instructions: unknown;
  readonly acceptanceCriteria: unknown;
  readonly seoIssue: { readonly ruleId: string; readonly urlRecord: { readonly url: string } | null } | null;
}

export interface TodayBoardClient {
  site: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      domain: string;
      name: string;
      organizationId: string;
      ignoredIssueKeys: string[];
    } | null>;
    update(args: { data: { ignoredIssueKeys: string[] }; where: { id: string } }): Promise<unknown>;
  };
  workOrder: {
    findMany(args: {
      where: { organizationId: string; siteId: string; status: { in: string[] } };
      include: { seoIssue: { include: { urlRecord: true } } };
    }): Promise<readonly WorkOrderRow[]>;
  };
  connectorSyncResult: {
    findMany(args: {
      where: { fixture: false; provider: string; status: "ok"; syncRun: { siteId: string } };
      orderBy: { fetchedAt: "desc" };
      take: number;
      select: { fetchedAt: true; records: true };
    }): Promise<readonly { fetchedAt: Date; records: unknown }[]>;
  };
}

export function createPrismaTodayBoardClient(prisma: SearchOpsPrismaClient): TodayBoardClient {
  return prisma as unknown as TodayBoardClient;
}

const activeStatuses = ["open", "in_progress", "in_review"];

export async function loadTodayBoard(
  client: TodayBoardClient,
  input: { readonly organizationId: string; readonly siteId: string },
): Promise<TodayBoard | null> {
  const site = await client.site.findUnique({ where: { id: input.siteId } });
  if (site === null || site.organizationId !== input.organizationId) {
    return null;
  }
  const rows = await client.workOrder.findMany({
    include: { seoIssue: { include: { urlRecord: true } } },
    where: { organizationId: input.organizationId, siteId: input.siteId, status: { in: activeStatuses } }
  });
  const snapshot = (provider: string, take: number) =>
    client.connectorSyncResult.findMany({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true, records: true },
      take,
      where: { fixture: false, provider, status: "ok", syncRun: { siteId: input.siteId } }
    });
  const [gscSnapshots, ga4Snapshots] = await Promise.all([snapshot("gsc", 2), snapshot("ga4", 1)]);
  const latestGsc = gscSnapshots[0];
  const gscRows = rowsOf(latestGsc?.records);

  const trafficByUrl: Record<string, number> = {};
  const add = (raw: unknown, value: unknown) => {
    const url = typeof raw === "string" ? normalizeSiteUrl(raw, site.domain) : null;
    if (url !== null && typeof value === "number") {
      trafficByUrl[url] = (trafficByUrl[url] ?? 0) + value;
    }
  };
  for (const row of gscRows) {
    add(row.page, row.impressions);
  }
  for (const row of rowsOf(ga4Snapshots[0]?.records)) {
    add(row.pagePath, row.sessions);
  }

  // [의도한 설정이에요] 를 누른 항목은 다음 크롤 정리를 기다리지 않고 바로 뺀다(리뷰 I3).
  const ignored = new Set(site.ignoredIssueKeys);
  const candidates = rows
    .flatMap((row) => toCandidate(row))
    .filter((candidate) => candidate.ruleId === null || candidate.url === null || !ignored.has(`${candidate.ruleId}|${candidate.url}`));
  // 후보의 url 은 이슈 정체성(UrlRecord.url 원본, 무시 키와 같은 값)이라 정규화하지 않는다.
  // 원본이 apex 등으로 정규화 키와 다르면 같은 트래픽을 원본 키로도 볼 수 있게 한다.
  for (const candidate of candidates) {
    const normalized = candidate.url === null ? null : normalizeSiteUrl(candidate.url, site.domain);
    if (candidate.url !== null && normalized !== null && normalized !== candidate.url && trafficByUrl[normalized] !== undefined) {
      trafficByUrl[candidate.url] = trafficByUrl[normalized];
    }
  }

  return {
    candidates,
    changes: searchChanges(rowsOf(gscSnapshots[1]?.records).flatMap(toGscRow), gscRows.flatMap(toGscRow)),
    search:
      latestGsc === undefined
        ? null
        : {
            clicks: gscRows.reduce((sum, row) => sum + (typeof row.clicks === "number" ? row.clicks : 0), 0),
            fetchedAt: latestGsc.fetchedAt.toISOString(),
            impressions: gscRows.reduce((sum, row) => sum + (typeof row.impressions === "number" ? row.impressions : 0), 0)
          },
    site: { domain: site.domain, id: site.id, ignoredIssueKeys: [...site.ignoredIssueKeys], name: site.name },
    trafficByUrl
  };
}

export async function addIgnoredIssueKey(
  client: TodayBoardClient,
  input: { readonly organizationId: string; readonly siteId: string; readonly key: string },
): Promise<boolean> {
  const site = await client.site.findUnique({ where: { id: input.siteId } });
  if (site === null || site.organizationId !== input.organizationId) {
    return false;
  }
  if (!site.ignoredIssueKeys.includes(input.key)) {
    await client.site.update({ data: { ignoredIssueKeys: [...site.ignoredIssueKeys, input.key] }, where: { id: site.id } });
  }
  return true;
}

/** 직전 대비 구글 순위 변화(한국, 노출가중 평균). 노출 50 이상·변화 0.5위 이상, 큰 순 3개. */
export function searchChanges(previous: readonly GscRow[], current: readonly GscRow[], limit = 3): readonly string[] {
  const before = averagePositions(previous);
  const after = averagePositions(current);
  return [...after]
    .flatMap(([query, now]) => {
      const then = before.get(query);
      return then === undefined || now.impressions < 50 || Math.abs(then.position - now.position) < 0.5
        ? []
        : [{ delta: Math.abs(then.position - now.position), text: `'${query}' 구글 순위 ${then.position.toFixed(1)}→${now.position.toFixed(1)}위` }];
    })
    .sort((left, right) => right.delta - left.delta)
    .slice(0, limit)
    .map((item) => item.text);
}

function averagePositions(rows: readonly GscRow[]): Map<string, { impressions: number; position: number }> {
  const sums = new Map<string, { impressions: number; weighted: number }>();
  for (const row of rows) {
    if (row.country !== "kor" || row.impressions <= 0) {
      continue;
    }
    const sum = sums.get(row.query) ?? { impressions: 0, weighted: 0 };
    sums.set(row.query, { impressions: sum.impressions + row.impressions, weighted: sum.weighted + row.position * row.impressions });
  }
  return new Map([...sums].map(([query, sum]) => [query, { impressions: sum.impressions, position: sum.weighted / sum.impressions }]));
}

function rowsOf(records: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(records) ? (records as Record<string, unknown>[]) : [];
}

function toGscRow(row: Record<string, unknown>): GscRow[] {
  const { country, impressions, position, query } = row;
  return typeof query === "string" && typeof country === "string" && typeof impressions === "number" && typeof position === "number"
    ? [{ country, impressions, position, query }]
    : [];
}

function toCandidate(row: WorkOrderRow): TodayBoardCandidate[] {
  const status = WorkOrderStatusSchema.safeParse(row.status);
  const priority = WorkOrderPrioritySchema.safeParse(row.priority);
  const effort = EstimatedEffortSchema.safeParse(row.estimatedEffort);
  if (!status.success || !priority.success || !effort.success) {
    return [];
  }
  return [
    {
      acceptanceCriteria: strings(row.acceptanceCriteria),
      description: row.description,
      estimatedEffort: effort.data,
      id: row.id,
      instructions: strings(row.instructions),
      priority: priority.data,
      problem: row.problem,
      ruleId: row.seoIssue?.ruleId ?? null,
      sourceKey: row.sourceKey,
      status: status.data,
      title: row.title,
      url: row.seoIssue?.urlRecord?.url ?? null
    }
  ];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
