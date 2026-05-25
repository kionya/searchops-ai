# GEO_SPEC.md

Generative engine optimization criteria and structured answer readiness checks live here.

## Phase 7 AEO Readiness V1
AEO readiness is deterministic and rule-based. It uses keyword targets and optional page signals to decide whether a page is ready for answer-engine extraction.

Inputs:
- `KeywordTarget`: site id, phrase, locale, language, country, optional intent, and source.
- `AeoPageSignal`: URL, title, meta description, H1/H2 structure, word count, schema types, question headings, and answer blocks.

Outputs:
- `AeoReadinessReport`: keyword, candidate page URL, status, score, checks, `generatedBy = deterministic`, and evaluated timestamp.
- `AeoReadinessReportRecord`: persisted report history for API/dashboard use.
- `ContentBriefDraft`: draft-only planning artifact generated from keyword, readiness, optional FAQ gaps, and optional page signals.

Readiness checks:
- `KEYWORD_INTENT_DEFINED`: keyword intent is explicit or inferred by deterministic lexicon rules.
- `ANSWER_SUMMARY_PRESENT`: page has a direct answer block, or at least fallback summary evidence.
- `QUESTION_COVERAGE`: page covers question-led headings or answer blocks.
- `FAQ_SCHEMA_PRESENT`: FAQPage schema exists when FAQ-style content is present.
- `STRUCTURED_HEADINGS`: page has a primary heading and supporting H2 structure.
- `CITABLE_SOURCE_PRESENT`: page can serve as a citable source with URL, title, and primary heading evidence.
- `CONTENT_DEPTH`: page has enough supporting content for the query.

Status thresholds:
- `ready`: score >= 80.
- `needs_work`: score >= 50 and < 80.
- `not_ready`: score < 50.

Non-goals for Phase 7:
- No LLM usage for readiness, scoring, or ContentBrief generation.
- No automatic publishing to CMS or external channels.
- No live connector-driven keyword discovery.
- FAQ gap generation is deterministic and can be produced from Keyword/AEO inputs without LLM usage.

## Phase 9 GEO Visibility Monitor V1
GEO visibility monitoring is deterministic and input-driven. It evaluates stored answer observations from AI/search surfaces and does not call an LLM, browser, or live provider.

Inputs:
- `GeoTarget`: site id, brand name, owned domain, locale, and market.
- `GeoAnswerObservation`: provider, query, locale, answer text, cited URLs, observed timestamp, and source.

Outputs:
- `GeoVisibilityReport`: status, score, mention rate, owned citation rate, competitor citation rate, query/provider counts, citations, checks, `generatedBy = deterministic`, and evaluated timestamp.
- `GeoVisibilityReportRecord`: persisted report history for API/dashboard use.
- `WorkOrderDraft`: deterministic improvement or maintenance task generated from a persisted GEO visibility report.

Visibility checks:
- `BRAND_MENTIONED`: answer text mentions the brand name or owned domain.
- `OWNED_URL_CITED`: cited URLs include the owned domain or subdomain.
- `QUERY_COVERAGE`: observations cover at least three distinct queries.
- `PROVIDER_DIVERSITY`: observations cover at least two providers.
- `COMPETITOR_CITATION_RISK`: non-owned citations stay below the risk threshold.

Status thresholds:
- `strong`: score >= 75.
- `visible`: score >= 50 and < 75.
- `weak`: score >= 25 and < 50.
- `not_visible`: score < 25.

Work order mapping:
- `not_visible` reports map to `p0`, large effort work orders.
- `weak` reports map to `p1`, medium effort work orders.
- `visible` reports map to `p2`, medium effort work orders.
- `strong` reports map to `p3`, small effort maintenance work orders.
- Work order instructions are selected from failed or warning visibility checks only; no LLM is used.
- Converting the same report is idempotent through `WorkOrder.geoVisibilityReportId`.

Non-goals for Phase 9:
- No LLM usage for visibility scoring, provider classification, or citations.
- No live AI provider scraping or external connector fetch in tests.
- No automatic content publishing or CMS updates.
- No claim/compliance approval automation.
