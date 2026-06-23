import {
  ProductizationReadinessResponseSchema,
  type OperationalReadinessStatus,
  type ProductizationReadinessArea,
  type ProductizationReadinessItem,
  type ProductizationReadinessResponse,
} from "@searchops/types";

export interface CreateProductizationReadinessInput {
  readonly env: NodeJS.ProcessEnv;
  readonly generatedAt: Date;
}

interface ProductizationInput {
  readonly area: ProductizationReadinessArea;
  readonly evidence: readonly string[];
  readonly id: string;
  readonly nextAction: string;
  readonly requiredAll?: readonly string[];
  readonly requiredAny?: readonly string[];
  readonly status?: OperationalReadinessStatus;
  readonly summary: string;
  readonly title: string;
}

export function createProductizationReadiness({
  env,
  generatedAt,
}: CreateProductizationReadinessInput): ProductizationReadinessResponse {
  const items = productizationInputs.map((item) => createProductizationItem(item, env));
  const summary = {
    configured: countStatus(items, "configured"),
    launchBlocking: items.filter((item) =>
      item.status === "blocked" || item.status === "needs_provisioning",
    ).length,
    manualFollowup: countStatus(items, "manual_followup"),
    needsProvisioning: countStatus(items, "needs_provisioning"),
    ready: countStatus(items, "ready"),
    total: items.length,
  };

  return ProductizationReadinessResponseSchema.parse({
    canLaunch: summary.launchBlocking === 0 && summary.manualFollowup === 0,
    generatedAt: generatedAt.toISOString(),
    items,
    summary,
  });
}

const productizationInputs: readonly ProductizationInput[] = [
  {
    area: "auth_rbac",
    evidence: [
      "API maps trusted IdP headers or verified bearer tokens into tenant and role context.",
      "Owner/admin/editor roles can write; viewer writes are denied.",
    ],
    id: "external-auth-rbac",
    nextAction: "Auth0/Clerk/Supabase Auth 등 provider의 issuer/audience/JWKS 또는 HS256 secret을 배포 secret에 등록하세요.",
    requiredAny: ["SEARCHOPS_IDP_JWKS_JSON", "SEARCHOPS_IDP_JWT_HS256_SECRET"],
    summary: "외부 IdP claim은 API auth context로 매핑되고 route-level RBAC에 사용됩니다.",
    title: "실제 로그인/Auth/RBAC 외부 IdP",
  },
  {
    area: "tenant_isolation",
    evidence: [
      "API tests cover cross-tenant organization/site access denial.",
      "Site-scoped resources resolve site ownership before returning data or accepting writes.",
    ],
    id: "tenant-isolation-e2e",
    nextAction: "배포 전 두 조직/두 사용자 smoke 계정으로 동일 시나리오를 한 번 더 실행하세요.",
    status: "configured",
    summary: "API boundary가 조직 간 데이터 접근을 차단하고 viewer write를 거부합니다.",
    title: "Tenant isolation E2E",
  },
  {
    area: "invites",
    evidence: [
      "Invitation model + create/list/revoke/accept API routes are implemented with RBAC (admin/owner/system).",
      "Accept upserts the org member with the invited role; tokens expire and are single-use.",
      "Email delivery is env-gated (SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL); unset = logs the accept link.",
    ],
    id: "organization-invite-user-management",
    nextAction: "이메일 발송을 켜려면 SEARCHOPS_INVITE_EMAIL_WEBHOOK_URL(+_TOKEN)을 설정하세요(미설정 시 서버 로그로 초대 링크 확인).",
    status: "configured",
    summary: "조직 초대/역할 관리(생성·수락·철회)가 구현되었고, 이메일 발송만 provider env로 선택 연결합니다.",
    title: "Organization invite/user management",
  },
  {
    area: "billing",
    evidence: [
      "Billing spec keeps provider SDKs outside deterministic packages.",
      "Plan dimensions are site count, crawl volume, connector sync volume, and seats.",
    ],
    id: "billing-subscription",
    nextAction: "Stripe 등 결제 provider, plan, entitlement 정책을 확정하고 webhook secret을 배포 secret에 등록하세요.",
    status: "manual_followup",
    summary: "구독 정책 skeleton은 문서화되어 있으나 live 결제 provider와 entitlement enforcement는 아직 연결하지 않습니다.",
    title: "Billing/subscription",
  },
  {
    area: "domain",
    evidence: [
      "Connector live setup checks SEARCHOPS_PUBLIC_APP_URL for local/deployment web runtime consistency.",
    ],
    id: "production-domain",
    nextAction: "Vercel production domain, DNS, HTTPS, canonical app URL을 연결하고 SEARCHOPS_PUBLIC_APP_URL을 설정하세요.",
    requiredAll: ["SEARCHOPS_PUBLIC_APP_URL"],
    summary: "production canonical app URL은 OAuth redirect, dashboard links, customer-facing docs의 기준입니다.",
    title: "Production domain",
  },
  {
    area: "legal",
    evidence: [
      "docs/PRIVACY.md exists.",
      "docs/TERMS.md exists.",
      "docs/SECURITY.md exists.",
    ],
    id: "privacy-terms-security",
    nextAction: "고객 공개 전 법무 검토와 회사 정보/관할/문의 경로를 확정하세요.",
    status: "configured",
    summary: "개인정보, 약관, 보안 문서 초안이 repo에 있으며 제품화 전 법무 검토가 필요합니다.",
    title: "Privacy/terms/security docs",
  },
  {
    area: "onboarding",
    evidence: [
      "Onboarding checklist keeps first site, first crawl, first work order, and connector setup separate.",
      "Live connector and billing steps are optional until credentials are provisioned.",
    ],
    id: "onboarding-flow",
    nextAction: "실제 auth/billing 연결 후 customer-specific completion state를 DB에 저장하세요.",
    status: "configured",
    summary: "초기 고객 온보딩 checklist와 dashboard 진입점이 fixture-safe 상태로 제공됩니다.",
    title: "초기 고객 onboarding",
  },
];

function createProductizationItem(
  input: ProductizationInput,
  env: NodeJS.ProcessEnv,
): ProductizationReadinessItem {
  const envKeys = [...(input.requiredAll ?? []), ...(input.requiredAny ?? [])];
  return {
    area: input.area,
    envKeys,
    evidence: [...input.evidence],
    id: input.id,
    nextAction: input.nextAction,
    status: input.status ?? inferStatus(input, env),
    summary: input.summary,
    title: input.title,
  };
}

function inferStatus(input: ProductizationInput, env: NodeJS.ProcessEnv): OperationalReadinessStatus {
  const allConfigured = (input.requiredAll ?? []).every((key) => hasEnv(env, key));
  const anyConfigured =
    input.requiredAny === undefined || input.requiredAny.some((key) => hasEnv(env, key));

  return allConfigured && anyConfigured ? "configured" : "needs_provisioning";
}

function hasEnv(env: NodeJS.ProcessEnv, key: string) {
  return typeof env[key] === "string" && env[key]!.trim().length > 0;
}

function countStatus(
  items: readonly ProductizationReadinessItem[],
  status: OperationalReadinessStatus,
) {
  return items.filter((item) => item.status === status).length;
}
