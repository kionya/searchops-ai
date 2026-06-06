import {
  ConnectorLiveSetupReportSchema,
  type ConnectorLiveSetupCheck,
  type ConnectorLiveSetupEnvironment,
  type ConnectorLiveSetupReport,
  type ConnectorLiveSetupStatus,
} from "@searchops/types";

export interface CreateConnectorLiveSetupReportInput {
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
  env,
  environment,
  generatedAt,
}: CreateConnectorLiveSetupReportInput): ConnectorLiveSetupReport {
  const googleOAuth = evaluateGoogleOAuth(env);
  const checks: ConnectorLiveSetupCheck[] = [
    evaluateRuntimeBase(env),
    evaluateApiWebBase(env, environment),
    googleOAuth.check,
    evaluateGsc(env, googleOAuth.ready),
    evaluateGa4(env, googleOAuth.ready),
    evaluatePagespeed(env),
    evaluateBing(env),
    evaluateCms(env),
    evaluateLiveModeGate(env, googleOAuth.ready),
  ];
  const summary = summarizeChecks(checks);
  const liveExternalApis = shouldEnableConnectorLiveApis(env) ? "enabled" : "disabled";

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
      checks.some((check) => ["gsc", "ga4", "pagespeed", "bing", "cms"].includes(check.area) && check.status === "ready"),
    checks,
    summary,
  });
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

function evaluateGsc(env: NodeJS.ProcessEnv, googleOAuthReady: boolean): ConnectorLiveSetupCheck {
  if (googleOAuthReady || hasEnv(env, "SEARCHOPS_GSC_ACCESS_TOKEN") || hasEnv(env, "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON")) {
    return createCheck({
      area: "gsc",
      envKeys: [
        "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
        "SEARCHOPS_GSC_ACCESS_TOKEN",
        "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON",
      ],
      id: "gsc-live-credential",
      nextAction: "사이트 커넥터 화면에서 GSC OAuth를 완료한 뒤 GSC만 단독 동기화하세요.",
      status: "ready",
      summary: "GSC live credential 경로가 준비되어 있습니다.",
      title: "GSC live credential",
    });
  }

  return createCheck({
    area: "gsc",
    envKeys: [
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
      "SEARCHOPS_GSC_ACCESS_TOKEN",
      "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON",
    ],
    id: "gsc-live-credential",
    nextAction: "Google OAuth를 설정하고 Search Console 속성 권한이 있는 계정으로 사이트를 연결하세요.",
    status: "needs_provisioning",
    summary: "GSC live sync에 사용할 credential 경로가 없습니다.",
    title: "GSC live credential",
  });
}

function evaluateGa4(env: NodeJS.ProcessEnv, googleOAuthReady: boolean): ConnectorLiveSetupCheck {
  const propertyId = env.SEARCHOPS_GA4_PROPERTY_ID?.trim();
  const credentialReady =
    googleOAuthReady ||
    hasEnv(env, "SEARCHOPS_GA4_ACCESS_TOKEN") ||
    hasEnv(env, "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON");

  if (!propertyId) {
    return createCheck({
      area: "ga4",
      envKeys: [
        "SEARCHOPS_GA4_PROPERTY_ID",
        "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
        "SEARCHOPS_GA4_ACCESS_TOKEN",
        "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON",
      ],
      id: "ga4-live-credential",
      nextAction: "GA4 관리 > 속성 세부정보의 숫자 Property ID를 SEARCHOPS_GA4_PROPERTY_ID에 등록하세요.",
      status: "needs_provisioning",
      summary: "GA4 live sync에 필요한 Property ID가 없습니다.",
      title: "GA4 live credential",
    });
  }

  if (!/^\d+$/.test(propertyId)) {
    return createCheck({
      area: "ga4",
      envKeys: ["SEARCHOPS_GA4_PROPERTY_ID"],
      id: "ga4-live-credential",
      nextAction: "측정 ID(G-...)나 GTM ID가 아니라 GA4 숫자 Property ID로 교체하세요.",
      status: "blocked",
      summary: "SEARCHOPS_GA4_PROPERTY_ID가 숫자 Property ID 형식이 아닙니다.",
      title: "GA4 live credential",
    });
  }

  if (!credentialReady) {
    return createCheck({
      area: "ga4",
      envKeys: [
        "SEARCHOPS_GA4_PROPERTY_ID",
        "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
        "SEARCHOPS_GA4_ACCESS_TOKEN",
        "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON",
      ],
      id: "ga4-live-credential",
      nextAction: "Google OAuth 또는 GA4 전용 credential을 설정하고 GA4 속성에서 연결 계정에 뷰어 이상 권한을 부여하세요.",
      status: "needs_provisioning",
      summary: "GA4 Property ID는 있지만 live sync credential 경로가 없습니다.",
      title: "GA4 live credential",
    });
  }

  return createCheck({
    area: "ga4",
    envKeys: [
      "SEARCHOPS_GA4_PROPERTY_ID",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
      "SEARCHOPS_GA4_ACCESS_TOKEN",
      "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON",
    ],
    id: "ga4-live-credential",
    nextAction: "사이트 커넥터 화면에서 GA4 OAuth를 완료한 뒤 GA4만 단독 동기화하세요.",
    status: "ready",
    summary: "GA4 숫자 Property ID와 credential 경로가 준비되어 있습니다.",
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
    nextAction: "SEARCHOPS_PAGESPEED_API_KEY를 배포 secret에 등록하세요.",
    status: "needs_provisioning",
    summary: "PageSpeed live sync API key가 없습니다.",
    title: "PageSpeed live credential",
  });
}

function evaluateBing(env: NodeJS.ProcessEnv): ConnectorLiveSetupCheck {
  if (hasEnv(env, "SEARCHOPS_BING_API_KEY")) {
    return createCheck({
      area: "bing",
      envKeys: ["SEARCHOPS_BING_API_KEY"],
      id: "bing-live-credential",
      nextAction: "Bing만 단독 동기화해 API key 유효성과 provider 응답을 확인하세요.",
      status: "ready",
      summary: "Bing Webmaster API key가 설정되어 있습니다.",
      title: "Bing live credential",
    });
  }

  return createCheck({
    area: "bing",
    envKeys: ["SEARCHOPS_BING_API_KEY"],
    id: "bing-live-credential",
    nextAction: "SEARCHOPS_BING_API_KEY를 배포 secret에 등록하세요.",
    status: "needs_provisioning",
    summary: "Bing live sync API key가 없습니다.",
    title: "Bing live credential",
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
        "SEARCHOPS_BING_API_KEY",
        "SEARCHOPS_GA4_PROPERTY_ID",
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
        "SEARCHOPS_BING_API_KEY",
        "SEARCHOPS_GA4_PROPERTY_ID",
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
      "SEARCHOPS_BING_API_KEY",
      "SEARCHOPS_GA4_PROPERTY_ID",
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
    hasEnv(env, "SEARCHOPS_BING_API_KEY") ||
      hasEnv(env, "SEARCHOPS_GA4_PROPERTY_ID") ||
      hasEnv(env, "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID") ||
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
