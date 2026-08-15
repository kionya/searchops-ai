import { parseSearchOpsEnv } from "@searchops/types";
import {
  createPrismaProviderCredentialStore,
  createRichdocContractBridge,
  createSearchOpsPrismaClient,
  parseCredentialKeyring,
  parseRichdocContractConfigFromEnv
} from "@searchops/db";

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
import { createIoredisGoogleOAuthStateStore } from "./google-oauth-state-store.js";
import { createPrismaRepository } from "./prisma-repository.js";
import { createProviderAccountService } from "./provider-account-service.js";
import { buildApiServer } from "./server.js";

const env = parseSearchOpsEnv(process.env);
const googleOAuthClient = createGoogleConnectorOAuthClientFromEnv(process.env);
const googleOAuthStateStore =
  googleOAuthClient === undefined
    ? undefined
    : createIoredisGoogleOAuthStateStore({ redisUrl: env.REDIS_URL });
const prisma = createSearchOpsPrismaClient();
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
const providerCredentialStore = createPrismaProviderCredentialStore(prisma);
const providerAccountService =
  credentialKeyring === undefined
    ? undefined
    : createProviderAccountService({
        keyring: credentialKeyring,
        store: providerCredentialStore
      });
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

const richdocContract = parseRichdocContractConfigFromEnv(env);
// ?? 는 빈 문자열을 통과시켜 Number("")=0 → 랜덤 포트 바인딩이 된다.
// 플랫폼이 PORT를 빈 값으로 주입하는 경우가 있어 || 로 떨어뜨린다.
const port = Number(process.env.PORT) || 4000;
const host = process.env.SEARCHOPS_API_HOST ?? "0.0.0.0";
const server = buildApiServer({
  authContextResolver,
  backupRestoreDrillScheduler,
  connectorSyncQueue,
  crawlRunQueue,
  deadLetterJobStore,
  geoAnswerMonitorQueue,
  googleOAuthClient,
  googleOAuthStateStore,
  operationalAlertRouter,
  operationalLogDrain,
  providerAccountService,
  providerCredentialStore,
  rateLimit: {
    enabled: rateLimitEnabled,
    maxRequests: env.SEARCHOPS_RATE_LIMIT_MAX ?? 120,
    windowMs: env.SEARCHOPS_RATE_LIMIT_WINDOW_MS ?? 60_000
  },
  ...(rateLimitStore === undefined ? {} : { rateLimitStore }),
  schemaRichResultValidationQueue,
  secretRotationExecutor,
  repository: createPrismaRepository(
    prisma,
    richdocContract === undefined
      ? {}
      : { richdocBridge: createRichdocContractBridge({ prisma, ...richdocContract }) },
  )
});

server.addHook("onClose", async () => {
  await connectorSyncQueue.close();
  await crawlRunQueue.close();
  await deadLetterJobStore.close();
  await geoAnswerMonitorQueue.close();
  await googleOAuthStateStore?.close();
  await rateLimitStore?.close();
  await schemaRichResultValidationQueue.close();
  await prisma.$disconnect();
});

await server.listen({ host, port });
console.log(`SearchOps API listening on http://${host}:${port}`);
