# Billing Specification Draft

Billing is not connected yet. The recommended production path is:

1. Select Stripe or another subscription provider.
2. Define plans around site count, crawl volume, connector sync volume, and team seats.
3. Store customer/subscription ids in the DB only after a migration plan is approved.
4. Enforce entitlements at API route boundaries, not inside deterministic packages.
5. Keep SEO/AEO/GEO/compliance rule execution deterministic regardless of billing provider.

No payment provider SDK or live billing credentials are required for the deterministic MVP.

Current productization boundary:

- `/ops/productization` reports billing as `manual_followup` until the provider and entitlement policy are selected.
- The dashboard does not load a payment SDK and the API does not call live billing provider APIs.
- Entitlement enforcement should be added at API route boundaries after subscription identifiers are added through an approved DB migration.
