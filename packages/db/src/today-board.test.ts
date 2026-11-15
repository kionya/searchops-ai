import { describe, expect, it } from "vitest";

import { addIgnoredIssueKey, loadTodayBoard, searchChanges, type TodayBoardClient } from "./today-board.js";

const W = "https://www.gowoonmom.co.kr";

function gsc(query: string, impressions: number, position: number, clicks = 0, page = `${W}/`) {
  return { clicks, country: "kor", impressions, page, position, query };
}

function createClient(overrides: { organizationId?: string; ignoredIssueKeys?: string[] } = {}) {
  const updates: unknown[] = [];
  const client: TodayBoardClient = {
    connectorSyncResult: {
      async findMany(args) {
        if (args.where.provider === "ga4") {
          return [{ fetchedAt: new Date("2026-11-14T21:47:00Z"), records: [{ pagePath: "/body/head-filler", sessions: 12 }] }];
        }
        return [
          { fetchedAt: new Date("2026-11-14T21:47:00Z"), records: [gsc("골반 필러", 479, 3.9, 4, `${W}/body/head-filler`), gsc("어깨필러", 218, 7.5)] },
          { fetchedAt: new Date("2026-11-13T21:40:00Z"), records: [gsc("골반 필러", 400, 4.7), gsc("어깨필러", 210, 7.6)] }
        ];
      }
    },
    site: {
      async findUnique() {
        return {
          domain: "gowoonmom.co.kr",
          id: "site_1",
          ignoredIssueKeys: overrides.ignoredIssueKeys ?? [],
          name: "고운몸의원",
          organizationId: overrides.organizationId ?? "org"
        };
      },
      async update(args) {
        updates.push(args);
        return args;
      }
    },
    workOrder: {
      async findMany() {
        return [
          {
            acceptanceCriteria: ["재크롤에서 h1 이 보인다."],
            description: null,
            estimatedEffort: "s",
            id: "wo_1",
            instructions: ["h1 추가"],
            priority: "p1",
            problem: "h1 이 없습니다.",
            seoIssue: { ruleId: "H1_MISSING", urlRecord: { url: `${W}/body/head-filler` } },
            sourceKey: null,
            status: "open",
            title: "/body/head-filler H1 제목 추가"
          },
          {
            acceptanceCriteria: ["제출 확인"],
            description: null,
            estimatedEffort: "s",
            id: "wo_2",
            instructions: ["사이트맵 제출"],
            priority: "p1",
            problem: "사이트맵",
            seoIssue: null,
            sourceKey: "checklist:site_1:sitemap-naver",
            status: "open",
            title: "네이버 서치어드바이저에 새 사이트맵 제출"
          }
        ];
      }
    }
  };
  return { client, updates };
}

const input = { organizationId: "org", siteId: "site_1" };

describe("loadTodayBoard", () => {
  it("loadTodayBoard returns null for other organization", async () => {
    await expect(loadTodayBoard(createClient({ organizationId: "other" }).client, input)).resolves.toBeNull();
  });

  it("maps seo issue rule and url onto candidates", async () => {
    const board = await loadTodayBoard(createClient().client, input);
    expect(board?.candidates[0]).toMatchObject({ id: "wo_1", ruleId: "H1_MISSING", url: `${W}/body/head-filler` });
    expect(board?.candidates[1]).toMatchObject({ ruleId: null, sourceKey: "checklist:site_1:sitemap-naver", url: null });
    expect(board?.site).toEqual({ domain: "gowoonmom.co.kr", id: "site_1", ignoredIssueKeys: [], name: "고운몸의원" });
  });

  it("sums latest gsc snapshot and builds traffic by url", async () => {
    const board = await loadTodayBoard(createClient().client, input);
    expect(board?.search).toEqual({ clicks: 4, fetchedAt: "2026-11-14T21:47:00.000Z", impressions: 697 });
    expect(board?.trafficByUrl[`${W}/body/head-filler`]).toBe(479 + 12);
    expect(board?.changes).toEqual(["'골반 필러' 구글 순위 4.7→3.9위"]);
  });

  it("exposes traffic under the raw apex url of a candidate", async () => {
    const { client } = createClient();
    const original = client.workOrder.findMany.bind(client.workOrder);
    client.workOrder.findMany = async (args) =>
      (await original(args)).map((row) =>
        row.seoIssue === null ? row : { ...row, seoIssue: { ...row.seoIssue, urlRecord: { url: "https://gowoonmom.co.kr/body/head-filler" } } },
      );
    const board = await loadTodayBoard(client, input);
    expect(board?.candidates[0]?.url).toBe("https://gowoonmom.co.kr/body/head-filler");
    expect(board?.trafficByUrl["https://gowoonmom.co.kr/body/head-filler"]).toBe(491);
  });
});

describe("addIgnoredIssueKey", () => {
  it("addIgnoredIssueKey is idempotent", async () => {
    const key = `NOINDEX_ON_IMPORTANT_PAGE|${W}/ebook`;
    const fresh = createClient();
    await expect(addIgnoredIssueKey(fresh.client, { ...input, key })).resolves.toBe(true);
    expect(fresh.updates).toEqual([{ data: { ignoredIssueKeys: [key] }, where: { id: "site_1" } }]);
    const already = createClient({ ignoredIssueKeys: [key] });
    await expect(addIgnoredIssueKey(already.client, { ...input, key })).resolves.toBe(true);
    expect(already.updates).toEqual([]);
  });

  it("refuses other organization", async () => {
    const other = createClient({ organizationId: "other" });
    await expect(addIgnoredIssueKey(other.client, { ...input, key: "X|y" })).resolves.toBe(false);
    expect(other.updates).toEqual([]);
  });
});

describe("searchChanges", () => {
  it("searchChanges reports position move", () => {
    expect(searchChanges([gsc("골반 필러", 400, 4.7)], [gsc("골반 필러", 479, 3.9)])).toEqual(["'골반 필러' 구글 순위 4.7→3.9위"]);
  });

  it("searchChanges ignores low impressions and small moves and other countries", () => {
    expect(searchChanges([gsc("a", 30, 9)], [gsc("a", 30, 5)])).toEqual([]);
    expect(searchChanges([gsc("b", 300, 5.0)], [gsc("b", 300, 5.3)])).toEqual([]);
    expect(searchChanges([{ ...gsc("c", 300, 9), country: "usa" }], [{ ...gsc("c", 300, 2), country: "usa" }])).toEqual([]);
  });

  it("weights position by impressions across rows of the same query and keeps the 3 biggest moves", () => {
    const previous = [gsc("q1", 100, 10), gsc("q2", 100, 10), gsc("q3", 100, 10), gsc("q4", 100, 10)];
    const current = [gsc("q1", 50, 2), gsc("q1", 50, 4), gsc("q2", 100, 9), gsc("q3", 100, 5), gsc("q4", 100, 12)];
    expect(searchChanges(previous, current)).toEqual([
      "'q1' 구글 순위 10.0→3.0위",
      "'q3' 구글 순위 10.0→5.0위",
      "'q4' 구글 순위 10.0→12.0위"
    ]);
  });
});
