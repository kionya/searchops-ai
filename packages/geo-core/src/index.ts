import {
  CreateGeoVisibilityReportRequestSchema,
  GeoVisibilityReportSchema
} from "@searchops/types";
import type {
  CreateGeoVisibilityReportRequest,
  GeoAnswerObservation,
  GeoCitation,
  GeoProvider,
  GeoTarget,
  GeoVisibilityCheck,
  GeoVisibilityCheckId,
  GeoVisibilityCheckStatus,
  GeoVisibilityReport,
  GeoVisibilityStatus
} from "@searchops/types";

export const geoCorePackage = "geo-core" as const;
export const geoCoreGenerationMode = "deterministic" as const;

export interface GeoVisibilityEvaluationOptions {
  readonly evaluatedAt?: string;
}

const checkWeights = {
  BRAND_MENTIONED: 35,
  COMPETITOR_CITATION_RISK: 10,
  OWNED_URL_CITED: 30,
  PROVIDER_DIVERSITY: 10,
  QUERY_COVERAGE: 15
} as const satisfies Record<GeoVisibilityCheckId, number>;

export function evaluateGeoVisibility(
  input: CreateGeoVisibilityReportRequest,
  options: GeoVisibilityEvaluationOptions = {},
): GeoVisibilityReport {
  const parsedInput = CreateGeoVisibilityReportRequestSchema.parse(input);
  const evaluatedAt = options.evaluatedAt ?? parsedInput.evaluatedAt ?? new Date().toISOString();
  const observations = parsedInput.observations;
  const queryCount = countDistinct(observations.map((observation) => normalizeText(observation.query)));
  const providerCount = countDistinct(observations.map((observation) => observation.provider));
  const citations = extractGeoCitations(parsedInput.target, observations);
  const mentionRate = calculateBrandMentionRate(parsedInput.target, observations);
  const citationRate = calculateOwnedCitationRate(parsedInput.target, observations);
  const competitorCitationRate = calculateCompetitorCitationRate(citations);
  const checks = [
    evaluateBrandMentionCheck(mentionRate),
    evaluateOwnedCitationCheck(citationRate),
    evaluateQueryCoverageCheck(queryCount),
    evaluateProviderDiversityCheck(providerCount),
    evaluateCompetitorCitationRiskCheck(competitorCitationRate)
  ];
  const score = calculateWeightedScore(checks);

  return GeoVisibilityReportSchema.parse({
    target: parsedInput.target,
    status: classifyGeoVisibilityStatus(score),
    score,
    mentionRate,
    citationRate,
    competitorCitationRate,
    queryCount,
    providerCount,
    observations,
    citations,
    checks,
    generatedBy: geoCoreGenerationMode,
    evaluatedAt
  });
}

export function calculateBrandMentionRate(
  target: GeoTarget,
  observations: readonly GeoAnswerObservation[],
) {
  if (observations.length === 0) {
    return 0;
  }

  const mentioned = observations.filter((observation) =>
    answerMentionsBrand(target, observation.answerText),
  ).length;

  return percentage(mentioned, observations.length);
}

export function calculateOwnedCitationRate(
  target: GeoTarget,
  observations: readonly GeoAnswerObservation[],
) {
  if (observations.length === 0) {
    return 0;
  }

  const cited = observations.filter((observation) =>
    observation.citedUrls.some((url) => isOwnedUrl(url, target.domain)),
  ).length;

  return percentage(cited, observations.length);
}

export function extractGeoCitations(
  target: GeoTarget,
  observations: readonly GeoAnswerObservation[],
): readonly GeoCitation[] {
  const byUrl = new Map<string, GeoCitation>();

  for (const observation of observations) {
    for (const url of observation.citedUrls) {
      const domain = extractHostname(url);
      if (!domain) {
        continue;
      }

      byUrl.set(url, {
        domain,
        owned: isDomainInScope(domain, target.domain),
        url
      });
    }
  }

  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
}

export function classifyGeoVisibilityStatus(score: number): GeoVisibilityStatus {
  if (score >= 75) {
    return "strong";
  }

  if (score >= 50) {
    return "visible";
  }

  if (score >= 25) {
    return "weak";
  }

  return "not_visible";
}

export function answerMentionsBrand(target: GeoTarget, answerText: string) {
  const normalizedAnswer = normalizeText(answerText);
  const normalizedBrand = normalizeText(target.brandName);
  const normalizedDomain = normalizeText(target.domain);
  const bareDomain = normalizedDomain.replace(/^www\./u, "");

  return normalizedAnswer.includes(normalizedBrand) || normalizedAnswer.includes(bareDomain);
}

export function isOwnedUrl(url: string, targetDomain: string) {
  const hostname = extractHostname(url);
  return hostname !== null && isDomainInScope(hostname, targetDomain);
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function calculateCompetitorCitationRate(citations: readonly GeoCitation[]) {
  if (citations.length === 0) {
    return 0;
  }

  return percentage(citations.filter((citation) => !citation.owned).length, citations.length);
}

function evaluateBrandMentionCheck(mentionRate: number): GeoVisibilityCheck {
  return createCheck({
    checkId: "BRAND_MENTIONED",
    expectedValue: ">= 70",
    observedValue: mentionRate,
    score: rateScore(mentionRate, 70, 1),
    sourceField: "observations.answerText"
  });
}

function evaluateOwnedCitationCheck(citationRate: number): GeoVisibilityCheck {
  return createCheck({
    checkId: "OWNED_URL_CITED",
    expectedValue: ">= 50",
    observedValue: citationRate,
    score: rateScore(citationRate, 50, 1),
    sourceField: "observations.citedUrls"
  });
}

function evaluateQueryCoverageCheck(queryCount: number): GeoVisibilityCheck {
  const score = queryCount >= 3 ? 100 : queryCount >= 1 ? 60 : 0;

  return createCheck({
    checkId: "QUERY_COVERAGE",
    expectedValue: ">= 3 distinct queries",
    observedValue: queryCount,
    score,
    sourceField: "observations.query"
  });
}

function evaluateProviderDiversityCheck(providerCount: number): GeoVisibilityCheck {
  const score = providerCount >= 2 ? 100 : providerCount === 1 ? 60 : 0;

  return createCheck({
    checkId: "PROVIDER_DIVERSITY",
    expectedValue: ">= 2 providers",
    observedValue: providerCount,
    score,
    sourceField: "observations.provider"
  });
}

function evaluateCompetitorCitationRiskCheck(competitorCitationRate: number): GeoVisibilityCheck {
  const score =
    competitorCitationRate <= 40 ? 100 : competitorCitationRate <= 70 ? 60 : 0;

  return createCheck({
    checkId: "COMPETITOR_CITATION_RISK",
    expectedValue: "<= 40",
    observedValue: competitorCitationRate,
    score,
    sourceField: "observations.citedUrls"
  });
}

function createCheck({
  checkId,
  expectedValue,
  observedValue,
  score,
  sourceField
}: {
  readonly checkId: GeoVisibilityCheckId;
  readonly expectedValue: string;
  readonly observedValue: number;
  readonly score: number;
  readonly sourceField: string;
}): GeoVisibilityCheck {
  return {
    checkId,
    evidence: {
      expectedValue,
      observedValue,
      sourceField
    },
    score,
    status: scoreToStatus(score)
  };
}

function scoreToStatus(score: number): GeoVisibilityCheckStatus {
  if (score >= 80) {
    return "pass";
  }

  if (score >= 40) {
    return "warning";
  }

  return "fail";
}

function calculateWeightedScore(checks: readonly GeoVisibilityCheck[]) {
  const weighted = checks.reduce(
    (total, check) => total + check.score * checkWeights[check.checkId],
    0,
  );
  const totalWeight = Object.values(checkWeights).reduce((total, weight) => total + weight, 0);

  return Math.round(weighted / totalWeight);
}

function rateScore(rate: number, passThreshold: number, warningThreshold: number) {
  if (rate >= passThreshold) {
    return 100;
  }

  if (rate >= warningThreshold) {
    return 60;
  }

  return 0;
}

function percentage(numerator: number, denominator: number) {
  return Math.round((numerator / denominator) * 100);
}

function countDistinct(values: readonly (GeoProvider | string)[]) {
  return new Set(values.filter(Boolean)).size;
}

function extractHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

function isDomainInScope(hostname: string, targetDomain: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^www\./u, "");
  const normalizedTarget = targetDomain.toLowerCase().replace(/^www\./u, "");

  return normalizedHostname === normalizedTarget || normalizedHostname.endsWith(`.${normalizedTarget}`);
}
