# Execution Plan — GEO 진단서·제안서 서비스 갭 구현

> 작성 2026-09-21 · 근거: 코드 감사(판정표 §0) + `harness-suite/docs/GEO_DIAGNOSIS_PROPOSAL_FRAMEWORK.md` §2·§4
> 규칙: 이 저장소 AGENTS.md 그대로 — 결정적 판정 우선(LLM 은 설명·초안만), 라이브 외부 API 는 태스크가 명시할 때만, 의료 콘텐츠 draft-only, 마이그레이션·테스트·Zod 동반.
> 한 태스크 = 한 PR. 순서는 아래 번호. 각 태스크는 독립 머지 가능해야 한다.

## Goal
병원 대상 GEO·AEO·SEO **진단서·제안서**를 이 제품이 직접 낼 수 있게 한다. 타업체(realgeoai)가 못 하는 세 가지 — 주간 반복 측정, 의료광고법 조항 판정, 워크오더 재검수 — 를 코드로 성립시킨다.

## Scope
Included: 아래 T0~T8. 전부 기존 패키지 경계 안에서.
Excluded: 네이버 AI브리핑 라이브 수집(T9, 공식 API 없음 — 별도 결정), 구글 Keyword Planner(OAuth·L), PDF 렌더(HTML 우선, PDF 는 파생), UI 신규 화면(대시보드는 기존 `geo-visibility-dashboard.ts` 확장 범위까지만).

## Current Context (코드 감사 2026-09-21, 코드가 정본)
| # | 기능 | 판정 | 근거 |
|---|---|---|---|
| 1 | 외부 AI 엔진 실호출 | partial | `packages/connectors/src/index.ts:1329-1545` OpenAI·Perplexity·Gemini·Anthropic 실 클라이언트. **네이버 0건**. 키 없으면 fixture 로 조용히 폴백(`:1560-1600`) |
| 2 | 반복 측정·추세 | partial | `GeoVisibilityReport`(schema.prisma:457) run 누적만. 스케줄 없음(BullMQ repeat 미사용, Actions cron 은 crawl 뿐). delta 계산 0건 |
| 3 | 브랜드 멘션·자사 인용 | exists | `packages/geo-core/src/index.ts:72-155`. 별칭·한글 변형 미대응 |
| 4 | 경쟁사 SOV | missing | `calculateCompetitorCitationRate`(:160) = 비자사 비율뿐 |
| 5 | 인용 출처 분류 | missing | `GeoCitation = {url, domain, owned}` |
| 6 | AEO 준비도 | exists | `packages/aeo-core` 7룰, `AeoReadinessReport` |
| 7 | SEO 룰·워크오더·recheck | exists | 룰 8개(seo-core:299-310), workorders 4소스, `POST /work-orders/:id/recheck` |
| 8 | 컴플라이언스 | partial | 룰 7종(compliance:73-81), 수정안 있음. **조항·심의대상 필드 없음**, 9항목 중 6 대응 |
| 9 | 키워드 검색량 | missing | 커넥터 gsc·ga4·pagespeed·bing·cms 뿐. `Keyword` 에 volume 없음 |
| 10 | 진단서/제안서 리포트 | missing | HTML/PDF 렌더 0건 |
| 11 | 제품 알림(텔레그램) | partial | `OperationalAlertRouter`(observability.ts:29) 운영 알림만 |
| 12 | 잡 큐 | partial | BullMQ 4워커. `analyze/generate/recheck` 는 이름만(jobs.ts:9-17) |

Relevant docs: `docs/GEO_SPEC.md`, `docs/COMPLIANCE_SPEC.md`, `docs/SEO_RULES.md`, `docs/DATA_MODEL.md`, `docs/CODE_REVIEW.md`.

---

## T0. 실측/픽스처 구분 플래그 (S) — 최우선
**왜:** 키가 없으면 fixture 로 폴백해 "실측"과 "가짜"가 결과상 구분되지 않는다. 진단서에 가짜 수치가 실리는 경로.
- Data model: `GeoVisibilityReport.observations[]` 각 항목에 `sourceMode: "live" | "fixture"`, 리포트 루트에 `liveShare`(0~1).
- API: 응답 Zod 에 두 필드 추가. `liveShare < 1` 이면 `warnings[]` 에 `"partial-fixture"`.
- Worker: `createLiveGeoAnswerMonitorAdaptersFromKeys` 폴백 지점(`connectors:1560-1600`)에서 모드 기록.
- Tests: 키 없음 → 모든 observation fixture·liveShare 0; 키 일부 → 혼합; 대시보드가 fixture 행을 회색 표기.
- Acceptance: [ ] 마이그레이션 없음(JSON 필드) [ ] 기존 리포트 하위호환(필드 없으면 `"unknown"`) [ ] typecheck·test 통과
- Risk: 과거 리포트가 전부 unknown 으로 보임 → 대시보드 범례에 명시.
- Rollback: 필드 무시. 코드 되돌리면 끝.

## T1. 인용 출처 분류 (S)
- Data model: `GeoCitation.kind: "owned" | "platform" | "competitor" | "community" | "other"`. 도메인 사전은 `packages/geo-core/src/domain-taxonomy.ts`(정적 목록: gangnamunni·yeoshin·babitalk·modoodoc·goodoc = platform; cafe.naver·blog.naver·tistory·dcinside = community). 경쟁사는 T2 의 목록을 참조.
- API: 리포트 응답에 `citationsByKind` 집계.
- Tests: 사전 매칭·서브도메인·미등록 도메인 → other.
- Acceptance: [ ] 사전 파일 단위 테스트 [ ] 기존 `owned` 불리언 유지(파생)
- Rollback: kind 필드 무시.

## T2. 경쟁사 SOV (S~M)
- Data model: `Site.competitors: String[]`(마이그레이션). `GeoTarget.competitors` 전달.
- geo-core: 답변 텍스트에서 경쟁사 실명 카운트(정규화: 공백·"의원/피부과/클리닉" 접미 제거, 소문자). `competitorMentions: {name, count, questions[]}[]`, `sov = 자사 / (자사 + Σ경쟁)`. 브랜드 별칭 배열도 같은 정규화기로(#3 약점 동시 해소).
- API: `PATCH /sites/:id` 로 competitors 편집(Zod, 최대 20).
- Tests: 접미 변형·부분 일치 오탐(“고운몸” vs “고운몸의원”)·0건.
- Acceptance: [ ] 마이그레이션+seed [ ] 대시보드에 SOV 막대 1개
- Risk: 경쟁사 실명은 **내부 분석 한정**(외부 노출 시 비교광고 게이트 — 리포트 T6 에서 "내부용" 워터마크).
- Rollback: 컬럼 nullable, 미설정이면 기존 동작.

## T3. 주간 재측정 + 추세 (M)
- Worker: `apps/worker/src/batch-geo.ts` + `.github/workflows/batch-geo.yml`(cron 주 1회, KST 월 04:00). Redis 상시 가동 의존을 피하려 **BullMQ repeat 대신 Actions cron** — batch-crawl 과 같은 방식. 사이트별 `geoMonitorEnabled` 플래그.
- Data model: `GeoVisibilityReport` 에 `runSeq`(사이트별 증가), `previousReportId`. 신규 `packages/db/src/geo-visibility.ts` 에 `getTrend(siteId, n)` — mentionRate·citationRate·sov 의 run 간 delta.
- API: `GET /sites/:id/geo-visibility-trend?runs=12`.
- Tests: 3 run 픽스처로 delta 부호·결측 run 처리; 멱등(같은 주 2회 실행 시 1건).
- Acceptance: [ ] cron 워크플로 dry-run 로그 [ ] 대시보드 스파크라인 1개 [ ] T0 의 liveShare 가 run 별로 남음
- Risk: 라이브 키 비용 — 사이트당 질문 10 × 엔진 4 × 주 1회 상한을 config 로.
- Rollback: cron 워크플로 비활성, 컬럼은 nullable.

## T4. 컴플라이언스 9항목화 + 조항 필드 (M)
정본은 `medical-ad-guard` 9항목(§56②·§57·§27③·§53). 현재 7룰과 대응:
| 9항목 | 현재 룰 | 조치 |
|---|---|---|
| 1 보장성·최상급 | GUARANTEED_RESULT_CLAIM·ABSOLUTE_SAFETY_CLAIM·SUPERLATIVE_CLAIM | 유지, `legalClause: "의료법 §56②"` |
| 2 치료 경험담 | PATIENT_TESTIMONIAL_REFERENCE | 유지 |
| 3 전후 사진 | BEFORE_AFTER_REFERENCE | 유지, "부작용 표기 동반 여부" 조건 추가 |
| 4 비교·비방 | 없음 | **신규** COMPARATIVE_OR_DEFAMATORY_CLAIM(§56② 4·5호) |
| 5 환자 유인·알선 | PRICE_DISCOUNT_PROMOTION | 유지, 조항 §27③ 로 정정 |
| 6 근거 없는 단정·신의료기술 | 없음 | **신규** UNSUBSTANTIATED_OR_NEW_TECH_CLAIM(§56②·§53) |
| 7 부작용 정보 누락 | 없음 | **신규** SIDE_EFFECT_DISCLOSURE_MISSING(§56② 7호) — 페이지 단위, 시술 키워드 있는데 면책 문구 없음 |
| 8 사전심의 | UNREVIEWED_MEDICAL_PUBLISH | 유지, `priorReviewRequired: true` |
| 9 기사형 광고 | 없음 | **신규** ADVERTORIAL_FORMAT(§56②) — 보도/전문가 의견 형식 패턴 |
- Data model: `ComplianceFlag` 에 `legalClause`, `checklistItem(1~9)`, `priorReviewRequired` 컬럼(마이그레이션).
- Tests: 항목별 KR 픽스처 양·음성 각 2건 이상. "9항목 중 미확인이 하나라도 있으면 safe 판정 불가" 룰을 리포트 레벨 테스트로.
- Acceptance: [ ] 9항목 전부 룰 매핑 [ ] 판정은 `flag` 까지 — **승인/반려는 사람**(draft-only 원칙) [ ] `docs/COMPLIANCE_SPEC.md` 갱신
- Risk: 정규식 오탐 → recommendation 에 "검토 필요" 톤 유지, 자동 차단 없음.
- Rollback: 신규 룰 4종은 rule pack 토글.

## T5. 검색량 커넥터 — 네이버 검색광고 (M, 외부 키)
- connectors: `naver-searchad` provider(HMAC-SHA256 서명, `CUSTOMER_ID/ACCESS_LICENSE/SECRET_KEY` 는 provider credential resolver 경유). fixture 기본, 라이브는 `liveExternalApis` 게이트.
- Data model: `Keyword.monthlyVolumePc/Mobile`, `volumeFetchedAt`.
- 규칙: 진단서에는 **월 100회 이상만** 근거 키워드. 미만은 `tier: "exploratory"`.
- Tests: 서명 생성 벡터, fixture 파싱, 100회 하한 분류.
- Acceptance: [ ] 키 없이 전체 테스트 통과 [ ] 라이브 1회 수동 검증 로그
- Rollback: 컬럼 nullable.

## T6. 리포트 패키지 — 진단서·제안서 HTML (M)
- 신규 `packages/reports`(의존: types·geo-core·aeo-core·seo-core·compliance 결과 **JSON 만** 입력, DB 직접 접근 금지 — 의존 규칙 준수).
- 템플릿 2종: `diagnosis.html`(프레임워크 §2 A~J 순서), `proposal.html`(§3 1~11). 각 절에 `data-source` 속성으로 리포트 id·run·liveShare 표기. 경쟁사 실명 절은 `data-audience="internal"`.
- API: `GET /sites/:id/reports/diagnosis?run=` → HTML. PDF 는 범위 밖(필요 시 playwright 별도 태스크).
- Tests: 스냅샷 테스트(픽스처 → HTML), liveShare<1 경고 박스 렌더, 목표 수치 칸이 **비어 있으면 빌드 실패**(타업체 약점 방지).
- Acceptance: [ ] UTF-8 charset·standalone [ ] 한글 줄바꿈 `keep-all`·`text-wrap: pretty`
- Rollback: 패키지 미배선.

## T7. 텔레그램 제품 알림 + 주간 요약 (S)
- `OperationalAlertRouter` 에 telegram 어댑터(BOT_TOKEN/CHAT_ID env, 기존 웹훅 어댑터와 같은 인터페이스). T3 batch-geo 끝에 사이트별 요약 1통(멘션률·SOV·delta·liveShare).
- Tests: 어댑터 페이로드 포맷, 토큰 없으면 no-op.
- Acceptance: [ ] 운영 알림과 제품 알림 채널 분리 설정
- Rollback: env 제거.

## T8. analyze/generate/recheck 워커 배선 (M)
- `apps/worker/src/runtime.ts` 에 3 워커. 프로세서는 API 경로에 있는 구현을 `packages/workorders` 로 끌어올려 공유(중복 제거). recheck 는 crawl 재실행 → 룰 재평가 → WorkOrder 상태 전이 → `ClosedLoopAuditEvent`.
- Tests: 잡 멱등(같은 workOrderId 재투입), 타임아웃, dead-letter 이동.
- Acceptance: [ ] `POST /work-orders/:id/recheck` 가 큐 경유로 동작 [ ] API 동기 경로 제거
- Rollback: 워커 미기동 시 API 동기 경로 유지(플래그).

## T9. (보류) 네이버 AI브리핑 수집 (L)
공식 API 없음. 선택지: ① 헤드리스 브라우저 수집(약관·차단 리스크) ② 사람이 캡처한 답변을 업로드하는 `manual-capture` provider(T0 의 sourceMode="manual"). **②를 먼저** — 진단서에 네이버를 넣을 수 있고 리스크 0. ①은 별도 결정.

---

## Acceptance Criteria (전체)
- [ ] T0~T4 머지 후, 고운몸의원 서초 1개 사이트로 **주간 run 2회** 실측 → 추세·SOV·9항목 플래그가 대시보드에 보인다
- [ ] T6 으로 진단서 HTML 1부 생성, `liveShare` 와 `sourceMode` 가 표기된다
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 전부 통과, 신규 룰마다 테스트
- [ ] 결정적 판정 계약 유지 — 어느 태스크도 `packages/ai-core` 를 seo/aeo/geo/compliance 의 의존으로 만들지 않는다

## Risks
- 라이브 엔진 호출 비용·차단: 주 1회·질문 10·엔진 4 상한, fixture 기본.
- 경쟁사 실명 외부 노출 = 비교광고 리스크: 리포트에서 internal 절 분리, 외부용 빌드는 해당 절 제거.
- 컴플라이언스 정규식 오탐: 자동 차단 없음, 사람 판정.
- 네이버 검색광고 API 키·약관: 키는 사용자가 발급·주입, 코드에 없음.

## Rollback Plan
태스크별 위 항목. 공통: 마이그레이션은 nullable 컬럼만 추가하므로 코드 롤백만으로 복구.

## Implementation Steps
1. T0 → 2. T1 → 3. T2 → 4. T3 → 5. T4 → 6. T7 → 7. T6 → 8. T5 → 9. T8 → (결정 후) T9
각 단계: 브랜치 `feat/geo-gap-tN` → 테스트 → PR(변경·검증방법·알려진 한계) → `progress.md` 한 줄.
