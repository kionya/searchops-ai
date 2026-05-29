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

## 운영자 진단 상태

- `ok`: provider 수집이 정상 완료되었습니다.
- `partial`: provider가 일부 데이터만 정규화했거나 run 전체가 일부 완료 상태입니다.
- `failed`: provider API가 요청을 거절했거나 런타임 오류가 발생했습니다. `providerErrors.<provider>.code`와 `nextAction`을 확인합니다.
- `setup_required`: 아직 운영 설정이 없습니다. CMS live connector 미구성, OAuth credential 누락, API key 누락처럼 코드 장애가 아닌 준비 단계입니다.

주요 코드:
- `ga4_property_id_invalid`: `SEARCHOPS_GA4_PROPERTY_ID`가 숫자 Property ID가 아니거나 Data API에서 찾을 수 없습니다.
- `ga4_property_access_denied`: OAuth Google 계정에 해당 GA4 속성 권한이 없습니다.
- `bing_invalid_api_key`: Railway worker의 `SEARCHOPS_BING_API_KEY`가 Bing Webmaster Tools에서 유효하지 않습니다.
- `cms_live_connector_not_configured`: CMS webhook 또는 provider-specific CMS adapter 구성이 필요합니다.
