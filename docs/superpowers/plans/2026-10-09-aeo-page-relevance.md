# AEO 질문↔페이지 적합성 (F절 ③겹) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진단서 F 절이 "이 페이지가 이 질문에 답하는가"를 결정적으로 측정하고, 답하는 페이지가 없는 질문을 워크오더 1건으로 내보낸다.

**Architecture:** `aeo-core` 의 동어반복 룰 `KEYWORD_INTENT_DEFINED` 를 새 룰 `PAGE_ANSWERS_QUESTION` 으로 교체해 7룰 평균 점수가 적합성을 부담하게 한다. 토큰화 정본을 `aeo-core` 에 두고 워커의 페이지 선택과 룰 판정이 같은 함수를 쓴다. 점수 의미가 바뀌므로 `rulesVersion` 을 리포트에 남겨 과거 행과 섞인 비교를 리포트가 거부한다. 공백은 `workorders` 의 다섯 번째 소스가 된다.

**Tech Stack:** TypeScript · pnpm + Turborepo · Zod · Prisma(PostgreSQL) · Vitest

**Spec:** `docs/superpowers/specs/2026-10-09-aeo-page-relevance-design.md`

## Global Constraints

- 결정적 판정 우선 — `packages/ai-core` 를 seo/aeo/geo/compliance 의 의존으로 만들지 않는다. LLM 은 판정에 쓰지 않는다.
- 의료 콘텐츠는 draft-only — 워크오더는 지시이고 자동 게재는 없다.
- 룰 개수는 **7개 유지**. `calculateAeoReadinessScore` 는 단순평균이므로 룰을 추가하면 분모가 바뀐다.
- 임계값 `getAeoReadinessStatus`(≥80 `ready`, ≥50 `needs_work`)는 **바꾸지 않는다**.
- 마이그레이션은 **nullable 컬럼 추가만**. 백필 없음(과거 행에 `candidatePage` 스냅샷이 없어 재계산 불가).
- 룰 버전 상수값: `aeoReadinessRulesVersion = "2"`. 과거 행의 `rulesVersion` 은 `null` = 버전 1.
- 모든 명령은 `pnpm`(이 머신에서 `~/Library/pnpm/bin/pnpm`, 9.15.9, `package.json` 핀과 일치).
- 패키지 경계를 넘는 새 export 를 추가했으면 `pnpm build` 를 먼저 돌려야 `apps/worker` 테스트에서 보인다(dist 참조).
- 한 태스크 = 한 커밋. PR 은 Task 8 에서 한 번.

## Review Focus

스펙이 함축하지만 어느 태스크의 테스트도 건드리지 않는 입력들. 각 줄의 테스트를 해당 코드를 가진 태스크에 넣었다.

1. **`rulesVersion` 이 전부 `null` 인 사이트** — "혼재"만 검사하면 구버전 전용 사이트는 경고 없이 구 점수를 새 기준처럼 보여준다. → Task 7 Step 1
2. **공백 질문이 수십 건** — `instructions`·`acceptanceCriteria` 가 수십 줄이 되어 사람이 못 읽는다. 상한과 "나머지 N건" 표기가 필요하다. → Task 6 Step 1
3. **같은 공백이 매 크롤런 반복** — 워크오더가 중복 생성된다. → Task 6 Step 1
4. **키워드 토큰이 전부 1글자**(`"코 턱"`) — 토큰화 결과가 비어 영구 `fail` 이 되고, 고칠 방법이 없는 공백 워크오더가 매번 나온다. 워크오더에서 제외해야 한다. → Task 6 Step 1
5. **`questionHeadings` 에 기호·1글자만인 항목** — `pass` 오탐은 아니지만 `evidence.observedValue` 에 쓰레기가 찍힌다. → Task 3 Step 1

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `packages/types/src/index.ts` | 열거형·스키마 계약 | 수정 — `PAGE_ANSWERS_QUESTION` 추가, `rulesVersion` 필드 |
| `packages/types/src/index.test.ts` | 계약 회귀 | 수정 |
| `packages/aeo-core/src/index.ts` | 결정적 AEO 룰·토큰화 정본 | 수정 — 토큰화 2함수, 새 룰, 버전 상수, 룰 배열 교체 |
| `packages/aeo-core/src/index.test.ts` | 룰 단위 테스트 | 수정 |
| `packages/db/prisma/schema.prisma` | DB 스키마 | 수정 — `rulesVersion String?` |
| `packages/db/prisma/migrations/20261009000000_aeo_rules_version/migration.sql` | 마이그레이션 | **생성** |
| `packages/db/src/crawl.ts` | 크롤 산출물 저장 | 수정 — `rulesVersion` 저장 |
| `apps/api/src/prisma-repository.ts` | DB → 레코드 매핑 | 수정 — `rulesVersion` 읽기 |
| `apps/api/src/repository.ts` | 인메모리 레포(테스트용) | 수정 — `rulesVersion` 보존 |
| `apps/worker/src/processor.ts` | 페이지 선택 | 수정 — 토큰화 사본 제거 |
| `packages/workorders/src/index.ts` | 워크오더 생성 | 수정 — 다섯 번째 소스 |
| `packages/workorders/src/index.test.ts` | 워크오더 테스트 | 수정 |
| `packages/reports/src/index.ts` | 진단서·제안서 렌더 | 수정 — F 절 |
| `packages/reports/src/index.test.ts` | 렌더 테스트 | 수정 |

---

### Task 1: 계약 — 열거형·`rulesVersion`, 과거 `checks` 하위호환

저장된 과거 행의 `checks` JSON 에는 `KEYWORD_INTENT_DEFINED` 가 들어 있고, `toAeoReadinessReportRecord`(`apps/api/src/prisma-repository.ts:1824`)가 그 JSON 을 `AeoReadinessReportRecordSchema` 로 파싱한다. 열거형에서 값을 **지우면 모든 과거 행의 조회가 던진다.** 그래서 값을 남기고(읽기 전용) 새 값을 추가한다 — 스펙 Risks 1 의 확정 결론이다.

**Files:**
- Modify: `packages/types/src/index.ts:996-1004` (`AeoReadinessCheckIdSchema`), `:1040-1050` (`AeoReadinessReportSchema`), `:1052-1068` (`AeoReadinessReportRecordSchema`)
- Test: `packages/types/src/index.test.ts`

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces: `AeoReadinessCheckIdSchema` 에 `"PAGE_ANSWERS_QUESTION"` 포함. `AeoReadinessReportSchema` · `AeoReadinessReportRecordSchema` 에 `rulesVersion: string | null`(입력 생략 시 `null`).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/types/src/index.test.ts` 끝에 추가:

```ts
describe("AEO 룰 버전·열거형 하위호환", () => {
  const legacyChecks = [
    {
      checkId: "KEYWORD_INTENT_DEFINED",
      status: "pass",
      score: 100,
      evidence: {
        url: "https://example-clinic.com/faq",
        observedValue: "commercial",
        expectedValue: "Non-null deterministic keyword intent",
        sourceField: "keyword.intent"
      }
    }
  ];

  // 저장된 과거 행은 이 checkId 를 담고 있다. 열거형에서 지우면 모든 과거 행의 조회가 던진다.
  it("과거 checks JSON(KEYWORD_INTENT_DEFINED)이 계속 파싱된다", () => {
    const record = AeoReadinessReportRecordSchema.parse({
      id: "aeo_1",
      siteId: "site_1",
      keywordId: null,
      phrase: "보톡스 가격",
      locale: "ko-KR",
      intent: null,
      pageUrl: "https://example-clinic.com/faq",
      status: "needs_work",
      score: 46,
      checks: legacyChecks,
      generatedBy: "deterministic",
      evaluatedAt: "2026-09-20T00:00:00.000Z",
      createdAt: "2026-09-20T00:00:00.000Z"
    });

    // rulesVersion 을 안 넘기면 null = 버전 1 이다. 백필하지 않는다.
    expect(record.rulesVersion).toBeNull();
    expect(record.checks[0]?.checkId).toBe("KEYWORD_INTENT_DEFINED");
  });

  it("새 체크 아이디와 룰 버전을 받는다", () => {
    const report = AeoReadinessReportSchema.parse({
      keyword: {
        siteId: "site_1",
        phrase: "보톡스 가격",
        locale: "ko-KR",
        language: "ko",
        country: "KR",
        intent: null,
        source: "manual"
      },
      pageUrl: "https://example-clinic.com/botox",
      status: "not_ready",
      score: 31,
      checks: [
        {
          checkId: "PAGE_ANSWERS_QUESTION",
          status: "fail",
          score: 0,
          evidence: {
            url: "https://example-clinic.com/botox",
            observedValue: [],
            expectedValue: "Question-form heading or answer block covering the keyword",
            sourceField: "questionHeadings"
          }
        }
      ],
      generatedBy: "deterministic",
      rulesVersion: "2",
      evaluatedAt: "2026-10-09T00:00:00.000Z"
    });

    expect(report.rulesVersion).toBe("2");
  });
});
```

`AeoReadinessReportRecordSchema` · `AeoReadinessReportSchema` 가 테스트 파일의 import 목록에 없으면 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @searchops/types test`
Expected: FAIL — `PAGE_ANSWERS_QUESTION` 이 열거형에 없어 `invalid_enum_value`, `rulesVersion` 이 스키마에 없어 `undefined`.

- [ ] **Step 3: 최소 구현**

`packages/types/src/index.ts:996`:

```ts
export const AeoReadinessCheckIdSchema = z.enum([
  "PAGE_ANSWERS_QUESTION",
  /**
   * 폐기(룰 버전 1). 룰 배열에서 제거됐지만 열거형에는 남는다 —
   * 저장된 과거 행의 checks JSON 이 이 값을 담고 있어, 지우면 모든 과거 행의 조회가 던진다.
   * 새로 생성되지 않는다. 읽기 전용이다.
   */
  "KEYWORD_INTENT_DEFINED",
  "ANSWER_SUMMARY_PRESENT",
  "QUESTION_COVERAGE",
  "FAQ_SCHEMA_PRESENT",
  "STRUCTURED_HEADINGS",
  "CITABLE_SOURCE_PRESENT",
  "CONTENT_DEPTH",
]);
```

`AeoReadinessReportSchema`(`:1040`)와 `AeoReadinessReportRecordSchema`(`:1052`)에 각각 한 줄 추가 — `checks` 바로 다음, `generatedBy` 앞:

```ts
  /**
   * 점수를 만든 룰 세트의 버전. null 은 버전 1(PAGE_ANSWERS_QUESTION 도입 전)이다.
   * 버전이 다른 리포트의 점수는 서로 비교하지 않는다 — 분자가 다른 분수다.
   */
  rulesVersion: z.string().min(1).nullable().default(null),
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @searchops/types test`
Expected: PASS (98 + 2 = 100 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/types/src/index.ts packages/types/src/index.test.ts
git commit -m "feat(types): AEO 룰 버전 필드 + PAGE_ANSWERS_QUESTION 열거형

KEYWORD_INTENT_DEFINED 는 열거형에 남긴다 — 저장된 과거 checks JSON 이 담고 있어
지우면 모든 과거 행의 조회가 던진다. 룰 배열에서만 빠진다(Task 3)."
```

---

### Task 2: `aeo-core` 토큰화 정본

워커의 `selectAeoCandidateSnapshot` 과 새 룰이 같은 토큰화를 쓴다. 사본을 두지 않는다.

**Files:**
- Modify: `packages/aeo-core/src/index.ts` (`normalizeKeywordPhrase` 정의 직후, `:126` 뒤)
- Test: `packages/aeo-core/src/index.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `rulesVersion`(상수만 쓰고 스키마는 Task 3 에서 쓴다)
- Produces:
  - `tokenizeKeywordPhrase(phrase: string): readonly string[]`
  - `haystackCoversAllTokens(haystack: string, tokens: readonly string[]): boolean`
  - `aeoReadinessRulesVersion: "2"`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/aeo-core/src/index.test.ts` 끝에 추가:

```ts
describe("키워드 토큰화 정본", () => {
  it("공백·기호 경계로 쪼개고 소문자화한다", () => {
    expect(tokenizeKeywordPhrase("보톡스 가격?")).toEqual(["보톡스", "가격"]);
    expect(tokenizeKeywordPhrase("리프팅·보톡스")).toEqual(["리프팅", "보톡스"]);
    expect(tokenizeKeywordPhrase("Botox  PRICE")).toEqual(["botox", "price"]);
  });

  // 1글자 토큰은 부분일치 오탐이 심하다 — "시" 가 "시술"·"시간"에 전부 걸린다.
  it("1글자 토큰을 버리고 중복을 지운다", () => {
    expect(tokenizeKeywordPhrase("코 보톡스 보톡스")).toEqual(["보톡스"]);
    expect(tokenizeKeywordPhrase("코 턱")).toEqual([]);
    expect(tokenizeKeywordPhrase("   ")).toEqual([]);
  });

  it("모든 토큰이 있어야 덮은 것이다 — 토큰 순서는 보지 않는다", () => {
    const tokens = tokenizeKeywordPhrase("보톡스 가격");
    expect(haystackCoversAllTokens("보톡스 가격은 얼마인가요?", tokens)).toBe(true);
    expect(haystackCoversAllTokens("가격 안내 — 보톡스 포함", tokens)).toBe(true);
    expect(haystackCoversAllTokens("보톡스 시술 안내", tokens)).toBe(false);
  });

  it("토큰이 없으면 아무것도 덮지 못한다", () => {
    expect(haystackCoversAllTokens("보톡스 가격", [])).toBe(false);
  });

  it("룰 버전 상수를 노출한다", () => {
    expect(aeoReadinessRulesVersion).toBe("2");
  });
});
```

테스트 파일 import 목록에 `aeoReadinessRulesVersion`, `haystackCoversAllTokens`, `tokenizeKeywordPhrase` 를 알파벳 순서에 맞게 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @searchops/aeo-core test`
Expected: FAIL — `tokenizeKeywordPhrase is not a function` 등 3개 심볼 미정의.

- [ ] **Step 3: 최소 구현**

`packages/aeo-core/src/index.ts`, `normalizeKeywordPhrase` 함수 바로 아래:

```ts
/** 룰 세트 버전. 점수의 의미가 바뀔 때만 올린다. null 로 저장된 과거 행은 버전 1 이다. */
export const aeoReadinessRulesVersion = "2" as const;

/**
 * 키워드 대조 토큰. 정본은 여기 하나다 — 워커의 페이지 선택과 룰 판정이 같은 토큰을 써야
 * "선택은 했는데 판정은 못 하는" 구간이 생기지 않는다(CLAUDE.md: 사본은 반드시 어긋난다).
 *
 * 글자·숫자가 아닌 것을 경계로 쪼갠다. 구두점을 떼지 않으면 "보톡스 가격?" 의 토큰이
 * "가격?" 이 되어 "가격은 얼마인가요" 를 못 덮는다. 1글자 토큰은 버린다 —
 * 부분일치라 "시" 가 "시술"·"시간"에 전부 걸려 판정이 무의미해진다.
 * 결과가 비면 호출자가 "판정 불가"로 다룬다(룰은 fail, 워커는 대표 페이지 폴백).
 */
export function tokenizeKeywordPhrase(phrase: string): readonly string[] {
  return [
    ...new Set(
      normalizeKeywordPhrase(phrase)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length > 1)
    )
  ];
}

/** 모든 토큰이 haystack 에 있어야 덮은 것이다. 토큰 순서는 보지 않는다. */
export function haystackCoversAllTokens(haystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) {
    return false;
  }

  const normalized = normalizeKeywordPhrase(haystack);

  return tokens.every((token) => normalized.includes(token));
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @searchops/aeo-core test`
Expected: PASS (26 + 5 = 31 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/aeo-core/src/index.ts packages/aeo-core/src/index.test.ts
git commit -m "feat(aeo-core): 키워드 토큰화 정본 + 룰 버전 상수

워커의 페이지 선택과 룰 판정이 같은 토큰을 쓰게 한다. 구두점을 경계로 쪼개고
1글자 토큰은 버린다 — 부분일치라 '시' 가 '시술'·'시간'에 전부 걸린다."
```

---

### Task 3: `PAGE_ANSWERS_QUESTION` 룰 + 룰 배열 교체

**Files:**
- Modify: `packages/aeo-core/src/index.ts:174-190` (`keywordIntentDefinedRule` → 새 룰로 교체), `:516-524` (`defaultAeoReadinessRules`), `:536-559` (`evaluateAeoReadiness`)
- Test: `packages/aeo-core/src/index.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `tokenizeKeywordPhrase` · `haystackCoversAllTokens` · `aeoReadinessRulesVersion`. Task 1 의 `rulesVersion` 스키마 필드.
- Produces: `pageAnswersQuestionRule: AeoReadinessRule`. `defaultAeoReadinessRules` 는 7개이고 `KEYWORD_INTENT_DEFINED` 를 포함하지 않는다. `evaluateAeoReadiness` 의 반환에 `rulesVersion: "2"`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/aeo-core/src/index.test.ts` 끝에 추가. `readyPage`·`createInput`·`evaluatedAt` 은 파일 상단의 기존 픽스처다.

```ts
const topicalOnlyPage: AeoPageSignal = {
  url: "https://example-clinic.com/botox",
  title: "보톡스 가격 안내",
  metaDescription: null,
  h1: "보톡스 가격",
  h2: ["진료 시간", "오시는 길"],
  wordCount: 400,
  schemaTypes: [],
  questionHeadings: [],
  answerBlocks: []
};

const unrelatedPage: AeoPageSignal = {
  ...topicalOnlyPage,
  title: "주차 안내",
  h1: "주차 안내",
  h2: ["지하 2층"]
};

function runRule(phrase: string, candidatePage: AeoPageSignal | null) {
  return evaluateAeoReadinessRule(pageAnswersQuestionRule, {
    candidatePage,
    keyword: { ...baseKeyword, phrase }
  });
}

describe("PAGE_ANSWERS_QUESTION — 질문↔페이지 적합성", () => {
  it("질문형 헤딩이 키워드를 덮으면 pass 100", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      questionHeadings: ["보톡스 가격은 얼마인가요?"]
    };
    expect(runRule("보톡스 가격", page)).toMatchObject({
      checkId: "PAGE_ANSWERS_QUESTION",
      score: 100,
      status: "pass",
      evidence: { observedValue: "보톡스 가격은 얼마인가요?", sourceField: "questionHeadings,answerBlocks" }
    });
  });

  it("답변 블록이 덮어도 pass 100", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      answerBlocks: [
        { question: "보톡스 가격이 궁금합니다", answer: "상담 후 안내합니다.", sourceField: "body" }
      ]
    };
    expect(runRule("보톡스 가격", page)).toMatchObject({ score: 100, status: "pass" });
  });

  it("주제만 다루면 warning 60", () => {
    expect(runRule("보톡스 가격", topicalOnlyPage)).toMatchObject({
      score: 60,
      status: "warning",
      evidence: { sourceField: "title,h1,h2" }
    });
    // 제목이 아니라 h2 에만 있어도 주제는 다룬 것이다.
    expect(runRule("진료 시간", topicalOnlyPage)).toMatchObject({ score: 60, status: "warning" });
  });

  it("무관한 페이지는 fail 0", () => {
    expect(runRule("보톡스 가격", unrelatedPage)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { observedValue: [], sourceField: "questionHeadings" }
    });
    expect(runRule("임플란트 비용", unrelatedPage)).toMatchObject({ score: 0, status: "fail" });
  });

  it("후보 페이지가 없으면 fail — 기존 6룰과 같은 처리", () => {
    expect(runRule("보톡스 가격", null)).toMatchObject({
      score: 0,
      status: "fail",
      evidence: { observedValue: null, url: null }
    });
  });

  it("토큰이 전부 1글자면 판정 불가 — fail 로 떨어뜨린다", () => {
    expect(runRule("코 턱", readyPage)).toMatchObject({ score: 0, status: "fail" });
  });

  // Review Focus 5: 기호·1글자만인 헤딩이 observedValue 에 쓰레기로 찍히지 않아야 한다.
  it("기호만인 질문형 헤딩은 매칭 후보에서 빠진다", () => {
    const page: AeoPageSignal = {
      ...topicalOnlyPage,
      questionHeadings: ["???", "보톡스 가격은 얼마인가요?"]
    };
    expect(runRule("보톡스 가격", page).evidence.observedValue).toBe("보톡스 가격은 얼마인가요?");
  });

  it("룰 배열에서 동어반복 룰이 빠지고 7개를 유지한다", () => {
    expect(defaultAeoReadinessRules).toHaveLength(7);
    expect(defaultAeoReadinessRules.map((rule) => rule.id)).toEqual([
      "PAGE_ANSWERS_QUESTION",
      "ANSWER_SUMMARY_PRESENT",
      "QUESTION_COVERAGE",
      "FAQ_SCHEMA_PRESENT",
      "STRUCTURED_HEADINGS",
      "CITABLE_SOURCE_PRESENT",
      "CONTENT_DEPTH"
    ]);
  });

  it("리포트에 룰 버전을 담는다", () => {
    expect(evaluateAeoReadiness(createInput(), { evaluatedAt }).rulesVersion).toBe("2");
  });

  // 공짜 100점이 사라져 점수가 내려간다. 숫자를 고정해 두면 조용한 회귀를 막는다.
  it("적합성 단계에 따라 점수가 갈린다", () => {
    const covered: AeoPageSignal = { ...topicalOnlyPage, questionHeadings: ["보톡스 가격은 얼마인가요?"] };
    const pass = evaluateAeoReadiness({ candidatePage: covered, keyword: { ...baseKeyword, phrase: "보톡스 가격" } }, { evaluatedAt });
    const warning = evaluateAeoReadiness({ candidatePage: topicalOnlyPage, keyword: { ...baseKeyword, phrase: "보톡스 가격" } }, { evaluatedAt });
    const fail = evaluateAeoReadiness({ candidatePage: unrelatedPage, keyword: { ...baseKeyword, phrase: "보톡스 가격" } }, { evaluatedAt });

    expect(pass.score).toBeGreaterThan(warning.score);
    expect(warning.score).toBeGreaterThan(fail.score);
    // 50점 경계를 넘어 not_ready 로 떨어지는 것이 의도된 결과다(임계값은 바꾸지 않는다).
    expect(fail.status).toBe("not_ready");
  });
});
```

import 목록에 `pageAnswersQuestionRule` 을 추가하고, `keywordIntentDefinedRule` import 와 그것을 쓰는 기존 테스트(`:148` "evaluates keyword intent as an independent readiness rule")를 **삭제**한다 — 룰이 더 이상 존재하지 않는다. 기존 `:140` 의 룰 아이디 목록 단언도 새 목록으로 갱신한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @searchops/aeo-core test`
Expected: FAIL — `pageAnswersQuestionRule` 미정의.

- [ ] **Step 3: 최소 구현**

`packages/aeo-core/src/index.ts:174-190` 의 `keywordIntentDefinedRule` 전체를 다음으로 **교체**한다:

```ts
/**
 * 이 페이지가 이 질문에 답하는가. F 절이 커버리지를 말할 수 있게 하는 유일한 룰이다.
 *
 * 앞선 KEYWORD_INTENT_DEFINED 는 intent 를 스스로 계산한 뒤 non-null 이라 단정해 항상
 * pass·100 이었다 — 7룰 단순평균에 약 14점을 공짜로 얹고, 질문과 페이지의 관계는 한 번도
 * 보지 않았다. 그래서 콘텐츠가 아예 없는 질문과 있는 질문이 같은 점수를 받았다.
 *
 * 등식으로 비교하지 않는다 — normalizeKeywordPhrase 는 구두점을 떼지 않아
 * "보톡스 가격" 과 "보톡스 가격은 얼마인가요?" 가 다른 문자열이다. 토큰 포함으로 본다.
 *
 * 알려진 한계(⚠️ 검증필요): 워커의 toAeoPageSignal 은 answerBlocks 를 [] 로 고정하므로
 * 크롤 경로에서 pass 는 질문형 헤딩이 있을 때만 난다. answerBlocks 추출기가 생기면 올라간다.
 */
export const pageAnswersQuestionRule: AeoReadinessRule = {
  id: "PAGE_ANSWERS_QUESTION",
  evaluate(context) {
    const page = context.candidatePage;
    const tokens = tokenizeKeywordPhrase(context.keyword.phrase);
    const expectedValue = "Question-form heading or answer block covering the keyword";

    // 토큰이 비는 경우: 키워드가 1글자 토큰뿐이다. 판정할 근거가 없으므로 fail 로 둔다 —
    // 억지로 pass 를 주면 F 절이 없는 커버리지를 있다고 말한다.
    if (page === null || tokens.length === 0) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: page === null ? null : [],
        score: 0,
        sourceField: "questionHeadings",
        status: "fail",
        url: page?.url ?? null
      });
    }

    const questions = uniqueNonBlankStrings([
      ...page.questionHeadings,
      ...page.answerBlocks.map((block) => block.question)
    ]).filter((question) => tokenizeKeywordPhrase(question).length > 0);

    const covering = questions.find((question) => haystackCoversAllTokens(question, tokens));
    if (covering !== undefined) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: covering,
        score: 100,
        sourceField: "questionHeadings,answerBlocks",
        status: "pass",
        url: page.url
      });
    }

    const topical = [page.title ?? "", page.h1 ?? "", page.h2.join(" ")].join(" ");
    if (haystackCoversAllTokens(topical, tokens)) {
      return createAeoReadinessCheck({
        checkId: "PAGE_ANSWERS_QUESTION",
        expectedValue,
        observedValue: normalizeKeywordPhrase(topical),
        score: 60,
        sourceField: "title,h1,h2",
        status: "warning",
        url: page.url
      });
    }

    return createAeoReadinessCheck({
      checkId: "PAGE_ANSWERS_QUESTION",
      expectedValue,
      observedValue: questions,
      score: 0,
      sourceField: "questionHeadings",
      status: "fail",
      url: page.url
    });
  }
};
```

`defaultAeoReadinessRules`(`:516`)의 첫 항목을 교체:

```ts
export const defaultAeoReadinessRules = [
  pageAnswersQuestionRule,
  answerSummaryPresentRule,
  questionCoverageRule,
  faqSchemaPresentRule,
  structuredHeadingsRule,
  citableSourcePresentRule,
  contentDepthRule
] as const satisfies readonly AeoReadinessRule[];
```

`evaluateAeoReadiness`(`:550`)의 `AeoReadinessReportSchema.parse({...})` 에 한 줄 추가:

```ts
    rulesVersion: aeoReadinessRulesVersion,
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @searchops/aeo-core test`
Expected: PASS. 기존 `generateAeoFaqGapSet`·`createContentBriefDraft` 테스트가 깨지면 그 테스트의 기대 점수를 새 값으로 갱신한다 — 룰이 바뀌어 점수가 내려간 것이 **의도된 결과**다. 기대값을 맞추려고 룰을 바꾸지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add packages/aeo-core/src/index.ts packages/aeo-core/src/index.test.ts
git commit -m "feat(aeo-core): PAGE_ANSWERS_QUESTION 으로 동어반복 룰을 교체

KEYWORD_INTENT_DEFINED 는 intent 를 스스로 계산한 뒤 non-null 이라 단정해 항상 pass·100
이었다 — 질문과 페이지의 관계를 한 번도 보지 않았다. 이제 질문형 헤딩·답변 블록이
키워드를 덮으면 100, 주제만 다루면 60, 아니면 0 이다. 룰 7개 유지, 버전 2."
```

---

### Task 4: `rulesVersion` 저장·조회

**Files:**
- Modify: `packages/db/prisma/schema.prisma:417-439` (`AeoReadinessReport`), `packages/db/src/crawl.ts:703-717` (`create data`)
- Create: `packages/db/prisma/migrations/20261009000000_aeo_rules_version/migration.sql`
- Modify: `apps/api/src/prisma-repository.ts:1824-1838` (`toAeoReadinessReportRecord`), `apps/api/src/repository.ts:866-880` (인메모리 레코드)
- Test: `apps/worker/src/crawl-postprocess.test.ts` — `persistAeoReadinessReports` 는 `packages/db` 에
  직접 테스트가 없고 이 파일의 `createAeoClient` 페이크(`create` 인자를 `aeo.created` 에 모은다)로만
  검증된다. 기존 자리에 단언을 더한다.

**Interfaces:**
- Consumes: Task 1 의 `rulesVersion` 스키마 필드, Task 3 의 `evaluateAeoReadiness` 반환값
- Produces: `AeoReadinessReport.rulesVersion` 컬럼. `persistAeoReadinessReports` 가 저장하고 두 레포지토리가 읽는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/worker/src/crawl-postprocess.test.ts` 의 `describe("크롤 후처리 AEO 준비도", ...)` 안,
기존 테스트 `"geo_query 키워드를 제외하고 나머지만 평가·저장한다"` 의 `toMatchObject` 단언에
`rulesVersion` 을 더하고(한 줄), 그 아래에 전용 테스트를 추가한다:

```ts
  it("룰 버전을 저장한다 — 과거 행과 섞인 비교를 리포트가 막을 수 있게", async () => {
    const aeo = createAeoClient([
      { id: "kw_1", phrase: "리프팅 효과", locale: "ko-KR", intent: null, purpose: "both" }
    ]);

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      aeoReadinessClient: aeo.client
    });

    // 과거 행은 이 컬럼이 NULL 이고 백필하지 않는다 — 새로 쓰는 행만 "2" 다.
    expect(aeo.created[0]).toMatchObject({ rulesVersion: "2" });
  });
```

기존 단언(같은 describe 안)은 다음처럼 한 줄이 늘어난다:

```ts
    expect(aeo.created[0]).toMatchObject({
      generatedBy: "deterministic",
      pageUrl: "https://example.com/",
      phrase: "리프팅 가격",
      rulesVersion: "2",
      siteId: "site_1"
    });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm build && pnpm --filter @searchops/worker test`
Expected: FAIL — `aeo.created[0]` 에 `rulesVersion` 이 없다.

- [ ] **Step 3: 최소 구현**

`packages/db/prisma/schema.prisma`, `AeoReadinessReport` 의 `generatedBy` 다음 줄:

```prisma
  rulesVersion String?
```

`packages/db/prisma/migrations/20261009000000_aeo_rules_version/migration.sql` 생성:

```sql
-- 적합성 룰(PAGE_ANSWERS_QUESTION)이 동어반복 룰을 대체해 점수의 의미가 바뀐다.
-- 과거 행은 NULL = 룰 버전 1 이다. 과거 행엔 candidatePage 스냅샷이 없어 재계산이
-- 원리적으로 불가능하므로 백필하지 않는다 — 섞인 비교는 진단서 F 절이 거부한다.
ALTER TABLE "AeoReadinessReport"
ADD COLUMN "rulesVersion" TEXT;
```

`packages/db/src/crawl.ts` 의 `create data` 에 한 줄(`pageUrl` 다음, 알파벳 순):

```ts
        rulesVersion: report.rulesVersion,
```

`apps/api/src/prisma-repository.ts` 의 `toAeoReadinessReportRecord` 에 한 줄(`generatedBy` 다음):

```ts
    rulesVersion: record.rulesVersion,
```

`apps/api/src/repository.ts` 의 인메모리 레코드에 한 줄(`generatedBy` 다음):

```ts
        rulesVersion: input.readinessReport.rulesVersion,
```

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm db:migrate   # 로컬 DB 가 없으면 생략 가능 — CI 의 migration-gate 가 검증한다
pnpm build
pnpm --filter @searchops/worker test
pnpm --filter @searchops/api test
```
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/db apps/api/src/prisma-repository.ts apps/api/src/repository.ts apps/worker/src/crawl-postprocess.test.ts
git commit -m "feat(db): AeoReadinessReport.rulesVersion 저장·조회

nullable 컬럼 1개 추가. 과거 행은 NULL = 버전 1 이고 백필하지 않는다 —
candidatePage 스냅샷이 없어 재계산이 원리적으로 불가능하다."
```

---

### Task 5: 워커가 토큰화 정본을 쓴다

**Files:**
- Modify: `apps/worker/src/processor.ts` (`selectAeoCandidateSnapshot` 내부의 자체 토큰화)
- Test: `apps/worker/src/crawl-postprocess.test.ts`

**Interfaces:**
- Consumes: Task 2 의 `tokenizeKeywordPhrase`
- Produces: 동작 변화 없음(토큰화 사본만 제거). PR #134 의 기존 테스트가 그대로 통과해야 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/worker/src/crawl-postprocess.test.ts` 의 `describe("크롤 후처리 AEO 준비도", ...)` 안에 추가:

```ts
it("1글자 토큰뿐인 키워드는 대표 페이지로 폴백한다 — 정본 토큰화를 쓴다", () => {
  const snapshots = [
    snapshotFixture("https://example.com/", "홈"),
    snapshotFixture("https://example.com/nose", "코 성형")
  ];

  // "코" 는 1글자라 정본 토큰화가 버린다. 토큰이 비면 매칭 근거가 없다.
  expect(selectAeoCandidateSnapshot("코", snapshots, snapshots[0]!)).toEqual({
    matched: false,
    snapshot: snapshots[0]
  });
});

it("구두점이 섞인 키워드도 매칭된다 — 정본 토큰화가 기호를 경계로 쓴다", () => {
  const snapshots = [
    snapshotFixture("https://example.com/", "홈"),
    snapshotFixture("https://example.com/botox", "보톡스 가격 안내")
  ];

  expect(selectAeoCandidateSnapshot("보톡스 가격?", snapshots, snapshots[0]!).snapshot.url).toBe(
    "https://example.com/botox",
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm build
pnpm --filter @searchops/worker test
```
Expected: FAIL — 현재 워커 토큰화는 공백만 쪼개고 1글자를 버리지 않아, `"코"` 가 `/nose` 에 매칭되고 `"보톡스 가격?"` 의 `"가격?"` 이 아무것도 못 덮는다.

- [ ] **Step 3: 최소 구현**

`apps/worker/src/processor.ts` 에서 `@searchops/aeo-core` import 에 `tokenizeKeywordPhrase` 를 추가하고, `selectAeoCandidateSnapshot` 의 첫 줄을 교체:

```ts
  const tokens = tokenizeKeywordPhrase(phrase);
```

(기존 `const tokens = [...new Set(phrase.toLowerCase().split(/\s+/u).filter(...))]` 를 지운다.)

doc 주석의 `ponytail:` 항목에서 "공백 토큰 부분일치" 를 "정본 토큰화(aeo-core tokenizeKeywordPhrase) 부분일치" 로 고친다.

- [ ] **Step 4: 통과를 확인한다**

```bash
pnpm build && pnpm --filter @searchops/worker test
```
Expected: PASS — PR #134 의 기존 매처 테스트 4건도 그대로 통과해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/worker/src/processor.ts apps/worker/src/crawl-postprocess.test.ts
git commit -m "refactor(worker): 토큰화 사본을 지우고 aeo-core 정본을 쓴다

워커의 페이지 선택과 룰 판정이 다른 토큰을 쓰면 '선택은 했는데 판정은 못 하는'
구간이 생긴다. 부수 효과로 구두점 키워드가 매칭되고 1글자 토큰 오탐이 사라진다."
```

---

### Task 6: 공백 → 워크오더 (다섯 번째 소스)

**스펙과의 차이 1건**: 스펙 §E 는 `instructions` 에 `createSuggestedAnswerAngle`(기존 함수)를
재사용한다고 적었으나, 확인 결과 그 함수는 `packages/aeo-core/src/index.ts:926` 의 **비공개
함수**다. 공개 export 로 올리면 `aeo-core` 의 공개 표면이 넓어지고 영어 문구가 한국어 워크오더에
섞인다. 그래서 공백 전용 한 줄 함수를 `workorders` 안에 둔다 — 아래 Step 3 의
`createAeoContentGapAngle`. 재사용이 낫다고 판단되면 `aeo-core` 에서 export 하고 이 함수를 지운다.

**Files:**
- Modify: `packages/workorders/src/index.ts:30-35` (`workOrderInputSources`), 파일 끝(새 함수 2개)
- Test: `packages/workorders/src/index.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `AeoReadinessReportRecord`, Task 3 의 `PAGE_ANSWERS_QUESTION` 체크
- Produces:
  - `createWorkOrdersFromAeoReadinessReports(reports: readonly AeoReadinessReportRecord[], siteUrl: string): readonly WorkOrderDraft[]` — 0건 또는 1건
  - `aeoContentGapQuestionLimit = 10`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/workorders/src/index.test.ts` 끝에 추가:

```ts
const SITE_URL = "https://example-clinic.com/";

function gapReport(
  phrase: string,
  status: "pass" | "warning" | "fail",
  pageUrl: string | null = "https://example-clinic.com/botox",
): AeoReadinessReportRecord {
  const score = status === "pass" ? 100 : status === "warning" ? 60 : 0;
  return {
    id: `aeo_${phrase}`,
    siteId: "site_1",
    keywordId: null,
    phrase,
    locale: "ko-KR",
    intent: null,
    pageUrl,
    status: "needs_work",
    score: 46,
    checks: [
      {
        checkId: "PAGE_ANSWERS_QUESTION",
        status,
        score,
        evidence: {
          url: pageUrl,
          observedValue: [],
          expectedValue: "Question-form heading or answer block covering the keyword",
          sourceField: "questionHeadings"
        }
      }
    ],
    generatedBy: "deterministic",
    rulesVersion: "2",
    evaluatedAt: "2026-10-09T00:00:00.000Z",
    createdAt: "2026-10-09T00:00:00.000Z"
  };
}

describe("AEO 콘텐츠 공백 워크오더", () => {
  it("공백 질문들을 묶어 정확히 1건을 만든다", () => {
    const orders = createWorkOrdersFromAeoReadinessReports(
      [gapReport("보톡스 가격", "fail"), gapReport("보톡스 부작용", "fail")],
      SITE_URL,
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      ownerType: "content",
      priority: "p2",
      estimatedEffort: "s",
      evidence: { url: "https://example-clinic.com/botox", observedValue: ["보톡스 가격", "보톡스 부작용"] }
    });
    expect(orders[0]?.title).toContain("2개");
  });

  it("주제는 다루는 warning 은 공백이 아니다 — 제외한다", () => {
    expect(
      createWorkOrdersFromAeoReadinessReports(
        [gapReport("보톡스 가격", "warning"), gapReport("주차 안내", "pass")],
        SITE_URL,
      ),
    ).toHaveLength(0);
  });

  it("공백이 0건이면 워크오더를 만들지 않는다", () => {
    expect(createWorkOrdersFromAeoReadinessReports([], SITE_URL)).toHaveLength(0);
  });

  // SeoIssueEvidenceSchema.url 은 non-null 이다. 전부 null 이면 사이트 URL 로 올린다.
  it("실패 리포트의 pageUrl 이 전부 null 이면 사이트 URL 을 쓴다", () => {
    const orders = createWorkOrdersFromAeoReadinessReports(
      [gapReport("보톡스 가격", "fail", null)],
      SITE_URL,
    );
    expect(orders[0]?.evidence.url).toBe(SITE_URL);
  });

  it("공백 수로 우선순위·공수를 결정적으로 나눈다", () => {
    const many = Array.from({ length: 5 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    expect(createWorkOrdersFromAeoReadinessReports(many, SITE_URL)[0]).toMatchObject({
      priority: "p1",
      estimatedEffort: "l"
    });

    const three = Array.from({ length: 3 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    expect(createWorkOrdersFromAeoReadinessReports(three, SITE_URL)[0]).toMatchObject({
      priority: "p2",
      estimatedEffort: "m"
    });
  });

  // Review Focus 2: 공백이 수십 건이면 본문이 사람이 못 읽는 길이가 된다.
  it("질문이 상한을 넘으면 상위 N개만 적고 나머지 수를 남긴다", () => {
    const many = Array.from({ length: 25 }, (_, index) => gapReport(`질문 ${index} 보톡스`, "fail"));
    const order = createWorkOrdersFromAeoReadinessReports(many, SITE_URL)[0];

    expect(order?.instructions.length).toBeLessThanOrEqual(aeoContentGapQuestionLimit + 2);
    expect(order?.problem).toContain("나머지 15개");
  });

  // Review Focus 4: 1글자 토큰뿐인 키워드는 영구 fail 이라 고칠 방법이 없다 — 노이즈다.
  it("판정 불가 키워드(1글자 토큰뿐)는 공백에서 제외한다", () => {
    expect(
      createWorkOrdersFromAeoReadinessReports([gapReport("코 턱", "fail")], SITE_URL),
    ).toHaveLength(0);
  });

  // Review Focus 3: 같은 입력이면 같은 출력이어야 호출부가 중복을 걸러낼 수 있다.
  it("같은 입력에 같은 출력을 낸다 — 중복 판정의 전제", () => {
    const reports = [gapReport("보톡스 가격", "fail"), gapReport("보톡스 부작용", "fail")];
    expect(createWorkOrdersFromAeoReadinessReports(reports, SITE_URL)).toEqual(
      createWorkOrdersFromAeoReadinessReports(reports, SITE_URL),
    );
  });

  it("aeo-core 를 워크오더 입력 소스로 선언한다", () => {
    expect(workOrderInputSources).toContain("aeo-core");
  });
});
```

import 에 `aeoContentGapQuestionLimit`, `createWorkOrdersFromAeoReadinessReports`, `workOrderInputSources` 와 타입 `AeoReadinessReportRecord` 를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @searchops/workorders test`
Expected: FAIL — `createWorkOrdersFromAeoReadinessReports is not a function`.

- [ ] **Step 3: 최소 구현**

`packages/workorders/src/index.ts` — import 에 `aeoCorePackage` 와 `tokenizeKeywordPhrase`(둘 다 `@searchops/aeo-core`), 타입 `AeoReadinessReportRecord`(`@searchops/types`)를 추가하고 `workOrderInputSources` 에 `aeoCorePackage` 를 넣는다. 파일 끝에:

```ts
/** 한 워크오더 본문에 적는 질문 수 상한. 넘으면 나머지 수만 적는다 — 수십 줄은 사람이 안 읽는다. */
export const aeoContentGapQuestionLimit = 10;

/**
 * 콘텐츠 공백 = PAGE_ANSWERS_QUESTION 이 fail 인 질문. warning(주제는 다루나 질문 형태가
 * 없음)은 공백이 아니라 기존 FAQ 스키마·헤딩 구조 워크오더의 영역이라 제외한다.
 *
 * 질문마다 워크오더를 만들지 않는다 — 콘텐츠 1건이 여러 질문을 동시에 답하는 것이
 * 실제 작업 단위다. 그래서 0건 또는 1건을 돌려준다.
 *
 * 판정 불가 키워드(토큰화 결과가 빈 것 — 1글자 토큰뿐)는 제외한다. 영구 fail 이라
 * 고칠 방법이 없고, 매 크롤런마다 같은 노이즈가 올라온다.
 */
export function createWorkOrdersFromAeoReadinessReports(
  reports: readonly AeoReadinessReportRecord[],
  siteUrl: string,
): readonly WorkOrderDraft[] {
  const gaps = reports.filter(
    (report) =>
      tokenizeKeywordPhrase(report.phrase).length > 0 &&
      report.checks.some(
        (check) => check.checkId === "PAGE_ANSWERS_QUESTION" && check.status === "fail",
      ),
  );
  if (gaps.length === 0) {
    return [];
  }

  const questions = gaps.map((report) => report.phrase);
  const shown = questions.slice(0, aeoContentGapQuestionLimit);
  const remaining = questions.length - shown.length;
  const url = gaps.find((report) => report.pageUrl !== null)?.pageUrl ?? siteUrl;
  const evaluatedPages = [...new Set(gaps.map((report) => report.pageUrl ?? siteUrl))];

  return [
    WorkOrderDraftSchema.parse({
      title: `콘텐츠 공백: 답변 없는 질문 ${questions.length}개`,
      problem:
        `다음 질문에 답하는 페이지가 없습니다(AEO 적합성 판정 fail): ${shown.join(", ")}` +
        (remaining > 0 ? ` 외 나머지 ${remaining}개.` : ".") +
        ` 평가 대상 페이지: ${evaluatedPages.join(", ")}.`,
      evidence: {
        url,
        observedValue: questions,
        expectedValue: "질문형 헤딩 또는 답변 블록으로 각 질문에 답하는 페이지",
        sourceField: "aeoReadinessReport.checks.PAGE_ANSWERS_QUESTION"
      },
      impact:
        "AI 답변엔진이 인용할 근거가 없어 해당 질문에서 노출되지 않습니다. 검색 수요가 있는 질문일수록 손실이 큽니다.",
      instructions: [
        ...shown.map((question) => `"${question}" — ${createAeoContentGapAngle(question)}`),
        "각 질문을 질문형 헤딩(또는 FAQPage 답변 블록)으로 쓰고 바로 아래에 답을 둡니다.",
        "의료 콘텐츠는 초안까지만 만듭니다 — 게재 전 의료광고법 검수와 사람 승인을 거칩니다(draft-only)."
      ],
      ownerType: "content",
      priority: questions.length >= 5 ? "p1" : "p2",
      acceptanceCriteria: [
        "각 질문이 질문형 헤딩 또는 답변 블록으로 페이지에 존재합니다.",
        "재크롤 후 해당 질문들의 AEO 리포트에서 PAGE_ANSWERS_QUESTION 이 fail 을 벗어납니다.",
        "의료 표현은 의료광고법 검수를 통과했습니다(승인·반려는 사람이 합니다)."
      ],
      verificationMethod:
        "재크롤 후 해당 질문들의 AeoReadinessReport 에서 PAGE_ANSWERS_QUESTION 상태를 확인합니다.",
      estimatedEffort: questions.length >= 5 ? "l" : questions.length >= 3 ? "m" : "s",
      relatedIssues: []
    })
  ];
}
```

`createAeoContentGapAngle` 은 `aeo-core` 의 `createSuggestedAnswerAngle` 이 비공개 함수이므로 이 패키지에 짧게 둔다 — 파일 끝에:

```ts
/** 답변 각도 한 줄. aeo-core 의 createSuggestedAnswerAngle 은 비공개라 공백 전용 문구를 둔다. */
function createAeoContentGapAngle(question: string) {
  return question.includes("가격") || question.includes("비용")
    ? "가격 결정 요인과 상담 절차를 적고, 할인·이벤트 유인 문구는 쓰지 않습니다."
    : "질문을 그대로 헤딩으로 쓰고 두세 문장으로 먼저 답한 뒤 근거를 덧붙입니다.";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm build && pnpm --filter @searchops/workorders test`
Expected: PASS (20 + 9 = 29 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/workorders
git commit -m "feat(workorders): 콘텐츠 공백을 워크오더로 — 다섯 번째 소스

PAGE_ANSWERS_QUESTION 이 fail 인 질문들을 묶어 1건을 만든다. 콘텐츠 1건이 여러 질문을
동시에 답하는 것이 실제 작업 단위다. warning(주제는 다룸)은 공백이 아니라 제외하고,
판정 불가 키워드(1글자 토큰뿐)는 영구 fail 이라 노이즈가 되므로 제외한다. draft-only."
```

---

### Task 7: F 절 — 버전 경고·공백 표기

**Files:**
- Modify: `packages/reports/src/index.ts` (`aeoBody`)
- Test: `packages/reports/src/index.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `rulesVersion`, Task 3 의 `PAGE_ANSWERS_QUESTION`
- Produces: 없음(최종 소비자)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/reports/src/index.test.ts` 의 F 절 테스트들 뒤에 추가. 먼저 `aeoReport` 헬퍼
(`:116`)에 6번째 파라미터를 더한다 — 기존 호출부는 손대지 않는다:

```ts
const aeoReport = (
  id: string,
  phrase: string,
  score: number,
  evaluatedAt: string,
  pageUrl = "https://example-clinic.com/faq",
  rulesVersion: string | null = "2"
): NonNullable<DiagnosisReportInput["aeoReports"]>[number] => ({
  // ... 기존 필드 그대로 ...
  rulesVersion,
  // ...
});
```

```ts
it("룰 버전이 섞이면 점수를 비교하지 않는다 (F)", () => {
  const html = renderDiagnosisHtml({
    ...input,
    aeoReports: [
      aeoReport("aeo_old", "보톡스 가격", 46, "2026-09-20T00:00:00.000Z", undefined, null),
      aeoReport("aeo_new", "주차 안내", 31, "2026-10-09T00:00:00.000Z", undefined, "2")
    ]
  });

  expect(html).toContain("룰 버전이 섞여");
  expect(html).toContain("점수를 서로 비교할 수 없습니다");
});

// Review Focus 1: 혼재가 아니라 전부 구버전인 사이트. 경고 없이 구 점수를 새 기준처럼 보이면 안 된다.
it("전부 구버전이면 구버전임을 알린다 (F)", () => {
  const html = renderDiagnosisHtml({
    ...input,
    aeoReports: [aeoReport("aeo_old", "보톡스 가격", 46, "2026-09-20T00:00:00.000Z", undefined, null)]
  });

  expect(html).toContain("구버전");
  expect(html).not.toContain("룰 버전이 섞여");
});

it("적합성 fail 행을 콘텐츠 공백으로 표기한다 (F)", () => {
  const gap = {
    ...aeoReport("aeo_gap", "임플란트 비용", 31, "2026-10-09T00:00:00.000Z"),
    checks: [
      {
        checkId: "PAGE_ANSWERS_QUESTION" as const,
        status: "fail" as const,
        score: 0,
        evidence: {
          url: "https://example-clinic.com/faq",
          observedValue: [],
          expectedValue: "Question-form heading or answer block covering the keyword",
          sourceField: "questionHeadings"
        }
      }
    ]
  };
  const html = renderDiagnosisHtml({ ...input, aeoReports: [gap] });

  expect(html).toContain("콘텐츠 공백");
  // PR #134 가 넣은 폐기 문구는 사라져야 한다 — 이제 측정한다.
  expect(html).not.toContain("아직 측정하지 않습니다");
  expect(html).not.toContain("이 표만으로는 그 폴백을 구분할 수 없습니다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @searchops/reports test`
Expected: FAIL — 버전 문구가 없고, 폐기 문구가 아직 남아 있다.

- [ ] **Step 3: 최소 구현**

`packages/reports/src/index.ts` 의 `aeoBody` 에서:

1. `latest` 계산 뒤에 버전 판정을 넣는다:

```ts
  const versions = new Set([...latest.values()].map((report) => report.rulesVersion ?? null));
  const versionNote = versions.size > 1
    ? ` <strong>룰 버전이 섞여 있어 점수를 서로 비교할 수 없습니다</strong>(⚠️ 검증필요) — 적합성 룰 도입 전후의 점수는 분자가 다른 분수입니다.`
    : versions.has(null)
      ? ` 이 점수는 <strong>구버전 룰</strong>(적합성 판정 전)로 계산됐습니다 — 질문↔페이지 적합성이 반영되지 않았습니다(⚠️ 검증필요).`
      : "";
```

2. 행 매핑에서 공백을 표기한다 — `rows` 의 `상태` 칸 뒤 대신 `미통과 체크` 칸 앞에 한 칸을 더하지 않고, `상태` 칸을 다음으로 바꾼다:

```ts
      esc(group.report.status) + (isContentGap(group.report) ? " · 콘텐츠 공백" : ""),
```

그리고 파일에 판정 함수를 둔다(`aeoBody` 바로 위):

```ts
/** 적합성 판정이 fail = 그 질문에 답하는 페이지가 없다. 워크오더가 나가는 조건과 같다. */
function isContentGap(report: ReportInput["aeoReports"][number]) {
  return report.checks.some(
    (check) => check.checkId === "PAGE_ANSWERS_QUESTION" && check.status === "fail",
  );
}
```

3. 각주에서 PR #134 가 넣은 두 문구를 **삭제**한다 — `<strong>"이 페이지가 이 질문에 답하는가"는 아직 측정하지 않습니다</strong>(⚠️ 검증필요).` 와 `질문에 대응하는 페이지를 찾지 못하면 대표 페이지로 평가되며, 이 표만으로는 그 폴백을 구분할 수 없습니다(⚠️ 검증필요).` 를 지우고, 그 자리에 `versionNote` 와 다음 문장을 넣는다:

```
적합성 판정(PAGE_ANSWERS_QUESTION)이 fail 인 행은 콘텐츠 공백이며 워크오더로 올라갑니다.
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @searchops/reports test`
Expected: PASS (23 + 3 = 26 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/reports
git commit -m "feat(reports): F 절에 룰 버전 경고·콘텐츠 공백 표기

점수의 의미가 바뀌었으므로 버전이 섞이면 비교를 거부하고, 전부 구버전이면 구버전임을
알린다. 적합성 fail 행은 콘텐츠 공백으로 표기한다. PR #134 가 넣은 '아직 측정하지
않습니다'·'폴백을 구분할 수 없습니다' 는 삭제한다 — 이제 측정한다."
```

---

### Task 8: 전체 게이트 · PR

**Files:** 없음(검증·전달)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: PR

- [ ] **Step 1: 전체 게이트**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```
Expected: 전부 통과. 실패하면 해당 태스크로 돌아간다 — 기대값을 맞추려고 룰을 바꾸지 않는다.

- [ ] **Step 2: 머지 결과를 실제로 확인한다**

```bash
git fetch origin main
git checkout -b tmp-merge-relevance origin/main
git merge --no-ff --no-edit feat/aeo-page-relevance
pnpm build && pnpm typecheck && pnpm lint && pnpm test
git checkout feat/aeo-page-relevance && git branch -D tmp-merge-relevance
```
Expected: 병합 결과도 전부 통과. GitHub 의 `MERGEABLE` 은 텍스트 충돌만 본다.

- [ ] **Step 3: 푸시·PR**

```bash
git push -u origin feat/aeo-page-relevance
```

PR 본문에 반드시 담는다:
- 근인(동어반복 룰이 항상 pass·100 이었다)과 점수 영향표(46 → pass 46 / warning 40 / fail 31)
- `KEYWORD_INTENT_DEFINED` 를 열거형에 남긴 이유(과거 `checks` JSON 파싱)
- 알려진 한계: 워커의 `answerBlocks` 가 비어 `pass` 가 과소평가된다(⚠️ 검증필요)
- 마이그레이션은 nullable 컬럼 1개, 백필 없음
- 롤백: 룰 배열 교체 되돌리기 + 컬럼 무시

- [ ] **Step 4: 운영 반영 안내**

머지 시 다음 크롤 배치부터 적용된다. 첫 배치 로그에서 확인할 것:
```
[crawl-postprocess] AEO 페이지 매칭 N/M건 (siteId)
```
그리고 F 절에서 `콘텐츠 공백` 표기와 워크오더 생성 여부를 확인한다. 공백 질문이 `not_ready` 로 떨어지는 것은 **의도된 결과**다.
