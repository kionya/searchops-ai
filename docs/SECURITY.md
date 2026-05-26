# Security Policy Draft

## Secrets

- Store production secrets only in Vercel, Railway, Supabase, or the selected secret manager.
- Do not commit tokens, private keys, customer data, or provider payload dumps.
- Rotate exposed credentials immediately.

## Runtime Controls

- API authentication should use trusted IdP headers or verified bearer tokens.
- HS256 and RS256/JWKS verification are supported at the API runtime boundary.
- Tenant-scoped routes must deny cross-organization access.
- BullMQ Redis should run with `maxmemory-policy noeviction`.

## Reporting

Security issues should be triaged by the project owner before public disclosure. This draft should be finalized before production launch.
