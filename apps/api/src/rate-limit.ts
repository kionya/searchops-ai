export interface ApiRateLimitPolicy {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface ApiRateLimitConsumeInput extends ApiRateLimitPolicy {
  readonly key: string;
  readonly nowMs: number;
}

export interface ApiRateLimitDecision {
  readonly limited: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export interface ApiRateLimitStore {
  consume(input: ApiRateLimitConsumeInput): Promise<ApiRateLimitDecision>;
}

export interface RedisRateLimitClient {
  incr(key: string): Promise<number>;
  pExpire(key: string, ttlMs: number): Promise<unknown>;
  pTtl(key: string): Promise<number>;
}

export interface CreateRedisRateLimitStoreOptions {
  readonly keyPrefix?: string;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export function createMemoryApiRateLimitStore(): ApiRateLimitStore {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    async consume(input) {
      pruneExpiredBuckets(buckets, input.nowMs);

      const bucket = buckets.get(input.key);
      if (bucket === undefined || input.nowMs >= bucket.resetAtMs) {
        const resetAtMs = input.nowMs + input.windowMs;
        buckets.set(input.key, { count: 1, resetAtMs });
        return {
          limited: false,
          remaining: Math.max(0, input.maxRequests - 1),
          resetAtMs,
        };
      }

      if (bucket.count >= input.maxRequests) {
        return {
          limited: true,
          remaining: 0,
          resetAtMs: bucket.resetAtMs,
        };
      }

      bucket.count += 1;
      return {
        limited: false,
        remaining: Math.max(0, input.maxRequests - bucket.count),
        resetAtMs: bucket.resetAtMs,
      };
    },
  };
}

export function createRedisApiRateLimitStoreFromClient(
  client: RedisRateLimitClient,
  options: CreateRedisRateLimitStoreOptions = {},
): ApiRateLimitStore {
  const keyPrefix = options.keyPrefix ?? "searchops:rate-limit";

  return {
    async consume(input) {
      const redisKey = `${keyPrefix}:${input.key}`;
      const count = await client.incr(redisKey);
      let ttlMs = await client.pTtl(redisKey);

      if (count === 1 || ttlMs < 0) {
        await client.pExpire(redisKey, input.windowMs);
        ttlMs = input.windowMs;
      }

      return {
        limited: count > input.maxRequests,
        remaining: Math.max(0, input.maxRequests - count),
        resetAtMs: input.nowMs + Math.max(0, ttlMs),
      };
    },
  };
}

function pruneExpiredBuckets(buckets: Map<string, RateLimitBucket>, nowMs: number) {
  for (const [bucketKey, bucketValue] of buckets.entries()) {
    if (nowMs >= bucketValue.resetAtMs) {
      buckets.delete(bucketKey);
    }
  }
}
