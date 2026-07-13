import {
  createHttpSchemaRichResultValidatorClient,
  createLiveSchemaRichResultValidatorAdapter,
  shouldEnableConnectorLiveRuntime
} from "@searchops/connectors";
import { parseCredentialKeyring } from "@searchops/db";
import { parseSearchOpsEnv } from "@searchops/types";

import { workerJobNames } from "./jobs.js";
import {
  createConnectorSyncWorker,
  createCrawlWorker,
  createGeoAnswerMonitorWorker,
  createSchemaRichResultValidationWorker,
  formatWorkerFailureLog,
  shouldEnableGeoLiveApis
} from "./runtime.js";

const env = parseSearchOpsEnv(process.env);
const connectorLiveExternalApis = shouldEnableConnectorLiveRuntime({
  ...(env.SEARCHOPS_CREDENTIAL_STORAGE_MODE === undefined
    ? {}
    : { credentialStorageMode: env.SEARCHOPS_CREDENTIAL_STORAGE_MODE }),
  ...(env.SEARCHOPS_PAGESPEED_API_KEY === undefined
    ? {}
    : { pagespeedApiKey: env.SEARCHOPS_PAGESPEED_API_KEY }),
});
const geoPlatformApiKeys = {
  geo_chatgpt: env.SEARCHOPS_GEO_CHATGPT_API_KEY,
  geo_claude: env.SEARCHOPS_GEO_CLAUDE_API_KEY,
  geo_gemini: env.SEARCHOPS_GEO_GEMINI_API_KEY,
  geo_perplexity: env.SEARCHOPS_GEO_PERPLEXITY_API_KEY
};
const geoLiveExternalApis = shouldEnableGeoLiveApis({
  credentialStorageMode: env.SEARCHOPS_CREDENTIAL_STORAGE_MODE,
  geoPlatformApiKeys
});
const credentialKeyring =
  env.SEARCHOPS_CREDENTIAL_STORAGE_MODE === undefined
    ? undefined
    : parseCredentialKeyring({
        ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY === undefined
          ? {}
          : { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY }),
        ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID === undefined
          ? {}
          : { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID }),
        ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON === undefined
          ? {}
          : {
              SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON:
                env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON
            })
      });
const crawlRuntime = createCrawlWorker({ redisUrl: env.REDIS_URL });
const connectorSyncRuntime = createConnectorSyncWorker({
  redisUrl: env.REDIS_URL,
  processorOptions: {
    bingApiKey: env.SEARCHOPS_BING_API_KEY,
    credentialKeyring,
    credentialStorageMode: env.SEARCHOPS_CREDENTIAL_STORAGE_MODE,
    ga4PropertyId: env.SEARCHOPS_GA4_PROPERTY_ID,
    googleOAuthClientId: env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID,
    googleOAuthClientSecret: env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET,
    liveExternalApis: connectorLiveExternalApis ? "enabled" : "disabled",
    pagespeedApiKey: env.SEARCHOPS_PAGESPEED_API_KEY
  }
});

const geoAnswerMonitorRuntime = createGeoAnswerMonitorWorker({
  redisUrl: env.REDIS_URL,
  processorOptions: {
    credentialKeyring,
    credentialStorageMode: env.SEARCHOPS_CREDENTIAL_STORAGE_MODE,
    geoPlatformApiKeys,
    geoProviderModels: {
      chatgpt: env.SEARCHOPS_GEO_CHATGPT_MODEL,
      claude: env.SEARCHOPS_GEO_CLAUDE_MODEL,
      gemini: env.SEARCHOPS_GEO_GEMINI_MODEL,
      perplexity: env.SEARCHOPS_GEO_PERPLEXITY_MODEL
    },
    liveExternalApis: geoLiveExternalApis ? "enabled" : "disabled"
  }
});

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

  runtime.worker.on("failed", (_job, error) => {
    console.error(formatWorkerFailureLog(error));
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
