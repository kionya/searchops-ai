import type { Site, WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

import { scopeDemoFixtureToSite } from "./site-fixture-scope";

export const demoSite: Site = {
  id: "site_demo_rejuel",
  organizationId: "org_demo",
  domain: "example-clinic.com",
  name: "예시 클리닉",
  industry: "medical",
  language: "ko",
  country: "KR",
  createdAt: "2026-05-19T00:00:00.000Z"
};

export const workOrderColumns = [
  { status: "open", label: "열림" },
  { status: "in_progress", label: "진행 중" },
  { status: "in_review", label: "검수 중" },
  { status: "done", label: "완료" },
  { status: "blocked", label: "차단됨" }
] as const satisfies ReadonlyArray<{ readonly status: WorkOrderStatus; readonly label: string }>;

export const demoWorkOrders: WorkOrder[] = [
  {
    id: "wo_title_service",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_title_service",
    status: "open",
    priority: "p0",
    title: "/service/seo에 고유 title 추가",
    description: "TITLE_MISSING 작업 지시서",
    problem: "해당 페이지에 title 태그가 없습니다.",
    evidence: {
      url: "https://example-clinic.com/service/seo",
      observedValue: null,
      expectedValue: "비어 있지 않은 title 태그",
      sourceField: "title"
    },
    impact: "검색엔진과 답변엔진(AEO)이 핵심 관련성 신호를 잃습니다.",
    instructions: [
      "페이지 주제에 맞는 고유 title 태그를 1개 추가합니다.",
      "title이 페이지 주제와 타깃 서비스에 맞게 작성되었는지 확인합니다.",
      "서비스 페이지 간 동일한 title 중복을 피합니다."
    ],
    ownerType: "content",
    acceptanceCriteria: [
      "재크롤링 후 title이 비어 있지 않음",
      "사이트 내 title이 고유함",
      "title이 페이지 주제와 일치함"
    ],
    verificationMethod: "URL을 재크롤링해 title 값이 채워졌는지 확인합니다.",
    estimatedEffort: "s",
    relatedIssues: ["TITLE_MISSING"],
    assignedTo: null,
    dueDate: "2026-05-22T09:00:00.000Z",
    createdAt: "2026-05-20T01:00:00.000Z",
    updatedAt: "2026-05-20T01:00:00.000Z"
  },
  {
    id: "wo_h1_service",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_h1_service",
    status: "in_progress",
    priority: "p1",
    title: "/service/seo에 H1 1개 추가",
    description: "H1_MISSING 작업 지시서",
    problem: "해당 페이지에 H1 헤딩이 없습니다.",
    evidence: {
      url: "https://example-clinic.com/service/seo",
      observedValue: 0,
      expectedValue: 1,
      sourceField: "h1Count"
    },
    impact: "검색엔진과 AI 답변엔진이 페이지 핵심 주제를 분류하기 어려워집니다.",
    instructions: [
      "콘텐츠 상단 근처에 보이는 H1을 1개 추가합니다.",
      "서비스명을 자연스럽게 포함합니다.",
      "한 페이지 안의 H1은 1개만 유지합니다."
    ],
    ownerType: "developer",
    acceptanceCriteria: [
      "재크롤링 후 h1Count가 1임",
      "H1 텍스트가 비어 있지 않음",
      "H1 주제가 페이지 title과 일치함"
    ],
    verificationMethod: "URL을 재크롤링해 h1Count가 1인지 확인합니다.",
    estimatedEffort: "s",
    relatedIssues: ["H1_MISSING"],
    assignedTo: "user_demo",
    dueDate: "2026-05-24T09:00:00.000Z",
    createdAt: "2026-05-20T01:05:00.000Z",
    updatedAt: "2026-05-20T02:00:00.000Z"
  },
  {
    id: "wo_meta_home",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_meta_home",
    status: "in_review",
    priority: "p2",
    title: "홈페이지 meta description 검토",
    description: "META_DESC_MISSING 작업 지시서",
    problem: "홈페이지에 meta description이 없습니다.",
    evidence: {
      url: "https://example-clinic.com/",
      observedValue: null,
      expectedValue: "비어 있지 않은 meta description",
      sourceField: "metaDescription"
    },
    impact: "검색 결과 스니펫을 의도대로 제어하기 어렵고 유용성이 낮아질 수 있습니다.",
    instructions: [
      "홈페이지용 간결한 설명문을 작성합니다.",
      "클리닉 유형과 주요 서비스 지역을 포함합니다.",
      "문구는 사실 기반으로 작성하고 컴플라이언스를 준수합니다."
    ],
    ownerType: "marketer",
    acceptanceCriteria: [
      "재크롤링 후 metaDescription이 비어 있지 않음",
      "홈페이지 문구가 고유함"
    ],
    verificationMethod: "홈페이지를 재크롤링해 metaDescription이 채워졌는지 확인합니다.",
    estimatedEffort: "s",
    relatedIssues: ["META_DESC_MISSING"],
    assignedTo: "user_demo",
    dueDate: "2026-05-25T09:00:00.000Z",
    createdAt: "2026-05-20T01:10:00.000Z",
    updatedAt: "2026-05-20T02:20:00.000Z"
  },
  {
    id: "wo_alt_team",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_alt_team",
    status: "blocked",
    priority: "p3",
    title: "팀 이미지 alt 텍스트 추가",
    description: "IMAGE_ALT_MISSING 작업 지시서",
    problem: "이미지 2개에 alt 텍스트가 없습니다.",
    evidence: {
      url: "https://example-clinic.com/about",
      observedValue: ["team-hero.jpg", "doctor-profile.jpg"],
      expectedValue: "의미 있는 이미지마다 설명형 alt 텍스트",
      sourceField: "imagesWithoutAlt"
    },
    impact: "이미지 접근성과 이미지 검색 문맥 신호가 약해집니다.",
    instructions: [
      "의미 있는 팀 이미지에 설명형 alt 텍스트를 추가합니다.",
      "순수 장식 이미지만 의도적으로 빈 alt를 유지합니다.",
      "alt 텍스트에 의료 효능/보장성 표현이 없는지 확인합니다."
    ],
    ownerType: "legal",
    acceptanceCriteria: [
      "재크롤링 후 imagesWithoutAlt가 0임",
      "의료 주장 표현이 컴플라이언스 검토를 거침"
    ],
    verificationMethod: "URL을 재크롤링해 의미 있는 이미지 모두 alt 텍스트가 있는지 확인합니다.",
    estimatedEffort: "m",
    relatedIssues: ["IMAGE_ALT_MISSING"],
    assignedTo: null,
    dueDate: null,
    createdAt: "2026-05-20T01:15:00.000Z",
    updatedAt: "2026-05-20T02:25:00.000Z"
  },
  {
    id: "wo_canonical_blog",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_canonical_blog",
    status: "done",
    priority: "p2",
    title: "/blog/seo-basics 캐노니컬 설정",
    description: "CANONICAL_MISSING 작업 지시서",
    problem: "해당 글에 canonical URL이 없습니다.",
    evidence: {
      url: "https://example-clinic.com/blog/seo-basics",
      observedValue: null,
      expectedValue: "자기 참조 canonical URL",
      sourceField: "canonicalUrl"
    },
    impact: "중복 URL 변형이 랭킹 신호를 분산시킬 수 있습니다.",
    instructions: [
      "자기 참조 canonical URL을 추가합니다.",
      "canonical URL은 정규화된 절대 URL로 유지합니다."
    ],
    ownerType: "developer",
    acceptanceCriteria: [
      "canonicalUrl이 크롤링 URL과 일치함",
      "canonical mismatch 이슈가 생성되지 않음"
    ],
    verificationMethod: "URL을 재크롤링해 canonicalUrl이 자기 참조인지 확인합니다.",
    estimatedEffort: "s",
    relatedIssues: ["CANONICAL_MISSING"],
    assignedTo: "user_demo",
    dueDate: "2026-05-21T09:00:00.000Z",
    createdAt: "2026-05-20T01:20:00.000Z",
    updatedAt: "2026-05-20T03:00:00.000Z"
  }
];

const priorityRank: Record<WorkOrderPriority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3
};

export function formatPriority(priority: WorkOrderPriority) {
  return priority.toUpperCase();
}

export function formatDate(isoDate: string | null) {
  return isoDate ? isoDate.slice(0, 10) : "일정 없음";
}

export function createSiteWorkOrders(site: Site): WorkOrder[] {
  return scopeDemoFixtureToSite(demoWorkOrders, site);
}

export function sortWorkOrdersForBoard(workOrders: readonly WorkOrder[]) {
  return [...workOrders].sort((left, right) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return formatDate(left.dueDate).localeCompare(formatDate(right.dueDate));
  });
}

export function groupWorkOrdersByStatus(workOrders: readonly WorkOrder[]) {
  const groups: Record<WorkOrderStatus, WorkOrder[]> = {
    open: [],
    in_progress: [],
    in_review: [],
    done: [],
    blocked: []
  };

  for (const workOrder of sortWorkOrdersForBoard(workOrders)) {
    groups[workOrder.status].push(workOrder);
  }

  return groups;
}

export function summarizeWorkOrders(workOrders: readonly WorkOrder[]) {
  const activeWorkOrders = workOrders.filter((workOrder) => workOrder.status !== "done");

  return {
    total: workOrders.length,
    active: activeWorkOrders.length,
    inProgress: workOrders.filter((workOrder) => workOrder.status === "in_progress").length,
    inReview: workOrders.filter((workOrder) => workOrder.status === "in_review").length,
    blocked: workOrders.filter((workOrder) => workOrder.status === "blocked").length,
    urgent: activeWorkOrders.filter(
      (workOrder) => workOrder.priority === "p0" || workOrder.priority === "p1"
    ).length
  };
}

export function canRecheckWorkOrder(workOrder: WorkOrder) {
  return workOrder.status !== "done" && workOrder.status !== "blocked";
}
