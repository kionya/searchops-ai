import {
  ContentBriefListResponseSchema,
  type ContentBrief,
  type ContentBriefStatus,
  type KeywordIntent
} from "@searchops/types";

import { demoSite } from "./work-order-board";

export type ContentBriefHistorySource = "api" | "fixture";
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
