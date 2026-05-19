# SearchOps AI

SearchOps AI는 사이트를 크롤링하고, SEO 이슈를 deterministic rule engine으로 분류하고, 실행 가능한 작업 지시서를 만들고, 반영 후 재검수하는 폐쇄 루프를 목표로 하는 모노레포입니다.

## Responsibility Model

- `apps/*`: 실행 앱입니다. UI, API, worker 런타임을 담당하고 핵심 도메인 로직은 `packages/*`로 위임합니다.
- `packages/*`: 재사용 가능한 도메인/인프라 모듈입니다. 각 패키지는 독립 테스트 가능해야 합니다.
- `docs/*`: 제품, 아키텍처, 데이터, API, SEO, 컴플라이언스, 작업 지시서의 기준 문서입니다.
- `scripts/*`: 개발, seed, 테스트 보조 자동화입니다.

## Dependency Rules

Allowed:
- `apps/* -> packages/*`
- `packages/workorders -> packages/seo-core | packages/compliance | packages/types`
- `packages/seo-core -> packages/types`
- `packages/crawler-core -> packages/types`
- `packages/connectors -> packages/types`
- `packages/compliance -> packages/types`

Forbidden:
- `packages/* -> apps/*`
- `packages/seo-core -> packages/ai-core`
- `packages/seo-core -> packages/db`
- `packages/crawler-core -> packages/seo-core`
- `packages/ui -> packages/db | packages/connectors | apps/worker`

## Determinism Contract

The core crawl -> analyze -> workorder -> recheck loop must run without LLM provider access. LLM use is isolated in `packages/ai-core` and is not a dependency of SEO rule execution.