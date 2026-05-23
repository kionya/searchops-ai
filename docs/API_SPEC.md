# API_SPEC.md

## Phase 1 API
The API app exposes health, mock auth context, Organization CRUD entrypoints, and Site CRUD entrypoints.

## Phase 2 API
The first crawler API boundary creates a crawl run and enqueues a crawl job. It does not perform live URL fetching inside the API process.

## Phase 4 API
The work board API lists work orders for a site, allows board fields to be updated, queues work order rechecks, and records deterministic resolution after a successful recheck.

## Phase 6 API
The connector sync API creates connector sync runs, enqueues connector jobs, lists sync history, and reads persisted provider results. It does not call live external provider APIs inside the API process.

## Routes
- `GET /health`
- `GET /auth/context`
- `GET /organizations`
- `POST /organizations`
- `GET /organizations/:organizationId/sites`
- `POST /organizations/:organizationId/sites`
- `GET /sites/:siteId`
- `GET /sites/:siteId/work-orders`
- `PATCH /sites/:siteId`
- `DELETE /sites/:siteId`
- `POST /sites/:siteId/crawl-runs`
- `GET /work-orders/:workOrderId`
- `PATCH /work-orders/:workOrderId`
- `POST /work-orders/:workOrderId/recheck`
- `POST /work-orders/:workOrderId/resolve`
- `POST /sites/:siteId/connector-sync-runs`
- `GET /sites/:siteId/connector-sync-runs`
- `GET /connector-sync-runs/:connectorSyncRunId`

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

## Connector Sync Runs
`POST /sites/:siteId/connector-sync-runs` accepts:
- `providers` optional provider list. Defaults to `gsc`, `ga4`, `pagespeed`, `bing`, and `cms`.
- `mode` optional sync mode. Defaults to deterministic fixture sync until live adapters are explicitly configured.

The response is `202 Accepted` with:
- `connectorSyncRun` in `queued` status.
- `job` containing the connector sync payload that the worker can process.

`GET /sites/:siteId/connector-sync-runs` returns `ConnectorSyncRunListResponse` for the site's persisted sync history.

`GET /connector-sync-runs/:connectorSyncRunId` returns `ConnectorSyncRunDetailResponse` with persisted provider results.

Connector sync APIs use the same mock auth context as the rest of the API. Live external API calls stay behind `packages/connectors` adapter ports and are disabled by default; fixture adapters remain the default test and local-development behavior.

## Work Orders
`GET /sites/:siteId/work-orders` returns `WorkOrderListResponse`.

`GET /work-orders/:workOrderId` returns a single `WorkOrder`.

`PATCH /work-orders/:workOrderId` accepts:
- `status` optional board status.
- `priority` optional P0-P3 priority.
- `assignedTo` optional user id or null.
- `dueDate` optional ISO datetime or null.

`POST /work-orders/:workOrderId/recheck` accepts:
- `startUrl` optional HTTP URL. Defaults to the work order evidence URL, then `https://{site.domain}/`.
- `maxPages` optional integer from 1 to 10. Defaults to 1.

The recheck URL must stay within the work order site's domain or subdomains. The response is `202 Accepted` with the updated `workOrder`, queued `crawlRun`, and crawl `job`.

`POST /work-orders/:workOrderId/resolve` marks the work order `done` and marks the linked SEO issue `resolved` when one exists.
