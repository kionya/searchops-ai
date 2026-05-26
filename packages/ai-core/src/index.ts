export const aiCorePackage = "ai-core" as const;

export const aiUsageBoundary = "optional-drafting-only" as const;

export interface DraftAssistRequest {
  readonly audience: "developer" | "marketer" | "content" | "legal";
  readonly source: "content_brief" | "schema_recommendation" | "seo_issue" | "work_order";
  readonly sourceId: string;
  readonly summary: string;
}

export interface DraftAssistPrompt {
  readonly guardrails: readonly string[];
  readonly prompt: string;
  readonly usageBoundary: typeof aiUsageBoundary;
}

export function createDraftAssistPrompt(request: DraftAssistRequest): DraftAssistPrompt {
  return {
    guardrails: [
      "Do not create SEO/AEO/GEO/compliance truth.",
      "Do not auto-publish content.",
      "Return draft assistance only.",
      "Preserve deterministic issue evidence from the source record.",
    ],
    prompt: [
      `Audience: ${request.audience}`,
      `Source: ${request.source}`,
      `Source ID: ${request.sourceId}`,
      `Summary: ${request.summary}`,
      "Draft a concise explanation or implementation note. Do not invent evidence.",
    ].join("\n"),
    usageBoundary: aiUsageBoundary,
  };
}
