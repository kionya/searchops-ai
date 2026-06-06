# Local Dev Execution Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local SearchOps API/worker/web startup failures easy to diagnose without changing external services or reading secrets.

**Architecture:** Add a root `check:local-dev` helper that checks env presence, localhost ports, and API `/health`. Update local setup docs to show the three required long-running terminals and the exact failure mode for connector sync when API is down.

**Tech Stack:** TypeScript, Node net/http modules, pnpm scripts, Markdown docs.

---

### Task 1: Local Dev Doctor

**Files:**
- Create: `scripts/dev/local-dev-doctor.ts`
- Modify: `package.json`

- [x] **Step 1: Add doctor script**

Check `DATABASE_URL`, `REDIS_URL`, `SEARCHOPS_API_BASE_URL`, local ports `3000`, `4000`, `5432`, `6379`, and API `/health`.

- [x] **Step 2: Add root command**

Run: `corepack pnpm check:local-dev`

### Task 2: Local Setup Docs

**Files:**
- Modify: `README.md`
- Modify: `scripts/dev/README.md`
- Modify: `docs/ROADMAP_EXECUTION_PLAN.md`

- [x] **Step 1: Split API/worker/web into three terminal commands**

Clarify that long-running `dev` commands remain open while testing.

- [x] **Step 2: Document doctor outputs**

Explain API-down, port-closed, Docker-down, and worker-no-port cases.

- [x] **Step 3: Run checks**

Run:

```bash
corepack pnpm check:local-dev
DATABASE_URL="postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public" REDIS_URL="redis://localhost:6379" SEARCHOPS_API_BASE_URL="http://localhost:4000" corepack pnpm check:local-dev -- --json
```

Expected: commands complete; strict mode fails only when required local services/env are missing.

### Task 3: Verification

**Files:**
- All changed files

- [x] **Step 1: Run focused docs/script verification**

Run:

```bash
corepack pnpm check:local-dev
git diff --check
```

- [x] **Step 2: Commit**

```bash
git add README.md package.json scripts/dev/README.md scripts/dev/local-dev-doctor.ts docs/ROADMAP_EXECUTION_PLAN.md docs/superpowers/plans/2026-06-07-local-dev-execution-polish.md
git commit -m "chore: add local dev startup doctor"
```
