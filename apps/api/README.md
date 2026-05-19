# apps/api

NestJS/Fastify API server for authentication, request validation, persistence access, and queue enqueueing.

Owns:
- HTTP API routes
- Auth/session boundaries
- DTO validation via `packages/types`
- DB access through `packages/db`
- Job enqueueing for `apps/worker`

Does not own:
- SEO issue classification
- Crawler parsing
- LLM prompt logic
- UI concerns