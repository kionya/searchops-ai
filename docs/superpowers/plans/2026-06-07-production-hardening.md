# Production Hardening Plan

Date: 2026-06-07

## Scope

Complete the Task 10 production-hardening pass without live external provider calls or secret usage.

## Completed Steps

- Wire API runtime rate limiting to Redis through a direct `ioredis` dependency when rate limiting is enabled.
- Return explicit `503 rate_limit_store_unavailable` responses when the configured rate-limit store fails.
- Add deterministic migration deployment gate plan contract and API route.
- Add GitHub Actions `migration-gate` using a temporary PostgreSQL service.
- Add dead-letter replay-plan UI that shows blocked source-of-truth payload requirements without auto-requeueing metadata-only entries.
- Add operations hardening dashboard for backup/restore drill plans, dry-run dispatch, and migration gate steps.
- Add operations hub linking readiness, observability, dead-letter, and hardening screens.
- Update readiness and runbooks to distinguish implemented code paths from deployment provisioning tasks.

## Verification

- Focused API tests for rate-limit, Redis adapter, operations hardening, and server routes.
- Focused web foundation tests for dead-letter replay plan and operations hardening dashboard helpers.
- Full verification to be run before commit.
