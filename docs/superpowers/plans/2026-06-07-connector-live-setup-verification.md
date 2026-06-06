# Connector Live Setup Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe local/deployment connector live setup verification path that detects env wiring problems without calling external APIs or exposing secrets.

**Architecture:** Add a Zod-validated public report contract in `packages/types`, generate the deterministic report inside `apps/api`, expose it through an ops endpoint, and provide a root `pnpm` helper for local/deployment checks. The report only returns env key names, statuses, summaries, and next actions.

**Tech Stack:** TypeScript, Zod, Fastify, Vitest, tsx, pnpm.

---

### Task 1: Public Report Contract

**Files:**
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/index.test.ts`

- [x] **Step 1: Add `ConnectorLiveSetupReportSchema`**

Define environment, status, area, check, summary, and report schemas near operational readiness schemas.

- [x] **Step 2: Add schema validation test**

Validate a minimal report with `liveExternalApis`, fixture-mode safety, check list, and status counts.

- [x] **Step 3: Run type package tests**

Run: `corepack pnpm --filter @searchops/types test`
Expected: PASS.

### Task 2: API Report Generator And Endpoint

**Files:**
- Create: `apps/api/src/connector-live-setup.ts`
- Test: `apps/api/src/connector-live-setup.test.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/server.test.ts`

- [x] **Step 1: Add deterministic report generator**

Check runtime DB/Redis env, web/API URL env, Google OAuth env completeness, GSC, GA4, PageSpeed, Bing, CMS, and worker live-mode gate.

- [x] **Step 2: Add focused unit tests**

Cover fixture-mode safety, partial OAuth/GA4 blockers, and fully configured live provider readiness.

- [x] **Step 3: Expose `GET /ops/connector-live-setup`**

Return the report from current `process.env` and current time.

- [x] **Step 4: Add server test**

Assert the endpoint responds and does not include raw secret strings.

- [x] **Step 5: Run API tests**

Run: `corepack pnpm --filter @searchops/types build && corepack pnpm --filter @searchops/api test`
Expected: PASS.

### Task 3: Developer Command And Docs

**Files:**
- Create: `apps/api/src/connector-live-setup-cli.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `scripts/dev/README.md`
- Modify: `docs/API_SPEC.md`
- Create: `docs/ROADMAP_EXECUTION_PLAN.md`

- [x] **Step 1: Add CLI report command**

Support text output, `--json`, `--deployment`, and `--require-live`.

- [x] **Step 2: Add root script**

Run: `corepack pnpm check:connector-live`.

- [x] **Step 3: Document optional env without blank parsed values**

Keep optional connector env examples commented so `parseSearchOpsEnv` does not reject blank strings.

- [x] **Step 4: Add roadmap execution checklist**

Track all remaining workstreams in execution order.

- [x] **Step 5: Run CLI checks**

Run:

```bash
corepack pnpm check:connector-live
corepack pnpm check:connector-live -- --json
```

Expected: no secret values; fixture mode safe with local DB/Redis env.

### Task 4: Verification

**Files:**
- All changed files

- [x] **Step 1: Run focused build/typecheck/test/lint**

Run:

```bash
corepack pnpm --filter @searchops/types test
corepack pnpm --filter @searchops/types build
corepack pnpm --filter @searchops/api test
corepack pnpm --filter @searchops/api typecheck
corepack pnpm --filter @searchops/api lint
corepack pnpm check:connector-live
```

Expected: PASS.

- [x] **Step 2: Inspect git diff**

Run: `git diff --stat && git diff --check`
Expected: no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add .env.example package.json packages/types/src/index.ts packages/types/src/index.test.ts apps/api/src/connector-live-setup.ts apps/api/src/connector-live-setup-cli.ts apps/api/src/connector-live-setup.test.ts apps/api/src/server.ts apps/api/src/server.test.ts scripts/dev/README.md docs/API_SPEC.md docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-connector-live-setup-verification.md
git commit -m "feat: add connector live setup verification"
```
