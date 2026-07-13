import {
  ConnectorLiveSetupReportSchema,
  type ConnectorLiveSetupCheck,
  type ConnectorLiveSetupEnvironment,
  type ConnectorLiveSetupReport,
  type ConnectorLiveSetupStatus,
} from "@searchops/types";
import {
  parseCredentialKeyring,
  type ConnectorCredentialReadinessSnapshot,
} from "@searchops/db";

export interface CreateConnectorLiveSetupReportInput {
  readonly connectorCredentials?: ConnectorCredentialReadinessSnapshot;
  readonly env: NodeJS.ProcessEnv;
  readonly environment: ConnectorLiveSetupEnvironment;
  readonly generatedAt: Date;
}

const runtimeBaseKeys = ["DATABASE_URL", "REDIS_URL"] as const;
const googleOAuthKeys = [
  "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
  "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
  "SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI",
  "SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET",
] as const;

export function createConnectorLiveSetupReport({
  connectorCredentials,
  env,
  environment,
  generatedAt,
}: CreateConnectorLiveSetupReportInput): ConnectorLiveSetupReport {
  const googleOAuth = evaluateGoogleOAuth(env);
  const checks: ConnectorLiveSetupCheck[] = [
    evaluateRuntimeBase(env),
    evaluateApiWebBase(env, environment),
    evaluateCredentialKeyring(env),
    googleOAuth.check,
    evaluateGoogleWorkerRefresh(env),
    evaluateGsc(connectorCredentials),
    evaluateGa4(connectorCredentials),
    evaluatePagespeed(env),
    evaluateBing(connectorCredentials),
    evaluateCms(env),
    evaluateCredentialCutover(env, connectorCredentials),
    evaluateLiveModeGate(env, googleOAuth.ready),
  ];
  const summary = summarizeChecks(checks);
  const liveExternalApis = shouldEnableConnectorLiveApis(env) ? "enabled" : "disabled";
  const cutoverReady =
    checks.find((check) => check.id === "credential-storage-cutover")?.status !== "warning";
  const nonGoogleProviderReady = checks.some(
    (check) =>
      ["pagespeed", "bing", "cms"].includes(check.area) && check.status === "ready",
  );
  const googleProviderReady =
    googleOAuth.ready &&
    checks.some(
      (check) => ["gsc", "ga4"].includes(check.area) && check.status === "ready",
    );

  return ConnectorLiveSetupReportSchema.parse({
    generatedAt: generatedAt.toISOString(),
    environment,
    liveExternalApis,
    canRunFixtureMode:
      summary.blocked === 0 &&
      runtimeBaseKeys.every((key) => hasEnv(env, key)) &&
      liveExternalApis === "disabled",
    canRunLiveConnectorSync:
      summary.blocked === 0 &&
      cutoverReady &&
      (nonGoogleProviderReady || googleProviderReady),
    checks,
    summary,
  });
}

function evaluateCredentialKeyring(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  const envKeys = [
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON",
    "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
  ];

  if (!hasEnv(env, "SEARCHOPS_CREDENTIAL_STORAGE_MODE")) {
    return createCheck({
      area: "runtime",
      envKeys,
      id: "credential-encryption-keyring",
      nextAction: "암호화 저장을 사용할 때 Railway API와 Worker에 같은 mode와 keyring을 설정하세요.",
      status: "configured",
      summary: "Credential storage mode가 없어 로컬 fixture/platform 검사만 수행합니다.",
      title: "Credential encryption keyring",
    });
  }

  try {
    parseCredentialKeyring({
      ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID === undefined
        ? {}
        : {
            SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID:
              env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID,
          }),
      ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY === undefined
        ? {}
        : {
            SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY:
              env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY,
          }),
      ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON === undefined
        ? {}
        : {
            SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON:
              env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON,
          }),
    });
    return createCheck({
      area: "runtime",
      envKeys,
      id: "credential-encryption-keyring",
      nextAction: "Railway API와 Worker의 active/previous keyring 값이 동일한지 배포 설정에서 대조하세요.",
      status: "configured",
      summary: "현재 프로세스의 encryption keyring 형식과 키 길이가 유효합니다.",
      title: "Credential encryption keyring",
    });
  } catch {
    return createCheck({
      area: "runtime",
      envKeys,
      id: "credential-encryption-keyring",
      nextAction: "32-byte base64 active key와 유효한 previous key JSON을 API와 Worker에 동일하게 설정하세요.",
      status: "blocked",
      summary: "설정된 encryption keyring의 의미 검증에 실패했습니다.",
      title: "Credential encryption keyring",
    });
  }
}

export function summarizeConnectorLiveSetupFailure(
  report: ConnectorLiveSetupReport,
  options: { readonly requireLive: boolean },
) {
  const reasons: string[] = [];

  if (report.summary.blocked > 0) {
    const blockedIds = report.checks
      .filter((check) => check.status === "blocked")
      .map((check) => check.id)
      .join(", ");
    reasons.push(`blocked checks: ${blockedIds}`);
  }

  if (options.requireLive && !report.canRunLiveConnectorSync) {
    reasons.push("require-live was requested, but no provider is ready for live connector sync.");
  }

  if (reasons.length === 0) {
    return undefined;
  }

  return `Connector live setup check failed: ${reasons.join("; ")}`;
}

function evaluateRuntimeBase(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  const missing = runtimeBaseKeys.filter((key) => !hasEnv(env, key));
  if (missing.length > 0) {
    return createCheck({
      area: "runtime",
      envKeys: [...runtimeBaseKeys],
      id: "runtime-base-env",
      nextAction: `${missing.join(", ")}를 설정한 뒤 API/worker를 다시 시작하세요.`,
      status: "blocked",
      summary: "API/worker 런타임에 필요한 기본 DB/Redis 환경변수가 없습니다.",
      title: "API/worker 기본 런타임 env",
    });
  }

  return createCheck({
    area: "runtime",
    envKeys: [...runtimeBaseKeys],
    id: "runtime-base-env",
    nextAction: "현재 DATABASE_URL과 REDIS_URL로 API/worker를 실행할 수 있습니다.",
    status: "configured",
    summary: "API/worker 런타임에 필요한 기본 DB/Redis 환경변수가 설정되어 있습니다.",
    title: "API/worker 기본 런타임 env",
  });
}

function evaluateApiWebBase(
  env: NodeJS.ProcessEnv,
  environment: ConnectorLiveSetupEnvironment,
): ConnectorLiveSetupCheck {
  const keys = ["SEARCHOPS_API_BASE_URL", "SEARCHOPS_PUBLIC_APP_URL"];
  const missing = keys.filter((key) => !hasEnv(env, key));

  if (missing.length > 0) {
    return createCheck({
      area: "runtime",
      envKeys: keys,
      id: "web-api-url-env",
      nextAction:
        environment === "local"
          ? "로컬 web 실행 시 SEARCHOPS_API_BASE_URL=http://localhost:4000, SEARCHOPS_PUBLIC_APP_URL=http://localhost:3000을 설정하세요."
          : "배포 web 환경에 API base URL과 public app URL을 등록하세요.",
      status: "warning",
      summary: "web server action과 OAuth return URL 생성에 필요한 URL env가 일부 비어 있습니다.",
      title: "Web/API URL env",
    });
  }

  return createCheck({
    area: "runtime",
    envKeys: keys,
    id: "web-api-url-env",
    nextAction: "web server action과 OAuth return URL 생성에 필요한 URL env가 설정되어 있습니다.",
    status: "configured",
    summary: "web/API URL env가 설정되어 connector UI에서 API와 OAuth URL을 만들 수 있습니다.",
    title: "Web/API URL env",
  });
}

function evaluateGoogleOAuth(env: NodeJS.ProcessEnv) {
  const present = googleOAuthKeys.filter((key) => hasEnv(env, key));
  const missing = googleOAuthKeys.filter((key) => !hasEnv(env, key));

  if (present.length === 0) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys: [...googleOAuthKeys],
        id: "google-oauth-env",
        nextAction: "GSC/GA4 live sync를 쓰려면 Google OAuth client id, secret, redirect URI, state secret을 모두 등록하세요.",
        status: "needs_provisioning",
        summary: "Google OAuth 런타임 env가 아직 없습니다.",
        title: "Google OAuth env",
      }),
    };
  }

  if (missing.length > 0) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys: [...googleOAuthKeys],
        id: "google-oauth-env",
        nextAction: `${missing.join(", ")}를 추가하세요. Google OAuth는 부분 설정 상태로 live connector를 켜면 안 됩니다.`,
        status: "blocked",
        summary: "Google OAuth env가 부분 설정되어 GSC/GA4 live sync가 안전하지 않습니다.",
        title: "Google OAuth env",
      }),
    };
  }

  const redirectUri = env.SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI;
  if (!isHttpUrl(redirectUri)) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys: [...googleOAuthKeys],
        id: "google-oauth-env",
        nextAction: "SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI를 http(s) 절대 URL로 설정하세요.",
        status: "blocked",
        summary: "Google OAuth redirect URI 형식이 올바르지 않습니다.",
        title: "Google OAuth env",
      }),
    };
  }

  if ((env.SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET?.trim().length ?? 0) < 16) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys: [...googleOAuthKeys],
        id: "google-oauth-env",
        nextAction: "SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET을 16자 이상 난수 문자열로 교체하세요.",
        status: "blocked",
        summary: "Google OAuth state secret이 너무 짧습니다.",
        title: "Google OAuth env",
      }),
    };
  }

  return {
    ready: true,
    check: createCheck({
      area: "oauth",
      envKeys: [...googleOAuthKeys],
      id: "google-oauth-env",
      nextAction: "Google Cloud Console의 authorized redirect URI가 이 값과 정확히 일치하는지 확인하세요.",
      status: "configured",
      summary: "Google OAuth client env 조합이 완성되어 있습니다.",
      title: "Google OAuth env",
    }),
  };
}

function evaluateGoogleWorkerRefresh(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  const envKeys = [
    "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
    "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
  ];
  const missing = envKeys.filter((key) => !hasEnv(env, key));

  if (missing.length === envKeys.length) {
    return createCheck({
      area: "oauth",
      envKeys,
      id: "google-worker-refresh-env",
      nextAction: "GSC/GA4를 사용할 때 Railway Worker에 Google client ID와 secret을 함께 설정하세요.",
      status: "needs_provisioning",
      summary: "Worker Google token refresh 앱 credential은 선택되지 않았습니다.",
      title: "Worker Google refresh env",
    });
  }
  if (missing.length > 0) {
    return createCheck({
      area: "oauth",
      envKeys,
      id: "google-worker-refresh-env",
      nextAction: `${missing.join(", ")}를 추가하거나 두 값을 모두 제거하세요.`,
      status: "blocked",
      summary: "Worker Google token refresh 앱 credential이 부분 설정 상태입니다.",
      title: "Worker Google refresh env",
    });
  }

  return createCheck({
    area: "oauth",
    envKeys,
    id: "google-worker-refresh-env",
    nextAction: "API와 Worker가 동일한 Google OAuth client ID/secret을 사용하는지 확인하세요.",
    status: "configured",
    summary: "Worker token refresh에 필요한 Google OAuth client 값이 설정되어 있습니다.",
    title: "Worker Google refresh env",
  });
}

function evaluateGsc(
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  if ((connectorCredentials?.configuredByProvider.gsc ?? 0) > 0) {
    return createCheck({
      area: "gsc",
      envKeys: [],
      id: "gsc-live-credential",
      nextAction: "사이트 커넥터 화면에서 GSC OAuth를 완료한 뒤 GSC만 단독 동기화하세요.",
      status: "ready",
      summary: "조직 ProviderAccount와 사이트 GSC 속성 binding이 connected 상태입니다.",
      title: "GSC live credential",
    });
  }

  return createCheck({
    area: "gsc",
    envKeys: [],
    id: "gsc-live-credential",
    nextAction:
      connectorCredentials === undefined
        ? "DB-free CLI는 tenant 상태를 조회하지 않습니다. 로그인 후 /ops/readiness 또는 integrations 화면을 확인하세요."
        : "조직 Google 계정을 연결하고 사이트에 정확한 GSC 속성을 선택하세요.",
    status: "needs_provisioning",
    summary:
      connectorCredentials === undefined
        ? "로컬 platform 검사에는 조직별 GSC connector metadata가 포함되지 않습니다."
        : "이 조직에는 connected 상태의 GSC 사이트 binding이 없습니다.",
    title: "GSC live credential",
  });
}

function evaluateGa4(
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  if ((connectorCredentials?.configuredByProvider.ga4 ?? 0) > 0) {
    return createCheck({
      area: "ga4",
      envKeys: [],
      id: "ga4-live-credential",
      nextAction: "사이트 커넥터 화면에서 GA4 OAuth를 완료한 뒤 GA4만 단독 동기화하세요.",
      status: "ready",
      summary: "조직 ProviderAccount와 사이트 숫자 GA4 Property ID binding이 connected 상태입니다.",
      title: "GA4 live credential",
    });
  }

  return createCheck({
    area: "ga4",
    envKeys: [],
    id: "ga4-live-credential",
    nextAction:
      connectorCredentials === undefined
        ? "DB-free CLI는 tenant 상태를 조회하지 않습니다. 로그인 후 /ops/readiness 또는 integrations 화면을 확인하세요."
        : "조직 Google 계정을 연결하고 사이트에 숫자 GA4 Property ID를 선택하세요.",
    status: "needs_provisioning",
    summary:
      connectorCredentials === undefined
        ? "로컬 platform 검사에는 조직별 GA4 connector metadata가 포함되지 않습니다."
        : "이 조직에는 connected 상태의 GA4 사이트 binding이 없습니다.",
    title: "GA4 live credential",
  });
}

function evaluatePagespeed(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  if (hasEnv(env, "SEARCHOPS_PAGESPEED_API_KEY")) {
    return createCheck({
      area: "pagespeed",
      envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"],
      id: "pagespeed-live-credential",
      nextAction: "PageSpeed만 단독 동기화해 quota와 응답 상태를 확인하세요.",
      status: "ready",
      summary: "PageSpeed Insights API key가 설정되어 있습니다.",
      title: "PageSpeed live credential",
    });
  }

  return createCheck({
    area: "pagespeed",
    envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"],
    id: "pagespeed-live-credential",
    nextAction: "PageSpeed live sync가 필요하면 Railway Worker에 플랫폼 API key를 등록하세요.",
    status: "configured",
    summary: "PageSpeed 플랫폼 key는 선택 사항이며 현재 비활성입니다.",
    title: "PageSpeed live credential",
  });
}

function evaluateBing(
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  if ((connectorCredentials?.configuredByProvider.bing ?? 0) > 0) {
    return createCheck({
      area: "bing",
      envKeys: [],
      id: "bing-live-credential",
      nextAction: "Bing만 단독 동기화해 조직 계정과 사이트 리소스 권한을 확인하세요.",
      status: "ready",
      summary: "조직 Bing ProviderAccount와 사이트 리소스 binding이 connected 상태입니다.",
      title: "Bing live credential",
    });
  }

  return createCheck({
    area: "bing",
    envKeys: [],
    id: "bing-live-credential",
    nextAction:
      connectorCredentials === undefined
        ? "DB-free CLI는 tenant 상태를 조회하지 않습니다. 로그인 후 /ops/readiness 또는 integrations 화면을 확인하세요."
        : "조직 Bing 계정을 연결하고 사이트에 검증된 Bing 리소스를 선택하세요.",
    status: "needs_provisioning",
    summary:
      connectorCredentials === undefined
        ? "로컬 platform 검사에는 조직별 Bing connector metadata가 포함되지 않습니다."
        : "이 조직에는 connected 상태의 Bing 사이트 binding이 없습니다.",
    title: "Bing live credential",
  });
}

function evaluateCredentialCutover(
  env: NodeJS.ProcessEnv,
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  const mode = env.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  const legacyFallbacks = connectorCredentials?.legacyFallbacks;
  const base = {
    area: "runtime" as const,
    envKeys: ["SEARCHOPS_CREDENTIAL_STORAGE_MODE"],
    id: "credential-storage-cutover",
    title: "Encrypted credential cutover",
  };

  if (mode !== "dual" && mode !== "encrypted") {
    return createCheck({
      ...base,
      nextAction: "암호화 rollout 시 API와 Worker에 dual mode부터 설정하세요.",
      status: "configured",
      summary: "Credential storage rollout은 아직 활성화되지 않았습니다.",
    });
  }
  if (legacyFallbacks === undefined) {
    return createCheck({
      ...base,
      nextAction: "로컬 CLI는 DB를 조회하지 않습니다. 로그인 후 /ops/readiness에서 조직 fallback을 확인하세요.",
      status: "warning",
      summary: "Platform 설정만 검사했으며 조직별 legacy fallback metadata는 조회하지 않았습니다.",
    });
  }
  if (legacyFallbacks > 0) {
    return createCheck({
      ...base,
      nextAction:
        mode === "encrypted"
          ? "API와 Worker를 dual로 롤백하고 legacy fallback을 0으로 만드세요."
          : "Backfill을 완료하고 legacy fallback이 0건이 될 때까지 dual mode를 유지하세요.",
      status: mode === "encrypted" ? "blocked" : "warning",
      summary:
        mode === "encrypted"
          ? "Encrypted mode인데 조직 sync metadata에 legacy fallback이 남아 있습니다."
          : "Dual mode 조직 sync metadata에 legacy credential fallback이 남아 있습니다.",
    });
  }

  return createCheck({
    ...base,
    nextAction:
      mode === "dual"
        ? "백업과 검증을 완료한 뒤 encrypted cutover를 승인하세요."
        : "7일간 zero-legacy와 refresh/decryption 오류를 관찰하세요.",
    status: "configured",
    summary: "조직 sync metadata의 legacy fallback이 0건입니다.",
  });
}

function evaluateCms(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  const webhookSecretsValid = !hasEnv(env, "SEARCHOPS_CMS_WEBHOOK_SECRETS") || isJsonObject(env.SEARCHOPS_CMS_WEBHOOK_SECRETS);

  if (!webhookSecretsValid) {
    return createCheck({
      area: "cms",
      envKeys: ["SEARCHOPS_CMS_WEBHOOK_SECRETS"],
      id: "cms-read-credential",
      nextAction: "SEARCHOPS_CMS_WEBHOOK_SECRETS를 provider 이름을 key로 갖는 JSON object 문자열로 설정하세요.",
      status: "blocked",
      summary: "CMS webhook secret env가 JSON object 형식이 아닙니다.",
      title: "CMS read/review credential",
    });
  }

  if (hasEnv(env, "SEARCHOPS_CMS_API_TOKEN") || hasEnv(env, "SEARCHOPS_CMS_WEBHOOK_SECRETS")) {
    return createCheck({
      area: "cms",
      envKeys: ["SEARCHOPS_CMS_API_TOKEN", "SEARCHOPS_CMS_WEBHOOK_SECRETS"],
      id: "cms-read-credential",
      nextAction: "CMS adapter 권한이 read/review scope인지 확인하고 write/publish scope는 등록하지 마세요.",
      status: "configured",
      summary: "CMS 읽기/검수 또는 webhook credential 경로가 설정되어 있습니다.",
      title: "CMS read/review credential",
    });
  }

  return createCheck({
    area: "cms",
    envKeys: ["SEARCHOPS_CMS_API_TOKEN", "SEARCHOPS_CMS_WEBHOOK_SECRETS"],
    id: "cms-read-credential",
    nextAction: "선택한 CMS provider의 read/review token 또는 webhook secret을 등록하세요.",
    status: "needs_provisioning",
    summary: "CMS 읽기/검수 credential 경로가 없습니다.",
    title: "CMS read/review credential",
  });
}

function evaluateLiveModeGate(
  env: NodeJS.ProcessEnv,
  googleOAuthReady: boolean,
): ConnectorLiveSetupCheck {
  const liveExternalApis = shouldEnableConnectorLiveApis(env);
  if (!liveExternalApis) {
    return createCheck({
      area: "runtime",
      envKeys: [
        "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
        "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
        "SEARCHOPS_PAGESPEED_API_KEY",
      ],
      id: "worker-live-mode-gate",
      nextAction: "fixture 모드로 검증한 뒤 provider credential을 완성한 시점에 worker를 재시작하세요.",
      status: "configured",
      summary: "worker connector sync는 fixture 모드로 유지됩니다.",
      title: "Worker live mode gate",
    });
  }

  const riskyGooglePartial =
    hasEnv(env, "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID") && !googleOAuthReady;
  if (riskyGooglePartial) {
    return createCheck({
      area: "runtime",
      envKeys: [
        "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
        "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
        "SEARCHOPS_PAGESPEED_API_KEY",
      ],
      id: "worker-live-mode-gate",
      nextAction: "Google OAuth env를 완성하거나 live trigger env를 제거한 뒤 worker를 다시 시작하세요.",
      status: "blocked",
      summary: "worker live mode가 부분 설정된 Google OAuth env 때문에 켜질 수 있습니다.",
      title: "Worker live mode gate",
    });
  }

  return createCheck({
    area: "runtime",
    envKeys: [
      "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
      "SEARCHOPS_PAGESPEED_API_KEY",
    ],
    id: "worker-live-mode-gate",
    nextAction: "provider별 단독 sync로 GSC, GA4, PageSpeed, Bing 순서대로 확인하세요.",
    status: "warning",
    summary: "worker connector sync가 live external API mode로 전환됩니다.",
    title: "Worker live mode gate",
  });
}

function summarizeChecks(checks: readonly ConnectorLiveSetupCheck[]) {
  return {
    ready: countStatus(checks, "ready"),
    configured: countStatus(checks, "configured"),
    needsProvisioning: countStatus(checks, "needs_provisioning"),
    warnings: countStatus(checks, "warning"),
    blocked: countStatus(checks, "blocked"),
    total: checks.length,
  };
}

function createCheck(input: ConnectorLiveSetupCheck): ConnectorLiveSetupCheck {
  return input;
}

function countStatus(
  checks: readonly ConnectorLiveSetupCheck[],
  status: ConnectorLiveSetupStatus,
) {
  return checks.filter((check) => check.status === status).length;
}

function shouldEnableConnectorLiveApis(env: NodeJS.ProcessEnv) {
  return Boolean(
    hasEnv(env, "SEARCHOPS_CREDENTIAL_STORAGE_MODE") ||
      hasEnv(env, "SEARCHOPS_PAGESPEED_API_KEY"),
  );
}

function hasEnv(env: NodeJS.ProcessEnv, key: string) {
  return typeof env[key] === "string" && env[key]!.trim().length > 0;
}

function isHttpUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isJsonObject(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
