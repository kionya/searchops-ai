import { parseSearchOpsEnv } from "@searchops/types";

import { workerJobNames } from "./jobs.js";
import {
  createConnectorSyncWorker,
  createCrawlWorker,
  createGeoAnswerMonitorWorker,
  createSchemaRichResultValidationWorker
} from "./runtime.js";

const env = parseSearchOpsEnv(process.env);
const crawlRuntime = createCrawlWorker({ redisUrl: env.REDIS_URL });
const connectorSyncRuntime = createConnectorSyncWorker({ redisUrl: env.REDIS_URL });
const geoAnswerMonitorRuntime = createGeoAnswerMonitorWorker({ redisUrl: env.REDIS_URL });
const schemaRichResultValidationRuntime = createSchemaRichResultValidationWorker({
  redisUrl: env.REDIS_URL
});

for (const runtime of [
  crawlRuntime,
  connectorSyncRuntime,
  geoAnswerMonitorRuntime,
  schemaRichResultValidationRuntime
]) {
  runtime.worker.on("completed", (job) => {
    console.log(`SearchOps worker completed ${job.name} job ${job.id}`);
  });

  runtime.worker.on("failed", (job, error) => {
    console.error(
      `SearchOps worker failed ${job?.name ?? "unknown"} job ${job?.id ?? "unknown"}`,
      error,
    );
  });
}

async function shutdown() {
  await Promise.all([
    crawlRuntime.close(),
    connectorSyncRuntime.close(),
    geoAnswerMonitorRuntime.close(),
    schemaRichResultValidationRuntime.close()
  ]);
}

process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

console.log(`SearchOps worker listening for jobs: ${workerJobNames.join(", ")}`);
