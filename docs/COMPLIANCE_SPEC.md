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

## Current Limitations

- Contracts and deterministic package-level rules are implemented first.
- API persistence stores ComplianceFlag history from deterministic reviews.
- Dashboard review workflow can run fixture reviews, update flag status, create WorkOrders, and run deterministic rechecks through the API when configured.
- ComplianceFlag to WorkOrder conversion is deterministic and legal-owned.
- Rule pack selection is deterministic. The `kr-medical` pack now includes Korean-market medical advertising refinements.
- Compliance reviews and rechecks do not publish content or push changes to a CMS.
- Inbound CMS update events trigger rechecks, but production webhook authentication and provider-specific signature verification remain future hardening scope.
