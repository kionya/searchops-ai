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
  createJwksIdpTokenVerifier,
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
// parseCredentialKeyring 은 어느 조건이 깨졌는지 말하지 않고 credential_keyring_invalid
// 하나만 던진다. 그 문자열은 시스템 전체가 에러 코드로 쓰고 있어(worker 의 processor,
// 회전 스크립트) 바꿀 수 없다. 대신 부팅 때만 원인을 짚어준다 — 값은 절대 찍지 않는다.
function describeKeyringProblem(): string | undefined {
  const keyId = env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID;
  const material = env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY;
  if (keyId === undefined || keyId.trim().length === 0) {
    return "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID 가 비어 있다.";
  }
  if (material === undefined || material.trim().length === 0) {
    return "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY 가 비어 있다.";
  }
  const decoded = Buffer.from(material, "base64");
  // 정규형 일치까지 요구한다 — 공백·줄바꿈이 섞이거나 base64url(-, _)이면 여기서 걸린다.
  if (decoded.toString("base64") !== material) {
    return "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY 가 표준 base64 가 아니다(공백·줄바꿈이 섞였거나 base64url 형식).";
  }
  if (decoded.length !== 32) {
    return `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY 를 디코딩하면 ${decoded.length}바이트다. AES-256 은 정확히 32바이트를 요구한다.`;
  }
  return undefined;
}

function buildCredentialKeyring() {
  if (env.SEARCHOPS_CREDENTIAL_STORAGE_MODE === undefined) {
    return undefined;
  }
  try {
    return parseCredentialKeyring({
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
  } catch (error) {
    // 원래 오류는 cause 로 남긴다 — credential_keyring_invalid 라는 코드 자체는
    // 다른 곳에서 의미를 갖는다. 여기서는 운영자가 고칠 수 있게 이유만 덧붙인다.
    const reason = describeKeyringProblem() ?? "이전 키 JSON 이 잘못됐거나 활성 키 id 와 겹친다.";
    throw new Error(
      `자격증명 키링을 읽지 못했다: ${reason} 생성: ` +
        `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))" ` +
        "(자세한 절차는 docs/API_DEPLOYMENT.md 2절)",
      { cause: error },
    );
  }
}

const credentialKeyring = buildCredentialKeyring();
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
    : createJwksIdpTokenVerifier({
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

// 검증기가 없으면 인증이 필요한 경로가 401 이 아니라 **500** 을 낸다. 증상만 보면
// 인증 설정 문제로 보이지 않아서 원인을 한참 못 찾는다(실제로 겪었다). 운영에서는
// 토큰을 검증할 수 없는 API 는 어차피 쓸 수 없으므로, 조용히 뜨는 대신 여기서 끊는다.
if (authContextResolver === undefined && env.NODE_ENV === "production") {
  throw new Error(
    "Invalid SearchOps environment: 토큰 검증기가 구성되지 않았다. " +
      "SEARCHOPS_IDP_JWKS_JSON(권장) 또는 SEARCHOPS_IDP_JWT_HS256_SECRET 중 하나가 필요하다. " +
      "Supabase 는 https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json 에서 받는다. " +
      "자세한 절차는 docs/API_DEPLOYMENT.md 2절.",
  );
}
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
  // 접속만 확인한다. 데이터는 읽지 않는다.
  databaseProbe: async () => {
    await prisma.$queryRaw`select 1`;
  },
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
