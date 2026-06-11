import type {
  OperationalReadinessItem,
  OperationalReadinessResponse,
  OperationalReadinessStatus,
  ProductizationReadinessItem,
  ProductizationReadinessResponse,
} from "@searchops/types";

export type EasySetupGroupId = "available_now" | "connect_before_launch" | "decide_later";
export type EasySetupTone = "ready" | "warning" | "info";

export interface EasySetupStep {
  readonly actionLabel: string;
  readonly description: string;
  readonly href: string;
  readonly id: string;
  readonly reason: string;
  readonly title: string;
  readonly tone: EasySetupTone;
}

export interface EasySetupGroup {
  readonly description: string;
  readonly id: EasySetupGroupId;
  readonly steps: readonly EasySetupStep[];
  readonly title: string;
}

export interface EasySetupGuideInput {
  readonly productization: ProductizationReadinessResponse;
  readonly readiness: OperationalReadinessResponse;
}

export interface EasySetupSummary {
  readonly availableNow: number;
  readonly connectBeforeLaunch: number;
  readonly decideLater: number;
  readonly total: number;
}

interface FriendlySetupCopy {
  readonly actionLabel?: string;
  readonly description: string;
  readonly href?: string;
  readonly reason: string;
  readonly title: string;
}

const firstUseSteps: readonly EasySetupStep[] = [
  {
    actionLabel: "사이트 등록하기",
    description: "도메인과 기본 업종만 입력하면 초기 크롤링과 분석 흐름을 시작할 수 있습니다.",
    href: "/sites#site-registration",
    id: "register-site",
    reason: "SearchOps가 어떤 사이트를 분석해야 하는지 정하는 첫 단계입니다.",
    title: "사이트 등록",
    tone: "ready",
  },
  {
    actionLabel: "크롤링 확인하기",
    description: "등록한 사이트에서 URL, 제목, 설명, 링크, 이미지 신호를 수집합니다.",
    href: "/sites/site_demo_rejuel/crawls",
    id: "first-crawl",
    reason: "실제 페이지 데이터를 모아야 SEO 이슈와 작업 지시서가 만들어집니다.",
    title: "첫 크롤링",
    tone: "ready",
  },
  {
    actionLabel: "URL 보기",
    description: "크롤링된 페이지 목록과 상태 코드를 확인합니다.",
    href: "/sites/site_demo_rejuel/urls",
    id: "review-urls",
    reason: "분석 대상 페이지가 제대로 들어왔는지 빠르게 확인할 수 있습니다.",
    title: "URL 확인",
    tone: "ready",
  },
  {
    actionLabel: "이슈 보기",
    description: "제목, 설명, H1, 이미지 alt 같은 결정론적 SEO 이슈를 검토합니다.",
    href: "/sites/site_demo_rejuel/issues",
    id: "review-seo-issues",
    reason: "고쳐야 할 일을 사람이 읽을 수 있는 문제 목록으로 바꿉니다.",
    title: "SEO 이슈 검토",
    tone: "ready",
  },
  {
    actionLabel: "작업 지시서 보기",
    description: "SEO 이슈를 담당자와 우선순위가 있는 실행 작업으로 바꿉니다.",
    href: "/sites/site_demo_rejuel/workorders",
    id: "create-workorders",
    reason: "분석 결과를 실제 수정 업무로 넘기는 단계입니다.",
    title: "작업 지시서",
    tone: "ready",
  },
];

const optionalEvenWhenUnconfigured = new Set(["live-cms-read"]);

const friendlyCopy: Record<string, FriendlySetupCopy> = {
  "ai-draft-assist": {
    description: "AI는 설명이나 초안 보조에만 쓰고, 판단 기준은 기존 규칙이 유지됩니다.",
    reason: "처음부터 켤 필요는 없고, 내부 검수 방식이 정해진 뒤 추가하면 됩니다.",
    title: "AI 초안 보조",
  },
  "alert-routing": {
    description: "오류나 운영 경고를 Slack, 이메일, webhook 같은 알림 채널로 보냅니다.",
    reason: "실사용 중 문제가 생겼을 때 놓치지 않기 위해 필요합니다.",
    title: "알림 채널 연결",
  },
  "billing-subscription": {
    description: "요금제, 결제 provider, 사용량 제한 정책을 정합니다.",
    href: "/ops/productization",
    reason: "고객에게 유료로 제공하려면 결제와 권한 정책이 필요합니다.",
    title: "결제/구독 정책",
  },
  "compliance-rule-pack-refinement": {
    description: "의료광고 리스크 문구와 심각도를 법무/시장 담당자가 검토합니다.",
    reason: "의료/병원 마케팅은 자동 판정보다 사전 검수 기준이 중요합니다.",
    title: "의료광고 검수 기준 승인",
  },
  "connector-partial-failure-ux": {
    description: "일부 provider만 실패했을 때 어떤 항목을 다시 실행할지 확인합니다.",
    reason: "Google, Bing, CMS 연결은 provider별로 성공/실패가 나뉠 수 있습니다.",
    title: "커넥터 실패/재시도 운영",
  },
  "content-brief-ui": {
    description: "콘텐츠 브리프 생성과 검토 흐름을 더 명확하게 다듬습니다.",
    reason: "초기 SEO 분석 후 콘텐츠 운영까지 확장할 때 유용합니다.",
    title: "콘텐츠 브리프 화면 개선",
  },
  "error-monitoring-uptime": {
    description: "서비스 오류와 접속 가능 여부를 계속 감시합니다.",
    reason: "출시 후 장애를 빠르게 발견하려면 필요합니다.",
    title: "오류/업타임 모니터링",
  },
  "external-auth-rbac": {
    description: "실제 로그인, 조직, 역할 권한을 외부 인증 provider와 연결합니다.",
    href: "/ops/productization",
    reason: "고객별 데이터가 섞이지 않게 하려면 출시 전에 필요합니다.",
    title: "실제 로그인/권한",
  },
  "geo-batch-generation": {
    description: "GEO 리포트를 예약 또는 수동 배치로 반복 생성합니다.",
    reason: "AI 검색 노출 모니터링을 정기 운영할 때 필요합니다.",
    title: "GEO 배치 생성",
  },
  "geo-bulk-workorders": {
    description: "GEO 리포트에서 여러 작업 지시서를 한 번에 만들 수 있게 합니다.",
    reason: "리포트가 쌓인 뒤 대량 운영이 필요할 때 추가하면 됩니다.",
    title: "GEO 작업 지시서 일괄 생성",
  },
  "geo-live-providers": {
    description: "AI 검색/답변 provider에서 실제 브랜드 노출 관측치를 수집합니다.",
    reason: "GEO 기능을 실데이터로 운영하려면 필요합니다.",
    title: "GEO provider 연결",
  },
  "geo-observation-collection": {
    description: "수동, 데모, 실제 provider 관측치를 같은 형식으로 모읍니다.",
    reason: "GEO 점수를 만들기 전에 관측치를 검토해야 합니다.",
    title: "GEO 관측 수집",
  },
  "gsc-keyword-discovery": {
    description: "Google Search Console 데이터를 키워드 후보로 변환합니다.",
    reason: "실제 검색어 기반 콘텐츠 계획을 만들려면 필요합니다.",
    title: "GSC 기반 키워드 발견",
  },
  "live-bing": {
    description: "Bing 검색/URL 데이터를 커넥터로 가져옵니다.",
    reason: "Google 외 검색 노출까지 확인하려면 필요합니다.",
    title: "Bing 연결",
  },
  "live-cms-read": {
    actionLabel: "나중에 연결하기",
    description: "CMS 콘텐츠를 읽기/검수 모드로 연결합니다.",
    reason: "초기 분석에는 필수는 아니고, 콘텐츠 운영을 연결할 때 추가하면 됩니다.",
    title: "CMS 읽기 연결",
  },
  "live-ga4": {
    description: "GA4 방문/전환 데이터를 커넥터로 가져옵니다.",
    reason: "SEO 이슈와 실제 성과를 함께 보려면 필요합니다.",
    title: "GA4 연결",
  },
  "live-gsc": {
    description: "Google Search Console 검색어와 페이지 성과 데이터를 가져옵니다.",
    reason: "실제 검색 노출 기반 분석을 하려면 가장 먼저 연결할 데이터입니다.",
    title: "Google Search Console 연결",
  },
  "live-pagespeed": {
    description: "PageSpeed 데이터를 가져와 성능 이슈를 함께 봅니다.",
    reason: "속도와 사용자 경험 신호를 SEO 작업에 반영할 수 있습니다.",
    title: "PageSpeed 연결",
  },
  "observability-drain": {
    description: "운영 로그와 지표를 외부 모니터링 도구로 보냅니다.",
    reason: "실사용 중 장애 원인을 추적하려면 필요합니다.",
    title: "운영 로그 연결",
  },
  "organization-invite-user-management": {
    description: "팀원 초대, 역할 부여, 계정 관리를 실제 인증 provider와 연결합니다.",
    href: "/ops/productization",
    reason: "여러 사용자가 함께 쓰려면 운영 정책이 필요합니다.",
    title: "팀 초대/사용자 관리",
  },
  "production-domain": {
    description: "고객이 접속할 실제 도메인과 보안 연결을 설정합니다.",
    href: "/ops/productization",
    reason: "공개 서비스로 쓰려면 임시 배포 주소 대신 실제 도메인이 필요합니다.",
    title: "실제 도메인 연결",
  },
  "restore-drill-scheduler": {
    description: "백업 복구 점검을 정기적으로 실행할 수 있게 합니다.",
    reason: "고객 데이터가 들어오기 전에 복구 가능성을 확인해야 합니다.",
    title: "백업 복구 점검",
  },
  "rich-result-live-validator": {
    description: "JSON-LD 추천안이 검색 결과 형식에 맞는지 검증합니다.",
    reason: "스키마 추천을 실제 배포 전에 더 안전하게 검토할 수 있습니다.",
    title: "스키마 검증 연결",
  },
  "schema-recheck-linkage": {
    description: "스키마 재검수 결과와 작업 지시서 상태를 더 촘촘히 연결합니다.",
    reason: "수정 완료 여부를 자동으로 추적하려면 필요합니다.",
    title: "스키마 재검수 연결 강화",
  },
  "schema-validation-dashboard-trigger": {
    description: "스키마 화면에서 검증 작업을 직접 실행할 수 있게 합니다.",
    reason: "운영자가 개발자 없이 검증을 돌릴 수 있어야 합니다.",
    title: "스키마 검증 버튼",
  },
  "secret-rotation-executor": {
    description: "중요한 비밀값을 주기적으로 교체하는 운영 절차를 연결합니다.",
    reason: "출시 후 보안 운영을 위해 필요합니다.",
    title: "시크릿 교체 절차",
  },
  "tenant-isolation-e2e": {
    description: "두 조직과 두 사용자로 데이터 접근 차단을 실제 배포 환경에서 확인합니다.",
    reason: "테스트는 있지만, 출시 전 실제 계정으로 한 번 더 확인해야 합니다.",
    title: "조직 분리 실사용 테스트",
  },
};

export function createEasySetupGuide({
  productization,
  readiness,
}: EasySetupGuideInput): readonly EasySetupGroup[] {
  const collected = collectFollowUpSteps(readiness.items, productization.items);
  const connectBeforeLaunch = collected.filter((step) => step.groupId === "connect_before_launch");
  const decideLater = collected.filter((step) => step.groupId === "decide_later");

  return [
    {
      description: "사이트를 등록하고, 크롤링 결과를 보고, 바로 고칠 일을 확인하는 기본 흐름입니다.",
      id: "available_now",
      steps: firstUseSteps,
      title: formatEasySetupGroupTitle("available_now"),
    },
    {
      description: "외부 계정이나 운영 도구가 필요한 항목입니다. 공개 서비스로 쓰기 전에 연결하세요.",
      id: "connect_before_launch",
      steps: connectBeforeLaunch,
      title: formatEasySetupGroupTitle("connect_before_launch"),
    },
    {
      description: "제품 정책이나 운영 방식이 정해진 뒤 붙이면 되는 항목입니다.",
      id: "decide_later",
      steps: decideLater,
      title: formatEasySetupGroupTitle("decide_later"),
    },
  ];
}

export function summarizeEasySetupGuide(groups: readonly EasySetupGroup[]): EasySetupSummary {
  const count = (id: EasySetupGroupId) => groups.find((group) => group.id === id)?.steps.length ?? 0;
  const availableNow = count("available_now");
  const connectBeforeLaunch = count("connect_before_launch");
  const decideLater = count("decide_later");

  return {
    availableNow,
    connectBeforeLaunch,
    decideLater,
    total: availableNow + connectBeforeLaunch + decideLater,
  };
}

export function formatEasySetupGroupTitle(id: EasySetupGroupId) {
  const labels = {
    available_now: "지금 바로 가능",
    connect_before_launch: "출시 전 연결 필요",
    decide_later: "나중에 결정",
  } satisfies Record<EasySetupGroupId, string>;

  return labels[id];
}

function collectFollowUpSteps(
  readinessItems: readonly OperationalReadinessItem[],
  productizationItems: readonly ProductizationReadinessItem[],
) {
  const byId = new Map<string, OperationalReadinessItem | ProductizationReadinessItem>();
  for (const item of [...readinessItems, ...productizationItems]) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values())
    .flatMap((item) => createFollowUpStep(item))
    .sort((left, right) => left.title.localeCompare(right.title, "ko"));
}

function createFollowUpStep(item: OperationalReadinessItem | ProductizationReadinessItem) {
  if (isDoneStatus(item.status)) {
    return [];
  }

  const groupId: EasySetupGroupId =
    item.status === "needs_provisioning" && !optionalEvenWhenUnconfigured.has(item.id)
      ? "connect_before_launch"
      : "decide_later";
  const copy = friendlyCopy[item.id] ?? createFallbackCopy(item);
  const tone: EasySetupTone = groupId === "connect_before_launch" ? "warning" : "info";

  return [
    {
      actionLabel: copy.actionLabel ?? (groupId === "connect_before_launch" ? "연결 방법 보기" : "나중에 결정하기"),
      description: copy.description,
      groupId,
      href: copy.href ?? "/ops/readiness",
      id: item.id,
      reason: copy.reason,
      title: copy.title,
      tone,
    },
  ];
}

function isDoneStatus(status: OperationalReadinessStatus) {
  return status === "configured" || status === "ready";
}

function createFallbackCopy(item: OperationalReadinessItem | ProductizationReadinessItem): FriendlySetupCopy {
  return {
    description: removeTechnicalTerms(item.summary),
    reason: removeTechnicalTerms(item.nextAction),
    title: removeTechnicalTerms(item.title),
  };
}

function removeTechnicalTerms(value: string) {
  return value.replaceAll(/SEARCHOPS_[A-Z0-9_]+/g, "필요 설정값").replaceAll("credential", "연결 정보");
}
