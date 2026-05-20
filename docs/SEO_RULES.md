# SEO_RULES.md

## Phase 3 Status
Deterministic SEO issue rules are implemented in `packages/seo-core` for:

- `TITLE_MISSING`
- `META_DESC_MISSING`
- `H1_MISSING`
- `MULTIPLE_H1`
- `NOINDEX_ON_IMPORTANT_PAGE`
- `CANONICAL_MISSING`
- `CANONICAL_MISMATCH`
- `IMAGE_ALT_MISSING`

## Rule Engine Contract
SEO rules must be deterministic, independently testable, and must not call LLM providers, DB clients, network clients, random sources, or current time.

Input is a `UrlSeoSnapshot` derived from `CrawlerPageSnapshot`.
Output is `SeoIssueDraft[]` with rule id, severity, category, priority, impact/effort/priority scores, and evidence.

Persistence belongs to API/worker layers, not `packages/seo-core`.
