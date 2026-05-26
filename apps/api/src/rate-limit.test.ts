import { describe, expect, it } from "vitest";

import {
  createMemoryApiRateLimitStore,
  createRedisApiRateLimitStoreFromClient,
  type RedisRateLimitClient,
} from "./rate-limit.js";

describe("API rate-limit stores", () => {
  it("keeps process-local buckets deterministic by key and window", async () => {
    const store = createMemoryApiRateLimitStore();

    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 2,
        nowMs: 1000,
        windowMs: 1000,
      }),
    ).resolves.toMatchObject({
      limited: false,
      remaining: 1,
      resetAtMs: 2000,
    });
    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 2,
        nowMs: 1100,
        windowMs: 1000,
      }),
    ).resolves.toMatchObject({
      limited: false,
      remaining: 0,
    });
    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 2,
        nowMs: 1200,
        windowMs: 1000,
      }),
    ).resolves.toMatchObject({
      limited: true,
      remaining: 0,
    });
    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 2,
        nowMs: 2100,
        windowMs: 1000,
      }),
    ).resolves.toMatchObject({
      limited: false,
      remaining: 1,
      resetAtMs: 3100,
    });
  });

  it("adapts Redis-like atomic counters for distributed rate limiting", async () => {
    const counts = new Map<string, number>();
    const ttlByKey = new Map<string, number>();
    const client: RedisRateLimitClient = {
      async incr(key) {
        const nextCount = (counts.get(key) ?? 0) + 1;
        counts.set(key, nextCount);
        return nextCount;
      },
      async pExpire(key, ttlMs) {
        ttlByKey.set(key, ttlMs);
      },
      async pTtl(key) {
        return ttlByKey.get(key) ?? -1;
      },
    };
    const store = createRedisApiRateLimitStoreFromClient(client, {
      keyPrefix: "test:rate-limit",
    });

    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 1,
        nowMs: 5000,
        windowMs: 60_000,
      }),
    ).resolves.toEqual({
      limited: false,
      remaining: 0,
      resetAtMs: 65_000,
    });
    await expect(
      store.consume({
        key: "ip_1",
        maxRequests: 1,
        nowMs: 6000,
        windowMs: 60_000,
      }),
    ).resolves.toEqual({
      limited: true,
      remaining: 0,
      resetAtMs: 66_000,
    });
    expect(counts.get("test:rate-limit:ip_1")).toBe(2);
    expect(ttlByKey.get("test:rate-limit:ip_1")).toBe(60_000);
  });
});
