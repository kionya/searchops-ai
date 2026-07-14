# packages/connectors

Adapters for external systems such as Google Search Console, GA4, PageSpeed, Bing, and CMS APIs.

This package owns auth, retries, rate-limit behavior, and response normalization for external services.

## Runtime boundary

- Live external API calls stay disabled by default.
- Connector contracts normalize mock fixtures into shared Zod-validated records from `@searchops/types`.
- Provider support starts with `gsc`, `ga4`, `pagespeed`, `bing`, and `cms`.
- `shouldEnableConnectorLiveRuntime` is the single Worker/readiness live-mode predicate: configured encrypted storage or a Worker PageSpeed key enables live runtime.
- `ConnectorAdapter` defines the async sync port used by fixture and live adapters.
- `syncFixtureConnectors` remains the deterministic fixture path.
- CMS webhook adapters normalize WordPress, Webflow, and generic headless CMS payloads into `CmsContentUpdatedEventRequest` without live CMS fetches or publishing.
- Runtime auth, retries, pagination, and rate limiting stay behind connector adapters.

## Tenant credential ownership

- Google/Bing 계정 credential은 조직별 encrypted `ProviderAccount`에 저장합니다.
- GSC property, 숫자 GA4 Property ID, Bing resource는 사이트별 `SiteConnector` metadata에 저장합니다.
- Worker는 job의 정확한 `organizationId`/`siteId`로 계정과 resource를 해석합니다.
- PageSpeed와 SearchOps-funded GEO key는 Worker 플랫폼 env이고, 고객 GEO BYOK는 조직별 encrypted account입니다.
- 전역 `SEARCHOPS_GA4_PROPERTY_ID`, `SEARCHOPS_BING_API_KEY`, 고객 Google token/service-account JSON은 `dual` mode legacy migration 입력만 허용합니다. 신규 연결에는 사용하지 않고 encrypted cutover 후 제거합니다.

## 운영자 진단 상태

- `ok`: provider 수집이 정상 완료되었습니다.
- `partial`: provider가 일부 데이터만 정규화했거나 run 전체가 일부 완료 상태입니다.
- `failed`: provider API가 요청을 거절했거나 런타임 오류가 발생했습니다. `providerErrors.<provider>.code`와 `nextAction`을 확인합니다.
- `setup_required`: 아직 운영 설정이 없습니다. CMS live connector 미구성, OAuth credential 누락, API key 누락처럼 코드 장애가 아닌 준비 단계입니다.

주요 코드:
- `ga4_property_id_invalid`: 사이트 `SiteConnector`의 GA4 resource가 숫자 Property ID가 아니거나 Data API에서 찾을 수 없습니다.
- `ga4_property_access_denied`: OAuth Google 계정에 해당 GA4 속성 권한이 없습니다.
- `bing_invalid_api_key`: 조직 Bing `ProviderAccount`의 key가 Bing Webmaster Tools에서 유효하지 않습니다.
- `bing_service_unavailable`: Bing Webmaster API 또는 중간 게이트웨이가 5xx/HTML 오류를 반환했습니다. Bing만 잠시 후 재실행합니다.
- `cms_live_connector_not_configured`: CMS webhook 또는 provider-specific CMS adapter 구성이 필요합니다.
