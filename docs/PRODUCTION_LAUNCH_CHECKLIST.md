# Production Launch Checklist

This checklist tracks the remaining SearchOps AI work from Phase 6 through product launch. Items that require external accounts, tokens, DNS, billing setup, or legal review cannot be completed by code alone; they are represented as deployment provisioning tasks and surfaced through `/ops/readiness`.

## Phase 6 Connectors

- GSC, GA4, PageSpeed, Bing, and CMS live credentials must be stored only in deployment secret storage.
- Live external API calls stay behind `packages/connectors` adapter ports and are disabled by default in tests.
- Connector sync must tolerate partial provider failure and keep provider-level result status for operations review.

## Phase 7 Keyword/AEO

- Live GSC keyword discovery starts from persisted connector sync results, not direct dashboard calls.
- ContentBrief outputs remain draft-only.
- Any LLM explanation or copy assist must be optional and isolated in `packages/ai-core`; it cannot be SEO/AEO truth.

## Phase 8 Schema

- Rich result validation live clients require explicit runtime injection and credentials.
- Dashboard triggers may enqueue validation jobs, but JSON-LD remains a recommendation draft.
- Recheck results should continue closing linked work orders only when deterministic evidence resolves the issue.

## Phase 9 GEO

- Live AI answer providers require provider credentials and connector adapter wiring.
- GEO observation collection should support manual/fixture inputs and live provider batch collection.
- Work order creation can be explicit per report or bulk, but should remain deterministic and idempotent.

## Phase 10 Compliance

- Provider native CMS webhook signatures should be added only for selected providers.
- Live CMS management APIs are read/validation oriented; no compliance flow auto-publishes medical content.
- Rule pack refinement should be reviewed by legal/market owners before production enforcement.

## Phase 11 Production Hardening

- Redis-backed rate limiting requires a Redis provider suitable for shared counters.
- BullMQ Redis must use `noeviction`.
- Observability log drain, alert routing, restore drill scheduler, secret manager executor, and IdP JWKS/issuer/audience are deployment provisioning tasks.
- Backup/restore drills and migration deploy checks must be rehearsed before customer data is onboarded.

## Productization

- External auth/RBAC provider, billing/subscription provider, organization invite flow, tenant isolation E2E, production domain, error monitoring policy, privacy/terms/security docs, and onboarding flow must be completed before public launch.
