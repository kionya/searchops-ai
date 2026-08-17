import {
  CrawlRunSchema,
  SchemaRecommendationRecordSchema,
  SeoIssueSchema,
  SiteSchema,
  UrlRecordSchema,
  WorkOrderSchema,
  type CrawlRun,
  type SchemaRecommendationRecord,
  type SeoIssue,
  type Site,
  type UrlRecord,
  type WorkOrder
} from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";

// 사이트 대시보드가 읽는 것 전부를 한 번에 돌려주는 읽기 전용 진입점.
//
// 왜 통짜 스냅샷인가: 엔티티마다 함수를 두면 조직 스코프 검사를 함수마다 반복해야 하고,
// 새 엔티티를 추가할 때 빠뜨리면 그대로 테넌트 유출이다. 진입점을 하나로 두면
// 검사는 한 곳에만 있고 빠뜨릴 수가 없다.
//
// apps/api 의 라우트는 훅으로 같은 검사를 하지만, 훅은 라우트를 추가할 때 빠뜨릴 수 있다.
// 여기는 구조적으로 그럴 수 없다 — 스코프를 통과하지 않고는 데이터를 꺼낼 함수가 없다.
//
// ponytail: 페이지마다 안 쓰는 것까지 5개 쿼리를 병렬로 친다. 사이트당 수십~수백 행
// 규모라 문제되지 않는다. 한 사이트가 수만 행이 되면 그때 엔티티별로 쪼개라 —
// 단, 쪼개는 순간 스코프 검사를 공통 헬퍼로 강제해야 한다.

export interface SiteDashboardSnapshot {
  readonly site: Site;
  readonly crawlRuns: readonly CrawlRun[];
  readonly urlRecords: readonly UrlRecord[];
  readonly seoIssues: readonly SeoIssue[];
  readonly workOrders: readonly WorkOrder[];
  readonly schemaRecommendations: readonly SchemaRecommendationRecord[];
}

export interface LoadSiteDashboardSnapshotInput {
  // 호출자가 이미 검증한 조직. 웹은 Supabase JWT 클레임에서 얻는다.
  readonly organizationId: string;
  readonly siteId: string;
}

/**
 * 사이트가 없거나 요청 조직 소유가 아니면 null. 둘을 구분하지 않는 이유는
 * 구분 자체가 "그 사이트가 존재한다"는 정보를 타 조직에 흘리기 때문이다.
 */
export async function loadSiteDashboardSnapshot(
  prisma: SearchOpsPrismaClient,
  input: LoadSiteDashboardSnapshotInput,
): Promise<SiteDashboardSnapshot | null> {
  const siteRecord = await prisma.site.findUnique({ where: { id: input.siteId } });
  if (siteRecord === null || siteRecord.organizationId !== input.organizationId) {
    return null;
  }

  const [crawlRuns, urlRecords, seoIssues, workOrders, schemaRecommendations] = await Promise.all([
    prisma.crawlRun.findMany({ orderBy: { startedAt: "asc" }, where: { siteId: input.siteId } }),
    prisma.urlRecord.findMany({ orderBy: [{ url: "asc" }], where: { siteId: input.siteId } }),
    // 이슈는 사이트에 직접 매달려 있지 않다. apps/api 와 같은 경로(크롤런 경유)를 쓴다.
    prisma.seoIssue.findMany({
      orderBy: [{ createdAt: "desc" }, { ruleId: "asc" }],
      where: { crawlRun: { siteId: input.siteId } }
    }),
    prisma.workOrder.findMany({
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      where: { siteId: input.siteId }
    }),
    prisma.schemaRecommendation.findMany({
      orderBy: [{ updatedAt: "desc" }, { pageUrl: "asc" }, { type: "asc" }],
      where: { siteId: input.siteId }
    })
  ]);

  return {
    // 아래 매핑은 apps/api/src/prisma-repository.ts 와 같은 zod 스키마로 파싱한다.
    // 스키마가 계약이라 필드가 어긋나면 여기서 즉시 던진다.
    crawlRuns: crawlRuns.map((record) =>
      CrawlRunSchema.parse({
        endedAt: record.endedAt?.toISOString() ?? null,
        id: record.id,
        siteId: record.siteId,
        startedAt: record.startedAt.toISOString(),
        status: record.status,
        summary: record.summary
      }),
    ),
    schemaRecommendations: schemaRecommendations.map((record) =>
      SchemaRecommendationRecordSchema.parse({
        createdAt: record.createdAt.toISOString(),
        evidence: record.evidence,
        generatedBy: record.generatedBy,
        id: record.id,
        instructions: record.instructions,
        jsonLd: record.jsonLd,
        pageUrl: record.pageUrl,
        priority: record.priority,
        reason: record.reason,
        recommendedFields: record.recommendedFields,
        requiredFields: record.requiredFields,
        siteId: record.siteId,
        status: record.status,
        type: record.type,
        updatedAt: record.updatedAt.toISOString()
      }),
    ),
    seoIssues: seoIssues.map((record) =>
      SeoIssueSchema.parse({
        createdAt: record.createdAt.toISOString(),
        crawlRunId: record.crawlRunId,
        evidence: record.evidence,
        id: record.id,
        ruleId: record.ruleId,
        severity: record.severity,
        status: record.status,
        title: record.title,
        urlRecordId: record.urlRecordId
      }),
    ),
    site: SiteSchema.parse({
      country: siteRecord.country,
      createdAt: siteRecord.createdAt.toISOString(),
      domain: siteRecord.domain,
      id: siteRecord.id,
      industry: siteRecord.industry,
      language: siteRecord.language,
      name: siteRecord.name,
      organizationId: siteRecord.organizationId
    }),
    urlRecords: urlRecords.map((record) =>
      UrlRecordSchema.parse({
        crawlRunId: record.crawlRunId,
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        metaDescription: record.metaDescription,
        siteId: record.siteId,
        statusCode: record.statusCode,
        title: record.title,
        url: record.url
      }),
    ),
    workOrders: workOrders.map((record) =>
      WorkOrderSchema.parse({
        acceptanceCriteria: record.acceptanceCriteria,
        assignedTo: record.assignedTo,
        createdAt: record.createdAt.toISOString(),
        description: record.description,
        dueDate: record.dueDate?.toISOString() ?? null,
        estimatedEffort: record.estimatedEffort,
        evidence: record.evidence,
        geoVisibilityReportId: record.geoVisibilityReportId,
        id: record.id,
        impact: record.impact,
        instructions: record.instructions,
        organizationId: record.organizationId,
        ownerType: record.ownerType,
        priority: record.priority,
        problem: record.problem,
        relatedIssues: record.relatedIssues,
        schemaRecommendationId: record.schemaRecommendationId,
        seoIssueId: record.seoIssueId,
        siteId: record.siteId,
        status: record.status,
        title: record.title,
        updatedAt: record.updatedAt.toISOString(),
        verificationMethod: record.verificationMethod
      }),
    )
  };
}

export interface UserMembership {
  readonly organizationId: string;
  readonly role: string;
  readonly userId: string;
}

/**
 * 검증된 이메일로 조직 소속을 찾는다.
 *
 * 왜 필요한가: 웹은 원래 Supabase JWT 의 `organization_id`/`user_role` 커스텀 클레임에
 * 의존했고, 그 클레임은 custom access token hook 을 따로 설치해야 나온다. 웹이 DB 를
 * 직접 읽게 된 이상 그 훅은 필요 없다 — 소속은 여기서 확인하면 된다.
 *
 * ⚠️ 동명이인 방지: `User.email` 은 조직별 unique 라 같은 이메일이 여러 조직에 있을 수
 * 있다. 그 경우 어느 조직인지 결정할 근거가 없으므로 **null 을 돌려 실패로 닫는다**.
 * 아무 조직이나 고르면 그게 곧 테넌트 유출이다. 그런 사용자는 토큰 클레임으로만
 * 해결할 수 있고, 그건 호출자가 판단한다.
 */
export async function findUserMembershipByEmail(
  prisma: SearchOpsPrismaClient,
  email: string,
): Promise<UserMembership | null> {
  const normalized = email.trim();
  if (normalized.length === 0) {
    return null;
  }

  // ⚠️ Prisma 의 `mode: "insensitive"` 는 Postgres 에서 ILIKE 로 컴파일되고 값이 그대로
  // 바인딩된다. 즉 입력의 `%` 와 `_` 가 와일드카드로 동작한다. `_` 는 이메일에 쓸 수 있는
  // 문자라 어떤 주소 검증기도 막지 못하고, 한 행만 맞히는 좁은 패턴이면 "1건이 아니면
  // 거부" 가드도 통과한다 — 그대로 남의 조직 소속과 role 을 얻는다.
  //
  // 두 겹으로 막는다:
  //   1. 패턴 문자를 이스케이프해 ILIKE 를 리터럴 비교로 만든다.
  //   2. 그래도 돌아온 행의 email 을 다시 정확히 대조한다. 1번이 Prisma/드라이버 버전에
  //      따라 달라져도 여기서 걸린다.
  const escaped = normalized.replace(/[\\%_]/g, (character) => `\\${character}`);
  const candidates = await prisma.user.findMany({
    select: { email: true, id: true, organizationId: true, role: true },
    take: 2,
    where: { email: { equals: escaped, mode: "insensitive" } }
  });

  const target = normalized.toLowerCase();
  const matches = candidates.filter((candidate) => candidate.email.toLowerCase() === target);
  const [only] = matches;
  if (matches.length !== 1 || only === undefined) {
    return null;
  }
  return { organizationId: only.organizationId, role: only.role, userId: only.id };
}

/**
 * 조직이 소유한 사이트 목록. `/sites` 페이지가 쓴다.
 */
export async function listOrganizationSites(
  prisma: SearchOpsPrismaClient,
  organizationId: string,
): Promise<readonly Site[]> {
  const records = await prisma.site.findMany({
    orderBy: [{ createdAt: "asc" }, { domain: "asc" }],
    where: { organizationId }
  });
  return records.map((record) =>
    SiteSchema.parse({
      country: record.country,
      createdAt: record.createdAt.toISOString(),
      domain: record.domain,
      id: record.id,
      industry: record.industry,
      language: record.language,
      name: record.name,
      organizationId: record.organizationId
    }),
  );
}
