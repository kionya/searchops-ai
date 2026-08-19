import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConnectorSyncRun: vi.fn(async () => undefined),
  createPrismaConnectorSyncPersistenceClient: vi.fn(() => ({ kind: "persistence" })),
  createSearchOpsPrismaClient: vi.fn(),
  parseCredentialKeyring: vi.fn(() => ({ activeKeyId: "k1" })),
  processAndPersistConnectorSyncJob: vi.fn(async () => ({
    summary: { failedProviders: 0, okProviders: 1, partialProviders: 0 },
  })),
  siteConnectorFindMany: vi.fn(async () => [
    {
      organizationId: "org_demo",
      provider: "gsc",
      site: { domain: "example.test" },
      siteId: "site_1",
    },
  ]),
}));

vi.mock("@searchops/db", () => ({
  createConnectorSyncRun: mocks.createConnectorSyncRun,
  createPrismaConnectorSyncPersistenceClient: mocks.createPrismaConnectorSyncPersistenceClient,
  createSearchOpsPrismaClient: mocks.createSearchOpsPrismaClient,
  parseCredentialKeyring: mocks.parseCredentialKeyring,
}));
vi.mock("./processor.js", () => ({
  processAndPersistConnectorSyncJob: mocks.processAndPersistConnectorSyncJob,
}));

describe("batch connector sync", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SEARCHOPS_CREDENTIAL_STORAGE_MODE = "encrypted";
    mocks.createSearchOpsPrismaClient.mockReturnValue({
      $disconnect: async () => undefined,
      siteConnector: { findMany: mocks.siteConnectorFindMany },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SEARCHOPS_CREDENTIAL_STORAGE_MODE;
  });

  // 이게 없으면 resolveGoogleAccountSecret 이 갱신을 시도조차 하지 않고
  // credential_expired 를 던진다. Google access token 은 1시간짜리고 이 배치는
  // 하루 한 번 도니까 사실상 100% 실패한다 — 그런데 배치 자체는 "성공" 으로 끝나서
  // 아무도 모른다. 실제로 GSC/GA4 가 전부 credential_expired 로 멈춰 있었다.
  it("hands the processor a refresh lock so expired Google tokens can be renewed", async () => {
    await import("./batch-connector-sync.js");

    expect(mocks.processAndPersistConnectorSyncJob).toHaveBeenCalledOnce();
    const call = mocks.processAndPersistConnectorSyncJob.mock.calls[0] as unknown as
      | readonly unknown[]
      | undefined;
    const options = call?.[2] as { refreshLock?: { withLock?: unknown } } | undefined;
    expect(options?.refreshLock).toBeDefined();
    expect(typeof options?.refreshLock?.withLock).toBe("function");
  });

  // 자격증명 단계에서 탈락한 provider 는 요약의 어느 칸에도 안 들어간다. 전부
  // 탈락하면 ok=0 partial=0 failed=0 이라 아무 일도 안 한 실행이 깨끗한 실행과
  // 똑같아 보인다. 실제로 그런 배치가 초록불로 끝났고, 사용자는 "동기화는 도는데
  // 데이터가 안 보인다" 만 겪었다.
  it("fails the run when providers vanish from the summary instead of reporting success", async () => {
    mocks.siteConnectorFindMany.mockResolvedValueOnce([
      {
        organizationId: "org_demo",
        provider: "gsc",
        site: { domain: "example.test" },
        siteId: "site_1",
      },
      {
        organizationId: "org_demo",
        provider: "ga4",
        site: { domain: "example.test" },
        siteId: "site_1",
      },
    ]);
    mocks.processAndPersistConnectorSyncJob.mockResolvedValueOnce({
      summary: { failedProviders: 0, okProviders: 0, partialProviders: 0 },
    });

    await import("./batch-connector-sync.js");

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
