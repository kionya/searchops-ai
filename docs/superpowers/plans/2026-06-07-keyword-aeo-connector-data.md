# Keyword AEO Connector Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make persisted GSC connector results drive deterministic keyword discovery and draft-only ContentBrief creation more clearly in the content dashboard.

**Architecture:** Reuse the existing keyword discovery API. Add a web action and helper for `POST /sites/:siteId/keyword-discoveries`, recommend the latest GSC connector sync run from persisted sync history, and add row-level draft brief creation forms for discovered keywords.

**Tech Stack:** Next.js App Router server actions, TypeScript, Zod response parsing, Vitest, Playwright smoke verification.

---

### Task 1: Discovery Action Helper

**Files:**
- Modify: `apps/web/src/keyword-aeo-dashboard.ts`
- Test: `apps/web/src/foundation.test.ts`

- [x] **Step 1: Find latest GSC sync run**

Select the latest connector sync run with persisted GSC records.

- [x] **Step 2: Add keyword discovery POST helper**

Parse form input with `CreateKeywordDiscoveryRequestSchema`, post to `POST /sites/:siteId/keyword-discoveries`, and parse `CreateKeywordDiscoveryResponseSchema`.

- [x] **Step 3: Keep fixture fallback deterministic**

When `SEARCHOPS_API_BASE_URL` is absent, return deterministic GSC fixture candidates without calling external APIs.

### Task 2: Content Dashboard Flow

**Files:**
- Modify: `apps/web/app/sites/[siteId]/content/actions.ts`
- Modify: `apps/web/app/sites/[siteId]/content/page.tsx`

- [x] **Step 1: Add server action**

Add a keyword discovery server action that redirects with candidate count and top keyword feedback.

- [x] **Step 2: Render GSC discovery form**

Show the latest GSC sync run, min impressions, max candidates, and a `GSC 후보 갱신` action.

- [x] **Step 3: Link discoveries to draft briefs**

Add a row-level `초안 생성` action that submits discovered keyword, intent, and candidate URL into the existing draft-only ContentBrief flow.

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

Open `http://localhost:3000/sites/site_demo_rejuel/content` and confirm that `GSC 기반 키워드 발견`, `sync_demo_003`, `GSC 후보 갱신`, and discovery-row `초안 생성` actions render on desktop and mobile without horizontal overflow.

- [ ] **Step 3: Run full verification and commit**

Run:

```bash
corepack pnpm verify
git diff --check
git add apps/web/src/keyword-aeo-dashboard.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/content/actions.ts' 'apps/web/app/sites/[siteId]/content/page.tsx' docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-keyword-aeo-connector-data.md
git commit -m "feat: connect GSC keyword discovery to content drafts"
```
