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

## Current Limitations

- Contracts and deterministic package-level rules are implemented first.
- API persistence, dashboard review workflow, and WorkOrder conversion are next Phase 10 steps.
- Jurisdiction-specific rule packs are not yet modeled; this foundation keeps the rule interface ready for them.
