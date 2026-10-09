# AEO 질문↔페이지 적합성 — 설계 스펙

> 작성 2026-10-09 · 선행 PR #134(F절 페이지 매칭) 머지 후 (`main` 8618ade)
> 규칙: 이 저장소 AGENTS.md — 결정적 판정 우선(LLM 은 설명·초안만), 의료 콘텐츠 draft-only,
> 마이그레이션·테스트·Zod 동반. 한 태스크 = 한 PR.

## Goal

진단서 F 절(AEO 준비도)이 **"이 페이지가 이 질문에 답하는가"를 실제로 측정**하게 하고,
답하는 페이지가 없는 질문(= 콘텐츠 공백)을 **워크오더로 내보낸다.**

## 왜 (근인)

PR #134 로 질문마다 페이지를 고르게 됐지만, 점수는 여전히 페이지 속성만 말한다. AEO 7룰 중
6룰이 `candidatePage` 만 보는 순수 함수이고, 유일한 키워드 의존 룰
`KEYWORD_INTENT_DEFINED`(`packages/aeo-core/src/index.ts:174-190`)는 intent 를 스스로 계산한 뒤
non-null 이라 단정해 **항상 `pass`·100** 이다 — 7체크 단순평균(`:717`)에 약 14점을 공짜로 얹는다.

그래서 F 절은 커버리지를 측정하지 못한다. 사이트에 해당 콘텐츠가 아예 없는 질문과
콘텐츠가 있는 질문이 같은 점수를 받는다. 진단서가 없는 커버리지를 있는 것처럼 말한다.

## Scope

Included: `packages/aeo-core` · `packages/types` · `packages/db`(마이그레이션 1건) ·
`packages/workorders`(다섯 번째 소스) · `packages/reports`(F 절) · `apps/worker`(정규화기 공유).

Excluded:
- 과거 리포트 점수 백필 — 과거 행에 `candidatePage` 스냅샷이 없어 **원리적으로 재계산 불가**.
- `intent` 정합 2축 판정 — 오분류가 점수로 직결되고 테스트 면적이 크다. 운영에서 한 번 돌아본 뒤 올릴 경로.
- ContentBrief 자동 생성 — 공백 워크오더까지가 이 태스크다. 브리프는 사람이 워크오더를 받아 착수한다.
- 대시보드(`apps/web`) 신규 화면 — 기존 `keyword-aeo-dashboard.ts` 가 `checks` 를 그대로 읽으므로 코드 변경 없음.

## 확정된 결정 (2026-10-09 합의)

| # | 결정 | 근거 |
|---|---|---|
| 1 | 성공 기준은 **공백이 워크오더로 나가는 것**까지 | 숫자 정직성만으로는 병원이 무엇을 할지 모른다 |
| 2 | 적합성은 **점수 안**에 넣는다 — `KEYWORD_INTENT_DEFINED` 자리를 교체 | 점수가 "이 질문에 답할 준비가 됐나"를 진짜 부담해야 한다 |
| 3 | 공백 워크오더는 **질문들을 묶어 1건** | 콘텐츠 1건이 여러 질문을 동시에 답하는 실제 작업 단위 |
| 4 | 판정은 **헤딩·답변블록 우선 3단**(A안 1) | 기존 7룰 전부가 쓰는 100/60/0 모양과 동일 |
| 5 | `matched` 컬럼은 **만들지 않는다** | 룰 결과가 폴백 플래그보다 정확하다 — 아래 §B |

## Proposed Design

### A. 새 룰 `PAGE_ANSWERS_QUESTION`

`packages/aeo-core/src/index.ts` 에 `pageAnswersQuestionRule` 을 추가하고
`defaultAeoReadinessRules` 의 첫 자리(`keywordIntentDefinedRule`)를 **교체**한다. 룰 개수는 7 유지.

판정 — `normalizeKeywordPhrase` 가 공백 정리·소문자화만 하고 **구두점을 떼지 않으므로**
등식 비교를 쓸 수 없다(키워드 `"보톡스 가격"` ≠ 헤딩 `"보톡스 가격은 얼마인가요?"`).
**토큰 포함**으로 판정한다:

| 상태 | 점수 | 조건 |
|---|---|---|
| `pass` | 100 | `questionHeadings` 또는 `answerBlocks[].question` 중 **한 항목이 키워드의 모든 토큰을 포함** |
| `warning` | 60 | 키워드의 **모든 토큰**이 `title` + `h1` + `h2` 합본에 존재(주제는 다루나 질문 형태로는 없음) |
| `fail` | 0 | 그 미만. `candidatePage === null` 도 `fail`(기존 6룰과 같은 처리) |

`evidence`:
- `expectedValue`: `"Question-form heading or answer block covering the keyword"`
- `observedValue`: `pass`·`warning` 은 매칭된 헤딩/합본 문자열, `fail` 은 `page.questionHeadings`(빈 배열 가능)
- `sourceField`: `pass` → `"questionHeadings,answerBlocks"`, `warning` → `"title,h1,h2"`, `fail` → `"questionHeadings"`
- `url`: `page?.url ?? null`

**알려진 한계 (⚠️ 검증필요)**: 워커의 `toAeoPageSignal`(`apps/worker/src/processor.ts`)은
`answerBlocks: []` 로 고정한다. 따라서 **워커 경로에서 `pass` 는 질문형 헤딩이 있을 때만 난다.**
`answerBlocks` 를 채우는 추출기는 이 태스크 범위 밖이고, 그때까지 `pass` 는 과소평가된다.
이 사실을 룰 doc 주석과 F 절 각주에 적는다.

### B. `matched` 컬럼을 만들지 않는 이유

PR #134 의 `selectAeoCandidateSnapshot` 은 `matched:false` 로 폴백을 알리지만 저장하지 않는다.
이 룰이 그것을 흡수한다 — `PAGE_ANSWERS_QUESTION` 이 `fail` 이면 그 자체가
"이 페이지는 이 질문에 답하지 않는다"이고, 폴백 플래그보다 **정확하다**:
워커가 폴백했는데 대표 페이지가 우연히 그 질문에 답하는 경우 `matched:false` 는 거짓이지만
룰은 `pass` 로 참을 말한다. 따라서 스키마 변경은 §D 하나만 남는다.

### C. 정규화기 정본 하나

워커의 `selectAeoCandidateSnapshot` 과 새 룰이 같은 토큰화를 중복 구현하게 된다.
`packages/aeo-core` 에 토큰화를 올려 **둘이 같은 함수**를 쓴다:

```ts
// packages/aeo-core/src/index.ts
export function tokenizeKeywordPhrase(phrase: string): readonly string[]
// normalizeKeywordPhrase 후 공백 분할, 중복 제거, **1글자 토큰 제외**
// (1글자는 부분일치 오탐이 심하다 — "시" 가 "시술"·"시간"에 전부 걸린다. Risks 4)
// 모든 토큰이 1글자라 결과가 비면 호출자가 "판정 불가"로 다룬다(룰은 fail, 워커는 폴백).

export function haystackCoversAllTokens(haystack: string, tokens: readonly string[]): boolean
// tokens.length > 0 && 모든 토큰이 haystack(소문자)에 부분일치
```

역할 분리: **워커는 페이지 선택, aeo-core 는 판정**, 정규화기는 하나.
`apps/worker/src/processor.ts` 는 자체 토큰화를 지우고 `tokenizeKeywordPhrase` 를 쓴다
(`aeoMatchHaystack` 의 제목·헤딩·URL 경로 구성은 워커에 남는다 — 그건 선택 전략이다).

사본을 두지 않는 이유는 CLAUDE.md 절대원칙 — 사본은 반드시 어긋난다.

### D. 룰 버전

점수의 의미가 바뀌므로 과거 행과 섞여 비교되면 안 된다.

- `packages/aeo-core`: `export const aeoReadinessRulesVersion = "2" as const;`
- `packages/types`: `AeoReadinessReportSchema` · `AeoReadinessReportRecordSchema` 에
  `rulesVersion: z.string().min(1).nullable().default(null)` 추가.
- `packages/db`: 마이그레이션 `20261009000000_aeo_rules_version`
  ```sql
  -- 적합성 룰(PAGE_ANSWERS_QUESTION) 도입으로 점수의 의미가 바뀐다. 과거 행은 NULL = 버전 1 이고
  -- candidatePage 스냅샷이 없어 재계산이 불가능하므로 백필하지 않는다. 섞인 비교는 리포트가 막는다.
  ALTER TABLE "AeoReadinessReport" ADD COLUMN "rulesVersion" TEXT;
  ```
- `evaluateAeoReadiness` 가 결과에 `rulesVersion: aeoReadinessRulesVersion` 을 담고,
  `persistAeoReadinessReports`(`packages/db/src/crawl.ts`)가 컬럼에 쓴다.

### E. 워크오더 — 다섯 번째 소스

`packages/workorders/src/index.ts`:
- `workOrderInputSources` 에 `aeoCorePackage` 추가 (현재 seo·compliance·schema·geo 4개).
- `createWorkOrderFromAeoContentGap(input): WorkOrderDraft` — 공백 질문 묶음 1건.
- `createWorkOrdersFromAeoReadinessReports(reports, siteUrl): readonly WorkOrderDraft[]` —
  `PAGE_ANSWERS_QUESTION` 이 **`fail`** 인 리포트만 모아 **0건 또는 1건**을 돌려준다.

`warning`(주제는 다루나 질문 형태가 없음)은 공백이 아니다 — 기존 FAQ 스키마·헤딩 구조
워크오더 영역이라 **제외**한다. 트리거를 `fail` 로 좁히는 이유다.

`WorkOrderDraft` 매핑(기존 `createWorkOrderFromComplianceFlag` 패턴):

| 필드 | 값 |
|---|---|
| `title` | `"콘텐츠 공백: 답변 없는 질문 N개"` |
| `problem` | 공백 질문 목록과, 그 질문들이 어느 페이지로 평가됐는지 |
| `evidence.url` | 실패 리포트 중 첫 번째의 `pageUrl`. 전부 `null` 이면 인자로 받은 `siteUrl` (`SeoIssueEvidenceSchema.url` 은 non-null) |
| `evidence.observedValue` | 공백 질문 배열 |
| `evidence.expectedValue` | `"질문형 헤딩 또는 답변 블록으로 각 질문에 답하는 페이지"` |
| `evidence.sourceField` | `"aeoReadinessReport.checks.PAGE_ANSWERS_QUESTION"` |
| `instructions` | 질문별 `createSuggestedAnswerAngle(question)`(기존 함수) + draft-only 고지 |
| `ownerType` | `"content"` |
| `priority` | 공백 질문 수로 결정적으로: 5건 이상 `p1`, 그 미만 `p2`. `p0` 는 쓰지 않는다 — 콘텐츠 공백은 법규 위반이 아니다 |
| `acceptanceCriteria` | 각 질문이 질문형 헤딩/답변 블록으로 덮이고, 재크롤 후 `PAGE_ANSWERS_QUESTION` 이 `fail` 을 벗어난다 |
| `verificationMethod` | 재크롤 후 해당 질문들의 AEO 리포트에서 `PAGE_ANSWERS_QUESTION` 상태 확인 |
| `estimatedEffort` | 5건 이상 `l`, 3건 이상 `m`, 그 미만 `s` |
| `relatedIssues` | `[]` (SeoIssue 룰이 아니다) |

의료 콘텐츠는 draft-only 다 — 워크오더는 "만들어라"는 지시이고 자동 게재는 없다.

### F. F 절 렌더 (`packages/reports`)

1. 버전 혼재 경고: 입력 리포트의 `rulesVersion` 이 2종 이상이면 경고 문구를 띄우고
   **점수를 비교하지 않는다**("룰 버전이 섞여 있어 점수를 서로 비교할 수 없습니다 ⚠️ 검증필요").
2. 각주 교체: PR #134 가 넣은 `"이 페이지가 이 질문에 답하는가는 아직 측정하지 않습니다"` 와
   폴백 구분 불가 문구를 **삭제**한다 — 이제 측정한다.
3. `PAGE_ANSWERS_QUESTION` 이 `fail` 인 행은 **콘텐츠 공백**으로 표기하고, 워크오더가 생성됨을 적는다.

### G. 점수 영향 (실측 46점 기준)

| 적합성 | 새 점수 | 상태 |
|---|---|---|
| `pass` | 46 (변화 없음) | `needs_work` |
| `warning` | 40 | `needs_work` |
| `fail` | 31 | `needs_work` → **`not_ready`** |

`getAeoReadinessStatus` 의 50점 경계 때문에 공백 질문은 `not_ready` 로 떨어진다.
정직한 결과지만 대시보드가 빨갛게 변하므로 §F-1 의 버전 경고가 "갑자기 나빠졌다"는 오독을 막는다.
**임계값(80/50)은 바꾸지 않는다** — 점수가 떨어진 것을 임계값으로 가리면 측정의 의미가 없다.

## Acceptance Criteria

- [ ] `defaultAeoReadinessRules` 가 7개이고 `KEYWORD_INTENT_DEFINED` 가 없다
- [ ] `AeoReadinessCheckIdSchema` 에 `PAGE_ANSWERS_QUESTION` 추가. `KEYWORD_INTENT_DEFINED` 제거는
      **Risks 1 선검증 결과에 따른다** — 과거 `checks` JSON 이 파싱되면 제거, 아니면 읽기 전용으로 남긴다
- [ ] 마이그레이션은 nullable 컬럼 1개 추가뿐, `migration-gate` CI 통과
- [ ] 워커·aeo-core 가 같은 `tokenizeKeywordPhrase` 를 쓴다(토큰화 사본 0개)
- [ ] 공백 질문 0건이면 워크오더 0건, 1건 이상이면 **정확히 1건**
- [ ] `warning` 리포트만 있으면 워크오더 0건
- [ ] F 절이 버전 혼재 시 비교를 거부한다
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 통과, 신규 로직마다 테스트
- [ ] `packages/ai-core` 가 aeo 의 의존이 되지 않는다(결정적 판정 계약)

## Tests

| 패키지 | 테스트 |
|---|---|
| `aeo-core` | `pass`/`warning`/`fail` 각 2건 이상 · 한글 질문 토큰 포함 · 토큰 순서 뒤바뀜(`"가격 보톡스"`)도 매칭 · `candidatePage === null` → `fail` · `answerBlocks` 로 `pass` · 기존 6룰 회귀 · `tokenizeKeywordPhrase` 빈 입력 |
| `types` | 열거형 변경 후 과거 `checks` JSON(`KEYWORD_INTENT_DEFINED` 포함)이 파싱되는지 — §Risks 1 참조 |
| `db` | `rulesVersion` 저장·조회, 과거 행 `null` |
| `workorders` | 공백 묶음 1건 · `warning` 제외 · 0건이면 미생성 · `pageUrl` 전부 `null` 이면 `siteUrl` 사용 · 우선순위·공수 경계(3·5건) |
| `reports` | 버전 혼재 경고 · `fail` 행 공백 표기 · PR #134 가 넣은 폐기 문구가 사라졌는지 |
| `worker` | 토큰화 정본 공유 후 페이지 선택 결과가 PR #134 테스트와 동일 |

## Risks

1. **⚠️ 가장 큰 것 — 과거 `checks` JSON 파싱.** `AeoReadinessCheckIdSchema` 에서
   `KEYWORD_INTENT_DEFINED` 를 지우면 **저장된 과거 행의 `checks` 가 Zod 파싱에 실패**해
   `listAeoReadinessReports` 가 던질 수 있다. 구현 1단계에서 이것부터 확인하고,
   실패하면 열거형에 `KEYWORD_INTENT_DEFINED` 를 **읽기 전용으로 남긴다**(룰 배열에서만 제거).
   가정이 무너지는 조건: 과거 행이 파싱되지 않으면 열거형 제거는 포기한다.
2. 점수 하락이 "제품이 나빠졌다"로 읽힌다 → §F-1 버전 경고로 막는다.
3. `answerBlocks` 가 비어 `pass` 가 과소평가된다 → 룰 주석·F 절에 명시(⚠️ 검증필요).
4. 토큰 포함 판정은 짧은 토큰에서 오탐한다(`"시"` 가 `"시술"` 에 걸린다) → 모든 토큰을 요구하므로
   단일 짧은 토큰 키워드만 위험하다. 1글자 토큰은 매칭에서 제외한다.
5. 워크오더가 매 크롤런마다 재생성될 수 있다 → 기존 dedupe 키는 `(url, ruleId)`
   (`packages/db/src/crawl.ts:868`)이고 워크오더 경로의 멱등성은 구현 시 확인한다.

## Rollback Plan

- `defaultAeoReadinessRules` 에서 교체를 되돌린다(1줄). 점수가 즉시 과거 정의로 복귀.
- `rulesVersion` 컬럼은 nullable 이므로 무시하면 끝. 마이그레이션 되돌림 불필요.
- 워크오더 소스는 `createWorkOrdersFromAeoReadinessReports` 호출부만 제거.
- F 절 문구는 코드 롤백으로 복귀.

## Implementation Steps

1. **Risks 1 선검증** — 과거 `checks` JSON 이 열거형 변경 후 파싱되는지 확인. 결과에 따라 2단계 범위 확정.
2. `aeo-core`: `tokenizeKeywordPhrase` · `haystackCoversAllTokens` · `pageAnswersQuestionRule` · `aeoReadinessRulesVersion` + 테스트.
3. `types`: 열거형·스키마 변경 + 테스트.
4. `db`: 마이그레이션 + `persistAeoReadinessReports` 배선 + 테스트.
5. `worker`: 토큰화 사본 제거(정본 공유) + 기존 테스트 유지 확인.
6. `workorders`: 다섯 번째 소스 + 테스트. **멱등성 확인**(Risks 5) — 같은 공백이 매 크롤런마다
   워크오더를 새로 만들지 않는지 호출부에서 확인하고, 중복되면 기존 dedupe 경로에 맞춰 키를 정한다.
7. `reports`: F 절 버전 경고·공백 표기·폐기 문구 제거 + 테스트.
8. 전체 게이트 → PR.
