import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTelegramNotifier: vi.fn(),
  sendMessage: vi.fn(async () => undefined),
  createPlatformGeoProviderResolver: vi.fn(() => ({ resolveGeoProviderAdapters: vi.fn() })),
  createPrismaGeoVisibilityPersistenceClient: vi.fn(() => ({})),
  createSearchOpsPrismaClient: vi.fn(),
  keywordFindMany: vi.fn(async () => [{ phrase: "강남 피부과" }]),
  processAndPersistGeoAnswerMonitorJob: vi.fn(async () => ({
    monitorResults: [{ provider: "chatgpt", status: "ok", observations: [{}] }],
    visibilityReport: { observations: [{}] },
  })),
  reportFindFirst: vi.fn(),
  reportUpdate: vi.fn(async () => ({})),
  siteFindMany: vi.fn(async () => [
    { competitors: [], country: "KR", domain: "a.example", id: "site_a", language: "ko", name: "A", organizationId: "org" },
  ]),
}));

vi.mock("@searchops/connectors", () => ({
  createTelegramNotifier: mocks.createTelegramNotifier,
}));
vi.mock("@searchops/db", () => ({
  createPrismaGeoVisibilityPersistenceClient: mocks.createPrismaGeoVisibilityPersistenceClient,
  createSearchOpsPrismaClient: mocks.createSearchOpsPrismaClient,
}));
vi.mock("./processor.js", () => ({
  processAndPersistGeoAnswerMonitorJob: mocks.processAndPersistGeoAnswerMonitorJob,
}));
vi.mock("./provider-credential-resolver.js", () => ({
  createPlatformGeoProviderResolver: mocks.createPlatformGeoProviderResolver,
}));

describe("batch geo (T3)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SEARCHOPS_GEO_CHATGPT_API_KEY = "k";
    mocks.createSearchOpsPrismaClient.mockReturnValue({
      $disconnect: async () => undefined,
      geoVisibilityReport: { findFirst: mocks.reportFindFirst, update: mocks.reportUpdate },
      keyword: { findMany: mocks.keywordFindMany },
      site: { findMany: mocks.siteFindMany },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SEARCHOPS_GEO_CHATGPT_API_KEY;
    delete process.env.SEARCHOPS_GEO_BATCH_ALLOW_FIXTURE;
    delete process.env.SEARCHOPS_GEO_BATCH_FORCE;
    process.exitCode = 0;
  });

  it("runs once per ISO week and chains runSeq/previousReportId", async () => {
    // previous run: 2 weeks ago → run, then created row gets runSeq 4
    mocks.reportFindFirst
      .mockResolvedValueOnce({ evaluatedAt: new Date(Date.now() - 14 * 86_400_000), id: "r3", mentionRate: 30, runSeq: 3, sov: 50 })
      .mockResolvedValueOnce({ id: "r4", mentionRate: 50, observations: [{ source: "connector" }, { source: "fixture" }], sov: 40 });
    mocks.createTelegramNotifier.mockReturnValueOnce({ chatId: "p", sendMessage: mocks.sendMessage });

    await import("./batch-geo.js");

    // T7: 사이트별 주간 요약 1통
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect((mocks.sendMessage.mock.calls as unknown as readonly (readonly unknown[])[])[0]?.[0]).toBe(
      "[GEO 주간] a.example · run #4\n언급률 50% (+20p)\nSOV 40% (-10p)\n실측 비율 50% ⚠ fixture/수동 포함\n엔진 chatgpt"
    );

    expect(mocks.processAndPersistGeoAnswerMonitorJob).toHaveBeenCalledTimes(1);
    const calls = mocks.processAndPersistGeoAnswerMonitorJob.mock.calls as unknown as readonly (readonly unknown[])[];
    const payload = calls[0]?.[0] as { queries: unknown[]; providers: string[] };
    expect(payload.queries).toEqual([{ query: "강남 피부과" }]);
    expect(payload.providers).toEqual(["chatgpt"]);
    // 모델 secret 이 없으면 geoProviderModels 에 undefined 키를 만들지 않는다(기본 모델이 살아야 한다)
    const resolverOptions = (mocks.createPlatformGeoProviderResolver.mock.calls as unknown as readonly (readonly unknown[])[])[0]?.[0] as { geoProviderModels: Record<string, unknown> };
    expect(resolverOptions.geoProviderModels).toEqual({});
    expect(mocks.reportUpdate).toHaveBeenCalledWith({
      data: { previousReportId: "r3", runSeq: 4 },
      where: { id: "r4" },
    });
  });

  it("does not assign runSeq when every provider failed (0 observations)", async () => {
    mocks.reportFindFirst.mockResolvedValueOnce(null);
    mocks.createTelegramNotifier.mockReturnValueOnce(null);
    mocks.processAndPersistGeoAnswerMonitorJob.mockResolvedValueOnce({
      monitorResults: [{ provider: "chatgpt", status: "failed", observations: [], error: { code: "provider_request_failed" } }],
      visibilityReport: { observations: [] },
    } as never);

    await import("./batch-geo.js");

    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("re-runs this week when SEARCHOPS_GEO_BATCH_FORCE=1", async () => {
    process.env.SEARCHOPS_GEO_BATCH_FORCE = "1";
    mocks.reportFindFirst
      .mockResolvedValueOnce({ evaluatedAt: new Date(), id: "r1", mentionRate: 1, runSeq: 1, sov: null })
      .mockResolvedValueOnce({ id: "r2", mentionRate: 5, observations: [{ source: "connector" }], sov: null });
    mocks.createTelegramNotifier.mockReturnValueOnce(null);

    await import("./batch-geo.js");

    expect(mocks.processAndPersistGeoAnswerMonitorJob).toHaveBeenCalledTimes(1);
    expect(mocks.reportUpdate).toHaveBeenCalledWith({ data: { previousReportId: "r1", runSeq: 2 }, where: { id: "r2" } });
    delete process.env.SEARCHOPS_GEO_BATCH_FORCE;
  });

  it("skips a site that already has a run this week (idempotent)", async () => {
    mocks.reportFindFirst.mockResolvedValueOnce({ evaluatedAt: new Date(), id: "r1", mentionRate: 1, runSeq: 1, sov: null });
    mocks.createTelegramNotifier.mockReturnValueOnce(null);

    await import("./batch-geo.js");

    expect(mocks.processAndPersistGeoAnswerMonitorJob).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });

  it("refuses to run fixture-only unless explicitly allowed", async () => {
    delete process.env.SEARCHOPS_GEO_CHATGPT_API_KEY;

    await import("./batch-geo.js");

    expect(process.exitCode).toBe(2);
    expect(mocks.processAndPersistGeoAnswerMonitorJob).not.toHaveBeenCalled();
  });

  it("startOfIsoWeek returns the UTC Monday", async () => {
    const { startOfIsoWeek } = await import("./batch-geo.js");
    expect(startOfIsoWeek(new Date("2026-09-24T10:00:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(startOfIsoWeek(new Date("2026-09-20T23:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});
