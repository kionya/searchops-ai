const statusLabels: Record<string, string> = {
  active: "실행 중",
  approved: "승인됨",
  archived: "보관됨",
  blocked: "차단됨",
  cleared: "정리됨",
  completed: "완료",
  converted: "작업 지시서 전환됨",
  created: "생성됨",
  critical: "긴급",
  dismissed: "기각됨",
  done: "완료",
  draft: "초안",
  failed: "실패",
  fixture: "데모 데이터 모드",
  high: "높음",
  in_progress: "진행 중",
  in_review: "검수 중",
  info: "정보",
  low: "낮음",
  medium: "중간",
  needs_work: "개선 필요",
  none: "없음",
  not_ready: "준비 부족",
  not_resolved: "미해결",
  not_visible: "미노출",
  ok: "정상",
  open: "열림",
  partial: "일부 완료",
  pass: "통과",
  published: "게시됨",
  queued: "대기 중",
  ready: "준비 완료",
  resolved: "해결됨",
  running: "실행 중",
  setup_required: "설정 필요",
  still_open: "계속 열림",
  strong: "강함",
  updated: "업데이트됨",
  visible: "노출됨",
  waiting: "대기 중",
  warning: "주의",
  weak: "약함"
};

const intentLabels: Record<string, string> = {
  commercial: "비교/검토",
  informational: "정보 탐색",
  local: "지역",
  mixed: "복합",
  navigational: "탐색",
  transactional: "전환"
};

const ownerLabels: Record<string, string> = {
  content: "콘텐츠",
  developer: "개발",
  legal: "법무",
  marketer: "마케팅"
};

const categoryLabels: Record<string, string> = {
  canonical: "캐노니컬",
  headings: "헤딩",
  images: "이미지",
  metadata: "메타데이터",
  schema: "스키마"
};

const industryLabels: Record<string, string> = {
  medical: "의료"
};

const sourceLabels: Record<string, string> = {
  api: "API",
  cms: "CMS",
  fixture: "데모 데이터",
  gsc: "GSC",
  manual: "수동",
  worker: "워커"
};

const generationModeLabels: Record<string, string> = {
  deterministic: "결정론적"
};

const publishPolicyLabels: Record<string, string> = {
  draft_only: "초안 전용"
};

export function formatStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "없음";
  }

  return statusLabels[status] ?? status.replaceAll("_", " ");
}

export function formatIntentLabel(intent: string | null | undefined) {
  if (!intent) {
    return "미분류";
  }

  return intentLabels[intent] ?? intent.replaceAll("_", " ");
}

export function formatOwnerLabel(owner: string | null | undefined) {
  if (!owner) {
    return "미지정";
  }

  return ownerLabels[owner] ?? owner.replaceAll("_", " ");
}

export function formatCategoryLabel(category: string | null | undefined) {
  if (!category) {
    return "미분류";
  }

  return categoryLabels[category] ?? category.replaceAll("_", " ");
}

export function formatIndustryLabel(industry: string | null | undefined) {
  if (!industry) {
    return "미지정";
  }

  return industryLabels[industry] ?? industry.replaceAll("_", " ");
}

export function formatSourceLabel(source: string | null | undefined) {
  if (!source) {
    return "미지정";
  }

  return sourceLabels[source] ?? source.replaceAll("_", " ");
}

export function formatDataSourceLabel(source: "api" | "fixture") {
  return source === "api" ? "API 데이터" : "데모 데이터";
}

export function formatGenerationModeLabel(mode: string | null | undefined) {
  if (!mode) {
    return "미지정";
  }

  return generationModeLabels[mode] ?? mode.replaceAll("_", " ");
}

export function formatPublishPolicyLabel(policy: string | null | undefined) {
  if (!policy) {
    return "미지정";
  }

  return publishPolicyLabels[policy] ?? policy.replaceAll("_", " ");
}

export function formatBooleanLabel(value: boolean) {
  return value ? "예" : "아니오";
}
