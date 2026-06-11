# Easy Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a beginner-friendly setup guide that turns launch-readiness data into plain next actions.

**Architecture:** Add one focused mapping module in `apps/web/src/easy-setup.ts`, then use it in `/onboarding`, `/sites`, and `/ops/readiness`. The existing readiness and productization APIs remain the source of truth; the new module only changes presentation and grouping.

**Tech Stack:** Next.js App Router, React server components, TypeScript, Vitest, existing SearchOps CSS utilities.

---

### Task 1: Easy Setup Data Model

**Files:**
- Create: `apps/web/src/easy-setup.ts`
- Modify: `apps/web/src/foundation.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that import `createEasySetupGuide`, `summarizeEasySetupGuide`, and `formatEasySetupGroupTitle`. Use `createDemoOperationalReadinessDashboard()` and `createDemoProductizationDashboard()` as inputs. Verify the guide has `available_now`, `connect_before_launch`, and `decide_later` groups, and that beginner-facing labels do not contain raw env keys such as `SEARCHOPS_`.

- [ ] **Step 2: Run focused test**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: FAIL because `./easy-setup` does not exist.

- [ ] **Step 3: Implement `apps/web/src/easy-setup.ts`**

Create types:

```ts
export type EasySetupGroupId = "available_now" | "connect_before_launch" | "decide_later";
export type EasySetupTone = "ready" | "warning" | "info";

export interface EasySetupStep {
  readonly actionLabel: string;
  readonly description: string;
  readonly href: string;
  readonly id: string;
  readonly reason: string;
  readonly title: string;
  readonly tone: EasySetupTone;
}

export interface EasySetupGroup {
  readonly description: string;
  readonly id: EasySetupGroupId;
  readonly steps: readonly EasySetupStep[];
  readonly title: string;
}
```

Implement:

- `createEasySetupGuide({ readiness, productization })`
- `summarizeEasySetupGuide(groups)`
- `formatEasySetupGroupTitle(id)`

Mapping rules:

- Always include available steps for site registration, first crawl, URL review, SEO issue review, and work orders.
- Readiness/productization items with `needs_provisioning` become `connect_before_launch`.
- Items with `manual_followup` become `decide_later`.
- Items with `configured` or `ready` are not repeated unless they are part of the always-available first-use flow.

- [ ] **Step 4: Run focused test**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: PASS for new tests and existing web foundation tests.

### Task 2: Onboarding Page Becomes Easy Setup

**Files:**
- Modify: `apps/web/app/onboarding/page.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that verify easy setup summary counts use `summarizeEasySetupGuide()` and that `available_now` appears before `connect_before_launch`.

- [ ] **Step 2: Update page**

Change `/onboarding` to load both readiness and productization dashboards, create the easy setup guide, and render:

- top metric cards for progress
- three grouped sections
- each step as a compact card with action button
- API/fixture source label

- [ ] **Step 3: Run focused tests**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: PASS.

### Task 3: Sites Page Next Action Panel

**Files:**
- Modify: `apps/web/app/sites/page.tsx`

- [ ] **Step 1: Add page-level data**

Load operational readiness and productization data with the existing loaders and derive `createEasySetupGuide()`.

- [ ] **Step 2: Render compact helper panel**

Add a panel beside the site registration form that shows:

- `지금 할 일`
- next available action
- first launch blocker count
- links to `/onboarding` and `/ops/readiness`

- [ ] **Step 3: Run focused tests**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: PASS.

### Task 4: Readiness Page Plain Summary

**Files:**
- Modify: `apps/web/app/ops/readiness/page.tsx`

- [ ] **Step 1: Add easy summary above the technical table**

Use `createEasySetupGuide()` and `summarizeEasySetupGuide()` to render a plain-language summary before the existing category cards and technical table.

- [ ] **Step 2: Preserve advanced detail**

Keep the existing detailed table unchanged under an "고급 상세" heading.

- [ ] **Step 3: Run focused tests**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: PASS.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run web focused test**

Run: `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts`

Expected: PASS.

- [ ] **Step 2: Run repo verification**

Run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Expected: all commands exit 0.

- [ ] **Step 3: Browser verification**

Start web/API if needed and open:

- `http://localhost:3000/onboarding`
- `http://localhost:3000/sites`
- `http://localhost:3000/ops/readiness`

Expected: the beginner setup sections render without overlapping text, and the technical readiness table remains available.
