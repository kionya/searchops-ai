# WORK_ORDER_SPEC.md

## Phase 4 Status
`packages/workorders` maps deterministic SEO issue drafts into actionable work order drafts.

The API exposes work board read/update routes, recheck enqueue, and deterministic resolution for persisted work orders.

Supported SEO rule templates:

- `TITLE_MISSING`
- `META_DESC_MISSING`
- `H1_MISSING`
- `MULTIPLE_H1`
- `NOINDEX_ON_IMPORTANT_PAGE`
- `CANONICAL_MISSING`
- `CANONICAL_MISMATCH`
- `IMAGE_ALT_MISSING`

Additional deterministic work order sources:
- Schema recommendations from `packages/schema-core`.
- GEO visibility reports from `packages/geo-core`.
- Compliance flags from `packages/compliance`.

## Work Order Contract
Work order drafts include:

- `title`
- `problem`
- `evidence`
- `impact`
- `instructions`
- `ownerType`
- `priority`
- `acceptanceCriteria`
- `verificationMethod`
- `estimatedEffort`
- `relatedIssues`

## Determinism Rules
Work order generation must use static templates only.

It must not call LLM providers, DB clients, network clients, random sources, or current time.

Persistence belongs to API/worker layers. The mapper returns `WorkOrderDraft` values only.

GEO report mapping must remain deterministic:
- It uses the persisted report status, score, checks, mention rate, citation rate, and competitor citation rate.
- It maps `not_visible`, `weak`, `visible`, and `strong` statuses to fixed priority and effort values.
- It must not call LLM providers or live AI/search providers.

Compliance flag mapping must remain deterministic:
- It uses the persisted flag risk level, rule id, evidence, recommendation, and replacement suggestion.
- It maps `critical`, `high`, `medium`, and `low` risks to fixed priority and effort values.
- It routes ownership to `legal`.
- It must not call LLM providers, CMS systems, or legal approval services.

## Board API
- `GET /sites/:siteId/work-orders`
- `GET /work-orders/:workOrderId`
- `PATCH /work-orders/:workOrderId`
- `POST /work-orders/:workOrderId/recheck`
- `POST /work-orders/:workOrderId/resolve`
- `POST /geo-visibility-reports/:geoVisibilityReportId/work-order`
- `POST /compliance-flags/:complianceFlagId/work-order`

Board updates can change status, priority, assignee, and due date.

Recheck enqueue creates a crawl run from the work order evidence URL when available, validates that URL against the site domain/subdomains, enqueues a crawl job, and moves the work order to `in_review`.

Resolution marks the work order `done` and marks the linked SEO issue `resolved` when the issue still exists.
