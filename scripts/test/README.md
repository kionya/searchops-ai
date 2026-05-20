# scripts/test

Repo-wide verification helpers live here.

## Runtime Smoke

Run the Redis/PostgreSQL crawl loop smoke test with:

```sh
pnpm test:runtime-smoke
```

The script starts local Docker services for PostgreSQL and Redis, applies Prisma migrations,
calls the API crawl-run endpoint, lets the BullMQ worker consume the job, and verifies the
resulting `CrawlRun` and `UrlRecord` rows through Prisma.
