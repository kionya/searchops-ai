# @searchops/schema-core

Deterministic JSON-LD recommendation engine for SearchOps AI.

## Boundary

- Input: typed crawler page snapshots and site context.
- Output: typed JSON-LD recommendation drafts validated by `@searchops/types`.
- No LLM, DB, network, connector, or CMS calls.
- Each recommendation rule is independently testable.

Persistence, API routes, dashboard rendering, and work order generation are future Phase 8 tasks.
