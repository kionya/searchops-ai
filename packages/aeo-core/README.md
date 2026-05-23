# packages/aeo-core

Deterministic Keyword/AEO rule logic.

This package must not call LLM providers, databases, network APIs, or connector adapters. It accepts typed inputs from `@searchops/types` and returns deterministic readiness outputs that can be unit tested independently.

ContentBrief draft mapping also stays here while it is a pure issue/signal-to-draft transformation. Persistence and publishing remain outside this package.
