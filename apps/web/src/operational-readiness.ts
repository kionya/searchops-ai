import {
  OperationalReadinessResponseSchema,
  type OperationalReadinessCategory,
  type OperationalReadinessItem,
  type OperationalReadinessResponse,
  type OperationalReadinessStatus,
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";

export type { OperationalReadinessCategory } from "@searchops/types";

export type OperationalReadinessSource = "api" | "fixture";
export type OperationalReadinessTone = "good" | "neutral" | "risk";

export interface OperationalReadinessDashboard {
  readonly errorMessage: string | null;
  readonly readiness: OperationalReadinessResponse;
  readonly source: OperationalReadinessSource;
}

const demoReadinessItems = [
  createDemoItem("live-gsc", "connectors", "GSC 실서비스 credential", "needs_provisioning"),
  createDemoItem("live-ga4", "connectors", "GA4 실서비스 credential", "needs_provisioning"),
  createDemoItem("live-pagespeed", "connectors", "PageSpeed 실서비스 credential", "needs_provisioning"),
  createDemoItem("live-bing", "connectors", "Bing 실서비스 credential", "needs_provisioning"),
  createDemoItem("live-cms-read", "connectors", "CMS 읽기 전용 credential", "needs_provisioning"),
  createDemoItem("external-api-adapter-gate", "connectors", "외부 API adapter gate", "configured"),
  createDemoItem("connector-partial-failure-ux", "connectors", "Connector 부분 성공/재시도 운영 UX", "manual_followup"),
  createDemoItem("gsc-keyword-discovery", "keyword_aeo", "GSC 기반 키워드 발견", "needs_provisioning"),
  createDemoItem("ai-draft-assist", "keyword_aeo", "선택형 AI 초안 보조", "manual_followup"),
  createDemoItem("content-brief-ui", "keyword_aeo", "ContentBrief 생성 UI 고도화", "manual_followup"),
  createDemoItem("content-brief-draft-only", "keyword_aeo", "ContentBrief draft-only guardrail", "configured"),
  createDemoItem("rich-result-live-validator", "schema", "Rich result live validator", "needs_provisioning"),
  createDemoItem("schema-validation-dashboard-trigger", "schema", "Schema validation dashboard trigger", "manual_followup"),
  createDemoItem("schema-recheck-linkage", "schema", "Schema recheck 결과 연결", "manual_followup"),
  createDemoItem("jsonld-draft-only", "schema", "JSON-LD draft/recommendation 유지", "configured"),
  createDemoItem("geo-live-providers", "geo", "GEO live answer provider", "needs_provisioning"),
  createDemoItem("geo-observation-collection", "geo", "GEO observation collection UI/API", "manual_followup"),
  createDemoItem("geo-batch-generation", "geo", "GEO report 자동 batch 생성", "manual_followup"),
  createDemoItem("geo-bulk-workorders", "geo", "GEO report to WorkOrder bulk generation", "manual_followup"),
  createDemoItem("cms-native-signatures", "compliance", "CMS native signature scheme", "manual_followup"),
  createDemoItem("cms-management-readonly", "compliance", "CMS management API 읽기/검수 모드", "configured"),
  createDemoItem("compliance-rule-pack-refinement", "compliance", "법무/시장별 compliance rule pack refinement", "manual_followup"),
  createDemoItem("medical-no-autopublish", "compliance", "의료 콘텐츠 자동 게시 금지", "configured"),
  createDemoItem("redis-rate-limit", "hardening", "Redis-backed distributed rate limit", "configured"),
  createDemoItem("observability-drain", "hardening", "Observability log drain", "needs_provisioning"),
  createDemoItem("alert-routing", "hardening", "Alert routing", "needs_provisioning"),
  createDemoItem("idp-verification", "hardening", "외부 IdP bearer verification", "configured"),
  createDemoItem("restore-drill-scheduler", "hardening", "Restore drill scheduler", "needs_provisioning"),
  createDemoItem("secret-rotation-executor", "hardening", "Secret rotation executor", "needs_provisioning"),
  createDemoItem("dead-letter-replay-ux", "hardening", "Queue별 idempotent replay 운영 UX", "configured"),
  createDemoItem("backup-restore-rehearsal", "hardening", "Backup/restore drill 실제 리허설", "configured"),
  createDemoItem("migration-ci-check", "hardening", "Migration deploy CI/CD check", "configured"),
  createDemoItem("ops-dashboard-polish", "hardening", "운영자용 ops dashboard polish", "configured"),
  createDemoItem("error-monitoring-uptime", "hardening", "Error monitoring, uptime check, alert policy", "needs_provisioning"),
  createDemoItem("external-auth-rbac", "productization", "실제 로그인/Auth/RBAC 외부 IdP", "needs_provisioning"),
  createDemoItem("billing-subscription", "productization", "Billing/subscription", "manual_followup"),
  createDemoItem("organization-invite-user-management", "productization", "Organization invite/user management", "manual_followup"),
  createDemoItem("tenant-isolation-e2e", "productization", "Tenant isolation E2E", "manual_followup"),
  createDemoItem("production-domain", "productization", "Production domain", "needs_provisioning"),
  createDemoItem("privacy-terms-security", "productization", "Privacy/terms/security docs", "configured"),
  createDemoItem("onboarding-flow", "productization", "초기 고객 onboarding", "manual_followup"),
];

export const demoOperationalReadiness = OperationalReadinessResponseSchema.parse({
  generatedAt: "2026-05-26T00:00:00.000Z",
  items: demoReadinessItems,
  summary: createReadinessSummary(demoReadinessItems),
});

export async function loadOperationalReadiness(): Promise<OperationalReadinessDashboard> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoOperationalReadinessDashboard();
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/ops/readiness`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`운영 준비도 요청 실패: ${response.status}`);
    }

    return {
      errorMessage: null,
      readiness: OperationalReadinessResponseSchema.parse(await response.json()),
      source: "api",
    };
  } catch (error) {
    return {
      ...createDemoOperationalReadinessDashboard(),
      errorMessage:
        error instanceof Error ? error.message : "운영 준비도 요청에 실패했습니다.",
    };
  }
}

export function createDemoOperationalReadinessDashboard(): OperationalReadinessDashboard {
  return {
    errorMessage: null,
    readiness: demoOperationalReadiness,
    source: "fixture",
  };
}

export function formatReadinessCategory(category: OperationalReadinessCategory) {
  const labels: Record<OperationalReadinessCategory, string> = {
    compliance: "컴플라이언스",
    connectors: "커넥터",
    geo: "GEO",
    hardening: "운영 안정화",
    keyword_aeo: "키워드/AEO",
    productization: "제품화",
    schema: "스키마(JSON-LD)",
  };

  return labels[category];
}

export function formatReadinessStatus(status: OperationalReadinessStatus) {
  const labels: Record<OperationalReadinessStatus, string> = {
    blocked: "차단됨",
    configured: "설정됨",
    manual_followup: "수동 후속",
    needs_provisioning: "프로비저닝 필요",
    ready: "완료",
  };

  return labels[status];
}

export function getReadinessTone(status: OperationalReadinessStatus): OperationalReadinessTone {
  if (status === "ready" || status === "configured") {
    return "good";
  }

  if (status === "manual_followup") {
    return "neutral";
  }

  return "risk";
}

export function groupReadinessByCategory(items: readonly OperationalReadinessItem[]) {
  return items.reduce<Record<OperationalReadinessCategory, OperationalReadinessItem[]>>(
    (groups, item) => {
      groups[item.category].push(item);
      return groups;
    },
    {
      compliance: [],
      connectors: [],
      geo: [],
      hardening: [],
      keyword_aeo: [],
      productization: [],
      schema: [],
    },
  );
}

function createReadinessSummary(items: readonly OperationalReadinessItem[]) {
  return {
    blocked: countReadinessStatus(items, "blocked"),
    configured: countReadinessStatus(items, "configured"),
    manualFollowup: countReadinessStatus(items, "manual_followup"),
    needsProvisioning: countReadinessStatus(items, "needs_provisioning"),
    ready: countReadinessStatus(items, "ready"),
    total: items.length,
  };
}

function countReadinessStatus(
  items: readonly OperationalReadinessItem[],
  status: OperationalReadinessStatus,
) {
  return items.filter((item) => item.status === status).length;
}

function createDemoItem(
  id: string,
  category: OperationalReadinessCategory,
  title: string,
  status: OperationalReadinessStatus,
): OperationalReadinessItem {
  return {
    category,
    envKeys: [],
    id,
    nextAction: "배포 환경 값 또는 제품 정책을 확정하세요.",
    status,
    summary: "남은 제품화/운영 연결 항목입니다.",
    title,
  };
}
