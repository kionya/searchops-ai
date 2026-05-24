# packages/compliance

Medical advertising rules, prohibited expression checks, claim checks, and replacement guidance.

Compliance checks should be deterministic and testable independently from SEO rules.

## Phase 10 foundation

- Input: `ComplianceReviewInput` from `@searchops/types`
- Output: `ComplianceReviewReport` with deterministic `ComplianceFlagDraft[]`
- Policy: medical content stays `draft_only`
- Boundaries: no LLM, DB, network, CMS, or app route dependency
