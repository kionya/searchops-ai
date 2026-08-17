import { compliancePackage } from "@searchops/compliance";
import { geoCorePackage } from "@searchops/geo-core";
import { schemaCorePackage } from "@searchops/schema-core";
import { seoCorePackage } from "@searchops/seo-core";
import {
  GeoVisibilityReportRecordSchema,
  SchemaRecommendationRecordSchema,
  SeoIssueDraftSchema,
  WorkOrderDraftSchema
} from "@searchops/types";
import type {
  ComplianceFlag,
  ComplianceRiskLevel,
  ComplianceRuleId,
  EstimatedEffort,
  GeoVisibilityCheckId,
  GeoVisibilityReportRecord,
  GeoVisibilityStatus,
  SchemaJsonLdType,
  SchemaRecommendationRecord,
  SeoIssueDraft,
  SeoIssueRuleId,
  WorkOrderDraft,
  WorkOrderOwnerType,
  WorkOrderPriority
} from "@searchops/types";

export const workordersPackage = "workorders" as const;

export const workOrderInputSources = [
  seoCorePackage,
  compliancePackage,
  schemaCorePackage,
  geoCorePackage
] as const;

interface WorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly estimatedEffort: EstimatedEffort;
  readonly relatedIssues: readonly SeoIssueRuleId[];
  readonly title: (path: string) => string;
  readonly problem: (issue: SeoIssueDraft) => string;
  readonly impact: string;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly verificationMethod: string;
}

interface SchemaWorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly estimatedEffort: EstimatedEffort;
  readonly impact: string;
  readonly title: (path: string, type: SchemaJsonLdType) => string;
  readonly instructions: readonly string[];
  readonly acceptanceCriteria: (type: SchemaJsonLdType) => readonly string[];
}

interface GeoWorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly impact: string;
  readonly title: (report: GeoVisibilityReportRecord) => string;
  readonly problem: (report: GeoVisibilityReportRecord) => string;
}

interface ComplianceWorkOrderTemplate {
  readonly ownerType: WorkOrderOwnerType;
  readonly impact: string;
  readonly title: (flag: ComplianceFlag) => string;
  readonly problem: (flag: ComplianceFlag) => string;
}

export const supportedSeoIssueRuleIds = [
  "TITLE_MISSING",
  "META_DESC_MISSING",
  "H1_MISSING",
  "MULTIPLE_H1",
  "NOINDEX_ON_IMPORTANT_PAGE",
  "CANONICAL_MISSING",
  "CANONICAL_MISMATCH",
  "IMAGE_ALT_MISSING"
] as const satisfies readonly SeoIssueRuleId[];

export const supportedSchemaRecommendationTypes = [
  "WebSite",
  "WebPage",
  "Article",
  "FAQPage",
  "BreadcrumbList",
  "LocalBusiness",
  "MedicalClinic",
  "Service"
] as const satisfies readonly SchemaJsonLdType[];

const workOrderTemplates = {
  TITLE_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["META_DESC_MISSING", "H1_MISSING"],
    title: (path) => `${path} 타이틀 태그 수정`,
    problem: () => "페이지에 내용이 있는 title 태그가 없습니다.",
    impact:
      "검색엔진과 답변엔진이 페이지 주제를 파악하지 못하거나, 검색 결과에 쓸 만한 제목을 띄우지 못합니다.",
    instructions: [
      "이 페이지만의 title 태그를 하나 추가합니다.",
      "핵심 주제와 서비스명을 자연스럽게 넣습니다.",
      "title 은 이 URL 에만 해당하는 내용으로 쓰고, 다른 페이지 제목과 중복시키지 않습니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 title 값이 비어 있지 않게 나온다.",
      "title 이 이 페이지 고유의 값이다.",
      "title 의 주제가 화면에 보이는 내용과 일치한다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 title 필드가 비어 있지 않은지 확인합니다."
  },
  META_DESC_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["TITLE_MISSING"],
    title: (path) => `${path} 메타 설명 수정`,
    problem: () => "페이지에 내용이 있는 meta description 이 없습니다.",
    impact:
      "요약 설명이 없어 검색 스니펫과 AI 요약이 참고할 맥락이 약해집니다.",
    instructions: [
      "페이지를 요약하는 meta description 을 하나 추가합니다.",
      "키워드를 나열하지 말고 핵심 주제와 방문 의도를 담습니다.",
      "설명은 이 URL 에만 해당하는 내용으로 씁니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 metaDescription 값이 비어 있지 않게 나온다.",
      "설명이 페이지 내용을 정확히 요약한다.",
      "다른 주요 페이지의 설명을 복사해 쓰지 않았다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 metaDescription 필드가 비어 있지 않은지 확인합니다."
  },
  H1_MISSING: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["MULTIPLE_H1", "TITLE_MISSING"],
    title: (path) => `${path} H1 제목 추가`,
    problem: () => "페이지에 H1 제목이 없습니다.",
    impact:
      "화면의 제목 구조만으로는 검색엔진과 답변엔진이 페이지의 핵심 주제를 파악하지 못합니다.",
    instructions: [
      "페이지 상단에 내용을 설명하는 H1 을 하나 추가합니다.",
      "목표 주제와 서비스명을 자연스럽게 넣습니다.",
      "페이지에 H1 은 하나만 둡니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 h1Count 가 1로 나온다.",
      "H1 텍스트가 비어 있지 않다.",
      "title 과 H1 이 같은 주제를 가리킨다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 h1Count 가 정확히 1인지 확인합니다."
  },
  MULTIPLE_H1: {
    ownerType: "content",
    estimatedEffort: "s",
    relatedIssues: ["H1_MISSING"],
    title: (path) => `${path} H1 중복 정리`,
    problem: (issue) => `페이지에 H1 제목이 ${String(issue.evidence.observedValue)}개 있습니다.`,
    impact:
      "H1 이 여러 개면 검색·답변엔진이 쓰는 핵심 주제 신호가 흐려집니다.",
    instructions: [
      "대표 제목으로 쓸 H1 하나를 정합니다.",
      "나머지 H1 은 H2 이하로 내립니다.",
      "화면의 제목 단계가 논리적 순서를 유지하게 합니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 h1Count 가 1로 나온다.",
      "보조 제목이 H2 이하 단계를 쓴다.",
      "남은 H1 이 페이지의 핵심 주제와 일치한다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 h1Count 가 정확히 1인지 확인합니다."
  },
  NOINDEX_ON_IMPORTANT_PAGE: {
    ownerType: "developer",
    estimatedEffort: "s",
    relatedIssues: ["ROBOTS_BLOCKED"],
    title: (path) => `${path} noindex 해제`,
    problem: () => "주요 페이지가 noindex 로 표시돼 있습니다.",
    impact:
      "페이지가 검색 결과에서 빠지고, AI 답변엔진이 인용할 수도 없게 됩니다.",
    instructions: [
      "이 페이지가 색인 대상이 맞는지 확인합니다.",
      "robots 메타 태그나 HTTP 헤더에서 noindex 지시를 제거합니다.",
      "robots.txt 가 이 페이지를 막고 있지 않은지 확인합니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 indexability.noindex 가 false 로 나온다.",
      "페이지가 정상 HTTP 상태로 접근된다.",
      "robots.txt 가 이 URL 을 막지 않는다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 indexability.noindex 가 false 인지 확인합니다."
  },
  CANONICAL_MISSING: {
    ownerType: "developer",
    estimatedEffort: "s",
    relatedIssues: ["CANONICAL_MISMATCH"],
    title: (path) => `${path} canonical URL 추가`,
    problem: () => "페이지에 canonical URL 이 없습니다.",
    impact:
      "검색엔진의 중복 처리가 약해지고, 의도하지 않은 URL 이 대표 주소로 선택될 수 있습니다.",
    instructions: [
      "페이지에 canonical link 요소를 추가합니다.",
      "색인 대상이 되는 최종 URL 을 canonical 로 지정합니다.",
      "관련 없는 URL 을 canonical 로 지정하지 않습니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 canonicalUrl 값이 비어 있지 않게 나온다.",
      "canonical URL 이 HTTP 또는 HTTPS 다.",
      "canonical URL 이 대표로 삼으려는 최종 URL 을 가리킨다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 canonicalUrl 이 있는지 확인합니다."
  },
  CANONICAL_MISMATCH: {
    ownerType: "developer",
    estimatedEffort: "m",
    relatedIssues: ["CANONICAL_MISSING"],
    title: (path) => `${path} canonical 불일치 수정`,
    problem: (issue) =>
      `canonical URL 이 ${String(issue.evidence.observedValue)} 인데, ${String(
        issue.evidence.expectedValue
      )} 이어야 합니다.`,
    impact:
      "검색엔진이 순위 신호를 엉뚱한 URL 에 몰아주거나, 의도한 페이지를 무시할 수 있습니다.",
    instructions: [
      "이 URL 의 canonical link 를 점검합니다.",
      "canonical 을 대표로 삼으려는 최종 URL 로 수정합니다.",
      "리다이렉트와 canonical 태그가 같은 목적지를 가리키는지 확인합니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 indexability.canonicalMismatch 가 false 로 나온다.",
      "canonicalUrl 이 대표로 삼으려는 최종 URL 과 일치한다.",
      "canonical 이 가리키는 페이지가 크롤·색인 가능하다."
    ],
    verificationMethod:
      "크롤러 재검사를 돌려 indexability.canonicalMismatch 가 false 인지 확인합니다."
  },
  IMAGE_ALT_MISSING: {
    ownerType: "content",
    estimatedEffort: "m",
    relatedIssues: [],
    title: (path) => `${path} 이미지 alt 텍스트 추가`,
    problem: (issue) =>
      `alt 텍스트가 없는 이미지가 있습니다: ${formatEvidenceValue(issue.evidence.observedValue)}.`,
    impact:
      "alt 텍스트가 없으면 이미지 맥락 전달, 접근성, 멀티모달 AI 의 이해가 모두 약해집니다.",
    instructions: [
      "alt 텍스트가 없는 이미지를 하나씩 확인합니다.",
      "의미 있는 이미지에는 내용을 설명하는 짧은 alt 텍스트를 넣습니다.",
      "장식용 이미지에만 alt 를 빈 값으로 둡니다."
    ],
    acceptanceCriteria: [
      "재크롤에서 이 URL 에 IMAGE_ALT_MISSING 이슈가 나오지 않는다.",
      "의미 있는 이미지에 설명형 alt 텍스트가 있다.",
      "장식용 이미지는 의도적으로 alt 를 빈 값으로 뒀다."
    ],
    verificationMethod: "크롤러 재검사를 돌려 의미 있는 이미지에 alt 텍스트가 모두 있는지 확인합니다."
  }
} satisfies Record<(typeof supportedSeoIssueRuleIds)[number], WorkOrderTemplate>;

const schemaWorkOrderTemplates = {
  Article: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "Article JSON-LD 는 검색·답변엔진이 이 페이지를 제목·작성자·발행처가 있는 칼럼형 콘텐츠로 이해하게 합니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "검수를 마친 Article JSON-LD 블록을 페이지에 추가합니다.",
      "게재 전에 headline·author·publisher 가 화면 내용과 일치하는지 확인합니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "JSON-LD 가 필수 필드를 갖춘 Article 객체로 검증된다.",
      "JSON-LD 값이 화면에 보이는 내용과 일치한다."
    ]
  },
  BreadcrumbList: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "breadcrumb 구조화 데이터는 검색 결과와 답변엔진 인용 맥락에서 페이지 계층을 분명히 해줍니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "하위 경로 페이지에 BreadcrumbList JSON-LD 를 추가합니다.",
      "모든 breadcrumb 항목을 화면 탐색 경로 및 canonical URL 과 일치시킵니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "각 breadcrumb 항목에 name·item·position 필드가 있다.",
      "breadcrumb URL 이 모두 같은 사이트 범위 안에 있다."
    ]
  },
  FAQPage: {
    ownerType: "content",
    estimatedEffort: "m",
    impact:
      "FAQPage JSON-LD 는 검수를 마친 질문·답변을 검색·답변엔진이 뽑아 쓰기 쉽게 만듭니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "검수를 마치고 화면에 실제로 노출된 FAQ 에만 FAQPage JSON-LD 를 추가합니다.",
      "JSON-LD 의 모든 질문·답변을 화면 문구와 항상 일치시킵니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "JSON-LD 의 모든 질문이 화면에 실제로 노출된 질문과 짝을 이룬다.",
      "모든 답변이 게재 전에 검수를 거쳤다."
    ]
  },
  LocalBusiness: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "LocalBusiness JSON-LD 는 검색 시스템이 위치·연락처·지역 정보를 이해하게 합니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "오시는 길·연락처 페이지에 LocalBusiness JSON-LD 를 추가합니다.",
      "선택 필드를 추가하기 전에 주소·전화번호·진료시간을 확인합니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "필수 필드인 name 과 URL 이 있다.",
      "선택 연락처 필드가 공식 사업자 정보와 일치한다."
    ]
  },
  MedicalClinic: {
    ownerType: "legal",
    estimatedEffort: "m",
    impact:
      "MedicalClinic JSON-LD 는 의료기관 정보를 분명히 해주지만, 의학적 표현과 진료과목은 의료광고법 검수를 거쳐야 합니다.",
    title: (path, type) => `${path} ${type} JSON-LD 의료광고법 검수`,
    instructions: [
      "적용 전에 MedicalClinic JSON-LD 초안을 검수합니다.",
      "진료과목·연락처·표현이 의료광고법에 맞는지 확인합니다.",
      "승인된 구조화 데이터를 개발자에게 넘겨 반영합니다."
    ],
    acceptanceCriteria: (type) => [
      `승인된 내용으로 적용한 뒤, 스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "의료광고법 검수에서 근거 없는 의학적 표현이 없음을 확인했다.",
      "필수 필드인 name 과 URL 이 있다."
    ]
  },
  Service: {
    ownerType: "developer",
    estimatedEffort: "m",
    impact:
      "구조화된 서비스 데이터는 검색·답변엔진이 제공 서비스·제공자·서비스 URL 을 이해하게 합니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "시술·서비스 상세 페이지에 Service JSON-LD 를 추가합니다.",
      "서비스명은 사실 그대로 쓰고, 근거 없는 효과 표현은 넣지 않습니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "JSON-LD 에 서비스명·제공자·URL 이 들어 있다.",
      "서비스 설명이 화면에 보이는 내용과 일치한다."
    ]
  },
  WebPage: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "WebPage JSON-LD 는 canonical URL 에 묶인 페이지 실체를 검색·답변엔진에 분명히 알려줍니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "Add WebPage JSON-LD to the page.",
      "canonical 이슈를 먼저 해결한 뒤, JSON-LD 의 URL 을 canonical URL 과 맞춥니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "JSON-LD 에 페이지 name 과 URL 이 들어 있다.",
      "페이지 URL 이 canonical URL 과 일치한다."
    ]
  },
  WebSite: {
    ownerType: "developer",
    estimatedEffort: "s",
    impact:
      "WebSite JSON-LD 는 검색 시스템이 사이트 실체와 홈페이지 URL 을 식별하게 합니다.",
    title: (path, type) => `${path} ${type} JSON-LD 적용`,
    instructions: [
      "홈페이지에 WebSite JSON-LD 를 추가합니다.",
      "사이트명과 URL 을 등록된 사이트 정보와 일치시킵니다."
    ],
    acceptanceCriteria: (type) => [
      `스키마 추천 재검사에서 이 URL 에 ${type} 이 더 이상 나오지 않는다.`,
      "JSON-LD 에 사이트명과 홈페이지 URL 이 들어 있다.",
      "홈페이지 URL 이 같은 사이트 범위 안에 있다."
    ]
  }
} satisfies Record<(typeof supportedSchemaRecommendationTypes)[number], SchemaWorkOrderTemplate>;

const geoStatusPriority = {
  not_visible: "p0",
  strong: "p3",
  visible: "p2",
  weak: "p1"
} as const satisfies Record<GeoVisibilityStatus, WorkOrderPriority>;

const geoStatusEffort = {
  not_visible: "l",
  strong: "s",
  visible: "m",
  weak: "m"
} as const satisfies Record<GeoVisibilityStatus, EstimatedEffort>;

const geoCheckInstructions = {
  BRAND_MENTIONED:
    "답변에 쓰이는 페이지의 브랜드·기관 정보를 보강해, 관련 질의 맥락에서 브랜드가 분명히 언급되게 합니다.",
  COMPETITOR_CITATION_RISK:
    "경쟁사 인용을 확인하고, 해당 질의 주제에 대한 자사 비교·서비스·근거 페이지를 보강합니다.",
  OWNED_URL_CITED:
    "인용돼야 할 자사 페이지를 개선합니다 — 짧은 답변 단락, 명확한 제목, 내부 링크로 연결된 canonical URL.",
  PROVIDER_DIVERSITY:
    "브랜드가 아직 노출되지 않는 제공자를 대상으로 관측 범위와 콘텐츠 신호를 넓힙니다.",
  QUERY_COVERAGE:
    "리포트에 나온 미대응 비브랜드 질의 주제에 대해 콘텐츠를 추가하거나 개선합니다."
} as const satisfies Record<GeoVisibilityCheckId, string>;

const geoWorkOrderTemplate = {
  ownerType: "marketer",
  impact:
    "이용자가 비브랜드 탐색 질의를 할 때 AI 답변엔진이 브랜드를 빠뜨리거나, 경쟁사를 인용하거나, 자사 URL 을 인용하지 않을 수 있습니다.",
  title: (report) =>
    report.status === "strong"
      ? `${report.brandName} GEO 노출 유지`
      : `${report.brandName} GEO 노출 개선`,
  problem: (report) =>
    `GEO 노출이 ${formatGeoStatus(report.status)} 상태입니다. 점수 ${report.score}/100, 언급률 ${report.mentionRate}%, 자사 인용률 ${report.citationRate}%.`
} satisfies GeoWorkOrderTemplate;

const complianceRiskPriority = {
  critical: "p0",
  high: "p1",
  low: "p3",
  medium: "p2"
} as const satisfies Record<ComplianceRiskLevel, WorkOrderPriority>;

const complianceRiskEffort = {
  critical: "m",
  high: "m",
  low: "s",
  medium: "s"
} as const satisfies Record<ComplianceRiskLevel, EstimatedEffort>;

const complianceRuleAcceptanceCriteria = {
  ABSOLUTE_SAFETY_CLAIM: [
    "절대적 안전성 표현을 삭제했거나, 검수를 거친 균형 잡힌 표현으로 바꿨다.",
    "법무 검수에서 위험 고지와 상담 안내 맥락이 적절함을 확인했다."
  ],
  BEFORE_AFTER_REFERENCE: [
    "Before-and-after reference is removed or approved with required consent and disclosures.",
    "공개 초안이 더 이상 일반적·보장된 결과를 암시하지 않는다."
  ],
  GUARANTEED_RESULT_CLAIM: [
    "보장·영구 효과를 뜻하는 표현을 삭제했다.",
    "수정된 문구가 결과를 약속하지 않고 서비스를 설명한다."
  ],
  PATIENT_TESTIMONIAL_REFERENCE: [
    "환자 후기 표현을 삭제했거나, 필요한 동의와 고지를 갖춰 승인받았다.",
    "문구가 일반적인 치료 결과를 암시하지 않는다."
  ],
  PRICE_DISCOUNT_PROMOTION: [
    "할인 문구가 기간·대상·제외 조건·필수 고지를 갖춰 승인됐다.",
    "검수받지 않은 할인 문구를 공개 문구에서 삭제했다."
  ],
  SUPERLATIVE_CLAIM: [
    "근거 없는 순위·최상급 표현을 삭제했다.",
    "남아 있는 우월성 주장에는 객관적 근거와 필수 고지가 붙어 있다."
  ],
  UNREVIEWED_MEDICAL_PUBLISH: [
    "콘텐츠를 초안으로 되돌렸거나, 게재 전 의료광고법 검수 승인을 받았다.",
    "게재 절차가 미검수 의료 콘텐츠를 차단한다."
  ]
} as const satisfies Record<ComplianceRuleId, readonly string[]>;

const complianceWorkOrderTemplate = {
  ownerType: "legal",
  impact:
    "미검수 문구가 공개 페이지에 나가면 게재가 막히고, 법무 검토 부담이 생기며, 신뢰가 떨어집니다.",
  title: (flag) => `${formatCompliancePath(flag)} ${flag.title ?? "의료광고법 검수"}`,
  problem: (flag) => flag.message
} satisfies ComplianceWorkOrderTemplate;

export function createWorkOrderFromSeoIssue(issue: SeoIssueDraft): WorkOrderDraft {
  const parsedIssue = SeoIssueDraftSchema.parse(issue);
  const template = getWorkOrderTemplate(parsedIssue.ruleId);
  const path = formatUrlPath(parsedIssue.evidence.url);

  return WorkOrderDraftSchema.parse({
    title: template.title(path),
    problem: template.problem(parsedIssue),
    evidence: parsedIssue.evidence,
    impact: template.impact,
    instructions: [...template.instructions],
    ownerType: template.ownerType,
    priority: parsedIssue.priority,
    acceptanceCriteria: [...template.acceptanceCriteria],
    verificationMethod: template.verificationMethod,
    estimatedEffort: template.estimatedEffort,
    relatedIssues: [...template.relatedIssues]
  });
}

export function createWorkOrdersFromSeoIssues(
  issues: readonly SeoIssueDraft[]
): readonly WorkOrderDraft[] {
  return issues.map((issue) => createWorkOrderFromSeoIssue(issue));
}

export function createWorkOrderFromSchemaRecommendation(
  recommendation: SchemaRecommendationRecord,
): WorkOrderDraft {
  const parsedRecommendation = SchemaRecommendationRecordSchema.parse(recommendation);
  const template = getSchemaWorkOrderTemplate(parsedRecommendation.type);
  const path = formatUrlPath(parsedRecommendation.pageUrl);

  return WorkOrderDraftSchema.parse({
    title: template.title(path, parsedRecommendation.type),
    problem: parsedRecommendation.reason,
    evidence: {
      url: parsedRecommendation.pageUrl,
      observedValue: parsedRecommendation.evidence.observedTypes,
      expectedValue: parsedRecommendation.evidence.expectedType,
      sourceField: parsedRecommendation.evidence.sourceField
    },
    impact: template.impact,
    instructions: [
      ...template.instructions,
      ...parsedRecommendation.instructions,
      `필수 JSON-LD 필드: ${parsedRecommendation.requiredFields.join(", ")}.`
    ],
    ownerType: template.ownerType,
    priority: parsedRecommendation.priority,
    acceptanceCriteria: [...template.acceptanceCriteria(parsedRecommendation.type)],
    verificationMethod: `${parsedRecommendation.pageUrl} 에 스키마 추천 재검사를 돌려, 열린 ${parsedRecommendation.type} 추천이 남지 않았는지 확인합니다.`,
    estimatedEffort: template.estimatedEffort,
    relatedIssues: ["SCHEMA_MISSING"]
  });
}

export function createWorkOrdersFromSchemaRecommendations(
  recommendations: readonly SchemaRecommendationRecord[],
): readonly WorkOrderDraft[] {
  return recommendations.map((recommendation) =>
    createWorkOrderFromSchemaRecommendation(recommendation),
  );
}

export function createWorkOrderFromGeoVisibilityReport(
  report: GeoVisibilityReportRecord,
): WorkOrderDraft {
  const parsedReport = GeoVisibilityReportRecordSchema.parse(report);

  return WorkOrderDraftSchema.parse({
    title: geoWorkOrderTemplate.title(parsedReport),
    problem: geoWorkOrderTemplate.problem(parsedReport),
    evidence: {
      url: `https://${parsedReport.domain}/`,
      observedValue: `status ${parsedReport.status}; score ${parsedReport.score}; mention ${parsedReport.mentionRate}%; citation ${parsedReport.citationRate}%; competitor ${parsedReport.competitorCitationRate}%`,
      expectedValue:
        "점수 75 이상(strong); 언급률 70% 이상; 자사 인용률 50% 이상; 경쟁사 인용률 40% 이하",
      sourceField: "geoVisibilityReport"
    },
    impact: geoWorkOrderTemplate.impact,
    instructions: createGeoInstructions(parsedReport),
    ownerType: geoWorkOrderTemplate.ownerType,
    priority: geoStatusPriority[parsedReport.status],
    acceptanceCriteria: createGeoAcceptanceCriteria(parsedReport.status),
    verificationMethod:
      "같은 질의 세트로 GEO 노출 리포트를 새로 만들어, 점수·언급률·인용률·경쟁사 인용 위험이 수용 기준을 만족하는지 확인합니다.",
    estimatedEffort: geoStatusEffort[parsedReport.status],
    relatedIssues: []
  });
}

export function createWorkOrdersFromGeoVisibilityReports(
  reports: readonly GeoVisibilityReportRecord[],
): readonly WorkOrderDraft[] {
  return reports.map((report) => createWorkOrderFromGeoVisibilityReport(report));
}

export function createWorkOrderFromComplianceFlag(flag: ComplianceFlag): WorkOrderDraft {
  const url = flag.url ?? flag.evidence?.url ?? null;
  if (url === null) {
    throw new Error("Compliance flag must include a URL before it can become a work order.");
  }

  return WorkOrderDraftSchema.parse({
    title: complianceWorkOrderTemplate.title(flag),
    problem: complianceWorkOrderTemplate.problem(flag),
    evidence: {
      url,
      observedValue: flag.evidence?.observedValue ?? flag.message,
      expectedValue: flag.evidence?.expectedValue ?? "의료광고법 검수를 통과한 의료 콘텐츠",
      sourceField: flag.evidence?.sourceField ?? "complianceFlag"
    },
    impact: complianceWorkOrderTemplate.impact,
    instructions: createComplianceInstructions(flag),
    ownerType: complianceWorkOrderTemplate.ownerType,
    priority: getCompliancePriority(flag.riskLevel),
    acceptanceCriteria: createComplianceAcceptanceCriteria(flag),
    verificationMethod:
      "수정한 초안에 의료광고법 검수를 다시 돌려, 게재 전에 해당 지적이 승인·기각·해소 처리됐는지 확인합니다.",
    estimatedEffort: getComplianceEffort(flag.riskLevel),
    relatedIssues: []
  });
}

export function createWorkOrdersFromComplianceFlags(
  flags: readonly ComplianceFlag[],
): readonly WorkOrderDraft[] {
  return flags.map((flag) => createWorkOrderFromComplianceFlag(flag));
}

export function hasWorkOrderTemplate(ruleId: SeoIssueRuleId) {
  return Object.hasOwn(workOrderTemplates, ruleId);
}

export function hasSchemaWorkOrderTemplate(type: SchemaJsonLdType) {
  return Object.hasOwn(schemaWorkOrderTemplates, type);
}

function getWorkOrderTemplate(ruleId: SeoIssueRuleId) {
  if (!hasWorkOrderTemplate(ruleId)) {
    throw new Error(`No work order template for SEO rule: ${ruleId}`);
  }

  return workOrderTemplates[ruleId as (typeof supportedSeoIssueRuleIds)[number]];
}

function getSchemaWorkOrderTemplate(type: SchemaJsonLdType) {
  if (!hasSchemaWorkOrderTemplate(type)) {
    throw new Error(`No work order template for schema recommendation: ${type}`);
  }

  return schemaWorkOrderTemplates[type as (typeof supportedSchemaRecommendationTypes)[number]];
}

function createGeoInstructions(report: GeoVisibilityReportRecord) {
  const weakChecks = report.checks.filter((check) => check.status !== "pass");
  const baseInstructions = [
    "콘텐츠를 고치기 전에 질의별·제공자별 GEO 관측 결과를 확인합니다.",
    "이미 질의 의도에 맞고 자연스럽게 인용될 수 있는 자사 페이지를 먼저 손봅니다.",
    "의학적 내용이나 효과 주장에 해당하는 문구는 의료광고법 검수가 끝날 때까지 초안 상태로 둡니다."
  ];

  if (weakChecks.length === 0) {
    return [
      "이 좋은 결과를 만든 현재의 답변용 페이지와 내부 링크 구조를 그대로 유지합니다.",
      "이후 GEO 리포트에서 브랜드 언급·자사 인용이 떨어지거나 경쟁사 인용 위험이 오르는지 관찰합니다.",
      ...baseInstructions
    ];
  }

  return [
    ...baseInstructions,
    ...weakChecks.map((check) => geoCheckInstructions[check.checkId])
  ];
}

function createGeoAcceptanceCriteria(status: GeoVisibilityStatus) {
  if (status === "strong") {
    return [
      "다음 GEO 노출 리포트가 strong 을 유지한다.",
      "언급률이 70% 이상을 유지한다.",
      "자사 인용률이 50% 이상을 유지한다.",
      "경쟁사 인용률이 40% 이하를 유지한다."
    ];
  }

  return [
    "다음 GEO 노출 리포트가 strong 상태에 도달한다.",
    "언급률이 70% 이상이다.",
    "자사 인용률이 50% 이상이다.",
    "경쟁사 인용률이 40% 이하다.",
    "리포트가 서로 다른 질의 3개, 제공자 2곳 이상을 다룬다."
  ];
}

function createComplianceInstructions(flag: ComplianceFlag) {
  return [
    "초안을 고치기 전에 지적된 문장과 출처 필드를 확인합니다.",
    flag.recommendation ??
      "지적된 표현이 공개 문구에 남지 않도록 의료 콘텐츠를 수정합니다.",
    flag.replacementSuggestion ??
      "사실에 근거한 서비스 정보를 쓰고, 근거 없는 의료광고 표현은 넣지 않습니다.",
    "법무 검수가 수정본을 승인할 때까지 콘텐츠를 초안 상태로 둡니다."
  ];
}

function createComplianceAcceptanceCriteria(flag: ComplianceFlag) {
  const ruleCriteria =
    flag.ruleId === undefined
      ? ["지적된 표현을 검수했고, 더 이상 게재를 막지 않는다."]
      : complianceRuleAcceptanceCriteria[flag.ruleId];

  return [
    ...ruleCriteria,
    "후속 의료광고법 검수에서 이 지적이 열린 상태로 다시 나오지 않는다.",
    "검수 승인이 기록될 때까지 콘텐츠가 초안 상태로만 남아 있다."
  ];
}

function getCompliancePriority(riskLevel: string): WorkOrderPriority {
  return riskLevel in complianceRiskPriority
    ? complianceRiskPriority[riskLevel as ComplianceRiskLevel]
    : "p2";
}

function getComplianceEffort(riskLevel: string): EstimatedEffort {
  return riskLevel in complianceRiskEffort
    ? complianceRiskEffort[riskLevel as ComplianceRiskLevel]
    : "s";
}

function formatCompliancePath(flag: ComplianceFlag) {
  const url = flag.url ?? flag.evidence?.url;
  if (!url) {
    return "수기 작성 콘텐츠";
  }

  return formatUrlPath(url);
}

function formatGeoStatus(status: GeoVisibilityStatus) {
  return status.replaceAll("_", " ");
}

function formatUrlPath(url: string) {
  const { pathname } = new URL(url);
  return pathname === "" ? "/" : pathname;
}

function formatEvidenceValue(value: SeoIssueDraft["evidence"]["observedValue"]) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}
