# Billing Specification Draft

Billing is not connected yet. The recommended production path is:

1. Select Stripe or another subscription provider.
2. Define plans around site count, crawl volume, connector sync volume, and team seats.
3. Store customer/subscription ids in the DB only after a migration plan is approved.
4. Enforce entitlements at API route boundaries, not inside deterministic packages.
5. Keep SEO/AEO/GEO/compliance rule execution deterministic regardless of billing provider.

No payment provider SDK or live billing credentials are required for the deterministic MVP.
