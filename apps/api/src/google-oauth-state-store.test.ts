import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createMemoryGoogleOAuthStateStore,
  createRedisGoogleOAuthStateStore,
  googleOAuthStateRedisKey,
  type RedisGoogleOAuthStateClient,
} from "./google-oauth-state-store.js";

const now = new Date("2026-07-14T00:00:00.000Z");
const currentTime = () => now;

describe("GoogleOAuthStateStore", () => {
  it("issues and consumes an in-memory state exactly once", async () => {
    const store = createMemoryGoogleOAuthStateStore({ currentTime });

    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:10:00.000Z",
        identifier: "nonce-a",
      }),
    ).resolves.toBe(true);
    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:10:00.000Z",
        identifier: "nonce-a",
      }),
    ).resolves.toBe(false);
    await expect(store.consume("nonce-a")).resolves.toBe(true);
    await expect(store.consume("nonce-a")).resolves.toBe(false);
  });

  it("rejects expired issuance and treats expired memory entries as unavailable", async () => {
    let clock = now;
    const store = createMemoryGoogleOAuthStateStore({ currentTime: () => clock });

    await expect(
      store.issue({ expiresAt: now.toISOString(), identifier: "already-expired" }),
    ).resolves.toBe(false);
    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:00:01.000Z",
        identifier: "short-lived",
      }),
    ).resolves.toBe(true);
    clock = new Date("2026-07-14T00:00:01.001Z");
    await expect(store.consume("short-lived")).resolves.toBe(false);
  });

  it("hashes the identifier and issues Redis state with exact NX and positive TTL", async () => {
    const set = vi.fn<RedisGoogleOAuthStateClient["set"]>().mockResolvedValue("OK");
    const evalCommand = vi.fn<RedisGoogleOAuthStateClient["eval"]>();
    const store = createRedisGoogleOAuthStateStore(
      { eval: evalCommand, set },
      { currentTime },
    );

    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:00:10.000Z",
        identifier: "raw-random-nonce",
      }),
    ).resolves.toBe(true);

    const digest = createHash("sha256").update("raw-random-nonce").digest("hex");
    const expectedKey = `searchops:google-oauth-state:${digest}`;
    expect(googleOAuthStateRedisKey("raw-random-nonce")).toBe(expectedKey);
    expect(set).toHaveBeenCalledWith(expectedKey, "1", "PX", 10_000, "NX");
    expect(JSON.stringify(set.mock.calls)).not.toContain("raw-random-nonce");
  });

  it("fails closed on Redis collision, expired TTL, and Redis errors", async () => {
    const set = vi.fn<RedisGoogleOAuthStateClient["set"]>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("redis-detail-sentinel"));
    const store = createRedisGoogleOAuthStateStore(
      { eval: vi.fn(), set },
      { currentTime },
    );

    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:00:01.000Z",
        identifier: "collision",
      }),
    ).resolves.toBe(false);
    await expect(
      store.issue({ expiresAt: now.toISOString(), identifier: "expired" }),
    ).resolves.toBe(false);
    await expect(
      store.issue({
        expiresAt: "2026-07-14T00:00:01.000Z",
        identifier: "redis-error",
      }),
    ).rejects.toThrow("redis-detail-sentinel");
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("atomically consumes Redis state by hashed key", async () => {
    const evalCommand = vi.fn<RedisGoogleOAuthStateClient["eval"]>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const store = createRedisGoogleOAuthStateStore(
      { eval: evalCommand, set: vi.fn() },
      { currentTime },
    );
    const expectedKey = googleOAuthStateRedisKey("consume-nonce");

    await expect(store.consume("consume-nonce")).resolves.toBe(true);
    await expect(store.consume("consume-nonce")).resolves.toBe(false);
    expect(evalCommand).toHaveBeenNthCalledWith(
      1,
      [
        "if redis.call('GET', KEYS[1]) then",
        "  return redis.call('DEL', KEYS[1])",
        "end",
        "return 0",
      ].join("\n"),
      1,
      expectedKey,
    );
    expect(JSON.stringify(evalCommand.mock.calls)).not.toContain("consume-nonce");
  });
});
