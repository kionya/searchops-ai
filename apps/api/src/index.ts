import { parseSearchOpsEnv } from "@searchops/types";
import { createSearchOpsPrismaClient } from "@searchops/db";

import {
  createBullMqConnectorSyncQueue,
  createBullMqCrawlRunQueue,
  createBullMqGeoAnswerMonitorQueue,
  createBullMqSchemaRichResultValidationQueue
} from "./bullmq-queue.js";
import {
  createHmacJwtIdpTokenVerifier,
  createJwksRs256IdpTokenVerifier,
  createRequestAuthContextResolver,
  parseJwksJson
} from "./auth.js";
import { createBullMqDeadLetterJobStore } from "./dead-letter-store.js";
import {
  createHttpOperationalAlertRouter,
  createHttpOperationalLogDrain
} from "./observability.js";
import {
  createHttpBackupRestoreDrillScheduler,
  createHttpSecretRotationExecutor
} from "./operations-hardening.js";
import { createIoredisApiRateLimitStore } from "./redis-rate-limit.js";
import { createGoogleConnectorOAuthClientFromEnv } from "./google-oauth.js";
import { createPrismaRepository } from "./prisma-repository.js";
import { buildApiServer } from "./server.js";

const env = parseSearchOpsEnv(process.env);
const googleOAuthClient = createGoogleConnectorOAuthClientFromEnv(process.env);
const prisma = createSearchOpsPrismaClient();
const crawlRunQueue = createBullMqCrawlRunQueue({ redisUrl: env.REDIS_URL });
const connectorSyncQueue = createBullMqConnectorSyncQueue({ redisUrl: env.REDIS_URL });
const geoAnswerMonitorQueue = createBullMqGeoAnswerMonitorQueue({ redisUrl: env.REDIS_URL });
const schemaRichResultValidationQueue = createBullMqSchemaRichResultValidationQueue({
  redisUrl: env.REDIS_URL
});
const deadLetterJobStore = createBullMqDeadLetterJobStore({ redisUrl: env.REDIS_URL });
const rateLimitEnabled = env.SEARCHOPS_RATE_LIMIT_ENABLED ?? (env.NODE_ENV === "production");
const rateLimitStore = rateLimitEnabled
  ? createIoredisApiRateLimitStore({ redisUrl: env.REDIS_URL })
  : undefined;
const deploymentTokenVerifier =
  env.SEARCHOPS_IDP_JWKS_JSON === undefined
    ? env.SEARCHOPS_IDP_JWT_HS256_SECRET === undefined
      ? undefined
      : createHmacJwtIdpTokenVerifier({
          audience: env.SEARCHOPS_IDP_AUDIENCE,
          issuer: env.SEARCHOPS_IDP_ISSUER,
          provider: "deployment_idp",
          secret: env.SEARCHOPS_IDP_JWT_HS256_SECRET
        })
    : createJwksRs256IdpTokenVerifier({
        audience: env.SEARCHOPS_IDP_AUDIENCE,
        issuer: env.SEARCHOPS_IDP_ISSUER,
        jwks: parseJwksJson(env.SEARCHOPS_IDP_JWKS_JSON),
        provider: "deployment_idp"
      });
const authContextResolver =
  deploymentTokenVerifier === undefined
    ? undefined
    : createRequestAuthContextResolver({
        allowMockFallback: env.NODE_ENV !== "production",
        allowTrustedHeaders: env.NODE_ENV !== "production",
        tokenVerifier: deploymentTokenVerifier
      });
const operationalLogDrain =
  env.SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL === undefined
    ? undefined
    : createHttpOperationalLogDrain({
        bearerToken: env.SEARCHOPS_OBSERVABILITY_LOG_DRAIN_TOKEN,
        endpointUrl: env.SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL
      });
const operationalAlertRouter =
  env.SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL === undefined
    ? undefined
    : createHttpOperationalAlertRouter({
        bearerToken: env.SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_TOKEN,
        endpointUrl: env.SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL
      });
const backupRestoreDrillScheduler =
  env.SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL === undefined
    ? undefined
    : createHttpBackupRestoreDrillScheduler({
        bearerToken: env.SEARCHOPS_RESTORE_DRILL_WEBHOOK_TOKEN,
        endpointUrl: env.SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL
      });
const secretRotationExecutor =
  env.SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL === undefined
    ? undefined
    : createHttpSecretRotationExecutor({
        bearerToken: env.SEARCHOPS_SECRET_ROTATION_WEBHOOK_TOKEN,
        endpointUrl: env.SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL
      });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.SEARCHOPS_API_HOST ?? "0.0.0.0";
const server = buildApiServer({
  authContextResolver,
  backupRestoreDrillScheduler,
  connectorSyncQueue,
  crawlRunQueue,
  deadLetterJobStore,
  geoAnswerMonitorQueue,
  googleOAuthClient,
  operationalAlertRouter,
  operationalLogDrain,
  rateLimit: {
    enabled: rateLimitEnabled,
    maxRequests: env.SEARCHOPS_RATE_LIMIT_MAX ?? 120,
    windowMs: env.SEARCHOPS_RATE_LIMIT_WINDOW_MS ?? 60_000
  },
  ...(rateLimitStore === undefined ? {} : { rateLimitStore }),
  schemaRichResultValidationQueue,
  secretRotationExecutor,
  repository: createPrismaRepository(prisma)
});

server.addHook("onClose", async () => {
  await connectorSyncQueue.close();
  await crawlRunQueue.close();
  await deadLetterJobStore.close();
  await geoAnswerMonitorQueue.close();
  await rateLimitStore?.close();
  await schemaRichResultValidationQueue.close();
  await prisma.$disconnect();
});

await server.listen({ host, port });
console.log(`SearchOps API listening on http://${host}:${port}`);
