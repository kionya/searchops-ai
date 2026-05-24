# AGENTS.md

## Product
SearchOps AI is a SaaS platform for SEO/AEO/GEO diagnosis, content planning, structured data generation, AI visibility monitoring, and work order automation.

## Stack
- Monorepo: pnpm + Turborepo
- Frontend: Next.js
- API: NestJS or Fastify
- Worker: BullMQ + Redis
- DB: PostgreSQL + Prisma
- Validation: Zod
- Tests: Vitest/Jest + Playwright E2E

## Repo Layout
- apps/web: dashboard UI
- apps/api: REST API
- apps/worker: async jobs
- packages/db: schema and migrations
- packages/seo-core: deterministic SEO rules
- packages/aeo-core: deterministic Keyword/AEO rules
- packages/schema-core: deterministic structured data recommendation rules
- packages/geo-core: deterministic GEO visibility scoring
- packages/crawler-core: crawl and parse logic
- packages/workorders: issue-to-task conversion
- packages/ai-core: LLM provider adapters and prompts
- packages/compliance: medical advertising risk filters

## Non-negotiable Rules
- Do not introduce broad refactors unless explicitly requested.
- Do not access live external APIs unless the task explicitly says so.
- Do not commit secrets, API keys, tokens, or real customer data.
- Use mock fixtures for external data by default.
- SEO issue detection must be deterministic first. LLM may explain or draft, but must not be the only source of truth.
- Keyword/AEO planning must be deterministic first. LLM must not be required for keyword intent, answer-readiness, FAQ gap, or ContentBrief draft generation.
- Schema and GEO monitoring must be deterministic first. LLM must not be required for JSON-LD recommendations, AI visibility scoring, brand mention detection, or owned citation detection.
- Compliance risk detection must be deterministic first. LLM must not be required for medical advertising flags, approval gates, or draft-only publish safeguards.
- ContentBrief output must remain draft-only and must not auto-publish to a CMS or external channel.
- Medical content must never be auto-published. It can only be generated as a draft with compliance flags.

## Done Means
- Code builds.
- Type checks pass.
- Relevant unit tests pass.
- New logic has tests.
- Public APIs have Zod schemas.
- DB changes include migration and seed fixture if needed.
- PR summary explains what changed, how it was tested, and known limitations.

## Commands
- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm dev
- pnpm db:migrate
- pnpm db:seed
