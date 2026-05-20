import { parseSearchOpsEnv } from "@searchops/types";
import { createSearchOpsPrismaClient } from "@searchops/db";

import { createBullMqCrawlRunQueue } from "./bullmq-queue.js";
import { createPrismaRepository } from "./prisma-repository.js";
import { buildApiServer } from "./server.js";

const env = parseSearchOpsEnv(process.env);
const prisma = createSearchOpsPrismaClient();
const crawlRunQueue = createBullMqCrawlRunQueue({ redisUrl: env.REDIS_URL });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const server = buildApiServer({
  crawlRunQueue,
  repository: createPrismaRepository(prisma)
});

server.addHook("onClose", async () => {
  await crawlRunQueue.close();
  await prisma.$disconnect();
});

await server.listen({ host, port });
console.log(`SearchOps API listening on http://${host}:${port}`);
