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