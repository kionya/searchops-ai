import { describe, expect, it } from "vitest";

import {
  createRedisRateLimitClientFromIoredis,
  type IoredisRateLimitClient,
} from "./redis-rate-limit.js";

describe("ioredis API rate-limit adapter", () => {
  it("maps ioredis lowercase TTL methods to the Redis rate-limit client port", async () => {
    const calls: string[] = [];
    const client: IoredisRateLimitClient = {
      async incr(key) {
        calls.push(`incr:${key}`);
        return 1;
      },
      async pexpire(key, ttlMs) {
        calls.push(`pexpire:${key}:${ttlMs}`);
      },
      async pttl(key) {
        calls.push(`pttl:${key}`);
        return 60_000;
      },
    };
    const adapter = createRedisRateLimitClientFromIoredis(client);

    await expect(adapter.incr("rate-limit:ip_1")).resolves.toBe(1);
    await expect(adapter.pTtl("rate-limit:ip_1")).resolves.toBe(60_000);
    await adapter.pExpire("rate-limit:ip_1", 60_000);

    expect(calls).toEqual([
      "incr:rate-limit:ip_1",
      "pttl:rate-limit:ip_1",
      "pexpire:rate-limit:ip_1:60000",
    ]);
  });
});
