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

## Local Mac Setup

Use Node 22 through `.nvmrc`, then run commands through Corepack so the repo uses `pnpm@9.15.9`.

```sh
corepack enable
corepack prepare pnpm@9.15.9 --activate
corepack pnpm install --frozen-lockfile
```

Start local PostgreSQL and Redis with Docker:

```sh
docker compose up -d
```

The default local values are documented in `.env.example`. This repo does not auto-load `.env` for API or worker processes, so export the runtime values in your shell before starting them:

```sh
export DATABASE_URL="postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public"
export REDIS_URL="redis://localhost:6379"
export SEARCHOPS_API_BASE_URL="http://localhost:4000"
```

Then apply migrations and seed fixtures:

```sh
corepack pnpm db:migrate:deploy
corepack pnpm db:seed
```

Run the services in three terminal tabs. Long-running `dev` commands must remain open while testing.

Terminal 1, API:

```sh
cd /Users/kionya/searchops-ai
export DATABASE_URL="postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public"
export REDIS_URL="redis://localhost:6379"
export PORT=4000
export SEARCHOPS_API_HOST="127.0.0.1"
corepack pnpm --filter @searchops/api dev
```

Terminal 2, worker:

```sh
cd /Users/kionya/searchops-ai
export DATABASE_URL="postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public"
export REDIS_URL="redis://localhost:6379"
corepack pnpm --filter @searchops/worker dev
```

Terminal 3, web:

```sh
cd /Users/kionya/searchops-ai
export SEARCHOPS_API_BASE_URL="http://localhost:4000"
export SEARCHOPS_PUBLIC_APP_URL="http://localhost:3000"
corepack pnpm --filter @searchops/web dev
```

Use the local doctor when a page action fails or a port is already in use:

```sh
corepack pnpm check:local-dev
```

If connector sync says the API server should be checked, the usual cause is that web is running on `3000` but API is not listening on `4000`.

Run `corepack pnpm test:runtime-smoke` after Docker Desktop is running to verify PostgreSQL, Redis, API enqueueing, worker consumption, and Prisma persistence together.
