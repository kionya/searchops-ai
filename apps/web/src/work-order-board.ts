import type { Site, WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@searchops/types";

export const demoSite: Site = {
  id: "site_demo_rejuel",
  organizationId: "org_demo",
  domain: "example-clinic.com",
  name: "Example Clinic",
  industry: "medical",
  language: "ko",
  country: "KR",
  createdAt: "2026-05-19T00:00:00.000Z"
};

export const workOrderColumns = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
  { status: "blocked", label: "Blocked" }
] as const satisfies ReadonlyArray<{ readonly status: WorkOrderStatus; readonly label: string }>;

export const demoWorkOrders: WorkOrder[] = [
  {
    id: "wo_title_service",
    organizationId: "org_demo",
    siteId: demoSite.id,
    seoIssueId: "issue_title_service",
    status: "open",
    priority: "p0",
    title: "Add a unique title to /service/seo",
    description: "TITLE_MISSING work order",
    problem: "The page does not expose a title tag.",
    evidence: {
      url: "https://example-clinic.com/service/seo",
      observedValue: null,
      expectedValue: "Non-empty title tag",
      sourceField: "title"
    },
    impact: "Search engines and answer engines lose a primary relevance signal.",
    instructions: [
      "Add one page-specific title tag.",
      "Keep the title aligned with the page topic and target service.",
      "Avoid duplicating the same title across service pages."
    ],
    ownerType: "content",
    acceptanceCriteria: [
      "title is not empty after recrawl",
      "title is unique for the site",
      "title matches the page topic"
    ],
    verificationMethod: "Recrawl the URL and confirm title is populated.",
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
    title: "Add one H1 to /service/seo",
    description: "H1_MISSING work order",
    problem: "The page has no H1 heading.",
    evidence: {
      url: "https://example-clinic.com/service/seo",
      observedValue: 0,
      expectedValue: 1,
      sourceField: "h1Count"
    },
    impact: "The page topic is harder to classify for search and AI answer engines.",
    instructions: [
      "Add one visible H1 near the top of the content.",
      "Include the service name naturally.",
      "Keep only one H1 on the page."
    ],
    ownerType: "developer",
    acceptanceCriteria: [
      "h1Count equals 1 after recrawl",
      "h1 text is not empty",
      "h1 topic aligns with the page title"
    ],
    verificationMethod: "Recrawl the URL and confirm h1Count is 1.",
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
    title: "Review homepage meta description",
    description: "META_DESC_MISSING work order",
    problem: "The homepage does not expose a meta description.",
    evidence: {
      url: "https://example-clinic.com/",
      observedValue: null,
      expectedValue: "Non-empty meta description",
      sourceField: "metaDescription"
    },
    impact: "Search result snippets may be less controlled and less useful.",
    instructions: [
      "Write a concise description for the homepage.",
      "Include the clinic category and primary service area.",
      "Keep the copy factual and compliant."
    ],
    ownerType: "marketer",
    acceptanceCriteria: [
      "metaDescription is not empty after recrawl",
      "copy is unique for the homepage"
    ],
    verificationMethod: "Recrawl the homepage and confirm metaDescription is populated.",
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
    title: "Add alt text to team images",
    description: "IMAGE_ALT_MISSING work order",
    problem: "Two images are missing alt text.",
    evidence: {
      url: "https://example-clinic.com/about",
      observedValue: ["team-hero.jpg", "doctor-profile.jpg"],
      expectedValue: "Descriptive alt text for each meaningful image",
      sourceField: "imagesWithoutAlt"
    },
    impact: "Image accessibility and image search context are weakened.",
    instructions: [
      "Add descriptive alt text to meaningful team images.",
      "Leave purely decorative images empty only when intentional.",
      "Confirm alt text does not make medical claims."
    ],
    ownerType: "legal",
    acceptanceCriteria: [
      "imagesWithoutAlt equals 0 after recrawl",
      "medical claim language is compliance-reviewed"
    ],
    verificationMethod: "Recrawl the URL and confirm all meaningful images have alt text.",
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
    title: "Set canonical on /blog/seo-basics",
    description: "CANONICAL_MISSING work order",
    problem: "The article had no canonical URL.",
    evidence: {
      url: "https://example-clinic.com/blog/seo-basics",
      observedValue: null,
      expectedValue: "Self-referencing canonical URL",
      sourceField: "canonicalUrl"
    },
    impact: "Duplicate URL variants can dilute ranking signals.",
    instructions: [
      "Add a self-referencing canonical URL.",
      "Keep the canonical URL normalized and absolute."
    ],
    ownerType: "developer",
    acceptanceCriteria: [
      "canonicalUrl matches the crawled URL",
      "no canonical mismatch issue is generated"
    ],
    verificationMethod: "Recrawl the URL and confirm canonicalUrl is self-referencing.",
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
  return isoDate ? isoDate.slice(0, 10) : "Unscheduled";
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
