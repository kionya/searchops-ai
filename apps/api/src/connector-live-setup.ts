import {
  ConnectorLiveSetupReportSchema,
  type ConnectorLiveSetupCheck,
  type ConnectorLiveSetupEnvironment,
  type ConnectorLiveSetupReport,
  type ConnectorLiveSetupStatus,
} from "@searchops/types";
import { shouldEnableConnectorLiveRuntime } from "@searchops/connectors";
import {
  parseCredentialKeyring,
  type ConnectorCredentialReadinessSnapshot,
} from "@searchops/db";

export interface CreateConnectorLiveSetupReportInput {
  readonly apiEnv: NodeJS.ProcessEnv;
  readonly connectorCredentials?: ConnectorCredentialReadinessSnapshot;
  readonly environment: ConnectorLiveSetupEnvironment;
  readonly generatedAt: Date;
  readonly workerEnv?: NodeJS.ProcessEnv;
}

const runtimeBaseKeys = ["DATABASE_URL", "REDIS_URL"] as const;
const googleOAuthKeys = [
  "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
  "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
  "SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI",
  "SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET",
] as const;

export function createConnectorLiveSetupReport({
  apiEnv,
  connectorCredentials,
  environment,
  generatedAt,
  workerEnv,
}: CreateConnectorLiveSetupReportInput): ConnectorLiveSetupReport {
  const googleOAuth = evaluateGoogleOAuth(apiEnv);
  const googleWorkerRefresh = evaluateGoogleWorkerRefresh(workerEnv);
  const checks: ConnectorLiveSetupCheck[] = [
    evaluateRuntimeBase(apiEnv, "api"),
    evaluateRuntimeBase(workerEnv, "worker"),
    evaluateApiWebBase(apiEnv, environment),
    evaluateCredentialKeyring(apiEnv, "api"),
    evaluateCredentialKeyring(workerEnv, "worker"),
    evaluateCredentialKeyringParity(apiEnv, workerEnv),
    googleOAuth.check,
    googleWorkerRefresh.check,
    evaluateGsc(connectorCredentials),
    evaluateGa4(connectorCredentials),
    evaluatePagespeed(workerEnv),
    evaluateBing(connectorCredentials),
    evaluateCms(apiEnv),
    evaluateCredentialMigration(connectorCredentials),
    evaluateCredentialCutover(apiEnv, connectorCredentials),
    evaluateLiveModeGate(workerEnv, googleWorkerRefresh.ready),
  ];
  const summary = summarizeChecks(checks);
  const liveExternalApis = isWorkerLiveRuntimeEnabled(workerEnv) ? "enabled" : "disabled";
  const cutoverReady =
    checks.find((check) => check.id === "credential-storage-cutover")?.status === "configured";
  const nonGoogleProviderReady = checks.some(
    (check) =>
      ["pagespeed", "bing", "cms"].includes(check.area) && check.status === "ready",
  );
  const googleProviderReady =
    googleOAuth.ready &&
    googleWorkerRefresh.ready &&
    checks.some(
      (check) => ["gsc", "ga4"].includes(check.area) && check.status === "ready",
    );

  return ConnectorLiveSetupReportSchema.parse({
    generatedAt: generatedAt.toISOString(),
    environment,
    liveExternalApis,
    canRunFixtureMode:
      summary.blocked === 0 &&
      runtimeBaseKeys.every((key) => hasEnv(apiEnv, key)) &&
      workerEnv !== undefined &&
      runtimeBaseKeys.every((key) => hasEnv(workerEnv, key)) &&
      liveExternalApis === "disabled",
    canRunLiveConnectorSync:
      summary.blocked === 0 &&
      liveExternalApis === "enabled" &&
      cutoverReady &&
      (nonGoogleProviderReady || googleProviderReady),
    checks,
    summary,
  });
}

function evaluateCredentialKeyring(
  env: NodeJS.ProcessEnv | undefined,
  target: "api" | "worker",
): ConnectorLiveSetupCheck {
  const envKeys = [
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON",
    "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
  ];
  const id = target === "api"
    ? "credential-encryption-keyring"
    : "worker-credential-encryption-keyring";
  const targetLabel = target === "api" ? "API" : "Worker";

  if (env === undefined) {
    return createCheck({
      area: "runtime",
      envKeys,
      id,
      nextAction: "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공하세요.",
      status: "warning",
      summary: "API process에서는 Worker encryption keyring을 검증할 수 없습니다.",
      title: "Worker credential encryption keyring",
    });
  }

  if (!hasEnv(env, "SEARCHOPS_CREDENTIAL_STORAGE_MODE")) {
    return createCheck({
      area: "runtime",
      envKeys,
      id,
      nextAction: "암호화 저장을 사용할 때 Railway API와 Worker에 같은 mode와 keyring을 설정하세요.",
      status: "configured",
      summary: `${targetLabel} credential storage mode가 설정되지 않았습니다.`,
      title: `${targetLabel} credential encryption keyring`,
    });
  }

  const mode = env.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  if (mode !== "dual" && mode !== "encrypted") {
    return createCheck({
      area: "runtime",
      envKeys,
      id,
      nextAction: "SEARCHOPS_CREDENTIAL_STORAGE_MODE를 dual 또는 encrypted로 설정하세요.",
      status: "blocked",
      summary: `${targetLabel} credential storage mode가 유효하지 않습니다.`,
      title: `${targetLabel} credential encryption keyring`,
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
      id,
      nextAction: "Railway API와 Worker의 active/previous keyring 값이 동일한지 배포 설정에서 대조하세요.",
      status: "configured",
      summary: `${targetLabel} encryption keyring 형식과 키 길이가 유효합니다.`,
      title: `${targetLabel} credential encryption keyring`,
    });
  } catch {
    return createCheck({
      area: "runtime",
      envKeys,
      id,
      nextAction: "32-byte base64 active key와 유효한 previous key JSON을 API와 Worker에 동일하게 설정하세요.",
      status: "blocked",
      summary: `${targetLabel} encryption keyring의 의미 검증에 실패했습니다.`,
      title: `${targetLabel} credential encryption keyring`,
    });
  }
}

function evaluateCredentialKeyringParity(
  apiEnv: NodeJS.ProcessEnv,
  workerEnv: NodeJS.ProcessEnv | undefined,
): ConnectorLiveSetupCheck {
  const envKeys = [
    "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY",
    "SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON",
  ];
  const base = {
    area: "runtime" as const,
    envKeys,
    id: "credential-keyring-target-parity",
    title: "API/Worker credential keyring parity",
  };

  if (workerEnv === undefined) {
    return createCheck({
      ...base,
      nextAction: "Railway API와 Worker의 storage mode와 keyring을 배포 설정에서 별도로 대조하세요.",
      status: "warning",
      summary: "Worker target이 없어 API/Worker keyring 일치를 검증하지 못했습니다.",
    });
  }

  const apiMode = apiEnv.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  const workerMode = workerEnv.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  if (!apiMode && !workerMode) {
    return createCheck({
      ...base,
      nextAction: "Encrypted rollout을 시작할 때 두 target에 같은 mode와 keyring을 설정하세요.",
      status: "configured",
      summary: "API와 Worker 모두 encrypted credential storage를 사용하지 않습니다.",
    });
  }

  if (apiMode !== workerMode || !keyringsMatch(apiEnv, workerEnv)) {
    return createCheck({
      ...base,
      nextAction: "API와 Worker의 mode, active key ID/material, previous key map을 동일하게 맞추세요.",
      status: "blocked",
      summary: "API와 Worker의 credential storage mode 또는 keyring이 일치하지 않습니다.",
    });
  }

  return createCheck({
    ...base,
    nextAction: "배포 변경 시 두 target을 함께 갱신하세요.",
    status: "configured",
    summary: "API와 Worker의 credential storage mode와 keyring이 일치합니다.",
  });
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

function evaluateRuntimeBase(
  env: NodeJS.ProcessEnv | undefined,
  target: "api" | "worker",
): ConnectorLiveSetupCheck {
  const id = target === "api" ? "runtime-base-env" : "worker-runtime-base-env";
  const targetLabel = target === "api" ? "API" : "Worker";
  if (env === undefined) {
    return createCheck({
      area: "runtime",
      envKeys: [...runtimeBaseKeys],
      id,
      nextAction: "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공하세요.",
      status: "warning",
      summary: "API process에서는 Worker의 DATABASE_URL과 REDIS_URL을 검증할 수 없습니다.",
      title: "Worker 기본 런타임 env",
    });
  }

  const missing = runtimeBaseKeys.filter((key) => !hasEnv(env, key));
  if (missing.length > 0) {
    return createCheck({
      area: "runtime",
      envKeys: [...runtimeBaseKeys],
      id,
      nextAction: `${missing.join(", ")}를 설정한 뒤 ${targetLabel}를 다시 시작하세요.`,
      status: "blocked",
      summary: `${targetLabel} 런타임에 필요한 기본 DB/Redis 환경변수가 없습니다.`,
      title: `${targetLabel} 기본 런타임 env`,
    });
  }

  return createCheck({
    area: "runtime",
    envKeys: [...runtimeBaseKeys],
    id,
    nextAction: `현재 DATABASE_URL과 REDIS_URL로 ${targetLabel}를 실행할 수 있습니다.`,
    status: "configured",
    summary: `${targetLabel} 런타임에 필요한 기본 DB/Redis 환경변수가 설정되어 있습니다.`,
    title: `${targetLabel} 기본 런타임 env`,
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

function evaluateGoogleWorkerRefresh(env: NodeJS.ProcessEnv | undefined): {
  readonly check: ConnectorLiveSetupCheck;
  readonly ready: boolean;
} {
  const envKeys = [
    "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
    "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
  ];
  if (env === undefined) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys,
        id: "google-worker-refresh-env",
        nextAction: "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공하세요.",
        status: "warning",
        summary: "API process에서는 Worker Google token refresh 설정을 검증할 수 없습니다.",
        title: "Worker Google refresh env",
      }),
    };
  }

  const missing = envKeys.filter((key) => !hasEnv(env, key));

  if (missing.length === envKeys.length) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys,
        id: "google-worker-refresh-env",
        nextAction: "GSC/GA4를 사용할 때 Railway Worker에 Google client ID와 secret을 함께 설정하세요.",
        status: "needs_provisioning",
        summary: "Worker Google token refresh 앱 credential은 선택되지 않았습니다.",
        title: "Worker Google refresh env",
      }),
    };
  }
  if (missing.length > 0) {
    return {
      ready: false,
      check: createCheck({
        area: "oauth",
        envKeys,
        id: "google-worker-refresh-env",
        nextAction: `${missing.join(", ")}를 추가하거나 두 값을 모두 제거하세요.`,
        status: "blocked",
        summary: "Worker Google token refresh 앱 credential이 부분 설정 상태입니다.",
        title: "Worker Google refresh env",
      }),
    };
  }

  return {
    ready: true,
    check: createCheck({
      area: "oauth",
      envKeys,
      id: "google-worker-refresh-env",
      nextAction: "API와 Worker가 동일한 Google OAuth client ID/secret을 사용하는지 확인하세요.",
      status: "configured",
      summary: "Worker token refresh에 필요한 Google OAuth client 값이 설정되어 있습니다.",
      title: "Worker Google refresh env",
    }),
  };
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

function evaluatePagespeed(env: NodeJS.ProcessEnv | undefined): ConnectorLiveSetupCheck {
  if (env === undefined) {
    return createCheck({
      area: "pagespeed",
      envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"],
      id: "pagespeed-live-credential",
      nextAction: "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공하세요.",
      status: "warning",
      summary: "API process에서는 Worker PageSpeed 플랫폼 key 설정을 검증할 수 없습니다.",
      title: "PageSpeed live credential",
    });
  }

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

function evaluateCredentialMigration(
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  const unmigrated = connectorCredentials?.unmigratedLegacyCredentials;
  const base = {
    area: "runtime" as const,
    envKeys: [] as string[],
    id: "credential-legacy-migration",
    title: "Legacy credential migration",
  };

  if (unmigrated === undefined) {
    return createCheck({
      ...base,
      nextAction: "DB-free CLI는 tenant 상태를 조회하지 않습니다. 인증된 /ops/readiness에서 조직 migration 잔량을 확인하세요.",
      status: "warning",
      summary: "Platform 검사에는 조직별 unmigrated legacy credential 수가 포함되지 않습니다.",
    });
  }

  if (unmigrated > 0) {
    return createCheck({
      ...base,
      nextAction: "Backfill dry-run/apply/reconcile을 완료하고 unmigrated legacy credential을 0건으로 만드세요.",
      status: "warning",
      summary: `이 조직에 아직 migration되지 않은 legacy credential이 ${unmigrated}건 있습니다.`,
    });
  }

  return createCheck({
    ...base,
    nextAction: "최근 7일 실제 legacy fallback 관측값을 별도로 확인하세요.",
    status: "configured",
    summary: "이 조직의 unmigrated legacy credential은 0건입니다.",
  });
}

function evaluateCredentialCutover(
  env: NodeJS.ProcessEnv,
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): ConnectorLiveSetupCheck {
  const mode = env.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  const observedLegacyFallbacks = connectorCredentials?.observedLegacyFallbacks;
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
  if (observedLegacyFallbacks === undefined) {
    return createCheck({
      ...base,
      nextAction: "로컬 CLI는 DB를 조회하지 않습니다. 로그인 후 /ops/readiness에서 조직 fallback을 확인하세요.",
      status: "warning",
      summary: "Platform 설정만 검사했으며 조직별 최근 7일 legacy 사용 metadata는 조회하지 않았습니다.",
    });
  }
  if (observedLegacyFallbacks > 0) {
    return createCheck({
      ...base,
      nextAction:
        mode === "encrypted"
          ? "API와 Worker를 dual로 롤백하고 최근 7일 관측 legacy 사용을 0으로 만드세요."
          : "관측된 fallback 원인을 해결하고 최근 7일 legacy 사용이 0건이 될 때까지 dual mode를 유지하세요.",
      status: mode === "encrypted" ? "blocked" : "warning",
      summary:
        mode === "encrypted"
          ? "Encrypted mode인데 조직의 최근 7일 sync에 legacy credential 사용이 관측됐습니다."
          : "Dual mode 조직의 최근 7일 sync에 legacy credential 사용이 관측됐습니다.",
    });
  }

  return createCheck({
    ...base,
    nextAction:
      mode === "dual"
        ? "백업과 검증을 완료한 뒤 encrypted cutover를 승인하세요."
        : "7일간 zero-legacy와 refresh/decryption 오류를 관찰하세요.",
    status: "configured",
    summary: "조직의 최근 7일 sync metadata에서 관측된 legacy 사용이 0건입니다.",
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
  env: NodeJS.ProcessEnv | undefined,
  googleWorkerRefreshReady: boolean,
): ConnectorLiveSetupCheck {
  const envKeys = [
    "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
    "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
    "SEARCHOPS_PAGESPEED_API_KEY",
  ];
  if (env === undefined) {
    return createCheck({
      area: "runtime",
      envKeys,
      id: "worker-live-mode-gate",
      nextAction: "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공하세요.",
      status: "warning",
      summary: "API process에서는 Worker live external API mode를 검증할 수 없습니다.",
      title: "Worker live mode gate",
    });
  }

  const liveExternalApis = isWorkerLiveRuntimeEnabled(env);
  if (!liveExternalApis) {
    return createCheck({
      area: "runtime",
      envKeys,
      id: "worker-live-mode-gate",
      nextAction: "fixture 모드로 검증한 뒤 provider credential을 완성한 시점에 worker를 재시작하세요.",
      status: "configured",
      summary: "worker connector sync는 fixture 모드로 유지됩니다.",
      title: "Worker live mode gate",
    });
  }

  const riskyGooglePartial =
    hasEnv(env, "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID") && !googleWorkerRefreshReady;
  if (riskyGooglePartial) {
    return createCheck({
      area: "runtime",
      envKeys,
      id: "worker-live-mode-gate",
      nextAction: "Google OAuth env를 완성하거나 live trigger env를 제거한 뒤 worker를 다시 시작하세요.",
      status: "blocked",
      summary: "worker live mode가 부분 설정된 Google OAuth env 때문에 켜질 수 있습니다.",
      title: "Worker live mode gate",
    });
  }

  return createCheck({
    area: "runtime",
    envKeys,
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

function isWorkerLiveRuntimeEnabled(env: NodeJS.ProcessEnv | undefined) {
  return env !== undefined && shouldEnableConnectorLiveRuntime({
    ...(env.SEARCHOPS_CREDENTIAL_STORAGE_MODE === undefined
      ? {}
      : { credentialStorageMode: env.SEARCHOPS_CREDENTIAL_STORAGE_MODE }),
    ...(env.SEARCHOPS_PAGESPEED_API_KEY === undefined
      ? {}
      : { pagespeedApiKey: env.SEARCHOPS_PAGESPEED_API_KEY }),
  });
}

function keyringsMatch(apiEnv: NodeJS.ProcessEnv, workerEnv: NodeJS.ProcessEnv) {
  try {
    const apiKeyring = parseKeyring(apiEnv);
    const workerKeyring = parseKeyring(workerEnv);
    if (
      apiKeyring.activeKeyId !== workerKeyring.activeKeyId ||
      !apiKeyring.activeKey.equals(workerKeyring.activeKey) ||
      apiKeyring.previousKeys.size !== workerKeyring.previousKeys.size
    ) {
      return false;
    }

    for (const [keyId, key] of apiKeyring.previousKeys) {
      const workerKey = workerKeyring.previousKeys.get(keyId);
      if (workerKey === undefined || !key.equals(workerKey)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function parseKeyring(env: NodeJS.ProcessEnv) {
  return parseCredentialKeyring({
    ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID === undefined
      ? {}
      : { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID }),
    ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY === undefined
      ? {}
      : { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: env.SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY }),
    ...(env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON === undefined
      ? {}
      : {
          SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON:
            env.SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON,
        }),
  });
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
