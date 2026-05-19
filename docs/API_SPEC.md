# API_SPEC.md

## Phase 1 API
The API app exposes health, mock auth context, Organization CRUD entrypoints, and Site CRUD entrypoints.

## Phase 2 API
The first crawler API boundary creates a crawl run and enqueues a crawl job. It does not perform live URL fetching inside the API process.

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
- `POST /sites/:siteId/crawl-runs`

## Contract Rule
Public APIs must use Zod schemas from `packages/types` or schemas colocated with the API boundary and exported through shared types when reused.

## Auth Stub
Phase 1 uses mock auth headers only:
- `x-mock-user-id`
- `x-mock-organization-id`

If the headers are absent, the API falls back to the Phase 1 seed user context.

## Crawl Runs
`POST /sites/:siteId/crawl-runs` accepts:
- `startUrl` optional HTTP URL. Defaults to `https://{site.domain}/`.
- `maxPages` optional integer from 1 to 100. Defaults to 25.

The response is `202 Accepted` with:
- `crawlRun` in `queued` status.
- `job` containing the deterministic crawl payload that the worker can process.
