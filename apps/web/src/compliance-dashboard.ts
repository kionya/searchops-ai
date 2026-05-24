import {
  ComplianceFlagListResponseSchema,
  CreateComplianceFlagWorkOrderResponseSchema,
  CreateComplianceReviewResponseSchema,
  ComplianceFlagSchema,
  type ComplianceFlag,
  type ComplianceFlagStatus,
  type Site
} from "@searchops/types";

import { demoSite } from "./work-order-board";

export type ComplianceDashboardSource = "api" | "fixture";
export type ComplianceTone = "good" | "neutral" | "risk";
export type ComplianceReviewCreateStatus = "created" | "failed" | "fixture";
export type ComplianceWorkOrderStatus = "converted" | "failed" | "fixture";
export type ComplianceStatusUpdateStatus = "updated" | "failed" | "fixture";

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
    title: "Absolute safety claim",
    message: "The content uses absolute safety language.",
    evidence: {
      url: `https://${demoSite.domain}/services/botox`,
      excerpt: "This clinic treatment is completely safe.",
      observedValue: "completely safe",
      expectedValue: "Medical content should avoid absolute safety claims.",
      sourceField: "text",
      match: "completely safe"
    },
    recommendation: "Replace absolute safety language with balanced wording.",
    replacementSuggestion: "Explain that risks vary by individual.",
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
    title: "Medical content is not draft-only",
    message: "Medical content is scheduled or published without an explicit compliance pass.",
    evidence: {
      url: `https://${demoSite.domain}/blog/medical-seo-checklist`,
      excerpt: "scheduled",
      observedValue: "scheduled",
      expectedValue: "draft",
      sourceField: "publishState",
      match: "scheduled"
    },
    recommendation:
      "Move the content back to draft or keep it unpublished until legal review approves it.",
    replacementSuggestion: "Keep medical content in draft_only workflow until review is complete.",
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
    const response = await fetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(site.id)}/compliance-flags`,
      {
        cache: "no-store"
      },
    );
    if (!response.ok) {
      throw new Error(`Compliance flags request failed with ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "Compliance flags request failed"
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
    const response = await fetch(
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
          text: "Our medical clinic offers guaranteed treatment outcomes and is completely safe.",
          title: "Fixture medical service draft",
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
      throw new Error(`Compliance review create request failed with ${response.status}`);
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
        error instanceof Error ? error.message : "Compliance review create request failed",
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
    const response = await fetch(
      `${apiBaseUrl}/compliance-flags/${encodeURIComponent(flagId)}/work-order`,
      {
        cache: "no-store",
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`Compliance work order request failed with ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "Compliance work order request failed",
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
    const response = await fetch(`${apiBaseUrl}/compliance-flags/${encodeURIComponent(flagId)}`, {
      body: JSON.stringify({ status }),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
    if (!response.ok) {
      throw new Error(`Compliance status update request failed with ${response.status}`);
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
        error instanceof Error ? error.message : "Compliance status update request failed",
      flagId,
      source: "api",
      status: "failed"
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
      message: `Compliance review created ${flagCount ?? "0"} flags.`,
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "Fixture mode: set SEARCHOPS_API_BASE_URL to persist compliance reviews.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "Compliance review failed. Check the API server and retry.",
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
        ? `Compliance work order created: ${workOrderId}`
        : "Compliance work order created.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: flagId
        ? `Fixture mode: ${flagId} was selected, but no API request was sent.`
        : "Fixture mode: set SEARCHOPS_API_BASE_URL to create persisted compliance work orders.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "Compliance work order creation failed. Check the API server and retry.",
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
      message: flagId ? `Compliance flag updated: ${flagId}` : "Compliance flag updated.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: "Fixture mode: status changes are not persisted without an API server.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "Compliance flag update failed. Check the API server and retry.",
      tone: "warning"
    };
  }

  return null;
}

export function formatComplianceDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function formatComplianceRisk(riskLevel: string) {
  return riskLevel.replaceAll("_", " ");
}

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}
