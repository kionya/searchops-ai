# API_SPEC.md

## Phase 1 API
The API app exposes health, mock auth context, Organization CRUD entrypoints, and Site CRUD entrypoints.

## Routes
- `GET /health`
- `GET /auth/context`
- `GET /organizations`
- `POST /organizations`
- `GET /organizations/:organizationId/sites`
- `POST /organizations/:organizationId/sites`
- `GET /sites/:siteId`
- `PATCH /sites/:siteId`
- `DELETE /sites/:siteId`

## Contract Rule
Public APIs must use Zod schemas from `packages/types` or schemas colocated with the API boundary and exported through shared types when reused.

## Auth Stub
Phase 1 uses mock auth headers only:
- `x-mock-user-id`
- `x-mock-organization-id`

If the headers are absent, the API falls back to the Phase 1 seed user context.