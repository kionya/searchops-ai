import { CrawlerPageSnapshotSchema, SeoIssueDraftSchema } from "@searchops/types";
import type {
  CrawlerPageSnapshot,
  SeoIssueCategory,
  SeoIssueDraft,
  SeoIssueEvidenceValue,
  SeoIssuePriority,
  SeoIssueRuleId,
  SeoIssueSeverity
} from "@searchops/types";

export const seoCorePackage = "seo-core" as const;

export type UrlSeoSnapshot = CrawlerPageSnapshot;

export interface SeoRule {
  readonly id: SeoIssueRuleId;
  readonly evaluate: (snapshot: UrlSeoSnapshot) => readonly SeoIssueDraft[];
}

export interface SeoRuleEngineInput {
  readonly pages: readonly UrlSeoSnapshot[];
}

interface SeoIssueDraftInput {
  readonly ruleId: SeoIssueRuleId;
  readonly severity: SeoIssueSeverity;
  readonly category: SeoIssueCategory;
  readonly title: string;
  readonly url: string;
  readonly observedValue: SeoIssueEvidenceValue;
  readonly expectedValue: SeoIssueEvidenceValue;
  readonly sourceField: string;
  readonly effortScore: number;
}

const impactScoreBySeverity: Record<SeoIssueSeverity, number> = {
  critical: 100,
  high: 80,
  medium: 55,
  low: 25
};

function clampScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score)));
}

function priorityFromScore(priorityScore: number): SeoIssuePriority {
  if (priorityScore >= 90) {
    return "p0";
  }

  if (priorityScore >= 70) {
    return "p1";
  }

  if (priorityScore >= 45) {
    return "p2";
  }

  return "p3";
}

export function scoreSeoIssue(severity: SeoIssueSeverity, effortScore: number) {
  const impactScore = impactScoreBySeverity[severity];
  const normalizedEffortScore = clampScore(effortScore);
  const priorityScore = clampScore(impactScore * 0.7 + (100 - normalizedEffortScore) * 0.3);

  return {
    impactScore,
    effortScore: normalizedEffortScore,
    priorityScore,
    priority: priorityFromScore(priorityScore)
  };
}

export function createSeoIssueDraft(input: SeoIssueDraftInput): SeoIssueDraft {
  const score = scoreSeoIssue(input.severity, input.effortScore);

  return SeoIssueDraftSchema.parse({
    ruleId: input.ruleId,
    severity: input.severity,
    category: input.category,
    priority: score.priority,
    title: input.title,
    evidence: {
      url: input.url,
      observedValue: input.observedValue,
      expectedValue: input.expectedValue,
      sourceField: input.sourceField
    },
    impactScore: score.impactScore,
    effortScore: score.effortScore,
    priorityScore: score.priorityScore
  });
}

function isBlank(value: string | null) {
  return value === null || value.trim().length === 0;
}

function getPrimaryUrl(snapshot: UrlSeoSnapshot) {
  return snapshot.finalUrl ?? snapshot.url;
}

function isImportantUrl(url: string) {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split("/").filter(Boolean);

  return pathSegments.length <= 1;
}

export const titleMissingRule: SeoRule = {
  id: "TITLE_MISSING",
  evaluate(snapshot) {
    if (!isBlank(snapshot.title)) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "TITLE_MISSING",
        severity: "high",
        category: "metadata",
        title: "Missing title tag",
        url: snapshot.url,
        observedValue: snapshot.title,
        expectedValue: "Non-empty <title> text",
        sourceField: "title",
        effortScore: 20
      })
    ];
  }
};

export const metaDescriptionMissingRule: SeoRule = {
  id: "META_DESC_MISSING",
  evaluate(snapshot) {
    if (!isBlank(snapshot.metaDescription)) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "META_DESC_MISSING",
        severity: "medium",
        category: "metadata",
        title: "Missing meta description",
        url: snapshot.url,
        observedValue: snapshot.metaDescription,
        expectedValue: "Non-empty meta description",
        sourceField: "metaDescription",
        effortScore: 20
      })
    ];
  }
};

export const h1MissingRule: SeoRule = {
  id: "H1_MISSING",
  evaluate(snapshot) {
    if (snapshot.h1Count > 0) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "H1_MISSING",
        severity: "high",
        category: "headings",
        title: "Missing H1 heading",
        url: snapshot.url,
        observedValue: snapshot.h1Count,
        expectedValue: 1,
        sourceField: "h1Count",
        effortScore: 25
      })
    ];
  }
};

export const multipleH1Rule: SeoRule = {
  id: "MULTIPLE_H1",
  evaluate(snapshot) {
    if (snapshot.h1Count <= 1) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "MULTIPLE_H1",
        severity: "medium",
        category: "headings",
        title: "Multiple H1 headings",
        url: snapshot.url,
        observedValue: snapshot.h1Count,
        expectedValue: 1,
        sourceField: "h1Count",
        effortScore: 30
      })
    ];
  }
};

export const noindexOnImportantPageRule: SeoRule = {
  id: "NOINDEX_ON_IMPORTANT_PAGE",
  evaluate(snapshot) {
    if (!snapshot.indexability.noindex || !isImportantUrl(getPrimaryUrl(snapshot))) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "NOINDEX_ON_IMPORTANT_PAGE",
        severity: "critical",
        category: "indexability",
        title: "Important page is noindexed",
        url: snapshot.url,
        observedValue: true,
        expectedValue: false,
        sourceField: "indexability.noindex",
        effortScore: 20
      })
    ];
  }
};

export const canonicalMissingRule: SeoRule = {
  id: "CANONICAL_MISSING",
  evaluate(snapshot) {
    if (snapshot.canonicalUrl !== null) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "CANONICAL_MISSING",
        severity: "medium",
        category: "canonical",
        title: "Missing canonical URL",
        url: snapshot.url,
        observedValue: null,
        expectedValue: "Self-referencing canonical URL",
        sourceField: "canonicalUrl",
        effortScore: 25
      })
    ];
  }
};

export const canonicalMismatchRule: SeoRule = {
  id: "CANONICAL_MISMATCH",
  evaluate(snapshot) {
    if (snapshot.canonicalUrl === null || !snapshot.indexability.canonicalMismatch) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "CANONICAL_MISMATCH",
        severity: "high",
        category: "canonical",
        title: "Canonical URL does not match the final URL",
        url: snapshot.url,
        observedValue: snapshot.canonicalUrl,
        expectedValue: getPrimaryUrl(snapshot),
        sourceField: "canonicalUrl",
        effortScore: 40
      })
    ];
  }
};

export const imageAltMissingRule: SeoRule = {
  id: "IMAGE_ALT_MISSING",
  evaluate(snapshot) {
    const imagesMissingAlt = snapshot.images.filter((image) => !image.hasAlt);

    if (imagesMissingAlt.length === 0) {
      return [];
    }

    return [
      createSeoIssueDraft({
        ruleId: "IMAGE_ALT_MISSING",
        severity: "low",
        category: "images",
        title: "Images are missing alt text",
        url: snapshot.url,
        observedValue: imagesMissingAlt.map((image) => image.url ?? image.src),
        expectedValue: "All images have non-empty alt text",
        sourceField: "images[].alt",
        effortScore: 35
      })
    ];
  }
};

export const defaultSeoRules = [
  titleMissingRule,
  metaDescriptionMissingRule,
  h1MissingRule,
  multipleH1Rule,
  noindexOnImportantPageRule,
  canonicalMissingRule,
  canonicalMismatchRule,
  imageAltMissingRule
] as const satisfies readonly SeoRule[];

export function evaluateSeoRule(rule: SeoRule, snapshot: UrlSeoSnapshot) {
  return rule.evaluate(snapshot);
}

export function analyzeUrlSeoSnapshot(
  snapshot: UrlSeoSnapshot,
  rules: readonly SeoRule[] = defaultSeoRules
) {
  const parsedSnapshot = CrawlerPageSnapshotSchema.parse(snapshot);

  return rules.flatMap((rule) => rule.evaluate(parsedSnapshot));
}

export function analyzeUrlSeoSnapshots(
  snapshots: readonly UrlSeoSnapshot[],
  rules: readonly SeoRule[] = defaultSeoRules
) {
  return snapshots.flatMap((snapshot) => analyzeUrlSeoSnapshot(snapshot, rules));
}

export function createEmptySeoIssueSet(input: SeoRuleEngineInput) {
  return {
    pageCount: input.pages.length,
    issues: [] as SeoIssueDraft[]
  };
}
