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
  readRichdocContract: vi.fn(() => ({ siteIds: [] })),
  siteFindMany: vi.fn(async () => [
    { domain: "keep.example", id: "site_keep" },
    { domain: "demo.example", id: "site_demo" },
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
