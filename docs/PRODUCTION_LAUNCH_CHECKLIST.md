# Production Launch Checklist

This checklist tracks the remaining SearchOps AI work from Phase 6 through product launch. Items that require external accounts, tokens, DNS, billing setup, or legal review cannot be completed by code alone; they are represented as deployment provisioning tasks and surfaced through `/ops/readiness`.

## Phase 6 Connectors

- [ ] API and Worker use the same `dual`/`encrypted` storage mode and active/previous encryption keyring; Vercel has none of these values.
- [ ] Google OAuth client ID/secret/redirect/state are on Railway API; the same client ID/secret are on Railway Worker for refresh.
- [ ] Organization Google/Bing/GEO credentials exist only as encrypted `ProviderAccount` payloads.
- [ ] Each site has the exact GSC property, numeric GA4 Property ID, and verified Bing resource in `SiteConnector` metadata.
- [ ] No new customer or site depends on global GA4 Property ID, global Bing key, customer access token, or service-account JSON env.
- [ ] PageSpeed and SearchOps-funded GEO keys remain optional Worker platform credentials.
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

- Organization BYOK takes precedence over optional SearchOps-funded Worker platform keys and is decrypted only for the provider call.
- GEO observation collection should support manual/fixture inputs and live provider batch collection.
- Work order creation can be explicit per report or bulk, but should remain deterministic and idempotent.

## Phase 10 Compliance

- Provider native CMS webhook signatures should be added only for selected providers.
- Live CMS management APIs are read/validation oriented; no compliance flow auto-publishes medical content.
- Rule pack refinement should be reviewed by legal/market owners before production enforcement.

## Phase 11 Production Hardening

- [ ] A restorable Supabase backup is verified before the credential schema migration/backfill.
- [ ] Migration status/deploy/status and credential migrate/rotate dry-runs are recorded.
- [ ] Deployment order is API, Worker, then Web.
- [ ] `legacyFallbacks=0` and no sync summary uses `credentialSources.*=legacy` before encrypted cutover.
- [ ] Encrypted mode is observed for at least seven days with zero fallback and no unexpected refresh/decryption error.
- [ ] Rollback keeps both API and Worker in `dual`; plaintext legacy table removal requires a separate plan and explicit approval.
- Redis-backed rate limiting is wired in the API runtime and requires a Redis provider suitable for shared counters.
- BullMQ Redis must use `noeviction`.
- Observability log drain, alert routing, restore drill scheduler, secret manager executor, and IdP JWKS/issuer/audience remain deployment provisioning tasks.
- GitHub Actions migration-gate validates Prisma migrations against temporary PostgreSQL; the production deploy pipeline should keep the same status/deploy/status sequence.
- Backup/restore drills must be rehearsed against a scratch restore database before customer data is onboarded.

## Productization

- `/ops/productization` must show no launch-blocking provisioning gaps before public launch.
- External auth/RBAC provider and production domain require deployment env provisioning.
- Billing/subscription provider and organization invite delivery require provider and policy decisions before customer onboarding.
- Tenant isolation API coverage, privacy/terms/security docs, and fixture-safe onboarding surface are implemented, but live smoke accounts and legal review remain release checklist evidence.
