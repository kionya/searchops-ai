import { parseSearchOpsEnv } from "@searchops/types";

import { workerJobNames } from "./jobs.js";
import { createCrawlWorker } from "./runtime.js";

const env = parseSearchOpsEnv(process.env);
const runtime = createCrawlWorker({ redisUrl: env.REDIS_URL });

runtime.worker.on("completed", (job) => {
  console.log(`SearchOps worker completed ${job.name} job ${job.id}`);
});

runtime.worker.on("failed", (job, error) => {
  console.error(`SearchOps worker failed ${job?.name ?? "unknown"} job ${job?.id ?? "unknown"}`, error);
});

async function shutdown() {
  await runtime.close();
}

process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

console.log(`SearchOps worker listening for jobs: ${workerJobNames.join(", ")}`);
