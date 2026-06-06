# GEO Observation Batch UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GEO fixture report creation, provider batch observation queueing, and work-order candidate preview visible from the GEO dashboard without calling live external providers from the web app.

**Architecture:** Reuse `POST /sites/:siteId/geo-answer-monitor-jobs` for typed queue registration and `POST /geo-visibility-reports/:id/work-order` for row-level work-order creation. Web helpers parse all queue and work-order responses through shared Zod contracts and fall back to deterministic fixture mode when `SEARCHOPS_API_BASE_URL` is absent.

**Tech Stack:** Next.js App Router server actions, TypeScript, Zod response parsing, Vitest, Playwright smoke verification.

---

### Task 1: GEO Queue And Preview Helpers

**Files:**
- Modify: `apps/web/src/geo-visibility-dashboard.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Add answer monitor queue helper**

Build a deterministic queue request from fixture-derived queries and provider selections, POST it to `/sites/:siteId/geo-answer-monitor-jobs`, and parse `QueueGeoAnswerMonitorResponseSchema`.

- [x] **Step 2: Add fixture fallback**

Return a fixture status with default providers and query count when the API base URL is absent, without calling external provider APIs.

- [x] **Step 3: Add work-order batch preview**

Summarize all non-strong GEO reports as work-order candidates with priority, reason, failing checks, and report ids.

- [x] **Step 4: Add focused tests**

Cover request construction, queue API contract parsing, fixture fallback, feedback, and strong-report exclusion in the preview.

### Task 2: GEO Dashboard UX

**Files:**
- Modify: `apps/web/app/sites/[siteId]/geo/actions.ts`
- Modify: `apps/web/app/sites/[siteId]/geo/page.tsx`

- [x] **Step 1: Add queue server action**

Queue answer monitor jobs and redirect with monitor status, provider list, query count, and job id when available.

- [x] **Step 2: Separate fixture and queue controls**

Keep fixture report creation as a distinct action and add provider checkbox controls for batch queue registration.

- [x] **Step 3: Render work-order preview and source details**

Show a candidate preview section for non-strong reports and add observation source visibility to the detail table.

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

Open `http://localhost:3000/sites/site_demo_rejuel/geo` on desktop and mobile viewports. Confirm that fixture report creation, provider queue controls, work-order candidate preview, and observation source columns render.

- [x] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/geo-visibility-dashboard.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/geo/actions.ts' 'apps/web/app/sites/[siteId]/geo/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-geo-observation-batch-ux.md
git commit -m "feat: add geo observation batch ux"
```
