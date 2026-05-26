import { describe, expect, it } from "vitest";

import { aiCorePackage, aiUsageBoundary, createDraftAssistPrompt } from "./index.js";

describe("ai-core foundation", () => {
  it("keeps AI usage outside deterministic rule truth", () => {
    expect(aiUsageBoundary).toBe("optional-drafting-only");
  });

  it("identifies the package", () => {
    expect(aiCorePackage).toBe("ai-core");
  });

  it("creates optional draft-assist prompts without truth-source authority", () => {
    const prompt = createDraftAssistPrompt({
      audience: "content",
      source: "content_brief",
      sourceId: "brief_1",
      summary: "FAQ gap needs a clearer answer block.",
    });

    expect(prompt.usageBoundary).toBe("optional-drafting-only");
    expect(prompt.guardrails).toContain("Do not create SEO/AEO/GEO/compliance truth.");
    expect(prompt.prompt).toContain("Do not invent evidence.");
  });
});
