import {
  ContentBriefListResponseSchema,
  CreateContentBriefDraftRequestSchema,
  CreateContentBriefDraftResponseSchema,
  type ContentBrief,
  type ContentBriefStatus,
  type CreateContentBriefDraftRequest,
  type KeywordIntent
} from "@searchops/types";

import { formatGenerationModeLabel, formatIntentLabel, formatPublishPolicyLabel, formatStatusLabel } from "./korean-labels";
import { demoSite } from "./work-order-board";

export type ContentBriefHistorySource = "api" | "fixture";
export type ContentBriefCreateStatus = "created" | "failed" | "fixture";
export type ContentBriefStatusTone = "archived" | "draft";

export interface ContentBriefHistoryData {
  readonly briefs: readonly ContentBrief[];
  readonly errorMessage: string | null;
  readonly source: ContentBriefHistorySource;
}

export interface ContentBriefHistorySummary {
  readonly archived: number;
  readonly draft: number;
  readonly latestCreatedAt: string | null;
  readonly total: number;
  readonly totalFaqQuestions: number;
}

export interface ContentBriefCreateResult {
  readonly contentBriefId: string | null;
  readonly errorMessage: string | null;
  readonly primaryKeyword: string;
  readonly source: ContentBriefHistorySource;
  readonly status: ContentBriefCreateStatus;
}

export interface ContentBriefCreateFeedback {
  readonly message: string;
  readonly tone: "info" | "success" | "warning";
}

export const demoContentBriefs: ContentBrief[] = [
  {
    id: "brief_demo_aeo",
    siteId: demoSite.id,
    keywordId: "keyword_demo_aeo",
    primaryKeyword: "답변엔진 최적화 클리닉",
    locale: "ko-KR",
    intent: "commercial",
    title: "답변엔진 최적화 클리닉 콘텐츠 브리프",
    status: "draft",
    summary: "Phase 7 키워드/AEO 흐름을 위한 결정론적 초안 전용 콘텐츠 브리프입니다.",
    outline: [
      {
        heading: "직접 답변",
        purpose: "핵심 AEO 질의에 명확하게 답합니다.",
        targetQuestions: ["답변엔진 최적화 클리닉에는 무엇이 포함되나요?"],
        acceptanceCriteria: ["간결한 답변 블록을 1개 포함합니다."]
      }
    ],
    faqQuestions: ["답변엔진 최적화 클리닉에는 무엇이 포함되나요?"],
    acceptanceCriteria: [
      "사람 검토가 완료될 때까지 콘텐츠 브리프를 초안 상태로 유지합니다.",
      "브리프를 CMS나 외부 채널에 자동 게시하지 않습니다."
    ],
    generationMode: "deterministic",
    publishPolicy: "draft_only",
    createdAt: "2026-05-23T00:00:00.000Z"
  },
  {
    id: "brief_demo_local_seo",
    siteId: demoSite.id,
    keywordId: "keyword_demo_local",
    primaryKeyword: "의료 SEO 체크리스트",
    locale: "ko-KR",
    intent: "informational",
    title: "의료 SEO 체크리스트 콘텐츠 브리프",
    status: "draft",
    summary: "결정론적 콘텐츠 기획 검토를 위한 초안 전용 체크리스트 브리프입니다.",
    outline: [
      {
        heading: "체크리스트 개요",
        purpose: "필수 SEO 및 컴플라이언스 검토 단계를 요약합니다.",
        targetQuestions: ["의료 SEO 체크리스트에는 무엇이 포함되어야 하나요?"],
        acceptanceCriteria: ["기술 SEO 작업과 컴플라이언스 검토 작업을 구분합니다."]
      },
      {
        heading: "검토 흐름",
        purpose: "게시 전 사람 검토 경로를 정의합니다.",
        targetQuestions: ["의료 콘텐츠는 게시 전에 누가 승인해야 하나요?"],
        acceptanceCriteria: ["검토 전까지 의료 콘텐츠가 초안으로 유지된다는 점을 명시합니다."]
      }
    ],
    faqQuestions: [
      "의료 SEO 체크리스트에는 무엇이 포함되어야 하나요?",
      "의료 콘텐츠는 게시 전에 누가 승인해야 하나요?"
    ],
    acceptanceCriteria: [
      "콘텐츠는 초안 전용으로 유지됩니다.",
      "게시 전 컴플라이언스 검토가 필요합니다."
    ],
    generationMode: "deterministic",
    publishPolicy: "draft_only",
    createdAt: "2026-05-22T00:00:00.000Z"
  }
];

export async function loadContentBriefHistory(siteId: string): Promise<ContentBriefHistoryData> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoContentBriefHistory(siteId);
  }

  try {
    const response = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/content-briefs`, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`콘텐츠 브리프 이력 요청 실패: ${response.status}`);
    }

    const list = ContentBriefListResponseSchema.parse(await response.json());
    return {
      briefs: list.contentBriefs,
      errorMessage: null,
      source: "api"
    };
  } catch (error) {
    const fallback = createDemoContentBriefHistory(siteId);
    return {
      ...fallback,
      errorMessage: error instanceof Error ? error.message : "콘텐츠 브리프 이력 요청에 실패했습니다"
    };
  }
}

export async function createContentBriefFromForm(
  siteId: string,
  formData: FormData,
): Promise<ContentBriefCreateResult> {
  const input = createContentBriefRequestFromForm(formData);
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      contentBriefId: null,
      errorMessage: null,
      primaryKeyword: input.keyword.phrase,
      source: "fixture",
      status: "fixture"
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/sites/${encodeURIComponent(siteId)}/content-briefs`, {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
    if (!response.ok) {
      throw new Error(`콘텐츠 브리프 생성 요청 실패: ${response.status}`);
    }

    const output = CreateContentBriefDraftResponseSchema.parse(await response.json());
    return {
      contentBriefId: output.contentBrief.id,
      errorMessage: null,
      primaryKeyword: output.contentBrief.primaryKeyword,
      source: "api",
      status: "created"
    };
  } catch (error) {
    return {
      contentBriefId: null,
      errorMessage: error instanceof Error ? error.message : "콘텐츠 브리프 생성 요청에 실패했습니다",
      primaryKeyword: input.keyword.phrase,
      source: "api",
      status: "failed"
    };
  }
}

export function createContentBriefRequestFromForm(
  formData: FormData,
  options: { readonly evaluatedAt?: string } = {},
): CreateContentBriefDraftRequest {
  const phrase = getRequiredFormText(formData, "phrase");
  const intent = getOptionalFormText(formData, "intent");
  const candidateUrl = getOptionalFormText(formData, "candidateUrl");
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();

  return CreateContentBriefDraftRequestSchema.parse({
    candidatePage: candidateUrl
      ? {
          answerBlocks: [],
          h1: getOptionalFormText(formData, "h1"),
          h2: splitLines(getOptionalFormText(formData, "h2")),
          metaDescription: getOptionalFormText(formData, "metaDescription"),
          questionHeadings: splitLines(getOptionalFormText(formData, "questionHeadings")),
          schemaTypes: splitCommaList(getOptionalFormText(formData, "schemaTypes")),
          title: getOptionalFormText(formData, "pageTitle"),
          url: candidateUrl,
          wordCount: parseWordCount(getOptionalFormText(formData, "wordCount"))
        }
      : null,
    evaluatedAt,
    keyword: {
      intent: intent || undefined,
      phrase
    }
  });
}

export function createDemoContentBriefHistory(siteId: string = demoSite.id): ContentBriefHistoryData {
  return {
    briefs: demoContentBriefs.map((brief) => ({ ...brief, siteId })),
    errorMessage: null,
    source: "fixture"
  };
}

export function summarizeContentBriefHistory(
  history: ContentBriefHistoryData,
): ContentBriefHistorySummary {
  return {
    archived: history.briefs.filter((brief) => brief.status === "archived").length,
    draft: history.briefs.filter((brief) => brief.status === "draft").length,
    latestCreatedAt: history.briefs[0]?.createdAt ?? null,
    total: history.briefs.length,
    totalFaqQuestions: history.briefs.reduce(
      (total, brief) => total + brief.faqQuestions.length,
      0,
    )
  };
}

export function getContentBriefCreateFeedback(
  status: string | undefined,
  briefId: string | undefined,
  keyword: string | undefined,
): ContentBriefCreateFeedback | null {
  if (status === "created") {
    return {
      message: briefId ? `콘텐츠 브리프가 생성되었습니다: ${briefId}` : "콘텐츠 브리프가 생성되었습니다.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: keyword
        ? `데모 데이터 모드: ${keyword}를 파싱했지만 API 요청은 보내지 않았습니다.`
        : "데모 데이터 모드: 저장되는 브리프를 만들려면 SEARCHOPS_API_BASE_URL을 설정하세요.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "콘텐츠 브리프 생성에 실패했습니다. API 서버를 확인한 뒤 다시 시도하세요.",
      tone: "warning"
    };
  }

  return null;
}

export function getContentBriefStatusTone(status: ContentBriefStatus): ContentBriefStatusTone {
  return status === "archived" ? "archived" : "draft";
}

export function formatContentBriefIntent(intent: KeywordIntent | string | null | undefined) {
  return formatIntentLabel(intent);
}

export function formatContentBriefStatus(status: ContentBriefStatus) {
  return formatStatusLabel(status);
}

export function formatContentBriefGenerationMode(mode: string | null | undefined) {
  return formatGenerationModeLabel(mode);
}

export function formatContentBriefPublishPolicy(policy: string | null | undefined) {
  return formatPublishPolicyLabel(policy);
}

export function formatContentBriefDate(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "시간 정보 없음";
}

function getApiBaseUrl() {
  const value = process.env.SEARCHOPS_API_BASE_URL?.trim();
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function getRequiredFormText(formData: FormData, key: string) {
  const value = getOptionalFormText(formData, key);
  if (!value) {
    throw new Error(`${key} 필드는 필수입니다`);
  }

  return value;
}

function getOptionalFormText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseWordCount(value: string) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
