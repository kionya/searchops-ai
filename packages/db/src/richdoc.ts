import { createHash } from "node:crypto";

import type { SearchOpsPrismaClient } from "./client.js";

// Outbound adapter for the richdoc-saas integration contract
// (richdoc-saas/supabase/searchops_contract.sql is the canonical spec).
// Writes searchops_runs / searchops_issues / searchops_work_orders into the
// richdoc (리쥬엘) Supabase via PostgREST upserts using the service-role key.
// Every public method is best-effort: it logs and resolves on failure so the
// caller's main operation (crawl job, API mutation) never fails because of it.
// ponytail: syncs are unserialized full-snapshot upserts, so two rapid
// mutations can land out of order and briefly mirror a stale status; the next
// sync self-heals. Serialize per site if the console ever needs strict order.

export interface RichdocContractConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  // Fail-closed allowlist of Site.id values. Site ids (not domains) pin the
  // tenant: Site.domain is only unique per organization, so a domain-based
  // allowlist would let another org's identically-named site leak into the
  // target Supabase, which belongs to a single tenant.
  readonly siteIds: readonly string[];
}

export interface CreateRichdocContractBridgeOptions extends RichdocContractConfig {
  readonly prisma: SearchOpsPrismaClient;
  readonly fetchImpl?: typeof fetch;
  readonly requestTimeoutMs?: number;
}

export interface RichdocContractBridge {
  syncCrawlRun(input: { readonly crawlRunId: string; readonly siteId: string }): Promise<void>;
  syncSiteWorkOrders(input: { readonly siteId: string }): Promise<void>;
}

export function parseRichdocContractConfigFromEnv(env: {
  readonly SEARCHOPS_RICHDOC_SUPABASE_URL?: string | undefined;
  readonly SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  readonly SEARCHOPS_RICHDOC_SITE_IDS?: string | undefined;
}): RichdocContractConfig | undefined {
  const supabaseUrl = env.SEARCHOPS_RICHDOC_SUPABASE_URL;
  const serviceRoleKey = env.SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY;
  const siteIds = (env.SEARCHOPS_RICHDOC_SITE_IDS ?? "")
    .split(",")
    .map((siteId) => siteId.trim())
    .filter((siteId) => siteId.length > 0);
  if (supabaseUrl === undefined || serviceRoleKey === undefined || siteIds.length === 0) {
    return undefined;
  }
  return { serviceRoleKey, siteIds, supabaseUrl };
}

// The contract tables use uuid primary keys while SearchOps ids are cuids.
// Deterministic UUIDv5-style derivation keeps upserts idempotent per record.
export function richdocUuidFromId(id: string): string {
  const hash = createHash("sha1").update(`searchops:${id}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Contract: running|done|error. SearchOps terminal statuses: completed|empty|failed.
export function toRichdocRunStatus(status: string): string {
  if (status === "completed" || status === "empty") {
    return "done";
  }
  if (status === "failed") {
    return "error";
  }
  return "running";
}

// Contract: critical|warning|info. SearchOps: critical|high|medium|low.
export function toRichdocIssueSeverity(severity: string): string {
  if (severity === "critical") {
    return "critical";
  }
  if (severity === "low") {
    return "info";
  }
  return "warning";
}

// Contract: open|in_progress|applied|verified. SearchOps adds in_review (fix
// applied, recheck pending → applied), done (recheck passed → verified) and
// blocked (still in flight → in_progress).
export function toRichdocWorkOrderStatus(status: string): string {
  if (status === "in_progress" || status === "blocked") {
    return "in_progress";
  }
  if (status === "in_review") {
    return "applied";
  }
  if (status === "done") {
    return "verified";
  }
  return "open";
}

function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

export function createRichdocContractBridge(
  options: CreateRichdocContractBridgeOptions,
): RichdocContractBridge {
  const { prisma, serviceRoleKey, siteIds } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const baseUrl = options.supabaseUrl.replace(/\/+$/, "");

  async function upsert(table: string, onConflict: string, rows: readonly unknown[]) {
    if (rows.length === 0) {
      return;
    }
    const response = await fetchImpl(
      `${baseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        body: JSON.stringify(rows),
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal"
        },
        method: "POST",
        signal: AbortSignal.timeout(requestTimeoutMs)
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `richdoc_upsert_failed table=${table} status=${response.status} detail=${detail.slice(0, 300)}`,
      );
    }
  }

  async function pushSiteWorkOrders(siteId: string) {
    if (!siteIds.includes(siteId)) {
      return;
    }
    const workOrders = await prisma.workOrder.findMany({
      include: {
        site: {
          select: {
            domain: true
          }
        }
      },
      // 오래된 것부터 올려 같은 지시서가 병합될 때 최신 상태가 남게 한다.
      orderBy: { updatedAt: "asc" },
      where: { siteId }
    });

    // 행 id 를 WorkOrder.id 에서 파생하면 크롤마다 새 id 가 생겨 콘솔에 같은 지시서가
    // 무한히 쌓인다(SeoIssue 유니크 키에 crawlRunId 가 들어 있어 크롤마다 이슈와 지시서가
    // 새로 만들어진다). 이슈가 (site,page_url,rule_id) 로 병합되는 것과 대칭이 되도록
    // (사이트, 제목)에서 파생한다 — 제목이 이미 "페이지 + 룰" 을 담고 있다.
    const rows = new Map<string, unknown>();
    for (const workOrder of workOrders) {
      if (workOrder.site === null) {
        continue;
      }
      const key = `wo:${workOrder.site.domain}:${workOrder.title}`;
      rows.set(key, {
        created_at: workOrder.createdAt.toISOString(),
        id: richdocUuidFromId(key),
        issue_count:
          workOrder.seoIssueId !== null
            ? 1
            : Array.isArray(workOrder.relatedIssues)
              ? workOrder.relatedIssues.length
              : 0,
        site: workOrder.site.domain,
        status: toRichdocWorkOrderStatus(workOrder.status),
        title: workOrder.title,
        updated_at: workOrder.updatedAt.toISOString()
      });
    }
    await upsert("searchops_work_orders", "id", [...rows.values()]);
  }

  return {
    async syncCrawlRun(input) {
      if (!siteIds.includes(input.siteId)) {
        return;
      }
      try {
        const crawlRun = await prisma.crawlRun.findUnique({
          include: {
            site: {
              select: {
                domain: true
              }
            }
          },
          where: { id: input.crawlRunId }
        });
        if (crawlRun === null || !siteIds.includes(crawlRun.siteId)) {
          return;
        }
        const domain = crawlRun.site.domain;

        const issues = await prisma.seoIssue.findMany({
          include: {
            urlRecord: {
              select: {
                url: true
              }
            }
          },
          where: { crawlRunId: crawlRun.id }
        });

        await upsert("searchops_runs", "id", [
          {
            finished_at: crawlRun.endedAt?.toISOString() ?? null,
            id: richdocUuidFromId(crawlRun.id),
            issues_found: issues.length,
            pages_crawled: readNumber(crawlRun.summary, "pagesProcessed") ?? 0,
            site: domain,
            started_at: crawlRun.startedAt.toISOString(),
            status: toRichdocRunStatus(crawlRun.status),
            summary: crawlRun.summary ?? null
          }
        ]);

        // status/first_seen are deliberately omitted so console-managed issue
        // states (in_order/fixed/...) survive re-crawls; inserts get defaults.
        // Postgres rejects duplicate conflict keys within one upsert request,
        // so collapse rows sharing (site, page_url, rule_id) first.
        const issueRows = new Map<string, unknown>();
        for (const issue of issues) {
          const pageUrl =
            issue.urlRecord?.url ?? readString(issue.evidence, "url") ?? `https://${domain}/`;
          issueRows.set(`${pageUrl} ${issue.ruleId}`, {
            detail: issue.evidence ?? null,
            last_seen: new Date().toISOString(),
            page_url: pageUrl,
            rule_id: issue.ruleId,
            severity: toRichdocIssueSeverity(issue.severity),
            site: domain,
            title: issue.title
          });
        }
        await upsert("searchops_issues", "site,page_url,rule_id", [...issueRows.values()]);

        await pushSiteWorkOrders(crawlRun.siteId);
      } catch (error) {
        console.error("[richdoc] crawl run sync failed; crawl result unaffected", error);
      }
    },

    async syncSiteWorkOrders(input) {
      try {
        await pushSiteWorkOrders(input.siteId);
      } catch (error) {
        console.error("[richdoc] work order sync failed; primary operation unaffected", error);
      }
    }
  };
}
