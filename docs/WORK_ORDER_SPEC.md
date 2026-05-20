# WORK_ORDER_SPEC.md

## Phase 4 Status
`packages/workorders` maps deterministic SEO issue drafts into actionable work order drafts.

Supported SEO rule templates:

- `TITLE_MISSING`
- `META_DESC_MISSING`
- `H1_MISSING`
- `MULTIPLE_H1`
- `NOINDEX_ON_IMPORTANT_PAGE`
- `CANONICAL_MISSING`
- `CANONICAL_MISMATCH`
- `IMAGE_ALT_MISSING`

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
