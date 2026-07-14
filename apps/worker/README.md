# apps/worker

BullMQ worker runtime for crawl, analyze, generate, and recheck jobs.

Owns:
- Queue processors
- Job orchestration
- Retry/failure handling at runtime boundaries
- Composing crawler, SEO, compliance, work order, connector, and DB packages

Does not own:
- SEO rule definitions
- Compliance rule definitions
- Work order templates
- API route behavior

## Live connector environment

Worker live runtime은 encrypted credential storage mode 또는 Worker 플랫폼 `SEARCHOPS_PAGESPEED_API_KEY`가 있을 때 활성화됩니다. 고객별 값은 환경변수가 아니라 작업의 `organizationId`와 `siteId`로 조회합니다.

- GSC/GA4: 조직 Google `ProviderAccount`의 암호화 OAuth payload와 사이트 `SiteConnector`의 GSC property/숫자 GA4 Property ID를 사용합니다.
- Bing: 조직 Bing `ProviderAccount`의 암호화 API key와 사이트 resource binding을 사용합니다.
- Google token refresh: Railway Worker의 `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID`, `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET`는 API OAuth 앱과 같은 플랫폼 값입니다.
- PageSpeed: `SEARCHOPS_PAGESPEED_API_KEY`는 SearchOps-funded Worker 플랫폼 key이며 선택 사항입니다.
- GEO: SearchOps-funded 플랫폼 key/model 또는 암호화된 조직 BYOK를 사용합니다.
- CMS: webhook secret은 API가 소유하며 Worker에 넣지 않습니다.

`SEARCHOPS_GA4_PROPERTY_ID`, `SEARCHOPS_BING_API_KEY`, 고객 Google access token/service-account JSON은 `dual` mode의 legacy migration 입력일 뿐입니다. 새 조직이나 사이트는 이 전역 env를 사용하지 않으며 encrypted cutover와 7일 zero observed legacy 확인 뒤 제거합니다.

전체 Worker env 목록은 `scripts/dev/worker.env.example`과 `docs/PROVISIONING_RUNBOOK.md`를 기준으로 합니다. 실제 secret은 Railway에만 넣고 코드, fixture, 문서, 스크린샷, Git에 남기지 않습니다.
