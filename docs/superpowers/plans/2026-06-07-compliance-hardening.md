# Compliance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic KR medical rule pack refinement workflow and selected CMS native webhook signature verification while preserving draft-only medical content safeguards and avoiding live CMS/API calls in tests.

**Architecture:** Keep compliance risk detection inside `packages/compliance`, expose refinement workflow metadata without adding LLM or network dependencies, and extend API webhook security so provider-specific CMS webhook routes can accept SearchOps HMAC or selected native provider signatures. The API still normalizes provider payloads, scopes URLs to the site, rechecks deterministic compliance flags, and never publishes content.

**Tech Stack:** TypeScript, Fastify route boundary, deterministic HMAC helpers, Vitest, Next.js App Router dashboard smoke verification.

---

### Task 1: KR Medical Rule Pack Workflow

**Files:**
- Modify: `packages/compliance/src/index.ts`
- Test: `packages/compliance/src/index.test.ts`
- Modify: `apps/web/src/compliance-dashboard.ts`
- Test: `apps/web/src/foundation.test.ts`
- Modify: `apps/web/app/sites/[siteId]/compliance/page.tsx`

- [x] **Step 1: Add package-level refinement plan**

Return deterministic refinement metadata for `kr-medical`, including rule coverage, phrase refinement, legal owner approval, and draft-only publish gate stages.

- [x] **Step 2: Keep owner approval explicit**

Mark legal owner review as `needs_owner` so rule pack changes do not imply legal approval.

- [x] **Step 3: Surface dashboard workflow**

Show KR rule pack hardening, native signature providers, draft-only gate, and legal review queue status on the compliance dashboard.

### Task 2: Selected CMS Native Signatures

**Files:**
- Modify: `apps/api/src/webhook-security.ts`
- Test: `apps/api/src/webhook-security.test.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/server.test.ts`

- [x] **Step 1: Add WordPress and Webflow native verifier**

Support provider-specific timestamp/signature headers for WordPress and Webflow webhook payloads, using deterministic HMAC and replay-window checks.

- [x] **Step 2: Restrict native fallback to provider webhook routes**

Keep normalized `/cms/content-updated-events` on SearchOps HMAC only. Allow native fallback only for `/cms/webhooks/:cmsType`, where the API has the original provider payload.

- [x] **Step 3: Preserve no-publish behavior**

Provider webhook handling still normalizes payloads, scopes URLs, rechecks compliance flags, and never fetches from or publishes to live CMS systems.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/API_SPEC.md`
- Modify: `docs/COMPLIANCE_SPEC.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ROADMAP_EXECUTION_PLAN.md`
- Modify: `docs/RUNBOOKS.md`
- Modify: `apps/api/src/readiness.ts`

- [x] **Step 1: Update specs and readiness**

Document selected native signature headers, KR refinement workflow, and remaining manual owner approval.

- [x] **Step 2: Run focused checks**

Run:

```bash
corepack pnpm --filter @searchops/compliance test
corepack pnpm --filter @searchops/compliance typecheck
corepack pnpm --filter @searchops/compliance lint
corepack pnpm --filter @searchops/api test -- --run src/webhook-security.test.ts src/server.test.ts
corepack pnpm --filter @searchops/api typecheck
corepack pnpm --filter @searchops/api lint
corepack pnpm --filter @searchops/web test
corepack pnpm --filter @searchops/web typecheck
corepack pnpm --filter @searchops/web lint
```

- [x] **Step 3: Run browser smoke, full verification, and commit**

Run:

```bash
corepack pnpm --filter @searchops/web dev
# open http://localhost:3000/sites/site_demo_rejuel/compliance
corepack pnpm verify
git diff --check
git add packages/compliance/src/index.ts packages/compliance/src/index.test.ts apps/api/src/webhook-security.ts apps/api/src/webhook-security.test.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/api/src/readiness.ts apps/web/src/compliance-dashboard.ts apps/web/src/foundation.test.ts 'apps/web/app/sites/[siteId]/compliance/page.tsx' docs/API_SPEC.md docs/COMPLIANCE_SPEC.md docs/ROADMAP.md docs/ROADMAP_EXECUTION_PLAN.md docs/RUNBOOKS.md docs/superpowers/plans/2026-06-07-compliance-hardening.md
git commit -m "feat: harden compliance workflow and cms signatures"
```
