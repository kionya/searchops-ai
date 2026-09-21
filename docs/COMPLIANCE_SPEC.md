# COMPLIANCE_SPEC.md

Medical advertising rules, prohibited expressions, and replacement guidance live here.

## Phase 10 Foundation

The compliance engine starts as a deterministic rule engine in `packages/compliance`.
It reviews draft or candidate medical content and returns typed `ComplianceFlagDraft`
records through shared Zod contracts in `packages/types`.

## Non-negotiables

- No LLM usage is required for compliance detection.
- Medical content remains draft-only until compliance review is complete.
- The engine returns review flags and replacement guidance; it does not publish content.
- Rules must be independently testable.
- External CMS or live customer content checks must use fixtures unless explicitly scoped.

## Input Contract

`ComplianceReviewInput` describes the item being reviewed:

- `siteId`
- `subjectType`: `content_brief`, `page_copy`, `schema_recommendation`, `work_order`, or `manual`
- `subjectId`
- `url`
- `locale`
- `industry`
- `title`
- `text`
- `publishState`: `draft`, `scheduled`, or `published`
- `source`: `content_brief`, `cms`, `fixture`, `manual`, `schema_recommendation`, or `work_order`

## Output Contract

`ComplianceReviewReport` returns:

- deterministic `ComplianceFlagDraft[]`
- `rulePackId`: `global` or `kr-medical`
- `status`: `clear`, `needs_review`, or `blocked`
- `overallRiskLevel`: `critical`, `high`, `medium`, `low`, or `null`
- `publishPolicy`: always `draft_only`
- `generatedBy`: always `deterministic`

Each flag includes:

- `ruleId`
- `riskLevel`
- `title`
- `message`
- evidence with URL, excerpt, observed value, expected value, source field, and match
- recommendation and replacement suggestion
- `ownerType`: `legal`
- `publishPolicy`: `draft_only`

## Initial Rules

- `GUARANTEED_RESULT_CLAIM`: guaranteed, permanent, or 100% result claims.
- `ABSOLUTE_SAFETY_CLAIM`: risk-free, side-effect-free, painless, or absolute safety claims.
- `SUPERLATIVE_CLAIM`: unqualified best, number one, or most effective claims.
- `BEFORE_AFTER_REFERENCE`: before-and-after or treatment-result references.
- `PATIENT_TESTIMONIAL_REFERENCE`: testimonial and patient-review references.
- `PRICE_DISCOUNT_PROMOTION`: discount, limited-time, event-price, or free-consultation promotions.
- `UNREVIEWED_MEDICAL_PUBLISH`: medical content outside draft state before compliance approval.

## medical-ad-guard 9항목 대응표 (T4)

정본은 `~/.claude/skills/medical-ad-guard/SKILL.md` 의 "검수 필수 체크리스트 — 9항목 전수" 다.
코드 정본은 `packages/compliance/src/index.ts` 의 `complianceChecklistCanon`. 두 곳이 어긋나면 이 표가 아니라 SKILL.md 를 따른다.

| # | 항목 | 조항 | 룰 | 비고 |
|---|---|---|---|---|
| 1 | 보장성·최상급 표현 | §56② 3·4·7·8호 | GUARANTEED_RESULT_CLAIM · ABSOLUTE_SAFETY_CLAIM · SUPERLATIVE_CLAIM | |
| 2 | 치료 경험담(후기) | §56② 2호 | PATIENT_TESTIMONIAL_REFERENCE | |
| 3 | 전후 사진 | §56② 2호 | BEFORE_AFTER_REFERENCE | 부작용 고지 동반 시 `low` 로 완화 |
| 4 | 비교·비방광고 | §56② 4·5호 | COMPARATIVE_OR_DEFAMATORY_CLAIM | 우위 주장 없는 단순 비교도 해당 |
| 5 | 환자 유인·알선 | §27③ | PRICE_DISCOUNT_PROMOTION | 조항 정정(§56② → §27③) |
| 6 | 객관적 근거·신의료기술 | §56② 3호 · §53 | UNSUBSTANTIATED_OR_NEW_TECH_CLAIM | |
| 7 | 부작용 등 중요정보 누락 | §56② 7호 | SIDE_EFFECT_DISCLOSURE_MISSING | 페이지 단위: 시술 키워드 있음 ∧ 면책 문구 없음. "부작용 없는" 은 고지가 아니다 |
| 8 | 사전심의 | §57 | UNREVIEWED_MEDICAL_PUBLISH (`priorReviewRequired: true`) | 기계가 확정 불가. `input.priorReviewStatus` 가 `confirmed`/`not_required` 일 때만 pass, 그 외 `needs_verification` |
| 9 | 기사형 광고 | §56② | ADVERTORIAL_FORMAT | |

리포트 레벨: `checklist[9]` + `verdict`. `verdict: "safe"` 는 9항목 전부 `pass` 일 때만.
`blocked` → `danger`, 그 외 flagged/needs_verification 이 하나라도 있으면 `needs_review`.
판정은 `flag` 까지다 — **승인/반려는 사람**(draft-only). 정규식 오탐은 자동 차단 없이 recommendation 의 "검토 필요" 톤으로 남긴다.

각 플래그는 `legalClause`·`checklistItem`·`priorReviewRequired` 를 갖는다(DB 컬럼, 마이그레이션 `20260921020000_compliance_checklist_clause`).

## Rule Packs

- `global`: deterministic English/global baseline medical advertising checks.
- `kr-medical`: Korean medical advertising refinements for Korean locale medical content.

The `kr-medical` pack keeps the same rule IDs as the global baseline but adds Korean-market
patterns for guaranteed outcomes, absolute safety, superlatives, before-and-after references,
patient testimonials, and discount/event promotions. Rule pack selection is deterministic from
locale plus medical context, and callers can pin a rule pack in package-level tests.

## Recheck Workflow

`POST /compliance-flags/:complianceFlagId/recheck` evaluates revised draft text against the same
deterministic rule engine. If the original flag's `ruleId` is no longer present, the flag is marked
`resolved` and its linked WorkOrder is marked `done`. If the same rule is still present, the flag
stays actionable as `open` or `in_review`, and a completed WorkOrder is moved back to `in_review`.

`POST /sites/:siteId/cms/content-updated-events` accepts an inbound CMS content update event and
automatically rechecks active ComplianceFlags whose source `subjectId` or URL matches the changed
content. The API uses the event payload text; it does not fetch from the live CMS and does not
publish medical content. Matching flags with resolved rules close their linked WorkOrders, while
still-failing rules stay actionable.

When CMS webhook secrets are configured, the inbound event must include provider-scoped signature
headers: `x-searchops-cms-type`, `x-searchops-timestamp`, and `x-searchops-signature`. The API
verifies an HMAC-SHA256 signature over the timestamp plus canonical normalized event payload before
running any compliance recheck side effects, and rejects stale timestamps outside the replay window.
Provider-specific webhook routes can also verify selected native signatures for WordPress
(`x-wp-webhook-timestamp`, `x-wp-webhook-signature`) and Webflow
(`x-webflow-timestamp`, `x-webflow-signature`) over the timestamp plus canonical provider payload.
Native verification is only a provider-route fallback; normalized CMS event routes still use the
SearchOps HMAC contract.

The `kr-medical` rule pack exposes a deterministic refinement workflow with rule coverage, market
phrase refinement, legal owner review, and draft-only publish gate stages. Legal owner review remains
explicitly marked as a manual approval step before phrase or severity changes are treated as approved.

## Current Limitations

- Contracts and deterministic package-level rules are implemented first.
- API persistence stores ComplianceFlag history from deterministic reviews.
- Dashboard review workflow can run fixture reviews, update flag status, create WorkOrders, and run deterministic rechecks through the API when configured.
- ComplianceFlag to WorkOrder conversion is deterministic and legal-owned.
- Rule pack selection is deterministic. The `kr-medical` pack now includes Korean-market medical advertising refinements.
- Compliance reviews and rechecks do not publish content or push changes to a CMS.
- Inbound CMS update events trigger rechecks only after SearchOps HMAC or selected provider-native signature verification when CMS webhook secrets are configured.
- WordPress, Webflow, and generic headless CMS payload adapters normalize provider webhook payloads without live CMS fetches.
- KR medical rule pack refinement now has deterministic workflow metadata, but legal/market owner approval is still a manual governance step.
