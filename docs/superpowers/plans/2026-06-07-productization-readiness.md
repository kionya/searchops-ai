# Productization Readiness Plan

Date: 2026-06-07

## Scope

Complete the code-owned Task 11 productization pass without connecting live IdP, billing, DNS, email, customer, or legal systems.

## Completed Steps

- Add shared productization readiness Zod contracts.
- Add `GET /ops/productization` with deterministic Auth/RBAC, tenant isolation, invite, billing, domain, legal, and onboarding status.
- Keep launch readiness honest: provider provisioning and manual policy decisions remain non-launchable until configured.
- Add `/ops/productization` dashboard with API/fixture fallback.
- Add `/onboarding` fixture-safe first-run flow for site, crawl, issues, work orders, optional connectors, and billing/team follow-up.
- Update roadmap, launch checklist, architecture, onboarding, and billing docs.

## Verification

- Focused API server tests for `/ops/productization`.
- Focused web foundation tests for productization and onboarding helpers.
- Full verification to be run before commit.
