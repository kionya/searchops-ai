import { Redis } from "ioredis";

import {
  createRedisApiRateLimitStoreFromClient,
  type ApiRateLimitStore,
  type RedisRateLimitClient,
} from "./rate-limit.js";

export interface IoredisRateLimitClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

export interface CloseableApiRateLimitStore extends ApiRateLimitStore {
  close(): Promise<void>;
}

export interface CreateIoredisApiRateLimitStoreOptions {
  readonly keyPrefix?: string;
  readonly redisUrl: string;
}

export function createRedisRateLimitClientFromIoredis(
  client: IoredisRateLimitClient,
): RedisRateLimitClient {
  return {
    incr: (key) => client.incr(key),
    pExpire: (key, ttlMs) => client.pexpire(key, ttlMs),
    pTtl: (key) => client.pttl(key),
  };
}

export function createIoredisApiRateLimitStore({
  keyPrefix,
  redisUrl,
}: CreateIoredisApiRateLimitStoreOptions): CloseableApiRateLimitStore {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  const store = createRedisApiRateLimitStoreFromClient(
    createRedisRateLimitClientFromIoredis(redis),
    keyPrefix === undefined ? {} : { keyPrefix },
  );

  return {
    consume: (input) => store.consume(input),
    async close() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}
