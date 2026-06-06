import {
  CreateSchemaRecommendationWorkOrderResponseSchema,
  CrawlerPageSnapshotSchema,
  QueueSchemaRichResultValidationResponseSchema,
  RecheckSchemaRecommendationResponseSchema,
  SchemaRecommendationListResponseSchema,
  SchemaRecommendationRecordSchema,
  type CrawlerPageSnapshot,
  type SchemaJsonLdType,
  type SchemaRecommendationPriority,
  type SchemaRecommendationRecord,
  type SchemaRecommendationStatus
} from "@searchops/types";

import { getApiBaseUrl } from "./api-base-url";
import { formatStatusLabel } from "./korean-labels";
import { demoSite } from "./work-order-board";

export type SchemaRecommendationDashboardSource = "api" | "fixture";
export type SchemaRecommendationRecheckStatus = "failed" | "fixture" | "not_resolved" | "resolved";
export type SchemaRichResultValidationQueueStatus = "failed" | "fixture" | "queued";
export type SchemaRecommendationTone = "good" | "neutral" | "risk";
export type SchemaRecommendationWorkOrderStatus = "converted" | "failed" | "fixture";

export interface SchemaRecommendationDashboardData {
  readonly errorMessage: string | null;
  readonly recommendations: readonly SchemaRecommendationRecord[];
  readonly source: SchemaRecommendationDashboardSource;
}

export interface SchemaRecommendationDashboardSummary {
  readonly converted: number;
  readonly dismissed: number;
  readonly highPriority: number;
  readonly open: number;
  readonly resolved: number;
  readonly total: number;
  readonly totalRequiredFields: number;
}

export interface SchemaRecommendationWorkOrderResult {
  readonly errorMessage: string | null;
  readonly recommendationId: string;
  readonly source: SchemaRecommendationDashboardSource;
  readonly status: SchemaRecommendationWorkOrderStatus;
  readonly workOrderId: string | null;
}

export interface SchemaRecommendationWorkOrderFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export interface SchemaRecommendationRecheckResult {
  readonly errorMessage: string | null;
  readonly expectedType: SchemaJsonLdType;
  readonly observedTypes: readonly SchemaJsonLdType[];
  readonly recommendationId: string;
  readonly source: SchemaRecommendationDashboardSource;
  readonly status: SchemaRecommendationRecheckStatus;
  readonly workOrderId: string | null;
}

export interface SchemaRecommendationRecheckFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export interface SchemaRichResultValidationQueueResult {
  readonly errorMessage: string | null;
  readonly jobId: string | null;
  readonly recommendationId: string;
  readonly source: SchemaRecommendationDashboardSource;
  readonly status: SchemaRichResultValidationQueueStatus;
}

export interface SchemaRichResultValidationFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

const fixtureCreatedAt = "2026-05-24T00:00:00.000Z";

export const demoSchemaRecommendations: SchemaRecommendationRecord[] = [
  createDemoSchemaRecommendation({
    id: "schema_rec_service",
    pageUrl: "https://example-clinic.com/service/seo",
    type: "Service",
    priority: "p1",
    status: "open",
    reason: "서비스 페이지에 결정론적 Service JSON-LD가 없습니다.",
    observedTypes: ["WebPage"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Service",
      name: "SEO 클리닉 서비스",
      provider: {
        "@type": "MedicalClinic",
        name: demoSite.name
      },
      serviceType: "SEO 진단"
    },
    instructions: [
      "서비스 페이지에 Service JSON-LD 블록을 1개 추가합니다.",
      "provider 값이 사이트 조직 정보와 일치하도록 유지합니다.",
      "작업 지시서를 완료 처리하기 전에 최종 JSON-LD를 검증합니다."
    ],
    requiredFields: ["@context", "@type", "name", "serviceType", "provider"],
    recommendedFields: ["areaServed", "offers"]
  }),
  createDemoSchemaRecommendation({
    id: "schema_rec_medical_clinic",
    pageUrl: "https://example-clinic.com/",
    type: "MedicalClinic",
    priority: "p1",
    status: "converted",
    reason: "홈페이지는 지역 검색과 AI 답변 노출을 위해 클리닉 엔티티를 식별해야 합니다.",
    observedTypes: ["WebSite", "WebPage"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "MedicalClinic",
      name: demoSite.name,
      url: "https://example-clinic.com/"
    },
    instructions: [
      "홈페이지에 MedicalClinic JSON-LD를 추가합니다.",
      "클리닉 이름과 URL이 공개 사이트와 일치하는지 확인합니다.",
      "의료 주장 표현은 게시 전 컴플라이언스 검토를 거칩니다."
    ],
    requiredFields: ["@context", "@type", "name", "url"],
    recommendedFields: ["address", "telephone", "medicalSpecialty"]
  }),
  createDemoSchemaRecommendation({
    id: "schema_rec_breadcrumb",
    pageUrl: "https://example-clinic.com/blog/medical-seo-checklist",
    type: "BreadcrumbList",
    priority: "p2",
    status: "open",
    reason: "해당 글 URL에 계층 문맥을 위한 BreadcrumbList JSON-LD가 없습니다.",
    observedTypes: ["Article"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: "https://example-clinic.com/",
          name: "홈",
          position: 1
        },
        {
          "@type": "ListItem",
          item: "https://example-clinic.com/blog/medical-seo-checklist",
          name: "의료 SEO 체크리스트",
          position: 2
        }
      ]
    },
    instructions: [
      "글 템플릿에 BreadcrumbList JSON-LD를 추가합니다.",
      "breadcrumb position을 순차적이고 안정적으로 유지합니다.",
      "breadcrumb 이름을 화면 내 내비게이션 라벨과 일치시킵니다."
    ],
    requiredFields: ["@context", "@type", "itemListElement"],
    recommendedFields: ["ListItem.item", "ListItem.name", "ListItem.position"]
  })
];

export async function loadSchemaRecommendationDashboard(
  siteId: string,
): Promise<SchemaRecommendationDashboardData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoSchemaRecommendationDashboard(siteId);
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/schema-recommendations`,
      {
        cache: "no-store"
      },
    );
    if (!response.ok) {
      throw new Error(`스키마 추천 요청 실패: ${response.status}`);
    }

    const list = SchemaRecommendationListResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      recommendations: list.recommendations,
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoSchemaRecommendationDashboard(siteId);
    return {
      ...fallback,
      errorMessage:
        error instanceof Error ? error.message : "스키마 추천 요청에 실패했습니다"
    };
  }
}

export async function convertSchemaRecommendationToWorkOrder(
  recommendationId: string,
): Promise<SchemaRecommendationWorkOrderResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      recommendationId,
      source: "fixture",
      status: "fixture",
      workOrderId: null
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/schema-recommendations/${encodeURIComponent(recommendationId)}/work-order`,
      {
        cache: "no-store",
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`스키마 작업 지시서 요청 실패: ${response.status}`);
    }

    const output = CreateSchemaRecommendationWorkOrderResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      recommendationId: output.recommendation.id,
      source: "api",
      status: "converted",
      workOrderId: output.workOrder.id
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "스키마 작업 지시서 요청에 실패했습니다",
      recommendationId,
      source: "api",
      status: "failed",
      workOrderId: null
    };
  }
}

export async function recheckSchemaRecommendationWithDraft(
  recommendation: SchemaRecommendationRecord,
): Promise<SchemaRecommendationRecheckResult> {
  const snapshot = createResolvedSchemaSnapshot(recommendation);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      expectedType: recommendation.type,
      observedTypes: [recommendation.type],
      recommendationId: recommendation.id,
      source: "fixture",
      status: "fixture",
      workOrderId: null
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/schema-recommendations/${encodeURIComponent(recommendation.id)}/recheck`,
      {
        body: JSON.stringify({ snapshot }),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`스키마 재검수 요청 실패: ${response.status}`);
    }

    const output = RecheckSchemaRecommendationResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      expectedType: output.expectedType,
      observedTypes: output.observedTypes,
      recommendationId: output.recommendation.id,
      source: "api",
      status: output.resolved ? "resolved" : "not_resolved",
      workOrderId: output.workOrder?.id ?? null
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "스키마 재검수 요청에 실패했습니다",
      expectedType: recommendation.type,
      observedTypes: [],
      recommendationId: recommendation.id,
      source: "api",
      status: "failed",
      workOrderId: null
    };
  }
}

export async function queueSchemaRichResultValidation(
  recommendationId: string,
): Promise<SchemaRichResultValidationQueueResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      errorMessage: null,
      jobId: null,
      recommendationId,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/schema-recommendations/${encodeURIComponent(recommendationId)}/rich-result-validation-jobs`,
      {
        body: JSON.stringify({}),
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      },
    );
    if (!response.ok) {
      throw new Error(`Rich result 검증 작업 요청 실패: ${response.status}`);
    }

    const output = QueueSchemaRichResultValidationResponseSchema.parse(await response.json());
    return {
      errorMessage: null,
      jobId: output.job.id,
      recommendationId: output.recommendation.id,
      source: "api",
      status: "queued"
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Rich result 검증 작업 요청에 실패했습니다",
      jobId: null,
      recommendationId,
      source: "api",
      status: "failed"
    };
  }
}

export function createDemoSchemaRecommendationDashboard(
  siteId: string = demoSite.id,
): SchemaRecommendationDashboardData {
  return {
    errorMessage: null,
    recommendations: demoSchemaRecommendations.map((recommendation) =>
      SchemaRecommendationRecordSchema.parse({
        ...recommendation,
        siteId
      }),
    ),
    source: "fixture"
  };
}

export function summarizeSchemaRecommendations(
  dashboard: SchemaRecommendationDashboardData,
): SchemaRecommendationDashboardSummary {
  return {
    converted: dashboard.recommendations.filter((recommendation) => recommendation.status === "converted").length,
    dismissed: dashboard.recommendations.filter((recommendation) => recommendation.status === "dismissed").length,
    highPriority: dashboard.recommendations.filter((recommendation) =>
      recommendation.priority === "p0" || recommendation.priority === "p1",
    ).length,
    open: dashboard.recommendations.filter((recommendation) => recommendation.status === "open").length,
    resolved: dashboard.recommendations.filter((recommendation) => recommendation.status === "resolved").length,
    total: dashboard.recommendations.length,
    totalRequiredFields: dashboard.recommendations.reduce(
      (total, recommendation) => total + recommendation.requiredFields.length,
      0,
    )
  };
}

export function getSchemaRecommendationStatusTone(
  status: SchemaRecommendationStatus,
): SchemaRecommendationTone {
  if (status === "converted" || status === "resolved") {
    return "good";
  }

  if (status === "dismissed") {
    return "neutral";
  }

  return "risk";
}

export function getSchemaRecommendationPriorityTone(
  priority: SchemaRecommendationPriority,
): SchemaRecommendationTone {
  if (priority === "p0" || priority === "p1") {
    return "risk";
  }

  if (priority === "p2") {
    return "neutral";
  }

  return "good";
}

export function getSchemaWorkOrderCreateFeedback(
  status: string | undefined,
  workOrderId: string | undefined,
  recommendationId: string | undefined,
): SchemaRecommendationWorkOrderFeedback | null {
  if (status === "converted") {
    return {
      message: workOrderId
        ? `스키마(JSON-LD) 작업 지시서가 생성되었습니다: ${workOrderId}`
        : "스키마(JSON-LD) 작업 지시서가 생성되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: recommendationId
        ? `데모 데이터 모드: ${recommendationId}가 선택되었지만 API 요청은 보내지 않았습니다.`
        : "데모 데이터 모드: 저장되는 스키마 작업 지시서를 만들려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "스키마 작업 지시서 생성에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getSchemaRecheckFeedback(
  status: string | undefined,
  workOrderId: string | undefined,
  recommendationId: string | undefined,
): SchemaRecommendationRecheckFeedback | null {
  if (status === "resolved") {
    return {
      message: workOrderId
        ? `스키마 추천이 해결되고 작업 지시서가 닫혔습니다: ${workOrderId}`
        : "스키마 추천이 해결되었습니다.",
      tone: "success"
    };
  }

  if (status === "not_resolved") {
    return {
      message: "스키마 재검수에서 아직 기대한 JSON-LD 유형을 찾지 못했습니다.",
      tone: "warning"
    };
  }

  if (status === "fixture") {
    return {
      message: recommendationId
        ? `데모 데이터 모드: ${recommendationId}를 결정론적 초안 스냅샷으로 재검수했습니다.`
        : "데모 데이터 모드: 스키마 재검수를 저장하려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "스키마 재검수에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getSchemaRichResultValidationFeedback(
  status: string | undefined,
  jobId: string | undefined,
  recommendationId: string | undefined,
): SchemaRichResultValidationFeedback | null {
  if (status === "queued") {
    return {
      message: jobId
        ? `Rich result 검증 작업이 대기열에 등록되었습니다: ${jobId}`
        : "Rich result 검증 작업이 대기열에 등록되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: recommendationId
        ? `데모 데이터 모드: ${recommendationId}의 Rich result 검증 작업을 요청하지 않았습니다.`
        : "데모 데이터 모드: Rich result 검증 작업을 저장하려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "Rich result 검증 작업 등록에 실패했습니다. API 서버와 worker queue를 확인하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function formatSchemaJsonLdType(type: SchemaJsonLdType) {
  const labels: Record<SchemaJsonLdType, string> = {
    Article: "아티클(Article)",
    BreadcrumbList: "탐색 경로(BreadcrumbList)",
    FAQPage: "FAQ 페이지(FAQPage)",
    LocalBusiness: "지역 비즈니스(LocalBusiness)",
    MedicalClinic: "의료 클리닉(MedicalClinic)",
    Service: "서비스(Service)",
    WebPage: "웹페이지(WebPage)",
    WebSite: "웹사이트(WebSite)"
  };

  if (type in labels) {
    return labels[type];
  }

  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatSchemaPriority(priority: SchemaRecommendationPriority) {
  return priority.toUpperCase();
}

export function formatSchemaRecommendationStatus(status: SchemaRecommendationStatus) {
  return formatStatusLabel(status);
}

export function formatSchemaRecommendationDate(isoDate: string) {
  return isoDate.replace("T", " ").slice(0, 16);
}

export function createResolvedSchemaSnapshot(
  recommendation: SchemaRecommendationRecord,
): CrawlerPageSnapshot {
  const rawJsonLd = JSON.stringify(recommendation.jsonLd);

  return CrawlerPageSnapshotSchema.parse({
    canonicalUrl: recommendation.pageUrl,
    content: {
      duplicateHash: "b".repeat(64),
      textLength: 320,
      wordCount: 48
    },
    finalUrl: null,
    h1Count: 1,
    h2Count: 0,
    headings: {
      h1: [`${formatSchemaJsonLdType(recommendation.type)} 페이지`],
      h2: []
    },
    images: [],
    indexability: {
      canonicalMismatch: false,
      nofollow: false,
      noindex: false,
      robotsBlocked: null
    },
    jsonLd: [
      {
        parsed: recommendation.jsonLd,
        raw: rawJsonLd
      }
    ],
    links: {
      external: [],
      internal: []
    },
    metaDescription: recommendation.reason,
    robotsMeta: "index,follow",
    title: `${formatSchemaJsonLdType(recommendation.type)} 스키마 재검수`,
    url: recommendation.pageUrl
  });
}

function createDemoSchemaRecommendation(input: {
  readonly id: string;
  readonly instructions: readonly string[];
  readonly jsonLd: Record<string, unknown>;
  readonly observedTypes: readonly SchemaJsonLdType[];
  readonly pageUrl: string;
  readonly priority: SchemaRecommendationPriority;
  readonly reason: string;
  readonly recommendedFields: readonly string[];
  readonly requiredFields: readonly string[];
  readonly status: SchemaRecommendationStatus;
  readonly type: SchemaJsonLdType;
}): SchemaRecommendationRecord {
  return SchemaRecommendationRecordSchema.parse({
    createdAt: fixtureCreatedAt,
    evidence: {
      expectedType: input.type,
      observedTypes: input.observedTypes,
      sourceField: "jsonLd",
      url: input.pageUrl
    },
    generatedBy: "deterministic",
    id: input.id,
    instructions: input.instructions,
    jsonLd: input.jsonLd,
    pageUrl: input.pageUrl,
    priority: input.priority,
    reason: input.reason,
    recommendedFields: input.recommendedFields,
    requiredFields: input.requiredFields,
    siteId: demoSite.id,
    status: input.status,
    type: input.type,
    updatedAt: fixtureCreatedAt
  });
}
