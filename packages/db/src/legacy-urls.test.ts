import { describe, expect, it } from "vitest";

import {
  loadLegacyUrlCandidates,
  normalizeSiteUrl,
  upsertSourceWorkOrder,
  type LegacyUrlClient,
  type SourceWorkOrderClient,
  type SourceWorkOrderDraft
} from "./legacy-urls.js";

const DOMAIN = "gowoonmom.co.kr";
const W = "https://www.gowoonmom.co.kr";

describe("normalizeSiteUrl", () => {
  it("makes relative paths absolute on www and keeps the query", () => {
    expect(normalizeSiteUrl("/web/blog/view?id=22", DOMAIN)).toBe(`${W}/web/blog/view?id=22`);
  });
  it("moves apex to www and drops the hash", () => {
    expect(normalizeSiteUrl("https://gowoonmom.co.kr/a#x", DOMAIN)).toBe(`${W}/a`);
  });
  it("rejects other hosts and garbage", () => {
    expect(normalizeSiteUrl("https://other.com/a", DOMAIN)).toBeNull();
    expect(normalizeSiteUrl("", DOMAIN)).toBeNull();
  });
});

describe("loadLegacyUrlCandidates", () => {
  function client(): LegacyUrlClient {
    return {
      connectorSyncResult: {
        async findMany() {
          return [
            {
              provider: "gsc",
              records: [
                { impressions: 300, page: `${W}/web/sub/BodyVolume_02` },
                { impressions: 100, page: `${W}/web/sub/BodyVolume_02` },
                { impressions: 50, page: `${W}/body/head-filler` }
              ]
            },
            { provider: "gsc", records: [{ impressions: 500, page: `${W}/web/sub/BodyVolume_02` }] },
            { provider: "ga4", records: [{ pagePath: "/web/sub/BodyVolume_02", sessions: 120 }, { pagePath: "/web/blog/view", sessions: 5 }] }
          ];
        }
      },
      crawlRun: {
        async findFirst() {
          return { id: "crawl_new" };
        }
      },
      site: {
        async findUnique() {
          return { domain: DOMAIN, id: "site_1" };
        }
      },
      urlRecord: {
        async findMany() {
          return [
            { crawlRunId: "crawl_new", url: `${W}/body/head-filler` },
            { crawlRunId: "crawl_old", url: `${W}/web/sub/doctor` }
          ];
        }
      }
    };
  }

  it("unions connector pages and old url records minus the latest crawl, ranked by traffic", async () => {
    const candidates = await loadLegacyUrlCandidates(client(), { since: new Date("2026-08-17T00:00:00Z"), siteId: "site_1" });
    // 노출은 스냅샷별 합계의 최댓값(400 vs 500 → 500), 방문은 ga4 합계(120)를 더한다.
    expect(candidates).toEqual([
      { traffic: 620, url: `${W}/web/sub/BodyVolume_02` },
      { traffic: 5, url: `${W}/web/blog/view` },
      { traffic: 0, url: `${W}/web/sub/doctor` }
    ]);
  });
});

describe("upsertSourceWorkOrder", () => {
  const draft: SourceWorkOrderDraft = {
    acceptanceCriteria: ["다음 점검에서 0개"],
    description: "| 옛 주소 | 노출 |",
    estimatedEffort: "m",
    impact: "순위가 사라집니다.",
    instructions: ["301 로 연결"],
    ownerType: "developer",
    priority: "p0",
    problem: "옛 주소가 404 입니다.",
    title: "옛 주소 3개가 열리지 않음(404) — 새 주소로 연결 필요",
    verificationMethod: "다음 점검"
  };

  function fake(existing: { id: string; status: string } | null) {
    const calls = { creates: [] as unknown[], events: [] as Record<string, unknown>[], updates: [] as { data: Record<string, unknown> }[] };
    const client: SourceWorkOrderClient = {
      closedLoopAuditEvent: {
        async create(args) {
          calls.events.push(args.data);
          return args;
        }
      },
      workOrder: {
        async create(args) {
          calls.creates.push(args.data);
          return { id: "wo_new" };
        },
        async findUnique() {
          return existing;
        },
        async update(args) {
          calls.updates.push(args);
          return args;
        }
      }
    };
    return { calls, client };
  }
  const base = { organizationId: "org", siteId: "site_1", sourceKey: "legacy-redirect:site_1:broken" };

  it("creates an open row when none exists", async () => {
    const { calls, client } = fake(null);
    await expect(upsertSourceWorkOrder(client, { ...base, draft, mode: "track" })).resolves.toBe("created");
    expect(calls.creates[0]).toMatchObject({ siteId: "site_1", sourceKey: base.sourceKey, status: "open", title: draft.title });
  });

  it("track reopens done row when draft returns", async () => {
    const { calls, client } = fake({ id: "wo_1", status: "done" });
    await expect(upsertSourceWorkOrder(client, { ...base, draft, mode: "track" })).resolves.toBe("reopened");
    expect(calls.updates[0]?.data).toMatchObject({ status: "open", title: draft.title });
    expect(calls.events[0]).toMatchObject({ eventType: "work_order_reopened", source: "worker:redirect-check" });
  });

  it("track updates content of an open row without touching status", async () => {
    const { calls, client } = fake({ id: "wo_1", status: "in_review" });
    await expect(upsertSourceWorkOrder(client, { ...base, draft, mode: "track" })).resolves.toBe("updated");
    expect(calls.updates[0]?.data).not.toHaveProperty("status");
    expect(calls.events).toEqual([]);
  });

  it("closes open row when draft is null", async () => {
    const { calls, client } = fake({ id: "wo_1", status: "open" });
    await expect(upsertSourceWorkOrder(client, { ...base, draft: null, mode: "track" })).resolves.toBe("closed");
    expect(calls.updates[0]).toEqual({ data: { status: "done" }, where: { id: "wo_1" } });
    expect(calls.events[0]).toMatchObject({ eventType: "work_order_done", status: "done" });
  });

  it("is unchanged when draft is null and no open row exists", async () => {
    await expect(upsertSourceWorkOrder(fake(null).client, { ...base, draft: null, mode: "track" })).resolves.toBe("unchanged");
    await expect(upsertSourceWorkOrder(fake({ id: "wo_1", status: "done" }).client, { ...base, draft: null, mode: "track" })).resolves.toBe(
      "unchanged",
    );
  });

  it("create_once never updates existing row", async () => {
    const { calls, client } = fake({ id: "wo_1", status: "done" });
    await expect(upsertSourceWorkOrder(client, { ...base, draft, mode: "create_once" })).resolves.toBe("unchanged");
    expect(calls.updates).toEqual([]);
  });
});
