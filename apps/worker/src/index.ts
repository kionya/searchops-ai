import {
  createGeoAnswerMonitorBatchRunner,
  createHttpSchemaRichResultValidatorClient,
  createLiveGeoAnswerMonitorAdaptersFromKeys,
  createLiveSchemaRichResultValidatorAdapter
} from "@searchops/connectors";
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
const connectorSyncRuntime = createConnectorSyncWorker({
  redisUrl: env.REDIS_URL,
  processorOptions: {
    bingApiKey: env.SEARCHOPS_BING_API_KEY,
    ga4PropertyId: env.SEARCHOPS_GA4_PROPERTY_ID,
    googleOAuthClientId: env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID,
    googleOAuthClientSecret: env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET,
    liveExternalApis: shouldEnableConnectorLiveApis(env) ? "enabled" : "disabled",
    pagespeedApiKey: env.SEARCHOPS_PAGESPEED_API_KEY
  }
});

// Live GEO answer monitoring for any provider whose API key is set (ChatGPT,
// Perplexity, Gemini, Claude). Providers without a key — and Copilot, which has
// no public API — fall back to fixture per-provider inside the batch runner.
const geoLiveAdapters = createLiveGeoAnswerMonitorAdaptersFromKeys({
  chatgptApiKey: env.SEARCHOPS_GEO_CHATGPT_API_KEY,
  chatgptModel: env.SEARCHOPS_GEO_CHATGPT_MODEL,
  claudeApiKey: env.SEARCHOPS_GEO_CLAUDE_API_KEY,
  claudeModel: env.SEARCHOPS_GEO_CLAUDE_MODEL,
  geminiApiKey: env.SEARCHOPS_GEO_GEMINI_API_KEY,
  geminiModel: env.SEARCHOPS_GEO_GEMINI_MODEL,
  perplexityApiKey: env.SEARCHOPS_GEO_PERPLEXITY_API_KEY,
  perplexityModel: env.SEARCHOPS_GEO_PERPLEXITY_MODEL
});
const geoAnswerMonitorRuntime = createGeoAnswerMonitorWorker(
  Object.keys(geoLiveAdapters).length > 0
    ? {
        redisUrl: env.REDIS_URL,
        processorOptions: {
          monitorGeoAnswers: createGeoAnswerMonitorBatchRunner(geoLiveAdapters, {
            onProviderError: (provider, error) =>
              console.error(`GEO live provider ${provider} failed; using fixture fallback`, error)
          })
        }
      }
    : { redisUrl: env.REDIS_URL },
);

// Live rich-result validation only when an operator-supplied validator endpoint is
// configured (SEARCHOPS_RICH_RESULT_VALIDATOR_URL must be set on the WORKER too, not
// just the API where readiness is evaluated). Otherwise the job falls back to the
// offline schema-core field-presence validator.
const richResultValidatorAdapter = env.SEARCHOPS_RICH_RESULT_VALIDATOR_URL
  ? createLiveSchemaRichResultValidatorAdapter({
      client: createHttpSchemaRichResultValidatorClient({
        token: env.SEARCHOPS_RICH_RESULT_VALIDATOR_TOKEN,
        url: env.SEARCHOPS_RICH_RESULT_VALIDATOR_URL
      })
    })
  : undefined;
const schemaRichResultValidationRuntime = createSchemaRichResultValidationWorker(
  richResultValidatorAdapter
    ? {
        redisUrl: env.REDIS_URL,
        processorOptions: {
          validateRichResult: (input) => richResultValidatorAdapter.validate(input)
        }
      }
    : { redisUrl: env.REDIS_URL },
);

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

function shouldEnableConnectorLiveApis(env: ReturnType<typeof parseSearchOpsEnv>) {
  return Boolean(
    env.SEARCHOPS_BING_API_KEY ||
      env.SEARCHOPS_GA4_PROPERTY_ID ||
      env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID ||
      env.SEARCHOPS_PAGESPEED_API_KEY,
  );
}
