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
- No automatic FAQ gap generation beyond the current contract and mapper input support.
