import { createHash } from "node:crypto";

import { Redis } from "ioredis";

const stateKeyPrefix = "searchops:google-oauth-state:";
const consumeStateScript = `
if redis.call('GET', KEYS[1]) then
  return redis.call('DEL', KEYS[1])
end
return 0
`.trim();

export interface GoogleOAuthStateStore {
  issue(input: {
    readonly expiresAt: string;
    readonly identifier: string;
  }): Promise<boolean>;
  consume(identifier: string): Promise<boolean>;
}

export interface RedisGoogleOAuthStateClient {
  set(
    key: string,
    value: string,
    expiryMode: "PX",
    ttlMs: number,
    condition: "NX",
  ): Promise<"OK" | null>;
  eval(script: string, numberOfKeys: number, key: string): Promise<unknown>;
}

export interface CloseableGoogleOAuthStateStore extends GoogleOAuthStateStore {
  close(): Promise<void>;
}

interface GoogleOAuthStateStoreClockOptions {
  readonly currentTime?: () => Date;
}

export function googleOAuthStateRedisKey(identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `${stateKeyPrefix}${digest}`;
}

export function createMemoryGoogleOAuthStateStore({
  currentTime = () => new Date(),
}: GoogleOAuthStateStoreClockOptions = {}): GoogleOAuthStateStore {
  const expirations = new Map<string, number>();

  return {
    async issue(input) {
      const key = googleOAuthStateRedisKey(input.identifier);
      const nowMs = currentTime().getTime();
      const expiresAtMs = Date.parse(input.expiresAt);
      if (
        input.identifier.length === 0 ||
        !Number.isFinite(expiresAtMs) ||
        expiresAtMs <= nowMs
      ) {
        return false;
      }
      const existingExpiry = expirations.get(key);
      if (existingExpiry !== undefined && existingExpiry > nowMs) {
        return false;
      }
      expirations.set(key, expiresAtMs);
      return true;
    },

    async consume(identifier) {
      const key = googleOAuthStateRedisKey(identifier);
      const expiresAtMs = expirations.get(key);
      expirations.delete(key);
      return expiresAtMs !== undefined && expiresAtMs > currentTime().getTime();
    },
  };
}

export function createRedisGoogleOAuthStateStore(
  client: RedisGoogleOAuthStateClient,
  { currentTime = () => new Date() }: GoogleOAuthStateStoreClockOptions = {},
): GoogleOAuthStateStore {
  return {
    async issue(input) {
      const expiresAtMs = Date.parse(input.expiresAt);
      const ttlMs = Math.ceil(expiresAtMs - currentTime().getTime());
      if (
        input.identifier.length === 0 ||
        !Number.isFinite(expiresAtMs) ||
        !Number.isFinite(ttlMs) ||
        ttlMs <= 0
      ) {
        return false;
      }
      const result = await client.set(
        googleOAuthStateRedisKey(input.identifier),
        "1",
        "PX",
        ttlMs,
        "NX",
      );
      return result === "OK";
    },

    async consume(identifier) {
      if (identifier.length === 0) {
        return false;
      }
      const result = await client.eval(
        consumeStateScript,
        1,
        googleOAuthStateRedisKey(identifier),
      );
      return result === 1 || result === "1";
    },
  };
}

export function createIoredisGoogleOAuthStateStore({
  redisUrl,
}: {
  readonly redisUrl: string;
}): CloseableGoogleOAuthStateStore {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  const store = createRedisGoogleOAuthStateStore(redis);

  return {
    consume: (identifier) => store.consume(identifier),
    issue: (input) => store.issue(input),
    async close() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  };
}
