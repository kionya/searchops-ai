import {
  CreateGeoVisibilityReportRequestSchema,
  GeoVisibilityReportSchema
} from "@searchops/types";
import { classifyGeoCitationDomain, isDomainInScope } from "./domain-taxonomy.js";

import type {
  CreateGeoVisibilityReportRequest,
  GeoAnswerObservation,
  GeoCitation,
  GeoCitationsByKind,
  GeoCompetitorMention,
  GeoProvider,
  GeoTarget,
  GeoVisibilityCheck,
  GeoVisibilityCheckId,
  GeoVisibilityCheckStatus,
  GeoVisibilityReport,
  GeoVisibilityStatus,
  GeoVisibilityTrendPoint
} from "@searchops/types";

export {
  classifyGeoCitationDomain,
  geoCommunityDomains,
  geoPlatformDomains,
  isDomainInScope
} from "./domain-taxonomy.js";

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
  const competitorMentions = countCompetitorMentions(parsedInput.target, observations);
  const sov = calculateShareOfVoice(parsedInput.target, observations, competitorMentions);
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
    evaluatedAt,
    citationsByKind: summarizeGeoCitationsByKind(citations, parsedInput.target.domain),
    sov,
    competitorMentions,
    ...summarizeGeoObservationSources(observations)
  });
}

/**
 * T2 브랜드명 정규화: 소문자·공백 제거·의료기관 접미어 제거.
 * "고운몸의원" 과 "고운몸" 이 같은 경쟁사로 잡히게 한다.
 */
export function normalizeBrandName(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/(의원|병원|피부과|성형외과|한의원|치과|클리닉|clinic)$/u, "");
}

// ponytail: 정규화 후 부분 문자열 매칭. "고운몸" 이 "고운몸매관리" 에도 걸린다 — 오탐 보고가 오면 경계 토큰 매칭으로 올린다.
function answerMentionsName(answerText: string, name: string) {
  const normalizedName = normalizeBrandName(name);
  return normalizedName.length > 0 && normalizeBrandName(answerText).includes(normalizedName);
}

export function countCompetitorMentions(
  target: GeoTarget,
  observations: readonly GeoAnswerObservation[]
): GeoCompetitorMention[] {
  return (target.competitors ?? []).map((name) => {
    const questions = [
      ...new Set(
        observations
          .filter((observation) => answerMentionsName(observation.answerText, name))
          .map((observation) => observation.query)
      )
    ];
    return { count: questions.length, name, questions };
  });
}

/** SOV(%) = 자사 언급 관측 수 / (자사 + Σ경쟁사 언급 관측 수). 분모 0 → 0. */
export function calculateShareOfVoice(
  target: GeoTarget,
  observations: readonly GeoAnswerObservation[],
  competitorMentions: readonly GeoCompetitorMention[] = countCompetitorMentions(target, observations)
) {
  const own = observations.filter((observation) =>
    answerMentionsBrand(target, observation.answerText)
  ).length;
  const total = own + competitorMentions.reduce((sum, mention) => sum + mention.count, 0);
  return total === 0 ? 0 : percentage(own, total);
}

/** kind 가 없는(T1 이전) 인용은 도메인 사전으로 재분류해 집계한다. */
export function summarizeGeoCitationsByKind(
  citations: readonly GeoCitation[],
  targetDomain: string
): GeoCitationsByKind {
  const counts: GeoCitationsByKind = { owned: 0, platform: 0, competitor: 0, community: 0, other: 0 };
  for (const citation of citations) {
    counts[citation.kind ?? classifyGeoCitationDomain(citation.domain, { targetDomain })] += 1;
  }
  return counts;
}

export const GEO_PARTIAL_FIXTURE_WARNING = "partial-fixture";
export const GEO_NO_OBSERVATIONS_WARNING = "no-observations";

/**
 * 실측(connector) 관측 비율. fixture·manual 은 실측이 아니다.
 * liveShare < 1 이면 진단서에 가짜/수동 수치가 섞였다는 뜻이라 경고를 단다.
 */
export function summarizeGeoObservationSources(
  observations: readonly Pick<GeoAnswerObservation, "source">[]
): { liveShare: number; warnings: string[] } {
  const live = observations.filter((observation) => observation.source === "connector").length;
  if (observations.length === 0) {
    return { liveShare: 0, warnings: [GEO_NO_OBSERVATIONS_WARNING] };
  }
  const liveShare = live / observations.length;
  return { liveShare, warnings: liveShare < 1 ? [GEO_PARTIAL_FIXTURE_WARNING] : [] };
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

      const kind = classifyGeoCitationDomain(domain, {
        competitorDomains: (target.competitors ?? []).filter((entry) => entry.includes(".")),
        targetDomain: target.domain
      });
      byUrl.set(url, {
        domain,
        kind,
        owned: kind === "owned",
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

  return (
    normalizedAnswer.includes(normalizedBrand) ||
    normalizedAnswer.includes(bareDomain) ||
    [target.brandName, ...(target.brandAliases ?? [])].some((name) =>
      answerMentionsName(answerText, name)
    )
  );
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

/** T3 추세 입력: 리포트 레코드에서 필요한 필드만. */
export interface GeoTrendReportInput {
  readonly id: string;
  readonly runSeq?: number | undefined;
  readonly evaluatedAt: string;
  readonly mentionRate: number;
  readonly citationRate: number;
  readonly sov?: number | undefined;
  readonly liveShare?: number | undefined;
}

/**
 * 주간 배치 run(runSeq 있는 리포트)만 골라 오래된 순으로 최근 n 개의 delta 를 낸다.
 * 결측 run 은 gapFromPrevious 로 드러내고, delta 는 실제 직전 run 과 비교한다.
 */
export function computeGeoTrend(reports: readonly GeoTrendReportInput[], runs = 12): GeoVisibilityTrendPoint[] {
  const runReports = reports
    .filter((report): report is GeoTrendReportInput & { runSeq: number } => report.runSeq !== undefined)
    .sort((left, right) => left.runSeq - right.runSeq)
    .slice(-runs);
  const delta = (current: number | undefined, previous: number | undefined) =>
    current === undefined || previous === undefined ? null : current - previous;

  return runReports.map((report, index) => {
    const previous = index === 0 ? undefined : runReports[index - 1];
    return {
      citationRate: report.citationRate,
      delta: {
        citationRate: delta(report.citationRate, previous?.citationRate),
        mentionRate: delta(report.mentionRate, previous?.mentionRate),
        sov: delta(report.sov, previous?.sov)
      },
      evaluatedAt: report.evaluatedAt,
      gapFromPrevious: previous === undefined ? null : report.runSeq - previous.runSeq,
      liveShare: report.liveShare ?? null,
      mentionRate: report.mentionRate,
      reportId: report.id,
      runSeq: report.runSeq,
      sov: report.sov ?? null
    };
  });
}
