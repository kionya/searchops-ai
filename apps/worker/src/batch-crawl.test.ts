import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  crawlRunCreate: vi.fn(async () => ({ id: "crawl_1" })),
  createPrismaAeoReadinessPersistenceClient: vi.fn(() => ({})),
  createPrismaComplianceFlagPersistenceClient: vi.fn(() => ({})),
  createPrismaCrawlAnalysisPersistenceClient: vi.fn(() => ({})),
  createPrismaCrawlPersistenceClient: vi.fn(() => ({})),
  createPrismaSchemaRecommendationRecheckPersistenceClient: vi.fn(() => ({})),
  createRichdocContractBridge: vi.fn(() => ({})),
  createSearchOpsPrismaClient: vi.fn(),
  processAndPersistCrawlJob: vi.fn(async () => ({
    summary: { crawledPages: 1, failedPages: 0 },
  })),
  readRichdocContract: vi.fn((): { siteIds: string[] } => ({ siteIds: [] })),
  siteFindMany: vi.fn(async (): Promise<{ archivedAt: Date | null; domain: string; id: string }[]> => [
    { archivedAt: null, domain: "keep.example", id: "site_keep" },
    { archivedAt: null, domain: "demo.example", id: "site_demo" },
  ]),
}));

vi.mock("@searchops/db", () => ({
  createPrismaAeoReadinessPersistenceClient: mocks.createPrismaAeoReadinessPersistenceClient,
  createPrismaComplianceFlagPersistenceClient: mocks.createPrismaComplianceFlagPersistenceClient,
  createPrismaCrawlAnalysisPersistenceClient: mocks.createPrismaCrawlAnalysisPersistenceClient,
  createPrismaCrawlPersistenceClient: mocks.createPrismaCrawlPersistenceClient,
  createPrismaSchemaRecommendationRecheckPersistenceClient:
    mocks.createPrismaSchemaRecommendationRecheckPersistenceClient,
  createRichdocContractBridge: mocks.createRichdocContractBridge,
  createSearchOpsPrismaClient: mocks.createSearchOpsPrismaClient,
  parseRichdocContractConfigFromEnv: mocks.readRichdocContract,
}));
vi.mock("./processor.js", () => ({
  processAndPersistCrawlJob: mocks.processAndPersistCrawlJob,
}));

describe("batch crawl", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSearchOpsPrismaClient.mockReturnValue({
      $disconnect: async () => undefined,
      crawlRun: { create: mocks.crawlRunCreate },
      site: { findMany: mocks.siteFindMany },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SEARCHOPS_CRAWL_SKIP_SITE_IDS;
    process.exitCode = 0;
  });

  // Site 에 크롤 on/off 컬럼이 없어서, 등록만 해둔 사이트도 매일 외부로 나가 긁혔다.
  // 앱 자기 도메인이 데모 시드로 남아 매일 크롤되고 있었던 게 그 예다.
  it("skips the sites listed in SEARCHOPS_CRAWL_SKIP_SITE_IDS", async () => {
    process.env.SEARCHOPS_CRAWL_SKIP_SITE_IDS = " site_demo , ";

    await import("./batch-crawl.js");

    const crawledSiteIds = (
      mocks.processAndPersistCrawlJob.mock.calls as unknown as readonly (readonly unknown[])[]
    ).map((call) => (call[0] as { siteId: string }).siteId);
    expect(crawledSiteIds).toEqual(["site_keep"]);
  });

  // 보관은 데이터를 남기고 크롤만 멈춘다. richdoc 계약에 남은 보관 사이트 id 는 "DB에 없음" 실패가 아니다.
  it("skips archived sites without failing the richdoc contract check", async () => {
    mocks.siteFindMany.mockResolvedValueOnce([
      { archivedAt: null, domain: "keep.example", id: "site_keep" },
      { archivedAt: new Date("2026-11-01T00:00:00.000Z"), domain: "old.example", id: "site_old" },
    ]);
    mocks.readRichdocContract.mockReturnValueOnce({ siteIds: ["site_old"] });

    await import("./batch-crawl.js");

    const crawledSiteIds = (
      mocks.processAndPersistCrawlJob.mock.calls as unknown as readonly (readonly unknown[])[]
    ).map((call) => (call[0] as { siteId: string }).siteId);
    expect(crawledSiteIds).toEqual(["site_keep"]);
    expect(process.exitCode).toBe(0);
  });

  // AEO·컴플라이언스는 크롤 결과를 지키려고 예외를 삼킨다. 그 실패가 배치까지 오지 않으면
  // 매일 밤 전패해도 워크플로가 초록불이라 "0건" 상태를 아무도 모른다.
  it("marks the batch run failed when postprocess steps fail silently", async () => {
    // Once 로 둔다 — clearAllMocks 는 구현을 지우지 않아 다른 테스트로 새어나간다.
    mocks.processAndPersistCrawlJob.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[2] as {
        onPostprocessFailure?: (label: string, error: unknown) => void;
      };
      options.onPostprocessFailure?.("compliance", new Error("compliance write failed"));
      return { summary: { crawledPages: 1, failedPages: 0 } };
    });

    await import("./batch-crawl.js");

    expect(process.exitCode).toBe(1);
  });

  it("crawls every site when no skip list is configured", async () => {
    await import("./batch-crawl.js");

    const crawledSiteIds = (
      mocks.processAndPersistCrawlJob.mock.calls as unknown as readonly (readonly unknown[])[]
    ).map((call) => (call[0] as { siteId: string }).siteId);
    expect(crawledSiteIds).toEqual(["site_keep", "site_demo"]);
  });
});
