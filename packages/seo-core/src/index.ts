import type { PageSnapshot } from "@searchops/types";

export const seoCorePackage = "seo-core" as const;

export interface SeoRuleEngineInput {
  readonly pages: readonly PageSnapshot[];
}

export function createEmptySeoIssueSet(input: SeoRuleEngineInput) {
  return {
    pageCount: input.pages.length,
    issues: [] as const
  };
}