# API_SPEC.md

## Phase 1 API

The API app exposes health, mock auth context, Organization CRUD entrypoints, and Site CRUD entrypoints.

## Phase 2 API

The first crawler API boundary creates a crawl run and enqueues a crawl job. It does not perform live URL fetching inside the API process.

## Phase 4 API

The work board API lists work orders for a site, allows board fields to be updated, queues work order rechecks, and records deterministic resolution after a successful recheck.

## Phase 6 API

The connector sync API creates connector sync runs, enqueues connector jobs, lists sync history, and reads persisted provider results. It does not call live external provider APIs inside the API process.

## Phase 7 API

The ContentBrief API creates deterministic draft-only content briefs from Keyword/AEO signals and reads persisted draft history. It does not call LLM providers or publish to a CMS.

The AEO readiness API computes deterministic readiness reports from keyword and page signals, persists them, and reads report history for dashboard use.

## Phase 10 API

The Compliance API evaluates deterministic medical advertising risk rules, persists ComplianceFlag history, updates review status, converts open flags into legal-review WorkOrders, rechecks revised draft copy, and accepts CMS content update events that trigger deterministic rechecks for matching active flags. It does not call LLM providers, live CMS APIs, or publish medical content.

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
- `POST /sites/:siteId/aeo-readiness-reports`
- `GET /sites/:siteId/aeo-readiness-reports`
- `POST /sites/:siteId/content-briefs`
- `GET /sites/:siteId/content-briefs`
- `GET /content-briefs/:contentBriefId`
- `POST /sites/:siteId/compliance-reviews`
- `POST /sites/:siteId/cms/content-updated-events`
- `POST /sites/:siteId/cms/webhooks/:cmsType`
- `GET /sites/:siteId/closed-loop-audit-events`
- `GET /sites/:siteId/compliance-flags`
- `PATCH /compliance-flags/:complianceFlagId`
- `POST /compliance-flags/:complianceFlagId/work-order`
- `POST /compliance-flags/:complianceFlagId/recheck`

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

## AEO Readiness Reports

`POST /sites/:siteId/aeo-readiness-reports` accepts:

- `keyword` required phrase and optional locale/language/country/intent/source.
- `keywordId` optional existing keyword id.
- `candidatePage` optional AEO page signal.
- `evaluatedAt` optional ISO datetime used for deterministic scoring.

The API computes readiness through `packages/aeo-core`, persists the report, and returns `CreateAeoReadinessReportResponse` with:

- `report`, the persisted `AeoReadinessReportRecord`.
- `readinessReport`, the deterministic report before persistence mapping.

`GET /sites/:siteId/aeo-readiness-reports` returns `AeoReadinessReportListResponse` ordered by latest evaluated report first.

AEO readiness persistence uses deterministic rules only. It does not call `packages/ai-core`, LLM providers, live connector APIs, or CMS publishing adapters.

## Content Briefs

`POST /sites/:siteId/content-briefs` accepts:

- `keyword` required phrase and optional locale/language/country/intent/source.
- `keywordId` optional existing keyword id.
- `candidatePage` optional AEO page signal.
- `readinessReport` optional deterministic AEO readiness report.
- `faqGapSet` optional deterministic FAQ gap set.
- `evaluatedAt` optional ISO datetime used when the API computes readiness.

If `readinessReport` is absent, the API computes deterministic readiness through `packages/aeo-core`. The response is `201 Created` with:

- `contentBrief`, the persisted draft row.
- `draft`, the deterministic `ContentBriefDraft` mapper output.
- `readinessReport`, the deterministic report used for the draft.

`GET /sites/:siteId/content-briefs` returns `ContentBriefListResponse`.

`GET /content-briefs/:contentBriefId` returns `ContentBriefDetailResponse`.

Content brief creation is draft-only. The API persists `status = draft`, `generationMode = deterministic`, and `publishPolicy = draft_only`; it does not publish to CMS or call `packages/ai-core`.

## Compliance Reviews

`POST /sites/:siteId/compliance-reviews` accepts `CreateComplianceReviewRequest`:

- `siteId` must match the route site.
- `subjectType`, `subjectId`, `url`, `locale`, `industry`, `title`, `text`, `publishState`, and `source` describe the reviewed draft.
- `evaluatedAt` optionally fixes the deterministic evaluation timestamp.

If `url` is present, it must stay within the site domain or subdomains. The API evaluates the draft through `packages/compliance`, persists returned flags, and returns `CreateComplianceReviewResponse` with:

- `report`, the deterministic compliance report.
- `complianceFlags`, the persisted flag rows.

`GET /sites/:siteId/compliance-flags` returns `ComplianceFlagListResponse` ordered by latest flag first.

`PATCH /compliance-flags/:complianceFlagId` accepts `UpdateComplianceFlagRequest` for review status updates such as `approved`, `dismissed`, or `resolved`.

`POST /compliance-flags/:complianceFlagId/work-order` creates or updates an idempotent legal-review work order and links it back to the compliance flag through `workOrderId`.

`POST /compliance-flags/:complianceFlagId/recheck` accepts `RecheckComplianceFlagRequest`:

- `text` is the revised draft copy to review.
- `url`, `title`, `locale`, `industry`, `publishState`, `source`, and `evaluatedAt` are optional overrides.

The API rebuilds the review input from the flag and site, validates any URL override against the site domain/subdomains, evaluates deterministic compliance rules, and returns `RecheckComplianceFlagResponse` with:

- `report`, the deterministic recheck report including selected `rulePackId`.
- `resolved`, true when the original flag's `ruleId` no longer appears.
- `complianceFlag`, updated to `resolved`, `open`, or `in_review`.
- `workOrder`, the linked WorkOrder updated to `done` when resolved or reopened to `in_review` if a completed task still fails.

Compliance APIs preserve `draft_only` policy and never publish medical content.

`POST /sites/:siteId/cms/content-updated-events` accepts `CmsContentUpdatedEventRequest`:

- `siteId` must match the route site.
- `provider` and `source` default to `cms`.
- `cmsType`, `externalId`, `url`, `title`, `text`, `status`, `locale`, `industry`, and `updatedAt` describe the content that was changed by the CMS.

When webhook secrets are configured, the request must include `CmsWebhookSignatureHeaders`:

- `x-searchops-cms-type`: the provider key used to select the provider-specific secret.
- `x-searchops-timestamp`: ISO datetime used for replay protection.
- `x-searchops-signature`: `sha256=` HMAC over the timestamp plus canonical normalized event payload.

The event URL must stay within the registered site domain or subdomains. The API does not fetch from the live CMS; it treats the payload as the source of truth for this event. Active ComplianceFlags match when their `subjectId` equals the CMS `externalId` or their `url` equals the event URL. Each matching flag with a `ruleId` is rechecked through the deterministic compliance engine, linked WorkOrders are closed when resolved, and the response is `CmsContentUpdatedEventResponse` with `matchedFlagCount`, `skippedFlagCount`, and `rechecks`.

`POST /sites/:siteId/cms/webhooks/:cmsType` accepts provider-specific CMS webhook payloads for `wordpress`, `webflow`, and `headless`. `packages/connectors` normalizes the provider payload into the same `CmsContentUpdatedEventRequest`, then the API applies the same signature verification, site URL scoping, compliance recheck, and response contract. The route still does not fetch from or publish to a live CMS.

CMS-triggered rechecks write closed-loop audit events for the received CMS update, each compliance recheck, resolved flags, and completed linked WorkOrders. `GET /sites/:siteId/closed-loop-audit-events` returns `ClosedLoopAuditEventListResponse` ordered by newest event first for operator review and debugging.

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
