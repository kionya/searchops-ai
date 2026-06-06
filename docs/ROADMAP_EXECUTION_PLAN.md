# SearchOps AI Roadmap Execution Plan

Updated: 2026-06-07

This checklist continues from the current deterministic MVP. Work must stay inside `/Users/kionya/searchops-ai` and GitHub `kionya/searchops-ai`.

## Guardrails

- Keep SEO/AEO/GEO/compliance truth deterministic-first.
- Do not call live external APIs in tests.
- Store real credentials only in local/deployment env, never in code, fixtures, docs, commits, or screenshots.
- Keep ContentBrief, JSON-LD, and medical content draft-only. Do not add CMS auto-publish flows.
- Validate each implementation with focused tests before moving to the next item.

## Execution Order

| Order | Workstream | Target Outcome | Status |
|---:|---|---|---|
| 1 | Connector live setup verification | Local/deploy env can be checked safely without external API calls or secret disclosure. | Done |
| 2 | Local dev execution polish | API/worker/web startup and common failure states are documented or scripted. | Done |
| 3 | Google connector live path | Google OAuth, GSC, and GA4 setup can be validated provider-by-provider. | Done |
| 4 | PageSpeed live path | PageSpeed API key setup and single-provider sync path are validated. | Done |
| 5 | Connector operations UX | Provider-level retry, partial failure, setup-required, and next-action guidance are clearer in the dashboard. | Done |
| 6 | Keyword/AEO from connector data | Persisted GSC results drive keyword discovery and ContentBrief draft flow more clearly. | Next |
| 7 | Schema validation UX | Rich-result validation can be triggered from schema recommendation screens and linked to work orders. | Pending |
| 8 | GEO observation/batch UX | Manual/fixture/live observations, batch report generation, and bulk work-order preview are designed and implemented. | Pending |
| 9 | Compliance hardening | KR medical rule pack refinement workflow and selected CMS native signatures are added without auto-publish. | Pending |
| 10 | Production hardening | Redis rate limit wiring, observability, alerts, dead-letter replay polish, restore drill, and migration gates are completed. | Pending |
| 11 | Productization | Auth/RBAC, tenant isolation E2E, invite flow, billing, production domain, onboarding, and legal docs are completed. | Pending |

## Current Task 1 Acceptance Criteria

- [x] `corepack pnpm check:connector-live` reports fixture mode safety when live credentials are absent and local runtime env is present.
- [x] `corepack pnpm check:connector-live -- --deployment --require-live` fails safely until at least one live provider is fully configured.
- [x] `GET /ops/connector-live-setup` returns a Zod-validated report with no secret values.
- [x] Partial Google OAuth, non-numeric GA4 property IDs, and malformed CMS webhook secret JSON are blocked before live connector sync.
- [x] Focused typecheck, lint, tests, and root `corepack pnpm verify` pass.

## Current Task 3 Acceptance Criteria

- [x] Connector dashboard shows GSC and GA4 OAuth status separately.
- [x] OAuth credential status uses the API contract when the API is configured and fixture data otherwise.
- [x] The dashboard keeps GSC-only and GA4-only sync actions visible beside setup state.
- [x] Focused web tests, typecheck, lint, and browser verification pass before moving to PageSpeed work.

## Current Task 4 Acceptance Criteria

- [x] Connector dashboard shows PageSpeed live setup status from `GET /ops/connector-live-setup`.
- [x] PageSpeed status falls back to deterministic fixture data when the API base URL is absent or unavailable.
- [x] PageSpeed API key requirements are shown without exposing any secret value.
- [x] The PageSpeed-only sync action remains visible next to setup state.
- [x] Focused web tests, typecheck, lint, and browser verification pass before moving to connector operations UX.

## Current Task 5 Acceptance Criteria

- [x] Connector dashboard shows provider-level operations guidance for GSC, GA4, PageSpeed, Bing, and CMS.
- [x] Provider status includes latest run, record count, partial failure, setup-required, and not-run states.
- [x] Provider error metadata is split into operator message and next action instead of only concatenated text.
- [x] Each provider row offers a one-provider retry action.
- [x] Focused web tests, typecheck, lint, and browser verification pass before moving to Keyword/AEO work.
