import {
  OperationalReadinessResponseSchema,
  type OperationalReadinessCategory,
  type OperationalReadinessItem,
  type OperationalReadinessResponse,
  type OperationalReadinessStatus,
} from "@searchops/types";

export interface CreateOperationalReadinessInput {
  readonly env: NodeJS.ProcessEnv;
  readonly generatedAt: Date;
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
  env,
  generatedAt,
}: CreateOperationalReadinessInput): OperationalReadinessResponse {
  const items = readinessInputs.map((item) => createReadinessItem(item, env));
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
    nextAction: "배포 secret에 Google OAuth client env를 등록하고 사이트 connector OAuth를 완료하세요.",
    requiredAny: [
      "SEARCHOPS_GSC_ACCESS_TOKEN",
      "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID"
    ],
  },
  {
    category: "connectors",
    id: "live-ga4",
    title: "GA4 실서비스 credential",
    summary: "GA4 page/session/conversion 데이터를 connector sync에 연결합니다.",
    nextAction: "GA4 property id와 Google OAuth client env를 배포 환경에 등록하세요.",
    requiredAll: ["SEARCHOPS_GA4_PROPERTY_ID"],
    requiredAny: [
      "SEARCHOPS_GA4_ACCESS_TOKEN",
      "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID"
    ],
  },
  {
    category: "connectors",
    id: "live-pagespeed",
    title: "PageSpeed 실서비스 credential",
    summary: "PageSpeed Insights API를 connector adapter 뒤에서 호출할 수 있게 합니다.",
    nextAction: "SEARCHOPS_PAGESPEED_API_KEY를 등록하세요.",
    requiredAll: ["SEARCHOPS_PAGESPEED_API_KEY"],
  },
  {
    category: "connectors",
    id: "live-bing",
    title: "Bing 실서비스 credential",
    summary: "Bing URL/search metrics를 connector adapter 뒤에서 정규화합니다.",
    nextAction: "SEARCHOPS_BING_API_KEY를 등록하세요.",
    requiredAll: ["SEARCHOPS_BING_API_KEY"],
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
    nextAction: "GSC OAuth 연결이 완료되면 keyword discovery를 실행하세요.",
    requiredAny: [
      "SEARCHOPS_GSC_ACCESS_TOKEN",
      "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID"
    ],
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
    summary: "SearchOps HMAC 외 provider native webhook signature 검증을 추가할 수 있습니다.",
    nextAction: "선택한 CMS provider의 native signature header와 secret policy를 확정하세요.",
    status: "manual_followup",
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
    summary: "의료광고/시장별 금칙어와 claim rule은 법무 검토 후 세분화해야 합니다.",
    nextAction: "KR 의료광고 rule pack부터 법무 owner와 승인 workflow를 정하세요.",
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
    summary: "rate-limit store boundary는 준비되어 있고 배포 Redis client wiring이 필요합니다.",
    nextAction: "REDIS_URL과 noeviction Redis를 운영 환경에 연결하세요.",
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
    summary: "실패 job replay는 queue별 source-of-truth payload와 deterministic replay id로만 실행해야 합니다.",
    nextAction: "dead-letter dashboard에 queue별 replay 가능 여부, payload 요구사항, 결과 이력을 노출하세요.",
    status: "manual_followup",
  },
  {
    category: "hardening",
    id: "backup-restore-rehearsal",
    title: "Backup/restore drill 실제 리허설",
    summary: "운영 DB 백업과 restore drill을 실제 환경에서 정기 검증해야 합니다.",
    nextAction: "Supabase/Railway 백업 절차와 restore drill 결과를 runbook에 기록하세요.",
    status: "manual_followup",
  },
  {
    category: "hardening",
    id: "migration-ci-check",
    title: "Migration deploy CI/CD check",
    summary: "Prisma migration status/deploy 체크를 CI/CD release gate에 명확히 연결해야 합니다.",
    nextAction: "GitHub Actions 또는 Railway deploy step에 migrate status/deploy 확인을 추가하세요.",
    status: "manual_followup",
  },
  {
    category: "hardening",
    id: "ops-dashboard-polish",
    title: "운영자용 ops dashboard polish",
    summary: "metrics, dead-letter, readiness, runbook link를 한 곳에서 확인할 수 있게 다듬어야 합니다.",
    nextAction: "ops navigation, empty state, alert severity, replay workflow 표시를 정리하세요.",
    status: "manual_followup",
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
    summary: "조직 초대, 사용자 역할 변경, 퇴사자 제거 흐름이 필요합니다.",
    nextAction: "외부 IdP 확정 후 invite API/UI와 role assignment 정책을 연결하세요.",
    status: "manual_followup",
  },
  {
    category: "productization",
    id: "tenant-isolation-e2e",
    title: "Tenant isolation E2E",
    summary: "조직 간 데이터 접근 차단을 API와 dashboard E2E로 검증해야 합니다.",
    nextAction: "두 조직/두 사용자 fixture로 cross-tenant access denied Playwright 시나리오를 추가하세요.",
    status: "manual_followup",
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
    summary: "조직 생성, 사이트 등록, 첫 crawl, 첫 work order까지의 안내 흐름이 필요합니다.",
    nextAction: "dashboard onboarding skeleton을 실제 auth/billing 이후 연결하세요.",
    status: "manual_followup",
  },
];

function createReadinessItem(input: ReadinessInput, env: NodeJS.ProcessEnv): OperationalReadinessItem {
  const envKeys = [...(input.requiredAll ?? []), ...(input.requiredAny ?? []), ...(input.envKeys ?? [])];
  const status = input.status ?? inferStatus(input, env);

  return {
    category: input.category,
    envKeys,
    id: input.id,
    nextAction: input.nextAction,
    status,
    summary: input.summary,
    title: input.title,
  };
}

function inferStatus(input: ReadinessInput, env: NodeJS.ProcessEnv): OperationalReadinessStatus {
  const allConfigured = (input.requiredAll ?? []).every((key) => hasEnv(env, key));
  const anyConfigured =
    input.requiredAny === undefined || input.requiredAny.some((key) => hasEnv(env, key));

  return allConfigured && anyConfigured ? "configured" : "needs_provisioning";
}

function hasEnv(env: NodeJS.ProcessEnv, key: string) {
  return typeof env[key] === "string" && env[key]!.trim().length > 0;
}

function countStatus(items: readonly OperationalReadinessItem[], status: OperationalReadinessStatus) {
  return items.filter((item) => item.status === status).length;
}
