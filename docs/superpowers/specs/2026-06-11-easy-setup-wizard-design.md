# Easy Setup Wizard Design

## Goal

Make SearchOps AI easier to use by replacing technical launch-readiness language with a simple operator flow: what works now, what must be connected before launch, and what can wait.

## Problem

The current `/ops/readiness` and `/ops/productization` screens expose correct information, but they read like engineering checklists. Users see terms such as credential, JWKS, log drain, provider provisioning, and manual follow-up before they understand what action to take. This makes the product feel harder than it is.

## Product Approach

Add a user-facing setup layer on top of the existing deterministic readiness data. The existing technical pages remain available for advanced operations. The new layer does not call external providers, does not store secrets, and does not change SEO/AEO/GEO/compliance truth logic.

## User Flow

1. User opens Onboarding or Sites.
2. User sees a plain-language setup guide with three groups:
   - `지금 바로 가능`: register a site, run a crawl, review URLs, review SEO issues, create work orders.
   - `출시 전 연결 필요`: GSC, GA4, PageSpeed, Bing, CMS, auth, production domain, monitoring.
   - `나중에 결정`: billing, invite policy, AI draft assist, bulk GEO automation, legal review.
3. Each item shows one clear action button, a short reason, and where the action leads.
4. Users can still open `/ops/readiness` for the full technical table.

## Architecture

Create a focused web module `apps/web/src/easy-setup.ts` that maps existing operational readiness and productization data into beginner-friendly setup steps. This module owns labels, grouping, progress scoring, and recommended actions. Pages use this module rather than duplicating readiness mapping logic.

Update `/onboarding` to become the primary easy setup page. Add a compact easy setup panel to `/sites` so users can understand the next step before or after registering a site. Add a simplified summary to `/ops/readiness` above the existing detailed table.

## Data Flow

- `/onboarding` loads `loadOperationalReadiness()` and `loadProductizationDashboard()`.
- `createEasySetupGuide()` converts those reports into `EasySetupGroup[]`.
- If API is unavailable, the existing fixture fallback still works.
- No secret values are displayed. Env keys appear only in advanced detail text.

## UI Requirements

- Use plain Korean labels.
- Avoid showing raw env keys in the beginner panels.
- Use existing SearchOps shell, cards, buttons, and status pill styles.
- Keep cards at 8px radius to match the current design system.
- Do not create a marketing landing page; this is an operator setup tool.
- Keep advanced technical detail accessible through `/ops/readiness`.

## Testing

Add unit tests in `apps/web/src/foundation.test.ts` for:

- Mapping readiness/productization reports into the three simple groups.
- Computing progress counts and launch blocker counts.
- Hiding raw env keys from beginner step labels.
- Preserving API/fixture fallback behavior through the existing loaders.

## Non-Goals

- Do not connect live external APIs in this change.
- Do not implement billing, Auth provider provisioning, or DNS automation.
- Do not store secrets or edit deployment provider settings.
- Do not remove existing `/ops/readiness` or `/ops/productization` technical screens.

## Acceptance Criteria

- `/onboarding` reads as a practical setup guide, not a technical checklist.
- `/sites` gives a user a clear next action after site registration.
- `/ops/readiness` starts with a plain-language summary before the technical table.
- `corepack pnpm --filter @searchops/web test -- src/foundation.test.ts` passes.
- Full repo `lint`, `typecheck`, and `test` pass before completion.
