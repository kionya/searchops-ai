# Schema Validation UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators trigger rich-result validation from schema recommendation rows while keeping work-order creation and deterministic recheck actions visible together.

**Architecture:** Reuse the existing `POST /schema-recommendations/:id/rich-result-validation-jobs` queue API, add a web helper and server action, and render the action beside work-order/recheck controls. The web and API handler only enqueue typed jobs and do not call live validator APIs.

**Tech Stack:** Next.js App Router server actions, TypeScript, Zod response parsing, Vitest, Playwright smoke verification.

---

### Task 1: Rich Result Queue Helper

**Files:**
- Modify: `apps/web/src/schema-recommendations.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Add queue helper**

POST to `POST /schema-recommendations/:id/rich-result-validation-jobs` and parse `QueueSchemaRichResultValidationResponseSchema`.

- [x] **Step 2: Add fixture fallback**

Return a deterministic fixture status when `SEARCHOPS_API_BASE_URL` is absent.

- [x] **Step 3: Add focused tests**

Cover queue API contract, job id feedback, and fixture fallback.

### Task 2: Schema Dashboard Action

**Files:**
- Modify: `apps/web/app/sites/[siteId]/schema/actions.ts`
- Modify: `apps/web/app/sites/[siteId]/schema/page.tsx`

- [x] **Step 1: Add server action**

Queue rich-result validation and redirect with status, recommendation id, and job id.

- [x] **Step 2: Render action with work-order controls**

Show `Rich result 검증` beside `작업 지시서 생성` and `재검수` for actionable recommendation rows.

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

Open `http://localhost:3000/sites/site_demo_rejuel/schema` and confirm that `작업 지시서 생성`, `재검수`, and `Rich result 검증` render together for schema recommendation rows.

- [ ] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/schema-recommendations.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/schema/actions.ts' 'apps/web/app/sites/[siteId]/schema/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-schema-validation-ux.md
git commit -m "feat: add schema rich result validation action"
```
