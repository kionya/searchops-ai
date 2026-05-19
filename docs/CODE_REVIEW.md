# Code Review Rules CODE_REVIEW.md

Check the following before approving:

## Architecture
- Does the change stay within the module boundary?
- Does it avoid unnecessary cross-package coupling?
- Are external APIs hidden behind adapters?

## Reliability
- Are failure states handled?
- Are queue jobs idempotent?
- Are retries and timeouts defined?

## Security
- No secrets in code.
- No customer data in fixtures.
- No unsafe shell command execution.
- No unbounded crawler behavior.

## Testing
- Unit tests for rule logic.
- Integration tests for API endpoints.
- Fixture-based tests for external connectors.
- Migration test for DB changes.

## Product Fit
- Does the output map to SEO/AEO/GEO workflow?
- Does it generate actionable work orders, not just reports?