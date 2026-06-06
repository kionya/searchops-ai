# PageSpeed Live Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators validate PageSpeed live setup and the PageSpeed-only sync path safely before using real external API calls.

**Architecture:** Reuse the existing `GET /ops/connector-live-setup` report, add a web loader that parses the public report contract and falls back to deterministic fixture data, and render the PageSpeed check beside the provider-specific sync actions.

**Tech Stack:** Next.js App Router, TypeScript, Zod response parsing, Vitest, Playwright smoke verification.

---

### Task 1: Live Setup Loader

**Files:**
- Create: `apps/web/src/connector-live-setup.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Add report loader**

Fetch `GET /ops/connector-live-setup` when `SEARCHOPS_API_BASE_URL` is configured and parse with `ConnectorLiveSetupReportSchema`.

- [x] **Step 2: Add PageSpeed fixture fallback**

Return deterministic PageSpeed setup-required data when the API base URL is missing or unavailable.

- [x] **Step 3: Add focused tests**

Cover PageSpeed check extraction, status labels, API response parsing, and fixture fallback.

### Task 2: Connector Dashboard UI

**Files:**
- Modify: `apps/web/app/sites/[siteId]/connectors/page.tsx`

- [x] **Step 1: Load setup report with connector data**

Load sync history, Google OAuth status, and connector live setup status in parallel.

- [x] **Step 2: Render PageSpeed setup status**

Show PageSpeed status, required env key name, next action, and API/fixture source without secret values.

- [x] **Step 3: Preserve PageSpeed-only action**

Keep `PageSpeed만 실행` available for provider-level live sync verification.

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

Open `http://localhost:3000/sites/site_demo_rejuel/connectors` and confirm that `PageSpeed live setup`, `SEARCHOPS_PAGESPEED_API_KEY`, `설정 필요`, and `PageSpeed만 실행` render with no console warnings or errors.

- [ ] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/connector-live-setup.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/connectors/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-pagespeed-live-path.md
git commit -m "feat: show PageSpeed live setup status"
```
