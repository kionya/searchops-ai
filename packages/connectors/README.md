# packages/connectors

Adapters for external systems such as Google Search Console, GA4, PageSpeed, Bing, and CMS APIs.

This package owns auth, retries, rate-limit behavior, and response normalization for external services.

## CDX-060 boundary

- Live external API calls stay disabled by default.
- Connector contracts normalize mock fixtures into shared Zod-validated records from `@searchops/types`.
- Provider support starts with `gsc`, `ga4`, `pagespeed`, `bing`, and `cms`.
- `ConnectorAdapter` defines the async sync port that future live adapters will implement.
- `fixtureConnectorAdapters` provides the current deterministic adapter registry.
- `syncFixtureConnectors` runs fixture adapters in canonical provider order and returns a batch summary.
- CMS webhook adapters normalize WordPress, Webflow, and generic headless CMS payloads into `CmsContentUpdatedEventRequest` without live CMS fetches or publishing.
- Runtime auth, retries, pagination, and rate limiting are future adapter work; tests use fixtures only.
