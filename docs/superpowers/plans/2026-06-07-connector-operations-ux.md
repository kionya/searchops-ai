# Connector Operations UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make connector operations easier to triage by showing provider-level retry actions, partial failures, setup-required states, and next-action guidance in the dashboard.

**Architecture:** Derive operations guidance from existing connector sync history and provider error metadata. Keep the API contract unchanged, render a provider operations table, and reuse the existing one-provider sync action.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Playwright smoke verification.

---

### Task 1: Provider Operations Guidance

**Files:**
- Modify: `apps/web/src/connector-sync-history.ts`
- Modify: `apps/web/src/korean-labels.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Add operation summary helper**

Summarize GSC, GA4, PageSpeed, Bing, and CMS into latest status, latest run, record count, message, next action, tone, and retry label.

- [x] **Step 2: Split provider error metadata**

Expose provider error `code`, operator message, and `nextAction` separately while preserving the existing concatenated message helper.

- [x] **Step 3: Add focused tests**

Cover ok, partial, not-run, and setup-required provider guidance.

### Task 2: Dashboard Operations Table

**Files:**
- Modify: `apps/web/app/sites/[siteId]/connectors/page.tsx`

- [x] **Step 1: Render operations table**

Show provider, status, latest run, record count, guidance, next action, and a one-provider retry button.

- [x] **Step 2: Keep existing history details**

Preserve recent sync run and provider result detail tables for auditability.

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

Open `http://localhost:3000/sites/site_demo_rejuel/connectors` and confirm that `Provider 운영 상태`, `Bing 미실행`, `CMS 일부 완료`, and provider row retry buttons render.

- [ ] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/connector-sync-history.ts apps/web/src/korean-labels.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/connectors/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-connector-operations-ux.md
git commit -m "feat: add connector operations guidance"
```
