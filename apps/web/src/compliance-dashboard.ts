import {
  ComplianceFlagListResponseSchema,
  CreateComplianceFlagWorkOrderResponseSchema,
  CreateComplianceReviewResponseSchema,
  ComplianceFlagSchema,
  RecheckComplianceFlagResponseSchema,
  type ComplianceFlag,
  type ComplianceFlagStatus,
  type Site
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";
import { formatStatusLabel } from "./korean-labels";
import { demoSite } from "./work-order-board";

export type ComplianceDashboardSource = "api" | "fixture";
export type ComplianceTone = "good" | "neutral" | "risk";
export type ComplianceReviewCreateStatus = "created" | "failed" | "fixture";
export type ComplianceWorkOrderStatus = "converted" | "failed" | "fixture";
export type ComplianceStatusUpdateStatus = "updated" | "failed" | "fixture";
export type ComplianceRecheckStatus = "resolved" | "still_open" | "failed" | "fixture";

export interface ComplianceDashboardData {
  readonly errorMessage: string | null;
  readonly flags: readonly ComplianceFlag[];
  readonly source: ComplianceDashboardSource;
}

export interface ComplianceDashboardSummary {
  readonly approved: number;
  readonly blocked: number;
  readonly open: number;
  readonly total: number;
}

export interface ComplianceHardeningWorkflowStage {
  readonly detail: string;
  readonly id: string;
  readonly nextAction: string;
  readonly status: "needs_owner" | "ready";
  readonly title: string;
}

export interface ComplianceHardeningWorkflowSummary {
  readonly autoPublishAllowed: false;
  readonly deterministicRuleCount: number;
  readonly legalReviewQueueCount: number;
  readonly nativeSignatureProviders: readonly string[];
  readonly rulePackId: "kr-medical";
  readonly stages: readonly ComplianceHardeningWorkflowStage[];
}

export interface ComplianceReviewCreateResult {
  readonly errorMessage: string | null;
  readonly flagCount: number;
  readonly source: ComplianceDashboardSource;
  readonly status: ComplianceReviewCreateStatus;
}

export interface ComplianceWorkOrderResult {
  readonly errorMessage: string | null;
  readonly flagId: string;
  readonly source: ComplianceDashboardSource;
  readonly status: ComplianceWorkOrderStatus;
  readonly workOrderId: string | null;
}

export interface ComplianceStatusUpdateResult {
  readonly errorMessage: string | null;
  readonly flagId: string;
  readonly source: ComplianceDashboardSource;
  readonly status: ComplianceStatusUpdateStatus;
}

export interface ComplianceRecheckResult {
  readonly errorMessage: string | null;
  readonly flagId: string;
  readonly resolved: boolean;
  readonly source: ComplianceDashboardSource;
  readonly status: ComplianceRecheckStatus;
  readonly workOrderStatus: string | null;
}

export interface ComplianceFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

const fixtureCreatedAt = "2026-05-24T00:00:00.000Z";

export const demoComplianceFlags: ComplianceFlag[] = [
  {
    id: "compliance_flag_demo_safety",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    workOrderId: null,
    subjectType: "page_copy",
    subjectId: "page_botox",
    ruleId: "ABSOLUTE_SAFETY_CLAIM",
    url: `https://${demoSite.domain}/services/botox`,
    riskLevel: "high",
    status: "open",
    title: "절대적 안전성 표현",
    message: "콘텐츠에 절대적 안전성 표현이 포함되어 있습니다.",
    evidence: {
      url: `https://${demoSite.domain}/services/botox`,
      excerpt: "이 클리닉 치료는 완전히 안전합니다.",
      observedValue: "completely safe",
      expectedValue: "의료 콘텐츠는 절대적 안전성 표현을 피해야 합니다.",
      sourceField: "text",
      match: "completely safe"
    },
    recommendation: "절대적 안전성 표현을 균형 잡힌 문구로 교체하세요.",
    replacementSuggestion: "위험은 개인별로 다를 수 있음을 설명하세요.",
    generatedBy: "deterministic",
    createdAt: fixtureCreatedAt,
    updatedAt: fixtureCreatedAt
  },
  {
    id: "compliance_flag_demo_publish",
    organizationId: demoSite.organizationId,
    siteId: demoSite.id,
    workOrderId: "wo_compliance_demo",
    subjectType: "content_brief",
    subjectId: "brief_medical_seo",
    ruleId: "UNREVIEWED_MEDICAL_PUBLISH",
    url: `https://${demoSite.domain}/blog/medical-seo-checklist`,
    riskLevel: "critical",
    status: "in_review",
    title: "의료 콘텐츠가 초안 전용이 아닙니다",
    message: "명시적인 컴플라이언스 통과 없이 의료 콘텐츠가 예약 또는 게시되었습니다.",
    evidence: {
      url: `https://${demoSite.domain}/blog/medical-seo-checklist`,
      excerpt: "scheduled",
      observedValue: "scheduled",
      expectedValue: "draft",
      sourceField: "publishState",
      match: "scheduled"
    },
    recommendation:
      "법무 검토가 승인할 때까지 콘텐츠를 초안으로 되돌리거나 게시하지 않은 상태로 유지하세요.",
    replacementSuggestion: "검토가 완료될 때까지 의료 콘텐츠를 draft_only 흐름에 유지하세요.",
    generatedBy: "deterministic",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z"
  }
];

export async function loadComplianceDashboard(site: Site): Promise<ComplianceDashboardData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoComplianceDashboard(site);
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/compliance-flags`,
      {
        cache: "no-store"
      },
    );
    if (!response.ok) {
      throw new Error(`컴플라이언스 플래그 요청 실패: ${response.status}`);
    }

    const list = ComplianceFlagListResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      flags: list.complianceFlags,
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoComplianceDashboard(site);
    return {
      ...fallback,
      errorMessage: error instanceof Error ? error.message : "컴플라이언스 플래그 요청에 실패했습니다"
    };
  }
}

export async function createComplianceReviewFromFixture(
  site: Site,
): Promise<ComplianceReviewCreateResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      flagCount: 0,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/compliance-reviews`,
      {
        body: JSON.stringify({
          evaluatedAt: new Date().toISOString(),
          industry: site.industry ?? "medical",
          publishState: "draft",
          siteId: site.id,
          source: "fixture",
          subjectId: "fixture-medical-page",
          subjectType: "page_copy",
          text: "우리 의료 클리닉은 보장된 치료 결과를 제공하며 완전히 안전합니다.",
          title: "데모 의료 서비스 초안",
          url: `https://${site.domain}/services/botox`
        }),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`컴플라이언스 검토 생성 요청 실패: ${response.status}`);
    }

    const output = CreateComplianceReviewResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      flagCount: output.complianceFlags.length,
      source: "api",
      status: "created"
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof Error ? error.message : "컴플라이언스 검토 생성 요청에 실패했습니다",
      flagCount: 0,
      source: "api",
      status: "failed"
    };
  }
}

export async function convertComplianceFlagToWorkOrder(
  flagId: string,
): Promise<ComplianceWorkOrderResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      flagId,
      source: "fixture",
      status: "fixture",
      workOrderId: null
    };
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/compliance-flags/${encodeURIComponent(flagId)}/work-order`,
      {
        cache: "no-store",
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`컴플라이언스 작업 지시서 요청 실패: ${response.status}`);
    }

    const output = CreateComplianceFlagWorkOrderResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      flagId: output.complianceFlag.id,
      source: "api",
      status: "converted",
      workOrderId: output.workOrder.id
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "컴플라이언스 작업 지시서 요청에 실패했습니다",
      flagId,
      source: "api",
      status: "failed",
      workOrderId: null
    };
  }
}

export async function updateComplianceFlagStatus(
  flagId: string,
  status: ComplianceFlagStatus,
): Promise<ComplianceStatusUpdateResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      flagId,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/compliance-flags/${encodeURIComponent(flagId)}`, {
      body: JSON.stringify({ status }),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
    if (!response.ok) {
      throw new Error(`컴플라이언스 상태 업데이트 요청 실패: ${response.status}`);
    }

    const output = ComplianceFlagSchema.parse(await response.json());
    return {
      errorMessage: null,
      flagId: output.id,
      source: "api",
      status: "updated"
    };
  } catch (error) {
    return {
      errorMessage:
        error instanceof Error ? error.message : "컴플라이언스 상태 업데이트 요청에 실패했습니다",
      flagId,
      source: "api",
      status: "failed"
    };
  }
}

export async function recheckComplianceFlagWithFixtureRevision(
  flagId: string,
): Promise<ComplianceRecheckResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      flagId,
      resolved: true,
      source: "fixture",
      status: "fixture",
      workOrderStatus: null
    };
  }

  try {
    const response = await apiFetch(
      `${apiBaseUrl}/compliance-flags/${encodeURIComponent(flagId)}/recheck`,
      {
        body: JSON.stringify({
          evaluatedAt: new Date().toISOString(),
          source: "work_order",
          text:
            "이 클리닉은 결과를 약속하지 않고 상담 절차, 가능한 불편감, 개인차를 설명합니다."
        }),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`컴플라이언스 재검수 요청 실패: ${response.status}`);
    }

    const output = RecheckComplianceFlagResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      flagId: output.complianceFlag.id,
      resolved: output.resolved,
      source: "api",
      status: output.resolved ? "resolved" : "still_open",
      workOrderStatus: output.workOrder?.status ?? null
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "컴플라이언스 재검수 요청에 실패했습니다",
      flagId,
      resolved: false,
      source: "api",
      status: "failed",
      workOrderStatus: null
    };
  }
}

export function createDemoComplianceDashboard(site: Site = demoSite): ComplianceDashboardData {
  return {
    errorMessage: null,
    flags: demoComplianceFlags.map((flag) => ({
      ...flag,
      organizationId: site.organizationId,
      siteId: site.id,
      url: flag.url?.replace(demoSite.domain, site.domain),
      evidence:
        flag.evidence === undefined || flag.evidence === null
          ? flag.evidence
          : {
              ...flag.evidence,
              url: flag.evidence.url?.replace(demoSite.domain, site.domain) ?? null
            }
    })),
    source: "fixture"
  };
}

export function summarizeComplianceDashboard(
  dashboard: ComplianceDashboardData,
): ComplianceDashboardSummary {
  return {
    approved: dashboard.flags.filter((flag) => flag.status === "approved").length,
    blocked: dashboard.flags.filter(
      (flag) => flag.riskLevel === "critical" || flag.riskLevel === "high",
    ).length,
    open: dashboard.flags.filter((flag) => flag.status === "open").length,
    total: dashboard.flags.length
  };
}

export function summarizeComplianceHardeningWorkflow(
  dashboard: ComplianceDashboardData,
): ComplianceHardeningWorkflowSummary {
  const legalReviewQueueCount = dashboard.flags.filter(
    (flag) => flag.status === "open" || flag.status === "in_review",
  ).length;

  return {
    autoPublishAllowed: false,
    deterministicRuleCount: 7,
    legalReviewQueueCount,
    nativeSignatureProviders: ["wordpress", "webflow"],
    rulePackId: "kr-medical",
    stages: [
      {
        detail: "KR 의료광고 phrase refinement는 deterministic rule pack으로 유지됩니다.",
        id: "kr_rule_pack_refinement",
        nextAction: "법무/시장 owner가 phrase fixture와 severity calibration을 승인합니다.",
        status: "needs_owner",
        title: "KR rule pack refinement"
      },
      {
        detail: "WordPress, Webflow provider webhook은 native signature fallback을 검증합니다.",
        id: "cms_native_signatures",
        nextAction: "provider별 webhook secret과 timestamp replay window를 운영 환경에서 확인합니다.",
        status: "ready",
        title: "CMS native signatures"
      },
      {
        detail: "의료 콘텐츠는 flag와 work order만 만들고 CMS publish action과 연결하지 않습니다.",
        id: "draft_only_gate",
        nextAction: "ContentBrief, compliance, CMS recheck 경로의 draft-only 정책을 유지합니다.",
        status: "ready",
        title: "Draft-only gate"
      },
      {
        detail: `${legalReviewQueueCount}개 플래그가 법무 검토 또는 재검수 대기열에 있습니다.`,
        id: "legal_review_queue",
        nextAction: "open/in_review 플래그를 work order로 전환하고 수정안 재검수를 실행합니다.",
        status: legalReviewQueueCount > 0 ? "needs_owner" : "ready",
        title: "Legal review queue"
      }
    ]
  };
}

export function getComplianceRiskTone(riskLevel: string): ComplianceTone {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "risk";
  }

  if (riskLevel === "medium") {
    return "neutral";
  }

  return "good";
}

export function getComplianceReviewCreateFeedback(
  status: string | undefined,
  flagCount: string | undefined,
): ComplianceFeedback | null {
  if (status === "created") {
    return {
      message: `컴플라이언스 검토가 생성되었습니다 ${flagCount ?? "0"} flags.`,
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: 컴플라이언스 검토를 저장하려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "컴플라이언스 검토에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getComplianceWorkOrderFeedback(
  status: string | undefined,
  workOrderId: string | undefined,
  flagId: string | undefined,
): ComplianceFeedback | null {
  if (status === "converted") {
    return {
      message: workOrderId
        ? `컴플라이언스 작업 지시서가 생성되었습니다: ${workOrderId}`
        : "컴플라이언스 작업 지시서가 생성되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: flagId
        ? `데모 데이터 모드: ${flagId}가 선택되었지만 API 요청은 보내지 않았습니다.`
        : "데모 데이터 모드: 저장되는 컴플라이언스 작업 지시서를 만들려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "컴플라이언스 작업 지시서 생성에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getComplianceStatusUpdateFeedback(
  status: string | undefined,
  flagId: string | undefined,
): ComplianceFeedback | null {
  if (status === "updated") {
    return {
      message: flagId ? `컴플라이언스 플래그가 업데이트되었습니다: ${flagId}` : "컴플라이언스 플래그가 업데이트되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: API 서버 없이는 상태 변경이 저장되지 않습니다.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "컴플라이언스 플래그 업데이트에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getComplianceRecheckFeedback(
  status: string | undefined,
  flagId: string | undefined,
): ComplianceFeedback | null {
  if (status === "resolved") {
    return {
      message: flagId ? `컴플라이언스 재검수에서 해결됨을 확인했습니다: ${flagId}` : "컴플라이언스 재검수에서 해결됨을 확인했습니다.",
      tone: "success"
    };
  }

  if (status === "still_open") {
    return {
      message: "컴플라이언스 재검수에서 같은 규칙이 여전히 감지되었습니다. 작업 지시서를 열린 상태로 유지하세요.",
      tone: "warning"
    };
  }

  if (status === "fixture") {
    return {
      message: "데모 데이터 모드: SEARCHOPS_API_BASE_URL이 설정될 때까지 재검수는 시뮬레이션됩니다.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "컴플라이언스 재검수에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function formatComplianceDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function formatComplianceRisk(riskLevel: string) {
  return formatStatusLabel(riskLevel);
}

export function formatComplianceStatus(status: string) {
  return formatStatusLabel(status);
}
