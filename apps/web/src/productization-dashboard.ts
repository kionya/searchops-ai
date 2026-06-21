import {
  ProductizationReadinessResponseSchema,
  type OperationalReadinessStatus,
  type ProductizationReadinessArea,
  type ProductizationReadinessItem,
  type ProductizationReadinessResponse,
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";

export type ProductizationDashboardSource = "api" | "fixture";
export type ProductizationTone = "good" | "neutral" | "risk";

export interface ProductizationDashboard {
  readonly errorMessage: string | null;
  readonly productization: ProductizationReadinessResponse;
  readonly source: ProductizationDashboardSource;
}

export interface OnboardingStep {
  readonly id: string;
  readonly title: string;
  readonly status: "available" | "blocked" | "optional";
  readonly href: string | null;
}

export const demoProductizationReadiness = ProductizationReadinessResponseSchema.parse({
  canLaunch: false,
  generatedAt: "2026-05-27T00:00:00.000Z",
  items: [
    createDemoProductizationItem(
      "external-auth-rbac",
      "auth_rbac",
      "실제 로그인/Auth/RBAC 외부 IdP",
      "needs_provisioning",
      {
        envKeys: ["SEARCHOPS_IDP_JWKS_JSON", "SEARCHOPS_IDP_JWT_HS256_SECRET"],
        evidence: [
          "API maps trusted IdP headers or verified bearer tokens into tenant and role context.",
          "Owner/admin/editor roles can write; viewer writes are denied.",
        ],
        nextAction: "IdP issuer/audience/JWKS 또는 HS256 secret을 배포 secret에 등록하세요.",
        summary: "외부 IdP claim은 API auth context로 매핑되고 route-level RBAC에 사용됩니다.",
      },
    ),
    createDemoProductizationItem(
      "tenant-isolation-e2e",
      "tenant_isolation",
      "Tenant isolation E2E",
      "configured",
      {
        evidence: [
          "API tests cover cross-tenant organization/site access denial.",
          "Site-scoped resources resolve site ownership before returning data or accepting writes.",
        ],
        nextAction: "배포 전 두 조직/두 사용자 smoke 계정으로 동일 시나리오를 한 번 더 실행하세요.",
        summary: "API boundary가 조직 간 데이터 접근을 차단하고 viewer write를 거부합니다.",
      },
    ),
    createDemoProductizationItem(
      "organization-invite-user-management",
      "invites",
      "Organization invite/user management",
      "manual_followup",
      {
        evidence: [
          "Invite lifecycle is documented as provider-owned until external IdP is selected.",
          "Roles are constrained to the shared AuthRole contract.",
        ],
        nextAction: "IdP provider 확정 후 email invite delivery와 role assignment webhook을 연결하세요.",
        summary: "초대/역할 정책은 정의되어 있으나 이메일 발송과 IdP user provisioning은 provider 선택 후 연결합니다.",
      },
    ),
    createDemoProductizationItem(
      "billing-subscription",
      "billing",
      "Billing/subscription",
      "manual_followup",
      {
        evidence: [
          "Billing spec keeps provider SDKs outside deterministic packages.",
          "Plan dimensions are site count, crawl volume, connector sync volume, and seats.",
        ],
        nextAction: "결제 provider, plan, entitlement 정책을 확정하고 webhook secret을 배포 secret에 등록하세요.",
        summary: "구독 정책 skeleton은 문서화되어 있으나 live 결제 provider와 entitlement enforcement는 아직 연결하지 않습니다.",
      },
    ),
    createDemoProductizationItem(
      "production-domain",
      "domain",
      "Production domain",
      "needs_provisioning",
      {
        envKeys: ["SEARCHOPS_PUBLIC_APP_URL"],
        evidence: [
          "Connector live setup checks SEARCHOPS_PUBLIC_APP_URL for web runtime consistency.",
        ],
        nextAction: "production domain, DNS, HTTPS, canonical app URL을 연결하고 SEARCHOPS_PUBLIC_APP_URL을 설정하세요.",
        summary: "production canonical app URL은 OAuth redirect, dashboard links, customer-facing docs의 기준입니다.",
      },
    ),
    createDemoProductizationItem(
      "privacy-terms-security",
      "legal",
      "Privacy/terms/security docs",
      "configured",
      {
        evidence: ["docs/PRIVACY.md", "docs/TERMS.md", "docs/SECURITY.md"],
        nextAction: "고객 공개 전 법무 검토와 회사 정보/관할/문의 경로를 확정하세요.",
        summary: "개인정보, 약관, 보안 문서 초안이 repo에 있으며 제품화 전 법무 검토가 필요합니다.",
      },
    ),
    createDemoProductizationItem(
      "onboarding-flow",
      "onboarding",
      "초기 고객 onboarding",
      "configured",
      {
        evidence: [
          "Onboarding checklist keeps first site, first crawl, first work order, and connector setup separate.",
          "Live connector and billing steps are optional until credentials are provisioned.",
        ],
        nextAction: "실제 auth/billing 연결 후 customer-specific completion state를 DB에 저장하세요.",
        summary: "초기 고객 온보딩 checklist와 dashboard 진입점이 fixture-safe 상태로 제공됩니다.",
      },
    ),
  ],
  summary: {
    configured: 3,
    launchBlocking: 2,
    manualFollowup: 2,
    needsProvisioning: 2,
    ready: 0,
    total: 7,
  },
});

export const onboardingSteps: readonly OnboardingStep[] = [
  {
    href: "/sites",
    id: "site",
    status: "available",
    title: "사이트 등록",
  },
  {
    href: "/sites/site_demo_rejuel/crawls",
    id: "crawl",
    status: "available",
    title: "첫 크롤링",
  },
  {
    href: "/sites/site_demo_rejuel/issues",
    id: "issues",
    status: "available",
    title: "SEO 이슈 검토",
  },
  {
    href: "/sites/site_demo_rejuel/workorders",
    id: "workorder",
    status: "available",
    title: "첫 작업 지시서",
  },
  {
    href: "/sites/site_demo_rejuel/connectors",
    id: "connectors",
    status: "optional",
    title: "커넥터 연결",
  },
  {
    href: "/ops/productization",
    id: "billing",
    status: "blocked",
    title: "구독/팀 설정",
  },
];

export async function loadProductizationDashboard(): Promise<ProductizationDashboard> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoProductizationDashboard();
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/ops/productization`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`제품화 준비도 요청 실패: ${response.status}`);
    }

    return {
      errorMessage: null,
      productization: ProductizationReadinessResponseSchema.parse(await response.json()),
      source: "api",
    };
  } catch (error) {
    return {
      ...createDemoProductizationDashboard(),
      errorMessage:
        error instanceof Error ? error.message : "제품화 준비도 요청에 실패했습니다.",
    };
  }
}

export function createDemoProductizationDashboard(): ProductizationDashboard {
  return {
    errorMessage: null,
    productization: demoProductizationReadiness,
    source: "fixture",
  };
}

export function formatProductizationArea(area: ProductizationReadinessArea) {
  const labels: Record<ProductizationReadinessArea, string> = {
    auth_rbac: "Auth/RBAC",
    billing: "Billing",
    domain: "Domain",
    invites: "Invites",
    legal: "Legal",
    onboarding: "Onboarding",
    tenant_isolation: "Tenant isolation",
  };

  return labels[area];
}

export function formatProductizationStatus(status: OperationalReadinessStatus) {
  const labels: Record<OperationalReadinessStatus, string> = {
    blocked: "차단됨",
    configured: "설정됨",
    manual_followup: "수동 후속",
    needs_provisioning: "프로비저닝 필요",
    ready: "완료",
  };

  return labels[status];
}

export function getProductizationTone(status: OperationalReadinessStatus): ProductizationTone {
  if (status === "configured" || status === "ready") {
    return "good";
  }

  if (status === "manual_followup") {
    return "neutral";
  }

  return "risk";
}

export function summarizeOnboardingSteps(steps: readonly OnboardingStep[]) {
  return {
    available: steps.filter((step) => step.status === "available").length,
    blocked: steps.filter((step) => step.status === "blocked").length,
    optional: steps.filter((step) => step.status === "optional").length,
    total: steps.length,
  };
}

function createDemoProductizationItem(
  id: string,
  area: ProductizationReadinessArea,
  title: string,
  status: OperationalReadinessStatus,
  options: {
    readonly envKeys?: readonly string[];
    readonly evidence?: readonly string[];
    readonly nextAction?: string;
    readonly summary?: string;
  } = {},
): ProductizationReadinessItem {
  return {
    area,
    envKeys: [...(options.envKeys ?? [])],
    evidence: [...(options.evidence ?? ["fixture-safe productization report"])],
    id,
    nextAction: options.nextAction ?? "배포 provider와 운영 정책을 확정하세요.",
    status,
    summary: options.summary ?? "제품화 전 확인해야 할 항목입니다.",
    title,
  };
}
