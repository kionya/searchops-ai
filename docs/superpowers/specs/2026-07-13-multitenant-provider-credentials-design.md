# Multi-tenant provider credentials design

Date: 2026-07-13
Status: Approved design, pending written-spec review

## 1. Objective

Replace worker-global customer credentials with a multi-tenant model that separates:

1. SearchOps platform secrets managed in Railway.
2. Organization-owned provider accounts.
3. Site-specific provider resources and configuration.

The design must support multiple organizations, multiple provider accounts per organization, and different GSC, GA4, and Bing resources per site. Stored OAuth tokens and customer API keys must be encrypted at rest. Queue payloads, logs, API responses, fixtures, and dead-letter records must never contain raw credentials.

## 2. Scope

### In scope

- Organization-scoped Google and Bing provider accounts.
- Organization-scoped GEO BYOK accounts for ChatGPT, Claude, Gemini, and Perplexity.
- Site-scoped GSC, GA4, and Bing resource bindings.
- Shared platform PageSpeed and SearchOps-funded GEO keys.
- AES-256-GCM application-level credential encryption.
- Versioned encryption-key rotation.
- Google OAuth migration from `ConnectorOAuthCredential`.
- Per-job worker credential resolution.
- Tenant-safe API and web management surfaces.
- Expand, backfill, cutover, and contract deployment stages.

### Not in scope

- External AWS, GCP, or HashiCorp KMS provisioning.
- Customer-specific PageSpeed keys.
- Per-site GEO keys. Customer GEO BYOK is organization-scoped.
- Automatic CMS publishing or medical-content publishing.
- Automatic discovery of every provider resource during the initial migration. Existing resources are preserved without live provider calls.
- Bing OAuth. The initial version stores an organization-owned Bing Webmaster API key; the model can add Bing OAuth later without changing site bindings.

## 3. Architectural decision

Use normalized organization accounts plus site bindings.

- `ProviderAccount` owns provider identity, non-secret metadata, and encrypted credentials.
- `SiteConnector` binds one site/provider pair to an organization account and external resource.
- Platform-managed keys remain deployment secrets and are never copied into customer rows.
- Workers resolve credentials after receiving a job. Jobs contain identifiers only.

Directly storing every secret on every site was rejected because it duplicates credentials and makes rotation and revocation unsafe. Storing only external secret-manager references was deferred because no external KMS is currently provisioned.

## 4. Data model

### 4.1 ProviderAccount

`ProviderAccount` represents an account or BYOK credential owned by one organization.

Required fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable provider-account ID |
| `organizationId` | Tenant owner |
| `provider` | `google`, `bing`, `geo_chatgpt`, `geo_claude`, `geo_gemini`, or `geo_perplexity` |
| `authType` | `oauth2` or `api_key` |
| `externalAccountId` | Stable provider identity, such as Google `sub`; nullable for migrated legacy rows |
| `accountEmail` | Display metadata only |
| `displayName` | Operator-friendly label |
| `status` | `connected`, `expired`, `revoked`, or `invalid` |
| `scopes` | Granted OAuth scopes, with no token values |
| `tokenExpiresAt` | Access-token expiry metadata |
| `credentialCiphertext` | Base64 AES-GCM ciphertext |
| `credentialIv` | Base64 96-bit random IV |
| `credentialAuthTag` | Base64 GCM authentication tag |
| `encryptionKeyId` | Key version used for this row |
| `encryptionVersion` | Credential envelope format version, initially `1` |
| `isDefault` | Organization default for a GEO provider |
| `legacyCredentialId` | Idempotent migration source ID; nullable and unique |
| `connectedByUserId` | Audit actor |
| `connectedAt` | Initial connection time |
| `createdAt` / `updatedAt` | Audit timestamps |

Canonical provider accounts are unique by `(organizationId, provider, externalAccountId)` when `externalAccountId` is present. A database partial unique index permits at most one `isDefault=true` account per organization and GEO provider.

The encrypted plaintext is a versioned JSON payload.

OAuth example:

```json
{
  "accessToken": "secret",
  "refreshToken": "secret-or-null",
  "tokenType": "Bearer"
}
```

API-key example:

```json
{
  "apiKey": "secret"
}
```

No repository method used by API response construction may select the credential ciphertext, IV, or authentication tag. Secret-bearing repository methods are worker- or credential-service-only interfaces.

### 4.2 SiteConnector

`SiteConnector` binds a site to a provider account and external resource.

| Field | Purpose |
| --- | --- |
| `id` | Stable binding ID |
| `organizationId` | Tenant boundary and query index |
| `siteId` | SearchOps site |
| `provider` | `gsc`, `ga4`, or `bing` |
| `providerAccountId` | Account used for authorization |
| `externalResourceId` | Exact provider resource |
| `config` | Non-secret connector configuration |
| `status` | `connected`, `needs_configuration`, `expired`, `revoked`, or `error` |
| `lastErrorCode` | Normalized non-secret error code |
| `lastCheckedAt` | Last credential/resource verification time |
| `createdAt` / `updatedAt` | Audit timestamps |

The unique key is `(siteId, provider)`. Database-level composite foreign keys enforce that `SiteConnector.organizationId`, the site organization, and the provider-account organization match. Application checks are still required but are not the only tenant boundary.

Resource formats:

- GSC: exact Search Console property, such as `sc-domain:example.com` or `https://example.com/`.
- GA4: normalized `properties/<numeric-id>`.
- Bing: exact verified Webmaster site URL.

PageSpeed needs no `SiteConnector` row because it uses the site's public URL and a platform API key. GEO BYOK defaults are organization-scoped `ProviderAccount` rows and do not require a site binding in this version.

## 5. Credential encryption

### 5.1 Runtime configuration

API and Worker receive the same Railway secrets. Vercel does not receive decryption keys.

```env
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID=v1
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON={}
```

`SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON` is a JSON object from key ID to base64 key. Production startup fails closed when credential storage is enabled and the active key is missing, malformed, not 32 bytes, or duplicated inconsistently in the previous-key map.

### 5.2 Cryptographic contract

- Algorithm: AES-256-GCM.
- IV: 12 random bytes for every encryption operation. IVs are never reused intentionally.
- Authentication data: `searchops:provider-account:v1:<organizationId>:<providerAccountId>:<provider>`.
- Encoding: base64 for ciphertext, IV, and authentication tag.
- Plaintext: UTF-8 JSON validated by an auth-type-specific Zod schema before encryption and after decryption.
- Decryption failure: generic `credential_decryption_failed`; cryptographic details are never returned or logged.

Binding organization, account, and provider into authenticated additional data prevents a valid encrypted payload from being copied to another tenant or provider row.

## 6. API design

### 6.1 Organization accounts

```text
GET    /organizations/:organizationId/provider-accounts
POST   /organizations/:organizationId/provider-accounts/:provider/api-key
PATCH  /organizations/:organizationId/provider-accounts/:id
PUT    /organizations/:organizationId/provider-accounts/:id/credential
DELETE /organizations/:organizationId/provider-accounts/:id

GET    /organizations/:organizationId/provider-accounts/google/oauth/start
GET    /connectors/google/oauth/callback
```

List and mutation responses contain account metadata only. Raw keys, OAuth tokens, ciphertext, IVs, tags, and key IDs are not exposed. Deleting an account referenced by a site returns `409 account_in_use`; unlinking the site is a separate action.

`PATCH` changes non-secret metadata only. `PUT .../credential` atomically replaces an API-key credential after encrypting it. The previous encrypted payload is not returned or retained in application tables.

Google OAuth retrieves a verified account identifier and email from Google's user-info endpoint using the returned access token. It upserts by `(organizationId, google, sub)`. Reauthorization preserves an existing refresh token when Google omits a replacement.

Before replacing a canonical Google account credential, the API computes the scopes required by every attached connector plus the connectors selected in the current flow. If the new token does not contain that complete scope set, the update fails with `scope_missing` and the existing encrypted credential remains unchanged. A reconnect must never silently remove access required by another site.

### 6.2 Site bindings

```text
GET    /sites/:siteId/connectors
PUT    /sites/:siteId/connectors/:provider
DELETE /sites/:siteId/connectors/:provider
```

Example binding request:

```json
{
  "providerAccountId": "pa_google_123",
  "externalResourceId": "properties/111111111"
}
```

The API rejects cross-organization account IDs even if a caller knows the ID. Removing a binding does not remove the shared account.

### 6.3 Authorization

- `owner`, `admin`, and `system`: create, replace, revoke, and delete provider accounts; create and remove site bindings.
- `editor`: run connector syncs but cannot mutate credentials or bindings.
- `viewer`: read metadata and sync results only.

Credential mutation routes require an end-user principal. The current web helper's fixed service-owner JWT cannot authorize these routes. Web server actions must forward the authenticated user's JWT, and service tokens must carry `token_use=service` so the API can reject them on secret-management routes.

## 7. Web experience

### 7.1 Organization integrations

An organization integration view lists reusable Google, Bing, and GEO BYOK accounts. Secret values are never redisplayed. API-key replacement requires entering a complete new value. The UI displays provider, masked account label, connection status, scopes, expiry, and number of attached sites.

### 7.2 Site connectors

Each site connector view provides:

- Google account selection or connection.
- Exact GSC property input/selection.
- Exact GA4 property ID input/selection.
- Bing account and verified-site selection.
- PageSpeed shown as platform-managed.
- GEO providers shown as organization BYOK or SearchOps-funded.
- Provider-specific readiness and sync actions.

Connect, save, replace, disconnect, and sync actions have pending and disabled states. Raw provider errors are normalized before display.

## 8. Worker resolution

Queue payloads retain only `organizationId`, `siteId`, provider names, timestamps, and job IDs. They never contain credentials.

For each connector-sync job the Worker:

1. Confirms the job organization matches the persisted site organization.
2. Loads `SiteConnector` rows for requested providers.
3. Confirms each referenced account belongs to that organization.
4. Decrypts credentials immediately before adapter creation.
5. Uses each connector's exact external resource ID.
6. Writes provider-specific results and normalized status.
7. Keeps plaintext only in process memory for the adapter call and never persists or logs it.

Google token refresh is account-scoped. A distributed lock keyed by provider-account ID prevents simultaneous refreshes from multiple site jobs. After acquiring the lock, the Worker rereads the row, refreshes only when still necessary, and writes a newly encrypted payload.

GEO adapters are resolved per job rather than once at Worker startup. Resolution order is organization BYOK, SearchOps platform key, then `account_missing`. PageSpeed always uses the platform key and site URL. Bing uses its site-bound organization account after the legacy transition ends.

In live mode, missing, invalid, or undecryptable credentials produce an explicit provider failure. Live runs never silently emit fixture records. Fixture behavior remains available only in explicit fixture mode.

## 9. Error contract

Normalized provider configuration codes:

```text
account_missing
connector_missing
scope_missing
credential_expired
credential_revoked
resource_access_denied
provider_rate_limited
credential_decryption_failed
```

One provider failure does not stop other providers in the same batch. `ProviderAccount` and `SiteConnector` status metadata is updated without storing response bodies or secrets. Logs include organization, site, provider, account ID, error code, and request correlation ID only.

## 10. Existing-data migration

### 10.1 Storage mode

```env
SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual
```

`dual` means new encrypted rows are preferred, with legacy reads as fallback. New writes are encrypted-only. This is intentionally not a dual-write mode: writing fresh secrets back into plaintext legacy columns would extend the security exposure being removed. Rollback during this window uses a forward-compatible application rollback, not an old binary that requires new plaintext writes.

After validation:

```env
SEARCHOPS_CREDENTIAL_STORAGE_MODE=encrypted
```

`encrypted` disables all legacy credential reads. Production refuses to start in either mode without a valid encryption key.

### 10.2 Backfill command

```bash
corepack pnpm credentials:migrate -- --dry-run
corepack pnpm credentials:migrate -- --apply --batch-size=100
```

For each legacy `ConnectorOAuthCredential` row, the command:

1. Checks for an existing `ProviderAccount.legacyCredentialId`.
2. Validates organization and site ownership.
3. Encrypts the access token, refresh token, and token type.
4. Creates one legacy Google `ProviderAccount` for that source row.
5. Creates or updates the matching GSC or GA4 `SiteConnector`.
6. Records counts and IDs only.

Legacy rows are not merged by email because email is not a stable identity and separate historical grants may carry different scopes. On the next OAuth connection, verified Google `sub` creates or selects the canonical account and selected site connectors are rebound. Unreferenced migrated legacy accounts can then be removed.

Legacy resource handling:

- GA4 copies the current numeric `SEARCHOPS_GA4_PROPERTY_ID` into each migrated GA4 binding. Missing values produce `needs_configuration`.
- GSC stores `resourceResolution=legacy_auto` and preserves current domain-based behavior until the user confirms an exact property.
- Bing's global key remains a temporary platform fallback and is not copied into organization rows.
- PageSpeed and SearchOps-funded GEO keys remain platform secrets.

The command is idempotent, supports dry-run, commits in bounded batches, and can resume after partial failure.

## 11. Encryption-key rotation

1. Generate a new 32-byte `v2` key.
2. Set `v2` as active and add `v1` to the previous-key JSON map.
3. Redeploy API and Worker.
4. Run rotation dry-run and apply commands.
5. Verify every row reports `encryptionKeyId=v2`.
6. Remove `v1` from the previous-key map and redeploy.

```bash
corepack pnpm credentials:rotate -- --dry-run
corepack pnpm credentials:rotate -- --apply --batch-size=100
```

Rotation uses optimistic `updatedAt` checks. Concurrently changed rows are skipped and processed on the next run. No secret, ciphertext, IV, or tag is printed. If a key may have been exposed, provider credentials must also be revoked and reissued; re-encryption alone is insufficient.

## 12. Test strategy

### Unit

- AES-GCM round trip and random IV behavior.
- Wrong key ID, wrong AAD, modified ciphertext, and modified tag rejection.
- Previous-key decrypt and active-key encrypt behavior.
- OAuth and API-key payload schema validation.
- Secret redaction from error serialization.

### Data and repository

- Same provider account shared across multiple same-organization sites.
- Cross-organization binding rejected by application and database constraints.
- `(siteId, provider)` uniqueness.
- In-use account deletion rejected.
- Secret-free metadata repository methods.

### API and authorization

- Owner/admin credential management success.
- Editor credential management rejection and sync permission.
- Viewer read-only behavior.
- Service principal rejection on credential mutation routes.
- No secret material in successful or failed responses.
- Verified Google identity upsert and refresh-token preservation.

### Worker

- Site-specific GSC, GA4, and Bing resource resolution.
- Organization BYOK precedence over platform GEO keys.
- Platform PageSpeed behavior.
- Account-scoped token refresh locking.
- Provider isolation within a batch.
- No fixture fallback in live mode.

### Migration and E2E

- Dry-run performs no writes.
- Repeated migration is idempotent.
- Null-email rows and partial failures are recoverable.
- Two sites use different GA4 properties and share or separate Google accounts.
- Organization A cannot see, bind, or use organization B's account.

All external provider tests use injected fetch clients and deterministic fixtures. The test suite does not call live provider APIs.

## 13. Deployment sequence

### Preflight

1. Create and verify a restorable Supabase backup.
2. Confirm Prisma migration status is clean.
3. Generate the initial encryption key.
4. Set the key and `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual` on Railway API and Worker only.
5. Confirm Vercel does not contain credential-encryption secrets.

### Expand and backfill

1. Deploy additive Prisma migration.
2. Deploy API with encrypted writes and dual reads.
3. Deploy Worker with per-job resolution and dual reads.
4. Deploy Web account and site-connector surfaces.
5. Run migration dry-run.
6. Run migration apply in batches.
7. Compare legacy row counts, migrated account counts, and site-binding counts.

### Validate and cut over

1. Verify GSC and GA4 sync on at least two sites with different resources.
2. Verify Bing organization connection and GEO BYOK precedence.
3. Verify PageSpeed still uses the platform key.
4. Confirm the legacy-fallback metric reaches zero.
5. Set storage mode to `encrypted` and redeploy API and Worker.
6. Observe syncs, token refresh, decryption failures, and provider errors for at least seven days.

### Contract

1. Confirm no legacy fallback and no unmigrated rows.
2. Remove the plaintext `ConnectorOAuthCredential` table in a separately approved migration.
3. Remove `SEARCHOPS_GA4_PROPERTY_ID` and the global Bing fallback after every affected site is configured.
4. Keep PageSpeed and SearchOps-funded GEO platform keys.
5. Confirm backups containing historical plaintext age out according to the configured retention policy.

The plaintext-table removal is never part of the initial automatic deployment. It requires a fresh backup, zero-fallback evidence, row-count reconciliation, and explicit operator approval.

## 14. Implementation phases

1. Encryption module, environment validation, and additive Prisma schema.
2. Provider-account and site-connector repository contracts and APIs.
3. Google OAuth canonical-account flow and encrypted backfill command.
4. Connector Worker per-job resolver and site-specific resources.
5. Bing organization credentials and GEO BYOK resolution.
6. End-user JWT forwarding and Web management UI.
7. Migration execution, encrypted-mode cutover, and later contract migration.

Each phase must preserve tenant isolation, add Zod contracts for public APIs, and pass focused tests before the next phase starts.
