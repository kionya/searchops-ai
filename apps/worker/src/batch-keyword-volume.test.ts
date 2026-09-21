import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNaverSearchAdClientFromEnv: vi.fn(),
  createSearchOpsPrismaClient: vi.fn(),
  keywordFindMany: vi.fn(async () => [
    { id: "k1", phrase: "강남 피부과", siteId: "s" },
    { id: "k2", phrase: "없는키워드", siteId: "s" },
  ]),
  keywordUpdate: vi.fn(async () => ({})),
}));

vi.mock("@searchops/connectors", () => ({ createNaverSearchAdClientFromEnv: mocks.createNaverSearchAdClientFromEnv }));
vi.mock("@searchops/db", () => ({ createSearchOpsPrismaClient: mocks.createSearchOpsPrismaClient }));

describe("batch keyword volume (T5)", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createSearchOpsPrismaClient.mockReturnValue({
      $disconnect: async () => undefined,
      keyword: { findMany: mocks.keywordFindMany, update: mocks.keywordUpdate },
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("writes nothing without keys", async () => {
    mocks.createNaverSearchAdClientFromEnv.mockReturnValueOnce(null);
    await import("./batch-keyword-volume.js");
    expect(mocks.createSearchOpsPrismaClient).not.toHaveBeenCalled();
  });

  it("matches volumes by normalized phrase and updates only matched keywords", async () => {
    mocks.createNaverSearchAdClientFromEnv.mockReturnValueOnce({
      mode: "live",
      fetchKeywordVolumes: async () => [{ keyword: "강남피부과", monthlyPc: 120, monthlyMobile: 900 }],
    });
    await import("./batch-keyword-volume.js");
    expect(mocks.keywordUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      data: { monthlyVolumeMobile: 900, monthlyVolumePc: 120, volumeFetchedAt: expect.any(Date) },
      where: { id: "k1" },
    });
  });
});
