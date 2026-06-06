# Google Connector Live Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Google connector setup safer to verify by showing GSC and GA4 OAuth status separately in the connector dashboard without calling external APIs in tests.

**Architecture:** Reuse the existing API OAuth credential contract, add a small web loader that falls back to deterministic fixtures when the API is unavailable, and render provider-level status beside the existing OAuth start links and provider-specific sync actions.

**Tech Stack:** Next.js App Router, TypeScript, Zod response parsing, Vitest, browser smoke verification.

---

### Task 1: OAuth Status Loader

**Files:**
- Create: `apps/web/src/connector-oauth.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Add web OAuth loader**

Fetch `GET /sites/:siteId/connectors/oauth` when `SEARCHOPS_API_BASE_URL` is configured and parse with `ConnectorOAuthCredentialListResponseSchema`.

- [x] **Step 2: Add fixture fallback**

Return deterministic demo credentials when the API base URL is missing or unreachable.

- [x] **Step 3: Add focused tests**

Cover provider summaries, status labels, API response parsing, and fixture fallback.

### Task 2: Connector Dashboard UI

**Files:**
- Modify: `apps/web/app/sites/[siteId]/connectors/page.tsx`

- [x] **Step 1: Load OAuth status with sync history**

Load connector sync history and OAuth credentials in parallel.

- [x] **Step 2: Render provider-level status**

Show separate GSC and GA4 cards with connected/missing/expired/revoked status, account email, token expiry, and API/fixture source.

- [x] **Step 3: Preserve provider actions**

Keep GSC-only and GA4-only sync buttons visible for provider-by-provider verification.

### Task 3: Verification

**Files:**
- All changed files

- [x] **Step 1: Run focused web checks**

Run:

```bash
corepack pnpm --filter @searchops/web test
corepack pnpm --filter @searchops/web typecheck
corepack pnpm --filter @searchops/web lint
```

- [x] **Step 2: Run browser smoke**

Open `http://localhost:3000/sites/site_demo_rejuel/connectors` and confirm that `Google OAuth 연결`, `GSC`, `GA4`, `연결됨`, `미연결`, and provider-specific sync buttons render.

- [ ] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/connector-oauth.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/connectors/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-google-connector-live-path.md
git commit -m "feat: show Google connector OAuth status"
```
