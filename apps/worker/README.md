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

자사 데이터 파이프라인을 live mode로 운영할 때 worker에는 provider별 secret만 환경변수로 주입합니다. 값은 코드나 fixture에 넣지 않습니다.

- GA4: `SEARCHOPS_GA4_PROPERTY_ID`는 숫자 Property ID를 사용합니다. 측정 ID(`G-...`)나 GTM ID(`GTM-...`)가 아닙니다.
- Bing: `SEARCHOPS_BING_API_KEY`는 Bing Webmaster Tools API Access에서 발급한 키입니다. `InvalidApiKey`는 코드 장애가 아니라 이 환경변수와 Bing 키의 설정 문제입니다.
- PageSpeed: `SEARCHOPS_PAGESPEED_API_KEY`가 필요합니다.
- Google OAuth refresh: `SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID`, `SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET`가 필요합니다.
- CMS: live fetch adapter는 아직 미구성입니다. webhook 기반 수집은 API 런타임의 `SEARCHOPS_CMS_WEBHOOK_SECRETS`로 설정합니다.
