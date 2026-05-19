# apps/web

Next.js dashboard for crawl results, SEO issues, work orders, and recheck status.

Owns:
- Dashboard routes and screens
- User-facing workflow state
- UI composition using `packages/ui`

Does not own:
- SEO rule logic
- Crawl parsing logic
- Work order generation logic
- Direct worker orchestration