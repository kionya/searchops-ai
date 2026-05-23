import {
  ContentBriefListResponseSchema,
  CreateContentBriefDraftRequestSchema,
  CreateContentBriefDraftResponseSchema,
  type ContentBrief,
  type ContentBriefStatus,
  type CreateContentBriefDraftRequest,
  type KeywordIntent
} from "@searchops/types";

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
    primaryKeyword: "answer engine optimization clinic",
    locale: "ko-KR",
    intent: "commercial",
    title: "Answer Engine Optimization Clinic content brief",
    status: "draft",
    summary: "Demo deterministic draft-only content brief for the Phase 7 Keyword/AEO workflow.",
    outline: [
      {
        heading: "Direct answer",
        purpose: "Answer the primary AEO query clearly.",
        targetQuestions: ["What does answer engine optimization clinic include?"],
        acceptanceCriteria: ["Includes one concise answer block."]
      }
    ],
    faqQuestions: ["What does answer engine optimization clinic include?"],
    acceptanceCriteria: [
      "Keep the content brief in draft status until human review is complete.",
      "Do not auto-publish the brief to any CMS or external channel."
    ],
    generationMode: "deterministic",
    publishPolicy: "draft_only",
    createdAt: "2026-05-23T00:00:00.000Z"
  },
  {
    id: "brief_demo_local_seo",
    siteId: demoSite.id,
    keywordId: "keyword_demo_local",
    primaryKeyword: "medical seo checklist",
    locale: "ko-KR",
    intent: "informational",
    title: "Medical SEO Checklist content brief",
    status: "draft",
    summary: "Draft-only checklist brief for deterministic content planning review.",
    outline: [
      {
        heading: "Checklist overview",
        purpose: "Summarize required SEO and compliance review steps.",
        targetQuestions: ["What should a medical SEO checklist include?"],
        acceptanceCriteria: ["Separates technical SEO tasks from compliance review tasks."]
      },
      {
        heading: "Review workflow",
        purpose: "Define the human review path before publishing.",
        targetQuestions: ["Who should approve medical content before publishing?"],
        acceptanceCriteria: ["States that medical content remains a draft until reviewed."]
      }
    ],
    faqQuestions: [
      "What should a medical SEO checklist include?",
      "Who should approve medical content before publishing?"
    ],
    acceptanceCriteria: [
      "Content remains draft-only.",
      "Compliance review is required before publishing."
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
      throw new Error(`Content brief history request failed with ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "Content brief history request failed"
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
      throw new Error(`Content brief create request failed with ${response.status}`);
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
      errorMessage: error instanceof Error ? error.message : "Content brief create request failed",
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
      message: briefId ? `Content brief created: ${briefId}` : "Content brief created.",
      tone: "success"
    };
  }

  if (status === "fixture") {
    return {
      message: keyword
        ? `Fixture mode: ${keyword} was parsed, but no API request was sent.`
        : "Fixture mode: set SEARCHOPS_API_BASE_URL to create persisted briefs.",
      tone: "info"
    };
  }

  if (status === "failed") {
    return {
      message: "Content brief creation failed. Check the API server and retry.",
      tone: "warning"
    };
  }

  return null;
}

export function getContentBriefStatusTone(status: ContentBriefStatus): ContentBriefStatusTone {
  return status === "archived" ? "archived" : "draft";
}

export function formatContentBriefIntent(intent: KeywordIntent) {
  return intent.replaceAll("_", " ");
}

export function formatContentBriefDate(isoDate: string | null) {
  return isoDate ? isoDate.replace("T", " ").slice(0, 16) : "No timestamp";
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
    throw new Error(`${key} is required`);
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
