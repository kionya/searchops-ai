import { parseSearchOpsEnv } from "@searchops/types";
import { createSearchOpsPrismaClient } from "@searchops/db";

import {
  createBullMqConnectorSyncQueue,
  createBullMqCrawlRunQueue,
  createBullMqGeoAnswerMonitorQueue,
  createBullMqSchemaRichResultValidationQueue
} from "./bullmq-queue.js";
import { createPrismaRepository } from "./prisma-repository.js";
import { buildApiServer } from "./server.js";

const env = parseSearchOpsEnv(process.env);
const prisma = createSearchOpsPrismaClient();
const crawlRunQueue = createBullMqCrawlRunQueue({ redisUrl: env.REDIS_URL });
const connectorSyncQueue = createBullMqConnectorSyncQueue({ redisUrl: env.REDIS_URL });
const geoAnswerMonitorQueue = createBullMqGeoAnswerMonitorQueue({ redisUrl: env.REDIS_URL });
const schemaRichResultValidationQueue = createBullMqSchemaRichResultValidationQueue({
  redisUrl: env.REDIS_URL
});
const rateLimitEnabled = env.SEARCHOPS_RATE_LIMIT_ENABLED ?? (env.NODE_ENV === "production");

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const server = buildApiServer({
  connectorSyncQueue,
  crawlRunQueue,
  geoAnswerMonitorQueue,
  rateLimit: {
    enabled: rateLimitEnabled,
    maxRequests: env.SEARCHOPS_RATE_LIMIT_MAX ?? 120,
    windowMs: env.SEARCHOPS_RATE_LIMIT_WINDOW_MS ?? 60_000
  },
  schemaRichResultValidationQueue,
  repository: createPrismaRepository(prisma)
});

server.addHook("onClose", async () => {
  await connectorSyncQueue.close();
  await crawlRunQueue.close();
  await geoAnswerMonitorQueue.close();
  await schemaRichResultValidationQueue.close();
  await prisma.$disconnect();
});

await server.listen({ host, port });
console.log(`SearchOps API listening on http://${host}:${port}`);
