# AEO 적합성 — 후속 작업 인계 (PR #135 이후)

> 작성 2026-10-11 · 선행: PR #135 (`feat/aeo-page-relevance`, 머지 대기)
> 이 문서는 **다음 세션용 인계서**다. PR #135 가 머지된 뒤 시작한다.

## 지금 상태

- **PR #135**: https://github.com/kionya/searchops-ai/pull/135 — `MERGEABLE`, 4게이트 통과. 머지 대기.
- 브랜치 `feat/aeo-page-relevance`, 최신 커밋 `d4804cc`.
- 앞선 머지 완료: **PR #133**(컴플라이언스 보일러플레이트, `097c58e`) · **PR #134**(F절 페이지 매칭, `8618ade`).

### PR #135 가 담은 것

진단서 F절(AEO 준비도)이 **"이 페이지가 이 질문에 답하는가"를 실제로 측정**한다.

| 변경 | 내용 |
|---|---|
| `aeo-core` | 동어반복 룰 `KEYWORD_INTENT_DEFINED`(항상 pass·100) → `PAGE_ANSWERS_QUESTION`(100/60/0). 룰 7개 유지 |
| `aeo-core` | 토큰화 정본 `tokenizeKeywordPhrase` — 워커의 페이지 선택과 룰 판정이 **같은 함수**를 쓴다 |
| `types`·`db` | `rulesVersion`(nullable 컬럼 1개, 백필 없음). 버전이 섞이면 F절이 비교를 거부 |
| `workorders` | 다섯 번째 소스 — 공백 질문들을 묶어 사이트당 1건 |
| `api` | `POST /sites/:id/aeo-content-gap-work-order` (멱등) |
| `reports` | F절 버전 경고·콘텐츠 공백 표기 |

`KEYWORD_INTENT_DEFINED` 는 **열거형에 남겼다** — 저장된 과거 `checks` JSON 이 담고 있어 지우면 모든 과거 행의 조회가 던진다.

---

## 남은 작업 2건 (Codex 적대 리뷰 2026-10-11)

### F1. 워크오더 멱등성 레이스 (high)

**파일**: `apps/api/src/prisma-repository.ts` — `createAeoContentGapWorkOrder`

`findFirst`(실제로는 `findMany` + JS 필터) 후 `create`/`update` 를 트랜잭션으로 감쌌지만, **동시 요청 두 건이 각각 `create` 할 수 있다.** `WorkOrder` 에 `(siteId, evidence.sourceField)` unique 제약이 없고 직렬화 잠금도 없다. 기본 격리수준(Read Committed)에서 두 트랜잭션 모두 기존 행을 못 보고 각각 insert 한다. 중복 생성 뒤에도 조회는 한 건만 갱신하므로 **나머지가 영구히 남는다.**

**최소 수정**: DB 수준 유일성. 컬럼 추가를 피하려면 그 `sourceField` 에 한정한 **부분 unique 인덱스**(`CREATE UNIQUE INDEX ... WHERE (evidence->>'sourceField') = '...'`)를 쓰고, 충돌 시 기존 행을 갱신한다. 마이그레이션 1건 + PostgreSQL 병렬 요청 테스트.

⚠️ 표현식 인덱스가 Prisma 스키마로 표현되지 않으면 `migration.sql` 수기 작성 + `prisma db pull` 불일치 가능 — `migration-gate` CI 로 확인한다.

### F2. 대시보드 평균이 룰 버전을 섞는다 (medium)

**파일**: `apps/web/src/keyword-aeo-dashboard.ts` — `summarizeKeywordAeoDashboard`

매퍼는 `rulesVersion` 을 보존하지만(PR #135 에서 고침) **집계는 버전 구분 없이 `score` 를 평균낸다.** API 는 사이트의 전체 측정 이력을 반환하므로, 과거 `NULL` 버전 행이 있는 사이트에서 v2 측정을 시작하면 `/sites/[siteId]/content` 의 "평균 점수" 가 **의미가 다른 점수를 합산**한다. 진단서 F절의 버전 경고는 이 화면에 적용되지 않는다.

**최소 수정**: 집계에도 버전 정책을 적용한다 — 버전별 분리, 또는 혼재 시 단일 평균을 표시하지 않는다. `NULL`/v2 이력이 함께 있는 화면 테스트 1건.

---

## 보류한 minor 7건 (Claude 리뷰어)

1. `docs/GEO_SPEC.md:18` 이 `KEYWORD_INTENT_DEFINED` 를 문서화하고 `PAGE_ANSWERS_QUESTION` 이 없다
2. `apps/web` 데모 리포트가 `rulesVersion "2"` + `KEYWORD_INTENT_DEFINED` checks — **v2 가 만들 수 없는 조합**이고 새 라벨("질문 적합성")이 데모에 안 보인다
3. `apps/worker/src/processor.ts` 주석이 구 룰을 설계 근거로 든다(동작은 안전)
4. `warning` 분기 `observedValue` 가 `title+h1+h2` 합본 전체(실측 280자)
5. `fail` 분기 `observedValue` 가 질문형 헤딩 전체(상한 없음) — `.slice(0, 10)` 로 충분
6. `packages/db/prisma/schema.prisma` 의 `rulesVersion` 필드 정렬(`prisma format` 미실행)
7. 워크오더 `problem` 의 `evaluatedPages` 상한 없음 — 공백 50건이 50개 URL 로 흩어지면 한 문장에 50개

---

## 알려진 한계 (고치는 작업이 아니라 알고 있어야 하는 것)

- **워커 경로에서 `pass` 는 질문형 헤딩이 있을 때만 난다** — `toAeoPageSignal` 이 `answerBlocks` 를 `[]` 로 고정한다. 추출기가 생기면 올라간다(⚠️ 검증필요)
- 한국어는 어절 경계가 없어 형태소 분석 없이는 부분일치 휴리스틱이 이 이상 정확해지지 않는다(`ponytail:` 주석에 천장 표기)
- 과거 리포트 점수 백필 없음 — `candidatePage` 스냅샷이 없어 원리적으로 불가능
- 공백 질문이 `not_ready` 로 떨어져 대시보드가 빨갛게 변한다. 의도된 결과다(임계값 80/50 은 바꾸지 않는다)

## 운영 반영 확인 (머지 후)

다음 크롤 배치 로그에서:
```
[crawl-postprocess] AEO 페이지 매칭 N/M건 (siteId)
[crawl-postprocess] 컴플라이언스 룰팩 kr-medical=N (siteId)
```
룰팩이 `global` 이면 한국 의료광고법 룰이 한 줄도 안 돈 것이다. AEO 매칭이 `0/M` 이면 전 질문이 대표 페이지 1장으로 평가된 것이다.

## 참고 문서

- 설계 스펙: `docs/superpowers/specs/2026-10-09-aeo-page-relevance-design.md`
- 구현 계획(8태스크 39단계): `docs/superpowers/plans/2026-10-09-aeo-page-relevance.md`
- 실행 레저(ruling 13건 전수·보류 minor): `.superpowers/sdd/2026-10-09-aeo-page-relevance/progress.md` — git 추적 안 됨, 로컬 경로
