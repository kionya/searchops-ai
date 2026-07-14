import {
  OperationalReadinessResponseSchema,
  type OperationalReadinessCategory,
  type OperationalReadinessItem,
  type OperationalReadinessResponse,
  type OperationalReadinessStatus,
} from "@searchops/types";
import {
  parseCredentialKeyring,
  type ConnectorCredentialReadinessSnapshot,
} from "@searchops/db";

export interface CreateOperationalReadinessInput {
  readonly connectorCredentials?: ConnectorCredentialReadinessSnapshot;
  readonly env: NodeJS.ProcessEnv;
  readonly generatedAt: Date;
  readonly workerEnv?: NodeJS.ProcessEnv;
}

interface ReadinessInput {
  readonly category: OperationalReadinessCategory;
  readonly envKeys?: readonly string[];
  readonly id: string;
  readonly nextAction: string;
  readonly requiredAny?: readonly string[];
  readonly requiredAll?: readonly string[];
  readonly status?: OperationalReadinessStatus;
  readonly summary: string;
  readonly title: string;
}

export function createOperationalReadiness({
  connectorCredentials,
  env,
  generatedAt,
  workerEnv,
}: CreateOperationalReadinessInput): OperationalReadinessResponse {
  const items = [
    createCredentialKeyringItem(env),
    createWorkerTargetVerificationItem(workerEnv),
    createCredentialMigrationItem(connectorCredentials),
    createCredentialCutoverItem(env, connectorCredentials),
    ...readinessInputs.map((item) =>
      createReadinessItem(item, env, workerEnv, connectorCredentials),
    ),
  ];
  const summary = {
    blocked: countStatus(items, "blocked"),
    configured: countStatus(items, "configured"),
    manualFollowup: countStatus(items, "manual_followup"),
    needsProvisioning: countStatus(items, "needs_provisioning"),
    ready: countStatus(items, "ready"),
    total: items.length,
  };

  return OperationalReadinessResponseSchema.parse({
    generatedAt: generatedAt.toISOString(),
    items,
    summary,
  });
}

const readinessInputs: readonly ReadinessInput[] = [
  {
    category: "connectors",
    id: "live-gsc",
    title: "GSC 실서비스 credential",
    summary: "Google Search Console 기반 검색어/페이지 데이터를 live connector adapter 뒤에서 수집합니다.",
    nextAction: "조직 integrations에서 Google 계정을 연결하고 사이트에 GSC 속성을 선택하세요.",
  },
  {
    category: "connectors",
    id: "live-ga4",
    title: "GA4 실서비스 credential",
    summary: "GA4 page/session/conversion 데이터를 connector sync에 연결합니다.",
    nextAction: "조직 integrations에서 Google 계정을 연결하고 사이트에 숫자 GA4 Property ID를 선택하세요.",
  },
  {
    category: "connectors",
    id: "live-pagespeed",
    title: "PageSpeed 실서비스 credential",
    summary: "PageSpeed Insights API를 connector adapter 뒤에서 호출할 수 있게 합니다.",
    nextAction: "선택적으로 Railway Worker에 SEARCHOPS_PAGESPEED_API_KEY를 등록하세요.",
    envKeys: ["SEARCHOPS_PAGESPEED_API_KEY"],
  },
  {
    category: "connectors",
    id: "live-bing",
    title: "Bing 실서비스 credential",
    summary: "Bing URL/search metrics를 connector adapter 뒤에서 정규화합니다.",
    nextAction: "조직 integrations에서 Bing 계정을 연결하고 사이트에 검증된 리소스를 선택하세요.",
  },
  {
    category: "connectors",
    id: "google-oauth-platform",
    title: "Google OAuth 앱 설정",
    summary: "API OAuth 연결에 필요한 플랫폼 앱 credential을 검증합니다.",
    nextAction: "Railway API에 OAuth client ID/secret, redirect URI, state secret을 설정하세요.",
    requiredAll: [
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
      "SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI",
      "SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET",
    ],
  },
  {
    category: "connectors",
    id: "google-worker-refresh-platform",
    title: "Worker Google token refresh 앱 설정",
    summary: "Worker가 조직별 Google refresh token을 갱신할 때 사용하는 플랫폼 client credential입니다.",
    nextAction: "Railway Worker에 API와 같은 Google OAuth client ID/secret을 설정하세요.",
    requiredAll: [
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
    ],
  },
  {
    category: "connectors",
    id: "live-cms-read",
    title: "CMS 읽기 전용 credential",
    summary: "WordPress/Webflow/headless CMS 콘텐츠를 읽기/검수 중심으로 연결합니다.",
    nextAction: "CMS base URL, token, webhook secret을 provider별로 등록하세요.",
    requiredAny: ["SEARCHOPS_CMS_API_TOKEN", "SEARCHOPS_CMS_WEBHOOK_SECRETS"],
  },
  {
    category: "connectors",
    id: "external-api-adapter-gate",
    title: "외부 API adapter gate",
    summary: "live 외부 API 호출은 connector adapter 뒤에서만 활성화하고 테스트에서는 fixture를 사용합니다.",
    nextAction: "provider별 live flag와 adapter secret을 배포 환경에서만 켜세요.",
    status: "configured",
  },
  {
    category: "connectors",
    id: "connector-partial-failure-ux",
    title: "Connector 부분 성공/재시도 운영 UX",
    summary: "provider별 sync 실패, 재시도, 부분 성공 상태를 운영자가 확인하고 후속 처리할 수 있어야 합니다.",
    nextAction: "connector sync history 화면에서 provider별 진단 코드와 개별 재실행 버튼을 확인하세요.",
    status: "configured",
  },
  {
    category: "keyword_aeo",
    id: "gsc-keyword-discovery",
    title: "GSC 기반 키워드 발견",
    summary: "persisted GSC connector result를 keyword discovery 후보로 변환합니다.",
    nextAction: "사이트 GSC connector가 connected 상태가 되면 keyword discovery를 실행하세요.",
  },
  {
    category: "keyword_aeo",
    id: "ai-draft-assist",
    title: "선택형 AI 초안 보조",
    summary: "AI는 설명/초안 보조만 담당하고 SEO/AEO/GEO truth source가 되지 않습니다.",
    nextAction: "LLM provider를 쓰려면 ai-core adapter env를 등록하고 draft-only UI에서만 노출하세요.",
    status: "manual_followup",
  },
  {
    category: "keyword_aeo",
    id: "content-brief-ui",
    title: "ContentBrief 생성 UI 고도화",
    summary: "ContentBrief는 사용자 검토용 draft만 생성하고 자동 게시 흐름을 만들지 않습니다.",
    nextAction: "keyword/AEO dashboard에서 draft 생성, 검토, history 진입점을 더 명확히 다듬으세요.",
    status: "manual_followup",
  },
  {
    category: "keyword_aeo",
    id: "content-brief-draft-only",
    title: "ContentBrief draft-only guardrail",
    summary: "ContentBrief 생성 결과는 draft 상태로만 저장되며 CMS 자동 게시 경로가 없습니다.",
    nextAction: "draft-only 정책을 유지하고 CMS publish adapter와 직접 연결하지 마세요.",
    status: "configured",
  },
  {
    category: "schema",
    id: "rich-result-live-validator",
    title: "Rich result live validator",
    summary: "JSON-LD draft 검증은 worker-injected validator client 뒤에서만 live 호출됩니다.",
    nextAction: "SEARCHOPS_RICH_RESULT_VALIDATOR_URL/TOKEN을 등록하세요.",
    requiredAll: ["SEARCHOPS_RICH_RESULT_VALIDATOR_URL"],
  },
  {
    category: "schema",
    id: "schema-validation-dashboard-trigger",
    title: "Schema validation dashboard trigger",
    summary: "dashboard에서 rich-result validation job을 수동 실행할 수 있는 진입점이 필요합니다.",
    nextAction: "schema recommendation 화면에 validation enqueue 버튼과 최신 결과 상태를 연결하세요.",
    status: "manual_followup",
  },
  {
    category: "schema",
    id: "schema-recheck-linkage",
    title: "Schema recheck 결과 연결",
    summary: "schema validation/recheck 결과가 작업 지시서와 이슈 상태를 더 촘촘히 갱신해야 합니다.",
    nextAction: "recommendation, validation result, work order, issue status 간 idempotent linkage를 강화하세요.",
    status: "manual_followup",
  },
  {
    category: "schema",
    id: "jsonld-draft-only",
    title: "JSON-LD draft/recommendation 유지",
    summary: "JSON-LD는 recommendation/draft로만 제공하고 자동 게시하지 않습니다.",
    nextAction: "CMS publish 흐름과 JSON-LD recommendation을 직접 연결하지 마세요.",
    status: "configured",
  },
  {
    category: "geo",
    id: "geo-live-providers",
    title: "GEO live answer provider",
    summary: "AI answer observation 수집은 connector adapter 뒤에서 provider별로 활성화합니다.",
    nextAction: "필요한 provider API key를 등록하세요.",
    requiredAny: [
      "SEARCHOPS_GEO_CHATGPT_API_KEY",
      "SEARCHOPS_GEO_PERPLEXITY_API_KEY",
      "SEARCHOPS_GEO_GEMINI_API_KEY",
      "SEARCHOPS_GEO_COPILOT_API_KEY",
      "SEARCHOPS_GEO_CLAUDE_API_KEY",
    ],
  },
  {
    category: "geo",
    id: "geo-observation-collection",
    title: "GEO observation collection UI/API",
    summary: "manual/fixture/live observation을 같은 contract로 수집하고 report 생성 전에 검토할 수 있어야 합니다.",
    nextAction: "GEO dashboard에 observation create/list flow와 provider source label을 연결하세요.",
    status: "manual_followup",
  },
  {
    category: "geo",
    id: "geo-batch-generation",
    title: "GEO report 자동 batch 생성",
    summary: "예약 또는 수동 batch job으로 GEO reports를 반복 생성할 수 있어야 합니다.",
    nextAction: "provider credential이 준비되면 batch schedule과 worker persistence를 활성화하세요.",
    status: "manual_followup",
  },
  {
    category: "geo",
    id: "geo-bulk-workorders",
    title: "GEO report to WorkOrder bulk generation",
    summary: "GEO report에서 deterministic work order를 bulk 생성하는 옵션이 필요합니다.",
    nextAction: "bulk preview, idempotency key, 중복 방지 정책을 화면과 API에 노출하세요.",
    status: "manual_followup",
  },
  {
    category: "compliance",
    id: "cms-native-signatures",
    title: "CMS native signature scheme",
    summary: "WordPress/Webflow provider webhook은 SearchOps HMAC 외 native signature fallback을 검증합니다.",
    nextAction: "운영 환경에서 provider별 webhook secret과 timestamp replay window를 확인하세요.",
    status: "configured",
  },
  {
    category: "compliance",
    id: "cms-management-readonly",
    title: "CMS management API 읽기/검수 모드",
    summary: "live CMS management API는 읽기와 검수 중심으로만 연결하고 자동 수정/게시를 금지합니다.",
    nextAction: "provider adapter 권한을 read/review scope로 제한하고 write scope를 배포 secret에 넣지 마세요.",
    status: "configured",
  },
  {
    category: "compliance",
    id: "compliance-rule-pack-refinement",
    title: "법무/시장별 compliance rule pack refinement",
    summary: "KR 의료광고 rule pack refinement workflow는 rule coverage, phrase review, owner approval, draft gate를 추적합니다.",
    nextAction: "법무/시장 owner가 fixture와 severity calibration을 승인하세요.",
    status: "manual_followup",
  },
  {
    category: "compliance",
    id: "medical-no-autopublish",
    title: "의료 콘텐츠 자동 게시 금지",
    summary: "compliance 관련 콘텐츠는 draft와 flag만 생성하고 CMS 자동 게시를 하지 않습니다.",
    nextAction: "모든 CMS adapter에서 compliance result 기반 auto-publish 경로를 계속 금지하세요.",
    status: "configured",
  },
  {
    category: "hardening",
    id: "redis-rate-limit",
    title: "Redis-backed distributed rate limit",
    summary: "API runtime은 Redis-backed distributed rate-limit store를 REDIS_URL에 연결합니다.",
    nextAction: "운영 Redis eviction policy와 SEARCHOPS_RATE_LIMIT_* 값을 배포 환경에서 확인하세요.",
    requiredAll: ["REDIS_URL"],
  },
  {
    category: "hardening",
    id: "observability-drain",
    title: "Observability log drain",
    summary: "metrics export를 SaaS/log drain endpoint로 전송합니다.",
    nextAction: "SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL/TOKEN을 등록하세요.",
    requiredAll: ["SEARCHOPS_OBSERVABILITY_LOG_DRAIN_URL"],
  },
  {
    category: "hardening",
    id: "alert-routing",
    title: "Alert routing",
    summary: "Slack/Discord/Email/Webhook alert route로 operational alerts를 보냅니다.",
    nextAction: "SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL/TOKEN을 등록하세요.",
    requiredAll: ["SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL"],
  },
  {
    category: "hardening",
    id: "idp-verification",
    title: "외부 IdP bearer verification",
    summary: "HS256 또는 RS256/JWKS bearer token verifier가 API runtime boundary에 연결됩니다.",
    nextAction: "HS256 secret 또는 JWKS JSON과 issuer/audience를 등록하세요.",
    requiredAny: ["SEARCHOPS_IDP_JWT_HS256_SECRET", "SEARCHOPS_IDP_JWKS_JSON"],
  },
  {
    category: "hardening",
    id: "restore-drill-scheduler",
    title: "Restore drill scheduler",
    summary: "restore drill plan을 외부 scheduler webhook으로 dispatch합니다.",
    nextAction: "SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL/TOKEN을 등록하세요.",
    requiredAll: ["SEARCHOPS_RESTORE_DRILL_WEBHOOK_URL"],
  },
  {
    category: "hardening",
    id: "secret-rotation-executor",
    title: "Secret rotation executor",
    summary: "secret rotation plan을 외부 secret manager workflow로 dispatch합니다.",
    nextAction: "SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL/TOKEN을 등록하세요.",
    requiredAll: ["SEARCHOPS_SECRET_ROTATION_WEBHOOK_URL"],
  },
  {
    category: "hardening",
    id: "dead-letter-replay-ux",
    title: "Queue별 idempotent replay 운영 UX",
    summary: "dead-letter dashboard는 queue별 replay-plan checklist를 표시하고 metadata-only 자동 재실행을 차단합니다.",
    nextAction: "재실행 전 source-of-truth payload와 owning queue의 idempotent replay path를 확인하세요.",
    status: "configured",
  },
  {
    category: "hardening",
    id: "backup-restore-rehearsal",
    title: "Backup/restore drill 실제 리허설",
    summary: "restore drill plan과 dry-run dispatch 진입점이 운영 hardening 화면에 연결되어 있습니다.",
    nextAction: "운영 DB 백업/restore 실행 결과는 별도 runbook evidence로 기록하세요.",
    status: "configured",
  },
  {
    category: "hardening",
    id: "migration-ci-check",
    title: "Migration deploy CI/CD check",
    summary: "GitHub Actions migration-gate job이 임시 PostgreSQL에서 migrate deploy/status를 검증합니다.",
    nextAction: "운영 배포 파이프라인에서도 동일한 migrate deploy/status gate를 유지하세요.",
    status: "configured",
  },
  {
    category: "hardening",
    id: "ops-dashboard-polish",
    title: "운영자용 ops dashboard polish",
    summary: "운영 허브가 readiness, metrics, dead-letter, hardening plan 화면을 한 곳에서 연결합니다.",
    nextAction: "실제 monitoring provider 연결 후 alert policy 링크를 추가하세요.",
    status: "configured",
  },
  {
    category: "hardening",
    id: "error-monitoring-uptime",
    title: "Error monitoring, uptime check, alert policy",
    summary: "runtime error monitoring과 uptime check가 alert routing으로 이어져야 합니다.",
    nextAction: "Vercel/Railway/Sentry/Better Stack 등 실제 monitoring provider와 alert policy를 등록하세요.",
    requiredAny: [
      "SEARCHOPS_ERROR_MONITORING_DSN",
      "SEARCHOPS_UPTIME_CHECK_URL",
      "SEARCHOPS_OBSERVABILITY_ALERT_WEBHOOK_URL",
    ],
  },
  {
    category: "productization",
    id: "external-auth-rbac",
    title: "실제 로그인/Auth/RBAC 외부 IdP",
    summary: "mock auth를 외부 IdP tenant/user/role claim으로 대체해야 합니다.",
    nextAction: "Auth0/Clerk/Supabase Auth 등 provider를 확정하고 issuer/audience/JWKS를 등록하세요.",
    requiredAny: ["SEARCHOPS_IDP_JWKS_JSON", "SEARCHOPS_IDP_JWT_HS256_SECRET"],
  },
  {
    category: "productization",
    id: "billing-subscription",
    title: "Billing/subscription",
    summary: "결제/구독 provider는 아직 제품 정책 확정과 provider credential 등록이 필요합니다.",
    nextAction: "Stripe 등 provider, plan, entitlement 정책을 확정하세요.",
    status: "manual_followup",
  },
  {
    category: "productization",
    id: "organization-invite-user-management",
    title: "Organization invite/user management",
    summary: "조직 초대/역할 관리(생성·수락·철회) API가 RBAC와 함께 구현되었고, 이메일 발송만 env로 선택 연결합니다.",
    nextAction: "이메일 발송을 켜려면 SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL(+_TOKEN)을 설정하세요(미설정 시 서버 로그로 초대 링크 확인).",
    status: "configured",
  },
  {
    category: "productization",
    id: "tenant-isolation-e2e",
    title: "Tenant isolation E2E",
    summary: "API route tests cover cross-tenant access denial and viewer write denial.",
    nextAction: "배포 전 두 조직/두 사용자 smoke 계정으로 동일 시나리오를 한 번 더 실행하세요.",
    status: "configured",
  },
  {
    category: "productization",
    id: "production-domain",
    title: "Production domain",
    summary: "custom domain, DNS, HTTPS, canonical app URL 설정이 필요합니다.",
    nextAction: "Vercel production domain과 DNS record를 연결하세요.",
    requiredAll: ["SEARCHOPS_PUBLIC_APP_URL"],
  },
  {
    category: "productization",
    id: "privacy-terms-security",
    title: "Privacy/terms/security docs",
    summary: "고객용 개인정보, 약관, 보안 문서가 제품화 전에 필요합니다.",
    nextAction: "docs/PRIVACY.md, docs/TERMS.md, docs/SECURITY.md 초안을 검토하세요.",
    status: "configured",
  },
  {
    category: "productization",
    id: "onboarding-flow",
    title: "초기 고객 onboarding",
    summary: "fixture-safe onboarding checklist and dashboard entry point are available.",
    nextAction: "실제 auth/billing 연결 후 customer-specific completion state를 DB에 저장하세요.",
    status: "configured",
  },
];

function createReadinessItem(
  input: ReadinessInput,
  apiEnv: NodeJS.ProcessEnv,
  workerEnv: NodeJS.ProcessEnv | undefined,
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): OperationalReadinessItem {
  const envKeys = [...(input.requiredAll ?? []), ...(input.requiredAny ?? []), ...(input.envKeys ?? [])];
  const tenantProvider = tenantProviderByItemId[input.id];
  const isWorkerItem = workerReadinessItemIds.has(input.id);
  const env = isWorkerItem ? workerEnv : apiEnv;
  const status =
    tenantProvider === undefined
      ? env === undefined
        ? "manual_followup"
        : input.id === "live-pagespeed"
        ? hasEnv(env, "SEARCHOPS_PAGESPEED_API_KEY")
          ? "configured"
          : "manual_followup"
        : input.id === "geo-live-providers"
          ? inferOptionalPlatformStatus(input, env)
          : input.status ?? inferStatus(input, env)
      : (connectorCredentials?.configuredByProvider[tenantProvider] ?? 0) > 0
        ? "configured"
        : "needs_provisioning";

  return {
    category: input.category,
    envKeys,
    id: input.id,
    nextAction: input.nextAction,
    status,
    summary:
      isWorkerItem && env === undefined
        ? `${input.summary} API process에서는 Worker target 설정을 검증할 수 없습니다.`
        : input.summary,
    title: input.title,
  };
}

const workerReadinessItemIds = new Set([
  "geo-live-providers",
  "google-worker-refresh-platform",
  "live-pagespeed",
  "rich-result-live-validator",
]);

const tenantProviderByItemId: Readonly<
  Partial<Record<string, keyof ConnectorCredentialReadinessSnapshot["configuredByProvider"]>>
> = {
  "gsc-keyword-discovery": "gsc",
  "live-bing": "bing",
  "live-ga4": "ga4",
  "live-gsc": "gsc",
};

const credentialKeyringEnvKeys = [
  "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID",
  "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY",
  "SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON",
  "SEARCHOPS_CREDENTIAL_STORAGE_MODE",
];

function createCredentialKeyringItem(env: NodeJS.ProcessEnv): OperationalReadinessItem {
  const base = {
    category: "hardening" as const,
    envKeys: credentialKeyringEnvKeys,
    id: "credential-encryption-keyring",
    title: "Provider credential encryption keyring",
  };

  if (!hasEnv(env, "SEARCHOPS_CREDENTIAL_STORAGE_MODE")) {
    return {
      ...base,
      nextAction: "Railway API와 Worker에 같은 storage mode와 active/previous keyring을 설정하세요.",
      status: "needs_provisioning",
      summary: "암호화 credential 저장 모드가 아직 설정되지 않았습니다.",
    };
  }
  const mode = env.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  if (mode !== "dual" && mode !== "encrypted") {
    return {
      ...base,
      nextAction: "SEARCHOPS_CREDENTIAL_STORAGE_MODE를 dual 또는 encrypted로 설정하세요.",
      status: "blocked",
      summary: "Provider credential storage mode가 유효하지 않습니다.",
    };
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
    return {
      ...base,
      nextAction: "API와 Worker의 active key ID, key material, previous key JSON이 동일한지 배포 설정에서 대조하세요.",
      status: "configured",
      summary: "현재 프로세스의 active/previous encryption keyring 형식과 키 길이가 유효합니다.",
    };
  } catch {
    return {
      ...base,
      nextAction: "32-byte base64 active key와 중복되지 않는 previous key JSON을 Railway API와 Worker에 동일하게 설정하세요.",
      status: "blocked",
      summary: "설정된 provider credential encryption keyring의 의미 검증에 실패했습니다.",
    };
  }
}

function createWorkerTargetVerificationItem(
  workerEnv: NodeJS.ProcessEnv | undefined,
): OperationalReadinessItem {
  return {
    category: "hardening",
    envKeys: ["DATABASE_URL", "REDIS_URL", ...credentialKeyringEnvKeys],
    id: "worker-target-verification",
    nextAction:
      workerEnv === undefined
        ? "Worker deployment env 또는 검증된 safe readiness signal을 별도로 제공해 런타임과 keyring을 대조하세요."
        : "Worker runtime과 API/Worker keyring parity를 connector live setup report에서 확인하세요.",
    status: workerEnv === undefined ? "manual_followup" : "configured",
    summary:
      workerEnv === undefined
        ? "API process에서는 Worker deployment 설정을 검증할 수 없습니다."
        : "Worker target 환경이 별도로 제공되었습니다.",
    title: "Worker deployment target verification",
  };
}

function createCredentialMigrationItem(
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): OperationalReadinessItem {
  const unmigrated = connectorCredentials?.unmigratedLegacyCredentials;
  const base = {
    category: "connectors" as const,
    envKeys: [] as string[],
    id: "credential-legacy-migration",
    title: "Legacy credential migration",
  };

  if (unmigrated === undefined) {
    return {
      ...base,
      nextAction: "검증된 사용자로 /ops/readiness를 호출해 조직별 migration 잔량을 확인하세요.",
      status: "needs_provisioning",
      summary: "DB-free platform 검사에서는 조직별 unmigrated legacy credential 수를 조회하지 않습니다.",
    };
  }
  if (unmigrated > 0) {
    return {
      ...base,
      nextAction: "Backfill dry-run/apply/reconcile을 완료해 unmigrated legacy credential을 0건으로 만드세요.",
      status: "manual_followup",
      summary: `이 조직에 아직 migration되지 않은 legacy credential이 ${unmigrated}건 있습니다.`,
    };
  }
  return {
    ...base,
    nextAction: "최근 7일 실제 legacy 사용 관측값을 cutover 항목에서 별도로 확인하세요.",
    status: "configured",
    summary: "이 조직의 unmigrated legacy credential은 0건입니다.",
  };
}

function createCredentialCutoverItem(
  env: NodeJS.ProcessEnv,
  connectorCredentials: ConnectorCredentialReadinessSnapshot | undefined,
): OperationalReadinessItem {
  const mode = env.SEARCHOPS_CREDENTIAL_STORAGE_MODE?.trim();
  const observedLegacyFallbacks = connectorCredentials?.observedLegacyFallbacks;
  const base = {
    category: "connectors" as const,
    envKeys: ["SEARCHOPS_CREDENTIAL_STORAGE_MODE"],
    id: "credential-storage-cutover",
    title: "Encrypted credential cutover",
  };

  if (mode !== "dual" && mode !== "encrypted") {
    return {
      ...base,
      nextAction: "마이그레이션 전 API와 Worker에 SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual을 설정하세요.",
      status: "needs_provisioning",
      summary: "Provider credential storage mode가 아직 설정되지 않았습니다.",
    };
  }
  if (observedLegacyFallbacks === undefined) {
    return {
      ...base,
      nextAction: "검증된 사용자로 /ops/readiness를 호출해 조직별 fallback metadata를 확인하세요.",
      status: "needs_provisioning",
      summary: "로컬 platform 검사에서는 조직별 최근 7일 legacy 사용 상태를 조회하지 않습니다.",
    };
  }
  if (observedLegacyFallbacks > 0) {
    return mode === "encrypted"
      ? {
          ...base,
          nextAction: "API와 Worker를 dual로 롤백하고 최근 7일 관측 legacy 사용을 0으로 만든 뒤 다시 cutover하세요.",
          status: "blocked",
          summary: "Encrypted mode인데 조직의 최근 7일 sync에 legacy credential 사용이 관측되어 cutover ready가 아닙니다.",
        }
      : {
          ...base,
          nextAction: "관측된 fallback 원인을 해결하고 최근 7일 legacy 사용이 0건이 될 때까지 dual mode를 유지하세요.",
          status: "manual_followup",
          summary: "경고: dual mode 조직의 최근 7일 sync에 legacy credential 사용이 관측됐습니다.",
        };
  }

  return {
    ...base,
    nextAction:
      mode === "dual"
        ? "백업과 검증을 완료한 뒤 encrypted mode cutover 승인을 진행하세요."
        : "7일간 zero-legacy 상태와 refresh/decryption 오류를 관찰하세요.",
    status: mode === "dual" ? "ready" : "configured",
    summary:
      mode === "dual"
        ? "조직의 최근 7일 sync metadata에서 관측된 legacy 사용이 0건입니다."
        : "Encrypted storage mode이며 최근 7일 관측 legacy 사용이 0건입니다.",
  };
}

function inferStatus(input: ReadinessInput, env: NodeJS.ProcessEnv): OperationalReadinessStatus {
  const allConfigured = (input.requiredAll ?? []).every((key) => hasEnv(env, key));
  const anyConfigured =
    input.requiredAny === undefined || input.requiredAny.some((key) => hasEnv(env, key));

  return allConfigured && anyConfigured ? "configured" : "needs_provisioning";
}

function inferOptionalPlatformStatus(
  input: ReadinessInput,
  env: NodeJS.ProcessEnv,
): OperationalReadinessStatus {
  return (input.requiredAny ?? []).some((key) => hasEnv(env, key))
    ? "configured"
    : "manual_followup";
}

function hasEnv(env: NodeJS.ProcessEnv, key: string) {
  return typeof env[key] === "string" && env[key]!.trim().length > 0;
}

function countStatus(items: readonly OperationalReadinessItem[], status: OperationalReadinessStatus) {
  return items.filter((item) => item.status === status).length;
}
