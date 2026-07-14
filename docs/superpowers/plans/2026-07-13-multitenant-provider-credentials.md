# Multi-Tenant Provider Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace worker-global customer credentials with encrypted organization provider accounts, site-specific GSC/GA4/Bing bindings, per-job Worker resolution, and organization GEO BYOK.

**Architecture:** Public contracts live in `@searchops/types`; AES-256-GCM and the Prisma-backed provider credential store live in `@searchops/db`; API services own authorization and OAuth orchestration; Worker resolvers decrypt only for the duration of a provider call. Migration uses encrypted writes plus a temporary legacy-read fallback, followed by an explicitly gated encrypted-only cutover.

**Tech Stack:** TypeScript 5.8, Node.js 20+, pnpm 9.15.9, Prisma 6.19/PostgreSQL 16, Fastify 5, BullMQ/Redis, Next.js 15/React 19, Zod 3, Vitest 3, Supabase Auth.

## Global Constraints

- Work only inside `/Users/kionya/searchops-ai` and only against `https://github.com/kionya/searchops-ai.git`.
- Never commit raw OAuth tokens, API keys, encryption keys, real customer data, or live provider payloads.
- API responses, logs, queue payloads, fixtures, and dead-letter records must never contain raw credentials or encrypted credential fields.
- Credential encryption is AES-256-GCM with a fresh 12-byte IV and AAD `searchops:provider-account:v1:<organizationId>:<providerAccountId>:<provider>`.
- Vercel never receives credential-encryption keys; Railway API and Worker receive the same active and previous key configuration.
- `owner`, `admin`, and `system` manage credentials and bindings; `editor` may run syncs; `viewer` is read-only.
- Live mode must return an explicit provider failure when credentials are missing or invalid; it must never substitute fixture records.
- New public API contracts use Zod schemas.
- External provider tests use injected `fetch` clients and deterministic fixtures; tests must not call live provider APIs.
- The plaintext `ConnectorOAuthCredential` table is not dropped in this implementation branch. A later contract migration requires seven days of zero fallback plus separate operator approval.
- Follow TDD for every behavior change: write a focused failing test, verify the expected failure, implement minimally, rerun focused tests, then commit.

---

## File Structure

### Shared contracts

- Create `packages/types/src/provider-credentials.ts`: provider-account, site-connector, secret-payload, request/response, storage-mode, and credential-source schemas.
- Create `packages/types/src/provider-credentials.test.ts`: schema acceptance and rejection tests.
- Modify `packages/types/src/index.ts`: export the new contracts and add credential environment keys to `SearchOpsEnvSchema`.

### Encryption and persistence

- Create `packages/db/src/credential-crypto.ts`: keyring parsing, AES-GCM encrypt/decrypt, and redacted errors.
- Create `packages/db/src/credential-crypto.test.ts`: round-trip, tamper, AAD, and rotation tests.
- Create `packages/db/src/provider-credential-store.ts`: store interface, Prisma implementation, and secret-free metadata projections.
- Create `packages/db/src/provider-credential-store.test.ts`: tenant and lifecycle tests with a focused Prisma-port fake.
- Create `packages/db/src/provider-credential-migration.ts`: idempotent legacy backfill and key rotation services.
- Create `packages/db/src/provider-credential-migration.test.ts`: dry-run, apply, resume, and optimistic-rotation tests.
- Create `packages/db/scripts/migrate-provider-credentials.ts`: migration CLI.
- Create `packages/db/scripts/rotate-provider-credentials.ts`: key rotation CLI.
- Modify `packages/db/prisma/schema.prisma`: add `ProviderAccount`, `SiteConnector`, and tenant-safe relations.
- Create `packages/db/prisma/migrations/20260713000000_provider_accounts_site_connectors/migration.sql`: additive tables, constraints, and partial unique index.
- Modify `packages/db/src/index.ts`, `packages/db/package.json`, and root `package.json`: exports and commands.

### API and OAuth

- Create `apps/api/src/provider-account-service.ts`: authorization-independent account/binding orchestration and encryption boundary.
- Create `apps/api/src/provider-account-service.test.ts`: secret handling, scope regression, deletion, and cross-tenant tests.
- Modify `apps/api/src/auth.ts` and `apps/api/src/auth.test.ts`: principal type and provider-credential management authorization.
- Modify `apps/api/src/google-oauth.ts` and `apps/api/src/google-oauth.test.ts`: verified Google `sub`/email lookup.
- Modify `apps/api/src/server.ts`, `apps/api/src/server.test.ts`, `apps/api/src/index.ts`: routes and dependency wiring.

### Worker and connectors

- Create `apps/worker/src/provider-credential-resolver.ts`: encrypted/legacy/platform resolution and Google refresh locking.
- Create `apps/worker/src/provider-credential-resolver.test.ts`: resource, tenant, fallback, and refresh tests.
- Modify `packages/connectors/src/index.ts` and `packages/connectors/src/index.test.ts`: accept provider-specific live configurations.
- Modify `apps/worker/src/processor.ts`, `apps/worker/src/processor.test.ts`, `apps/worker/src/runtime.ts`, `apps/worker/src/runtime.test.ts`, and `apps/worker/src/index.ts`: per-job connector and GEO resolution.
- Modify `packages/db/src/connector-sync.ts` and `packages/db/src/connector-sync.test.ts`: persist credential-source metadata without secrets.

### Web and operations

- Add `@supabase/ssr` and `@supabase/supabase-js` to `apps/web/package.json` and the lockfile.
- Create `apps/web/src/supabase-server.ts`: server-side Supabase session access.
- Create `apps/web/src/supabase-middleware.ts` and `apps/web/middleware.ts`: session refresh and protected-route enforcement.
- Create `apps/web/app/login/page.tsx` and `actions.ts`: email/password sign-in and sign-out entry point.
- Create `apps/web/src/provider-accounts.ts` and `apps/web/src/provider-accounts.test.ts`: user-authenticated API client functions.
- Create `apps/web/app/ops/integrations/page.tsx` and `actions.ts`: organization provider-account management.
- Modify `apps/web/src/api-client.ts`: distinguish user and service principals.
- Modify `apps/web/app/sites/[siteId]/connectors/page.tsx`, `actions.ts`, and `apps/web/src/connector-oauth.ts`: account selection and resource binding.
- Modify `apps/api/src/readiness.ts`, `apps/api/src/connector-live-setup.ts`, their tests, `.env.example`, `scripts/dev/*.env.example`, `docs/RUNBOOKS.md`, and `docs/PRODUCTION_LAUNCH_CHECKLIST.md`: new readiness and rollout contract.

---

### Task 1: Add shared provider credential contracts

**Files:**
- Create: `packages/types/src/provider-credentials.ts`
- Create: `packages/types/src/provider-credentials.test.ts`
- Modify: `packages/types/src/index.ts:1-20,275-325`

**Interfaces:**
- Produces: `ProviderAccountProvider`, `ProviderAccountAuthType`, `ProviderAccountStatus`, `SiteConnectorProvider`, `SiteConnectorStatus`, `ProviderCredentialSecret`, `ProviderAccountMetadata`, `SiteConnector`, `CredentialStorageMode`, `CredentialSource` and their Zod schemas.
- Produces: `CreateApiKeyProviderAccountRequestSchema`, `ReplaceProviderCredentialRequestSchema`, `UpsertSiteConnectorRequestSchema`, list/detail response schemas.
- Consumed by: every later task.

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";

import {
  CredentialStorageModeSchema,
  ProviderCredentialSecretSchema,
  UpsertSiteConnectorRequestSchema
} from "./provider-credentials.js";

describe("provider credential contracts", () => {
  it("accepts supported storage modes", () => {
    expect(CredentialStorageModeSchema.parse("dual")).toBe("dual");
    expect(CredentialStorageModeSchema.parse("encrypted")).toBe("encrypted");
    expect(() => CredentialStorageModeSchema.parse("legacy")).toThrow();
  });

  it("keeps secret payloads discriminated", () => {
    expect(ProviderCredentialSecretSchema.parse({ kind: "api_key", apiKey: "key-123" })).toEqual({
      kind: "api_key",
      apiKey: "key-123"
    });
    expect(() => ProviderCredentialSecretSchema.parse({ kind: "api_key", accessToken: "x" })).toThrow();
  });

  it("normalizes a numeric GA4 property", () => {
    expect(
      UpsertSiteConnectorRequestSchema.parse({
        providerAccountId: "pa_google_1",
        externalResourceId: "123456789"
      })
    ).toEqual({ providerAccountId: "pa_google_1", externalResourceId: "123456789" });
  });
});
```

- [ ] **Step 2: Verify the test fails for the missing module**

Run:

```bash
corepack pnpm --filter @searchops/types exec vitest run src/provider-credentials.test.ts
```

Expected: FAIL because `./provider-credentials.js` does not exist.

- [ ] **Step 3: Implement the contracts and exports**

Use these exact core schemas; derive request/response types with `z.infer` and compose secret-free metadata responses from them.

```ts
import { z } from "zod";

export const ProviderAccountProviderSchema = z.enum([
  "google",
  "bing",
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity"
]);
export const ProviderAccountAuthTypeSchema = z.enum(["oauth2", "api_key"]);
export const ProviderAccountStatusSchema = z.enum(["connected", "expired", "revoked", "invalid"]);
export const SiteConnectorProviderSchema = z.enum(["gsc", "ga4", "bing"]);
export const SiteConnectorStatusSchema = z.enum([
  "connected",
  "needs_configuration",
  "expired",
  "revoked",
  "error"
]);
export const CredentialStorageModeSchema = z.enum(["dual", "encrypted"]);
export const CredentialSourceSchema = z.enum(["encrypted", "legacy", "platform"]);

export const OAuthCredentialSecretSchema = z.object({
  kind: z.literal("oauth2"),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullable(),
  tokenType: z.string().min(1).nullable()
}).strict();
export const ApiKeyCredentialSecretSchema = z.object({
  kind: z.literal("api_key"),
  apiKey: z.string().min(1)
}).strict();
export const ProviderCredentialSecretSchema = z.discriminatedUnion("kind", [
  OAuthCredentialSecretSchema,
  ApiKeyCredentialSecretSchema
]);

export const UpsertSiteConnectorRequestSchema = z.object({
  providerAccountId: z.string().min(1),
  externalResourceId: z.string().min(1)
}).strict();
```

Add these environment fields to `SearchOpsEnvSchema`:

```ts
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: z.string().min(1).optional(),
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JsonObjectStringSchema.optional(),
SEARCHOPS_CREDENTIAL_STORAGE_MODE: CredentialStorageModeSchema.optional(),
```

- [ ] **Step 4: Run focused tests and typecheck**

```bash
corepack pnpm --filter @searchops/types exec vitest run src/provider-credentials.test.ts
corepack pnpm --filter @searchops/types typecheck
```

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/provider-credentials.ts packages/types/src/provider-credentials.test.ts packages/types/src/index.ts
git commit -m "feat(types): add provider credential contracts"
```

### Task 2: Implement AES-256-GCM credential encryption

**Files:**
- Create: `packages/db/src/credential-crypto.ts`
- Create: `packages/db/src/credential-crypto.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `ProviderCredentialSecretSchema`, `ProviderAccountProvider` from Task 1.
- Produces: `CredentialKeyring`, `parseCredentialKeyring`, `encryptProviderCredential`, `decryptProviderCredential`, `CredentialDecryptionError`.

- [ ] **Step 1: Write failing crypto tests**

```ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring
} from "./credential-crypto.js";

const key = randomBytes(32).toString("base64");
const context = { organizationId: "org_a", providerAccountId: "pa_1", provider: "google" as const };

describe("credential crypto", () => {
  it("round trips and never reuses the IV", () => {
    const keyring = parseCredentialKeyring({
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: key,
      SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}"
    });
    const secret = { kind: "oauth2" as const, accessToken: "a", refreshToken: "r", tokenType: "Bearer" };
    const first = encryptProviderCredential(keyring, context, secret);
    const second = encryptProviderCredential(keyring, context, secret);
    expect(first.credentialIv).not.toBe(second.credentialIv);
    expect(decryptProviderCredential(keyring, context, first)).toEqual(secret);
  });

  it("rejects tenant-bound AAD changes", () => {
    const keyring = parseCredentialKeyring({
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: key,
      SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}"
    });
    const envelope = encryptProviderCredential(keyring, context, { kind: "api_key", apiKey: "secret" });
    expect(() => decryptProviderCredential(keyring, { ...context, organizationId: "org_b" }, envelope)).toThrow(
      "credential_decryption_failed"
    );
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/credential-crypto.test.ts
```

Expected: FAIL because the crypto module does not exist.

- [ ] **Step 3: Implement keyring parsing and encryption**

Implement the exported contract with `createCipheriv("aes-256-gcm", key, iv)`, `cipher.setAAD(Buffer.from(aad))`, `getAuthTag()`, and matching `createDecipheriv`. Validate active and previous keys as exactly 32 decoded bytes. Convert every decryption/parsing failure to:

```ts
export class CredentialDecryptionError extends Error {
  constructor() {
    super("credential_decryption_failed");
    this.name = "CredentialDecryptionError";
  }
}
```

Return this exact envelope shape:

```ts
export interface EncryptedProviderCredential {
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: 1;
}
```

Build AAD only with:

```ts
function buildCredentialAad(input: CredentialContext) {
  return `searchops:provider-account:v1:${input.organizationId}:${input.providerAccountId}:${input.provider}`;
}
```

- [ ] **Step 4: Add tamper and previous-key tests, then run them**

Add cases that modify one byte of ciphertext, tag, and IV; test unknown key ID; test decrypting a `v1` row after activating `v2` with `v1` in previous keys.

```bash
corepack pnpm --filter @searchops/db exec vitest run src/credential-crypto.test.ts
corepack pnpm --filter @searchops/db typecheck
```

Expected: all crypto tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/credential-crypto.ts packages/db/src/credential-crypto.test.ts packages/db/src/index.ts
git commit -m "feat(db): encrypt provider credentials"
```

### Task 3: Add additive Prisma models and migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma:10-165`
- Create: `packages/db/prisma/migrations/20260713000000_provider_accounts_site_connectors/migration.sql`

**Interfaces:**
- Produces: Prisma `ProviderAccount` and `SiteConnector` models.
- Consumed by: persistence, migration, API, and Worker tasks.

- [ ] **Step 1: Add a schema-level migration assertion test**

Extend `packages/db/src/index.test.ts` to read the schema and assert model and tenant constraints exist:

```ts
it("declares tenant-safe provider credential models", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  expect(schema).toContain("model ProviderAccount");
  expect(schema).toContain("model SiteConnector");
  expect(schema).toContain("@@unique([siteId, provider])");
  expect(schema).toContain("fields: [providerAccountId, organizationId]");
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/index.test.ts
```

Expected: FAIL because the models do not exist.

- [ ] **Step 3: Add the models and relations**

Use required non-secret metadata plus the five encrypted-envelope columns from Task 2. Add `providerAccounts` and `siteConnectors` relations to `Organization`; add `siteConnectors` and `@@unique([id, organizationId])` to `Site`; add `@@unique([id, organizationId])` to `ProviderAccount`; enforce composite relations from `SiteConnector` to both parent models.

```prisma
model ProviderAccount {
  id                       String   @id @default(cuid())
  organizationId           String
  provider                 String
  authType                 String
  externalAccountId        String?
  accountEmail             String?
  displayName              String
  status                   String   @default("connected")
  scopes                   Json     @default("[]")
  tokenExpiresAt           DateTime?
  credentialCiphertext     String
  credentialIv             String
  credentialAuthTag        String
  encryptionKeyId          String
  encryptionVersion        Int      @default(1)
  isDefault                Boolean  @default(false)
  legacyCredentialId       String?  @unique
  connectedByUserId        String
  connectedAt              DateTime @default(now())
  createdAt                DateTime @default(now())
  updatedAt                DateTime @default(now()) @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  siteConnectors SiteConnector[]

  @@unique([id, organizationId])
  @@unique([organizationId, provider, externalAccountId])
  @@index([organizationId])
  @@index([provider])
  @@index([status])
  @@index([encryptionKeyId])
}

model SiteConnector {
  id                   String   @id @default(cuid())
  organizationId       String
  siteId               String
  provider              String
  providerAccountId     String
  externalResourceId    String?
  config                Json     @default("{}")
  status                String   @default("needs_configuration")
  lastErrorCode         String?
  lastCheckedAt         DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @default(now()) @updatedAt

  site Site @relation(fields: [siteId, organizationId], references: [id, organizationId], onDelete: Cascade)
  providerAccount ProviderAccount @relation(fields: [providerAccountId, organizationId], references: [id, organizationId], onDelete: Restrict)

  @@unique([siteId, provider])
  @@index([organizationId])
  @@index([providerAccountId])
  @@index([status])
}
```

- [ ] **Step 4: Generate and inspect the additive migration**

```bash
corepack pnpm --filter @searchops/db exec prisma migrate dev --schema prisma/schema.prisma --name provider_accounts_site_connectors --create-only
corepack pnpm --filter @searchops/db db:generate
```

Rename the generated migration directory to `20260713000000_provider_accounts_site_connectors` if Prisma used a local timestamp. Add this PostgreSQL-only partial index to the migration:

```sql
CREATE UNIQUE INDEX "ProviderAccount_org_provider_default_key"
ON "ProviderAccount" ("organizationId", "provider")
WHERE "isDefault" = true;
```

Verify the migration contains only `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE ... ADD CONSTRAINT`; it must not drop or alter `ConnectorOAuthCredential`.

- [ ] **Step 5: Run focused validation and commit**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/index.test.ts
corepack pnpm --filter @searchops/db typecheck
git diff --check
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260713000000_provider_accounts_site_connectors/migration.sql packages/db/src/index.test.ts
git commit -m "feat(db): add provider account models"
```

### Task 4: Implement the provider credential store

**Files:**
- Create: `packages/db/src/provider-credential-store.ts`
- Create: `packages/db/src/provider-credential-store.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: Prisma models from Task 3 and public types from Task 1.
- Produces: `ProviderCredentialStore`, `createPrismaProviderCredentialStore`, `ProviderAccountSecretRecord`.
- Store methods: `listAccounts`, `getAccountMetadata`, `getAccountSecretRecord`, `createApiKeyAccount`, `replaceCredential`, `upsertGoogleAccount`, `deleteAccount`, `listSiteConnectors`, `upsertSiteConnector`, `deleteSiteConnector`, `countAccountBindings`, `getCredentialReadinessSnapshot`.

- [ ] **Step 1: Write failing store tests**

Create a focused fake for the Prisma methods used by the store and test these behaviors:

```ts
it("rejects a cross-organization site binding", async () => {
  const store = createPrismaProviderCredentialStore(fakePrisma({
    sites: [{ id: "site_a", organizationId: "org_a" }],
    accounts: [{ id: "pa_b", organizationId: "org_b", provider: "google" }]
  }));
  await expect(store.upsertSiteConnector({
    organizationId: "org_a",
    siteId: "site_a",
    provider: "ga4",
    providerAccountId: "pa_b",
    externalResourceId: "properties/1"
  })).rejects.toThrow("provider_account_not_in_organization");
});

it("does not expose encrypted columns from listAccounts", async () => {
  const store = createPrismaProviderCredentialStore(fakePrismaWithEncryptedAccount());
  expect(await store.listAccounts("org_a")).toEqual([
    expect.not.objectContaining({ credentialCiphertext: expect.anything() })
  ]);
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/provider-credential-store.test.ts
```

Expected: FAIL because the store module is absent.

- [ ] **Step 3: Define and implement the store**

Keep metadata and secret-bearing reads separate:

```ts
export interface ProviderCredentialStore {
  listAccounts(organizationId: string): Promise<ProviderAccountMetadata[]>;
  getAccountSecretRecord(input: {
    organizationId: string;
    providerAccountId: string;
  }): Promise<ProviderAccountSecretRecord | null>;
  countAccountBindings(input: {
    organizationId: string;
    providerAccountId: string;
  }): Promise<number>;
  upsertSiteConnector(input: UpsertSiteConnectorStoreInput): Promise<SiteConnector>;
  deleteSiteConnector(input: {
    organizationId: string;
    siteId: string;
    provider: SiteConnectorProvider;
  }): Promise<boolean>;
}
```

Every query includes `organizationId`; `upsertSiteConnector` loads both parents before writing; `deleteAccount` throws `account_in_use` when the binding count is nonzero.

- [ ] **Step 4: Run store tests and DB package verification**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/provider-credential-store.test.ts
corepack pnpm --filter @searchops/db typecheck
corepack pnpm --filter @searchops/db lint
```

Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/provider-credential-store.ts packages/db/src/provider-credential-store.test.ts packages/db/src/index.ts
git commit -m "feat(db): add provider credential store"
```

### Task 5: Add idempotent migration and key-rotation commands

**Files:**
- Create: `packages/db/src/provider-credential-migration.ts`
- Create: `packages/db/src/provider-credential-migration.test.ts`
- Create: `packages/db/scripts/migrate-provider-credentials.ts`
- Create: `packages/db/scripts/rotate-provider-credentials.ts`
- Modify: `packages/db/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `migrateLegacyProviderCredentials`, `rotateProviderCredentialEncryption`, `CredentialMaintenanceSummary`.
- CLI exit codes: `0` success, `1` validation or row failure.

- [ ] **Step 1: Write failing migration tests**

```ts
it("is a no-op on dry run and reports exact counts", async () => {
  const store = createMigrationStore({ legacyRows: [legacyGscRow(), legacyGa4Row()] });
  const summary = await migrateLegacyProviderCredentials(store, keyring(), {
    apply: false,
    batchSize: 100,
    legacyGa4PropertyId: "123456789"
  });
  expect(summary).toEqual({ examined: 2, migrated: 0, skipped: 0, failed: 0, pending: 2, dryRun: true });
  expect(store.writes).toEqual([]);
});

it("does not duplicate rows on a second apply", async () => {
  const store = createMigrationStore({ legacyRows: [legacyGscRow()] });
  await migrateLegacyProviderCredentials(store, keyring(), { apply: true, batchSize: 100 });
  const second = await migrateLegacyProviderCredentials(store, keyring(), { apply: true, batchSize: 100 });
  expect(second.skipped).toBe(1);
});

it("rotates a previous-key row to the active key without exposing the secret", async () => {
  const store = createMigrationStore({ encryptedRows: [encryptedV1Row()] });
  const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
    apply: true,
    batchSize: 100
  });
  expect(summary).toMatchObject({ examined: 1, migrated: 1, failed: 0, pending: 0 });
  expect(store.encryptedRows[0]?.encryptionKeyId).toBe("v2");
  expect(JSON.stringify(summary)).not.toContain("access-token");
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/provider-credential-migration.test.ts
```

Expected: FAIL because migration services are absent.

- [ ] **Step 3: Implement migration and rotation services**

Migration behavior must be exact:

- One legacy row creates one legacy Google `ProviderAccount`; never merge by email.
- `legacyCredentialId` is the idempotency key.
- GSC uses `config.resourceResolution="legacy_auto"` and a nullable resource ID.
- GA4 stores `properties/<SEARCHOPS_GA4_PROPERTY_ID>` or `needs_configuration` when missing.
- Each batch is transactional; one failed batch rolls back without undoing previous batches.
- Rotation rereads `updatedAt` and updates only when unchanged.
- Summaries contain counts and IDs only.

```ts
export interface CredentialMaintenanceSummary {
  readonly examined: number;
  readonly migrated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly pending: number;
  readonly dryRun: boolean;
}
```

- [ ] **Step 4: Add exact CLI scripts and root commands**

```json
{
  "credentials:migrate": "corepack pnpm --filter @searchops/db credentials:migrate",
  "credentials:rotate": "corepack pnpm --filter @searchops/db credentials:rotate"
}
```

Package commands:

```json
{
  "credentials:migrate": "tsx scripts/migrate-provider-credentials.ts",
  "credentials:rotate": "tsx scripts/rotate-provider-credentials.ts"
}
```

Both CLIs require exactly one of `--dry-run` or `--apply`; parse `--batch-size=<positive integer>` and default to 100. Mask and never print environment values.

- [ ] **Step 5: Verify and commit**

```bash
corepack pnpm --filter @searchops/db exec vitest run src/provider-credential-migration.test.ts
corepack pnpm --filter @searchops/db typecheck
corepack pnpm --filter @searchops/db lint
git add package.json packages/db/package.json packages/db/src/provider-credential-migration.ts packages/db/src/provider-credential-migration.test.ts packages/db/scripts/migrate-provider-credentials.ts packages/db/scripts/rotate-provider-credentials.ts
git commit -m "feat(db): add credential maintenance commands"
```

### Task 6: Add provider account and site binding APIs

**Files:**
- Create: `apps/api/src/provider-account-service.ts`
- Create: `apps/api/src/provider-account-service.test.ts`
- Modify: `apps/api/src/server.ts:300-465,1763-1970`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/index.ts:35-90`

**Interfaces:**
- Consumes: `ProviderCredentialStore`, crypto functions, public request/response schemas.
- Produces: `ProviderAccountService`, `createProviderAccountService`.
- Service methods: `createApiKeyAccount`, `replaceApiKeyCredential`, `upsertGoogleAccount`, `prepareGoogleConnectors`, `listAccounts`, `deleteAccount`, `listSiteConnectors`, `upsertSiteConnector`, `deleteSiteConnector`.
- Routes: organization account CRUD and site connector GET/PUT/DELETE from the spec.

- [ ] **Step 1: Write failing service tests**

```ts
it("encrypts an API key before calling the store", async () => {
  const store = createProviderStoreSpy();
  const service = createProviderAccountService({ store, keyring: keyring() });
  await service.createApiKeyAccount({
    organizationId: "org_a",
    provider: "geo_chatgpt",
    apiKey: "raw-secret",
    displayName: "Primary",
    actorUserId: "user_a"
  });
  expect(JSON.stringify(store.calls)).not.toContain("raw-secret");
  expect(store.calls[0]?.encryptionKeyId).toBe("v1");
});

it("rejects deletion while a site binding exists", async () => {
  const service = createProviderAccountService({ store: storeWithBinding(), keyring: keyring() });
  await expect(service.deleteAccount({
    organizationId: "org_a",
    providerAccountId: "pa_1"
  })).rejects.toThrow("account_in_use");
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/provider-account-service.test.ts
```

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement the service and route schemas**

The service receives raw secrets only at method boundaries, encrypts immediately, and passes only encrypted fields to the store. Add server routes:

```text
GET    /organizations/:organizationId/provider-accounts
POST   /organizations/:organizationId/provider-accounts/:provider/api-key
PATCH  /organizations/:organizationId/provider-accounts/:id
PUT    /organizations/:organizationId/provider-accounts/:id/credential
DELETE /organizations/:organizationId/provider-accounts/:id
GET    /sites/:id/connectors
PUT    /sites/:id/connectors/:provider
DELETE /sites/:id/connectors/:provider
```

Map domain errors to stable statuses: `404 account_not_found`, `409 account_in_use`, `400 provider_account_not_in_organization`, and `400 validation_error`.

Normalize provider resources before persistence: GA4 accepts `123456789` or `properties/123456789` and stores the latter; GSC accepts only `sc-domain:<domain>` or an HTTP(S) URL-prefix property; Bing accepts only an HTTP(S) URL. Reject all other formats with `validation_error`.

- [ ] **Step 4: Add API tests for metadata-only responses and tenant isolation**

Use `server.inject` to assert owner success, cross-organization 403/400, malformed resource 400, in-use delete 409, and that response JSON contains none of:

```ts
const forbiddenFields = [
  "apiKey",
  "accessToken",
  "refreshToken",
  "credentialCiphertext",
  "credentialIv",
  "credentialAuthTag"
];
```

Run:

```bash
corepack pnpm --filter @searchops/api exec vitest run src/provider-account-service.test.ts src/server.test.ts
corepack pnpm --filter @searchops/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/provider-account-service.ts apps/api/src/provider-account-service.test.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/api/src/index.ts
git commit -m "feat(api): manage provider accounts and bindings"
```

### Task 7: Enforce user principals and forward Supabase sessions

**Files:**
- Modify: `packages/types/src/index.ts:1750-1795`
- Modify: `apps/api/src/auth.ts:1-115,418-432`
- Modify: `apps/api/src/auth.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/supabase-server.ts`
- Create: `apps/web/src/supabase-middleware.ts`
- Create: `apps/web/middleware.ts`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/login/actions.ts`
- Modify: `apps/web/src/api-client.ts`
- Create: `apps/web/src/api-client.test.ts`

**Interfaces:**
- Produces: `AuthPrincipalType = "user" | "service"`, `canManageProviderCredentials`, `apiFetchAsUser`.
- Requires deployment env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel and existing IdP issuer/audience/JWKS on Railway API.

- [ ] **Step 1: Write failing auth tests**

```ts
it("allows only user owner/admin/system principals to manage credentials", () => {
  expect(canManageProviderCredentials({ role: "owner", principalType: "user" })).toBe(true);
  expect(canManageProviderCredentials({ role: "admin", principalType: "user" })).toBe(true);
  expect(canManageProviderCredentials({ role: "editor", principalType: "user" })).toBe(false);
  expect(canManageProviderCredentials({ role: "owner", principalType: "service" })).toBe(false);
});
```

Add a web test asserting `apiFetchAsUser` forwards a supplied access token and never falls back to the service-owner token.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/auth.test.ts
corepack pnpm --filter @searchops/web exec vitest run src/api-client.test.ts
```

Expected: FAIL because principal type and user fetch are absent.

- [ ] **Step 3: Add dependencies and server session helper**

```bash
corepack pnpm --filter @searchops/web add @supabase/ssr @supabase/supabase-js
```

`getSupabaseServerClient()` must use Next `cookies()` and return `null` when either public Supabase environment variable is absent. `apiFetchAsUser` must return a typed `authentication_required` error before making a request when no session token exists.

Add an email/password login action using `supabase.auth.signInWithPassword`, a sign-out action using `supabase.auth.signOut`, and middleware that refreshes the session. Protect `/sites/*` and `/ops/integrations`; allow `/login`, legal pages, and health-facing static routes. After login, redirect to `/sites`.

- [ ] **Step 4: Implement principal enforcement**

Add `principalType` to resolved auth context. IdP tokens default to `user`; tokens with `token_use=service` resolve to `service`. Modify the existing service-token minting payload to include:

```ts
token_use: "service"
```

Credential and site-binding mutation routes call `canManageProviderCredentials`; connector sync routes retain `editor` write permission.

- [ ] **Step 5: Verify and commit**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/auth.test.ts src/server.test.ts
corepack pnpm --filter @searchops/web exec vitest run src/api-client.test.ts
corepack pnpm --filter @searchops/api typecheck
corepack pnpm --filter @searchops/web typecheck
git add packages/types/src/index.ts apps/api/src/auth.ts apps/api/src/auth.test.ts apps/api/src/server.ts apps/api/src/server.test.ts apps/web/package.json pnpm-lock.yaml apps/web/src/supabase-server.ts apps/web/src/supabase-middleware.ts apps/web/middleware.ts apps/web/app/login/page.tsx apps/web/app/login/actions.ts apps/web/src/api-client.ts apps/web/src/api-client.test.ts
git commit -m "feat(auth): require user principals for credentials"
```

### Task 8: Move Google OAuth to canonical encrypted accounts

**Files:**
- Modify: `apps/api/src/google-oauth.ts`
- Modify: `apps/api/src/google-oauth.test.ts`
- Modify: `apps/api/src/server.ts:1844-1970`
- Modify: `apps/api/src/server.test.ts`
- Modify: `packages/types/src/provider-credentials.ts`

**Interfaces:**
- Extends: `GoogleOAuthTokenResult` with `externalAccountId: string` and required verified email metadata.
- Consumes: `ProviderAccountService.upsertGoogleAccount` and `ProviderAccountService.prepareGoogleConnectors`.
- Produces: `GET /organizations/:organizationId/provider-accounts/google/oauth/start` and the existing public callback backed by canonical encrypted accounts.

- [ ] **Step 1: Write failing user-info and scope-regression tests**

```ts
it("loads verified Google sub and email after token exchange", async () => {
  const fetch = createFetchSequence([
    jsonResponse({ access_token: "a", refresh_token: "r", token_type: "Bearer", scope: "openid email" }),
    jsonResponse({ sub: "google-123", email: "owner@example.com", email_verified: true })
  ]);
  const client = createGoogleConnectorOAuthClient({ ...oauthOptions(), fetch });
  await expect(client.exchangeCodeForTokens("code")).resolves.toMatchObject({
    externalAccountId: "google-123",
    externalAccountEmail: "owner@example.com"
  });
});
```

Add a service test where an existing GSC-bound account is reauthorized with only the GA4 scope and assert `scope_missing` while the stored credential is unchanged.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/google-oauth.test.ts src/provider-account-service.test.ts
```

Expected: FAIL because user-info identity and scope regression checks are absent.

- [ ] **Step 3: Implement verified identity and encrypted upsert**

After token exchange, call `https://openidconnect.googleapis.com/v1/userinfo` with `Authorization: Bearer <access token>`. Require non-empty `sub`, verified email, and matching expected JSON types. The callback must:

1. Verify signed OAuth state and site organization.
2. Upsert canonical Google `ProviderAccount` by organization and `sub`.
3. Preserve an existing refresh token when the response omits one.
4. Reject scope regression before replacing the credential.
5. Create requested GSC/GA4 bindings with `needs_configuration` until a resource is selected.
6. Never call legacy `upsertConnectorOAuthCredentials` for new writes.

The organization OAuth-start route requires `siteId` and requested connector providers, verifies that the site belongs to the route organization, and signs both into state. Keep the existing site-scoped start route only as a temporary compatibility redirect to the organization route; it must not create a separate OAuth implementation.

- [ ] **Step 4: Run OAuth and server tests**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/google-oauth.test.ts src/provider-account-service.test.ts src/server.test.ts
corepack pnpm --filter @searchops/api typecheck
```

Expected: PASS, including no token fields in callback response.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/google-oauth.ts apps/api/src/google-oauth.test.ts apps/api/src/provider-account-service.ts apps/api/src/provider-account-service.test.ts apps/api/src/server.ts apps/api/src/server.test.ts packages/types/src/provider-credentials.ts
git commit -m "feat(oauth): store canonical encrypted Google accounts"
```

### Task 9: Resolve site-specific connector credentials per Worker job

**Files:**
- Create: `apps/worker/src/provider-credential-resolver.ts`
- Create: `apps/worker/src/provider-credential-resolver.test.ts`
- Modify: `packages/connectors/src/index.ts:176-210,1160-1225,1771-1815`
- Modify: `packages/connectors/src/index.test.ts`
- Modify: `apps/worker/src/processor.ts:65-210`
- Modify: `apps/worker/src/processor.test.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/src/runtime.test.ts`
- Modify: `apps/worker/src/index.ts:17-29`
- Modify: `packages/types/src/index.ts:2595-2645`
- Modify: `packages/db/src/connector-sync.ts`
- Modify: `packages/db/src/connector-sync.test.ts`

**Interfaces:**
- Produces: `ResolvedConnectorProviderConfigs`, `resolveConnectorProviderConfigs`.
- Connector config fields: `gsc.credential/propertyId`, `ga4.credential/propertyId`, `bing.apiKey/siteUrl`, `pagespeed.apiKey/siteUrl`.
- Adds non-secret `credentialSources` to connector batch summary.

- [ ] **Step 1: Write failing resolver tests**

```ts
it("returns different GA4 resources for two sites sharing one Google account", async () => {
  const resolver = createProviderCredentialResolver(resolverFixture({
    sites: {
      site_a: { ga4: "properties/111" },
      site_b: { ga4: "properties/222" }
    }
  }));
  await expect(resolver.resolveConnectorProviderConfigs(connectorJob("site_a", "org_a", ["ga4"]))).resolves.toMatchObject({
    configs: { ga4: { propertyId: "properties/111" } }
  });
  await expect(resolver.resolveConnectorProviderConfigs(connectorJob("site_b", "org_a", ["ga4"]))).resolves.toMatchObject({
    configs: { ga4: { propertyId: "properties/222" } }
  });
});

it("does not use fixtures when encrypted credentials are missing in live mode", async () => {
  const result = await processConnectorSyncJob(connectorJob("site_a", "org_a", ["ga4"]), {
    liveExternalApis: "enabled",
    resolveConnectorProviderConfigs: async () => ({ configs: {}, credentialSources: {} })
  });
  expect(result.results[0]).toMatchObject({ status: "setup_required", fixture: false });
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/worker exec vitest run src/provider-credential-resolver.test.ts src/processor.test.ts
```

Expected: FAIL because per-job resolution is absent.

- [ ] **Step 3: Implement the connector package input boundary**

Replace global credential fields in `LiveConnectorBatchSyncRequest` with:

```ts
export interface LiveConnectorProviderConfigs {
  readonly gsc?: { readonly credential: GoogleOAuthCredential; readonly propertyId: string };
  readonly ga4?: { readonly credential: GoogleOAuthCredential; readonly propertyId: string };
  readonly bing?: { readonly apiKey: string; readonly siteUrl: string };
  readonly pagespeed?: { readonly apiKey?: string; readonly siteUrl: string };
}
```

`syncLiveConnectors` creates an adapter only from the requested provider's config. Missing config produces a non-fixture `setup_required` result.

- [ ] **Step 4: Implement encrypted/legacy/platform resolution**

Resolution order in `dual` mode:

1. New `SiteConnector` plus encrypted `ProviderAccount`.
2. Legacy Google row for GSC/GA4.
3. Global Bing fallback only for Bing.
4. Platform PageSpeed key.

In `encrypted` mode skip steps 2 and 3. Verify site and account organization before decrypting. Normalize GSC legacy auto behavior and GA4 `properties/<id>`. Persist `credentialSources` in the sync summary; it contains only `encrypted`, `legacy`, or `platform`.

For Google refresh, acquire `provider-account-refresh:<id>` through the existing Redis connection, reread the row after lock acquisition, refresh only if still expired, encrypt with the active key, and update with an `updatedAt` precondition.

Normalize runtime failures to `account_missing`, `connector_missing`, `scope_missing`, `credential_expired`, `credential_revoked`, `resource_access_denied`, `provider_rate_limited`, or `credential_decryption_failed`. Update account/connector status metadata through the store, but persist no provider response body and no secret-bearing error object.

- [ ] **Step 5: Run connector/worker/DB tests and commit**

```bash
corepack pnpm --filter @searchops/connectors exec vitest run src/index.test.ts
corepack pnpm --filter @searchops/worker exec vitest run src/provider-credential-resolver.test.ts src/processor.test.ts src/runtime.test.ts
corepack pnpm --filter @searchops/db exec vitest run src/connector-sync.test.ts
corepack pnpm --filter @searchops/worker typecheck
git add packages/connectors/src/index.ts packages/connectors/src/index.test.ts apps/worker/src/provider-credential-resolver.ts apps/worker/src/provider-credential-resolver.test.ts apps/worker/src/processor.ts apps/worker/src/processor.test.ts apps/worker/src/runtime.ts apps/worker/src/runtime.test.ts apps/worker/src/index.ts packages/types/src/index.ts packages/db/src/connector-sync.ts packages/db/src/connector-sync.test.ts
git commit -m "feat(worker): resolve site connector credentials per job"
```

### Task 10: Resolve organization GEO BYOK per job

**Files:**
- Modify: `apps/worker/src/provider-credential-resolver.ts`
- Modify: `apps/worker/src/provider-credential-resolver.test.ts`
- Modify: `apps/worker/src/processor.ts:75-90,300-370`
- Modify: `apps/worker/src/processor.test.ts`
- Modify: `apps/worker/src/runtime.ts:165-305`
- Modify: `apps/worker/src/runtime.test.ts`
- Modify: `apps/worker/src/index.ts:31-59`
- Modify: `packages/types/src/index.ts:1240-1270`
- Modify: `packages/types/src/index.test.ts`

**Interfaces:**
- Produces: `ResolvedGeoAdapters`, `resolveGeoProviderAdapters(job): Promise<ResolvedGeoAdapters>`.
- Precedence: organization BYOK, platform key, explicit missing-provider result.

- [ ] **Step 1: Write failing precedence tests**

```ts
it("prefers organization BYOK over the platform GEO key", async () => {
  const resolver = createProviderCredentialResolver(resolverFixture({
    organizationByok: { org_a: { geo_chatgpt: "org-key" } },
    platformKeys: { geo_chatgpt: "platform-key" }
  }));
  const resolved = await resolver.resolveGeoProviderAdapters(geoJob("org_a", "site_a", ["chatgpt"]));
  expect(resolved.credentialSources.chatgpt).toBe("encrypted");
  expect(resolved.adapters.chatgpt).toBeDefined();
});

it("returns an explicit missing provider instead of a fixture", async () => {
  const result = await processGeoAnswerMonitorJob(geoJob("org_a", "site_a", ["claude"]), {
    liveExternalApis: "enabled",
    resolveGeoProviderAdapters: async () => ({ adapters: {}, credentialSources: {} })
  });
  expect(result.monitorResults[0]).toMatchObject({
    provider: "claude",
    status: "setup_required",
    observations: [],
    liveExternalApis: "enabled"
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/worker exec vitest run src/provider-credential-resolver.test.ts src/processor.test.ts
```

- [ ] **Step 3: Move GEO adapter creation from startup to job execution**

Remove startup-global `geoLiveAdapters`. The Worker passes platform key metadata to the resolver; the resolver decrypts an organization default account when present and creates only requested adapters. Copilot remains unsupported and returns a normalized unavailable result.

Extend `GeoAnswerMonitorResultSchema` with `status: "ok" | "failed" | "setup_required"` and this optional error contract:

```ts
const GeoAnswerMonitorProviderErrorSchema = z.object({
  code: z.enum([
    "account_missing",
    "provider_rate_limited",
    "provider_request_failed",
    "credential_decryption_failed"
  ]),
  message: z.string().min(1)
}).strict();
```

Permit an empty observation array only when status is not `ok`; require at least one observation for `ok`. This allows one provider to fail without aborting results from the others.

```ts
export interface ResolvedGeoAdapters {
  readonly adapters: Partial<Record<GeoAnswerMonitorProvider, GeoAnswerMonitorAdapter>>;
  readonly credentialSources: Partial<Record<GeoAnswerMonitorProvider, CredentialSource>>;
}
```

- [ ] **Step 4: Verify focused Worker tests**

```bash
corepack pnpm --filter @searchops/worker exec vitest run src/provider-credential-resolver.test.ts src/processor.test.ts src/runtime.test.ts
corepack pnpm --filter @searchops/worker typecheck
```

Expected: BYOK precedence passes and live missing providers are non-fixture failures.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/provider-credential-resolver.ts apps/worker/src/provider-credential-resolver.test.ts apps/worker/src/processor.ts apps/worker/src/processor.test.ts apps/worker/src/runtime.ts apps/worker/src/runtime.test.ts apps/worker/src/index.ts packages/types/src/index.ts packages/types/src/index.test.ts
git commit -m "feat(worker): resolve organization GEO BYOK per job"
```

### Task 11: Build provider-account and site-binding Web UI

**Files:**
- Create: `apps/web/src/provider-accounts.ts`
- Create: `apps/web/src/provider-accounts.test.ts`
- Create: `apps/web/app/ops/integrations/page.tsx`
- Create: `apps/web/app/ops/integrations/actions.ts`
- Modify: `apps/web/app/sites/[siteId]/connectors/page.tsx:1-140,473-560`
- Modify: `apps/web/app/sites/[siteId]/connectors/actions.ts`
- Modify: `apps/web/src/connector-oauth.ts`
- Modify: `apps/web/src/dashboard-shell.tsx`
- Modify: `apps/web/src/foundation.test.ts`

**Interfaces:**
- Consumes: Task 6 APIs and Task 7 `apiFetchAsUser`.
- Produces: organization integration management and site account/resource selection.

- [ ] **Step 1: Write failing data-client tests**

```ts
it("never keeps the submitted API key in the returned account", async () => {
  const fetch = createAuthenticatedFetch({
    response: { id: "pa_1", provider: "geo_chatgpt", displayName: "Primary", status: "connected" }
  });
  const result = await createApiKeyProviderAccount(fetch, {
    organizationId: "org_a",
    provider: "geo_chatgpt",
    displayName: "Primary",
    apiKey: "raw-key"
  });
  expect(JSON.stringify(result)).not.toContain("raw-key");
});

it("normalizes numeric GA4 input before saving", async () => {
  const fetch = createAuthenticatedFetch();
  await saveSiteConnector(fetch, {
    siteId: "site_a",
    provider: "ga4",
    providerAccountId: "pa_google",
    externalResourceId: "123456789"
  });
  expect(fetch.lastBody()).toContain("properties/123456789");
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/web exec vitest run src/provider-accounts.test.ts
```

- [ ] **Step 3: Implement organization integration actions and page**

The page groups Google, Bing, and GEO BYOK accounts by provider. Use password inputs for new/replacement API keys, never set a `value` from server data, and show metadata only. Actions call `apiFetchAsUser`, revalidate `/ops/integrations`, and redirect with normalized `saved`, `deleted`, `account_in_use`, or `failed` status.

Controls:

- Google: connect/reconnect command.
- Bing: API-key create/replace and account label.
- GEO providers: API-key create/replace/delete and `isDefault` status.
- Shared account: attached-site count and delete disabled while nonzero.

- [ ] **Step 4: Implement site connector selectors**

On `/sites/[siteId]/connectors`:

- GSC: Google account select plus exact `sc-domain:` or URL-prefix resource input.
- GA4: Google account select plus numeric/property resource input.
- Bing: Bing account select plus verified-site URL input.
- PageSpeed: read-only platform-managed status.
- GEO: organization BYOK or SearchOps-funded source labels.

Use existing pending submit controls and keep dimensions stable. Editors see sync controls but not credential/binding mutation controls; viewers see status only.

- [ ] **Step 5: Run Web tests, typecheck, and commit**

```bash
corepack pnpm --filter @searchops/web exec vitest run src/provider-accounts.test.ts src/foundation.test.ts
corepack pnpm --filter @searchops/web typecheck
corepack pnpm --filter @searchops/web lint
git add apps/web/src/provider-accounts.ts apps/web/src/provider-accounts.test.ts apps/web/app/ops/integrations/page.tsx apps/web/app/ops/integrations/actions.ts 'apps/web/app/sites/[siteId]/connectors/page.tsx' 'apps/web/app/sites/[siteId]/connectors/actions.ts' apps/web/src/connector-oauth.ts apps/web/src/dashboard-shell.tsx apps/web/src/foundation.test.ts
git commit -m "feat(web): manage provider accounts and site bindings"
```

### Task 12: Update readiness, local configuration, and rollout documentation

**Files:**
- Modify: `apps/api/src/readiness.ts`
- Modify: `apps/api/src/connector-live-setup.ts`
- Create: `apps/api/src/readiness.test.ts`
- Modify: `apps/api/src/connector-live-setup.test.ts`
- Modify: `apps/api/src/server.ts:825-860`
- Modify: `apps/api/src/server.test.ts`
- Modify: `.env.example`
- Modify: `scripts/dev/api.env.example`
- Modify: `scripts/dev/worker.env.example`
- Modify: `docs/RUNBOOKS.md`
- Modify: `docs/PRODUCTION_LAUNCH_CHECKLIST.md`
- Modify: `docs/API_SPEC.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Produces: readiness that separates platform secrets from per-organization/per-site configuration.
- Produces: `ConnectorCredentialReadinessSnapshot` with `configuredByProvider`, `encryptedAccounts`, and `legacyFallbacks`.
- Documents exact migration, rotation, validation, and rollback commands.

- [ ] **Step 1: Write failing readiness tests**

```ts
it("does not require a global GA4 property or Bing key after encrypted cutover", () => {
  const report = createConnectorLiveSetupReport({
    env: {
      DATABASE_URL: "postgresql://localhost/searchops",
      REDIS_URL: "redis://localhost:6379",
      SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
      SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
    },
    environment: "deployment",
    generatedAt: new Date("2026-07-13T00:00:00.000Z")
  });
  expect(report.checks.find((check) => check.id === "ga4-live-credential")?.envKeys).not.toContain(
    "SEARCHOPS_GA4_PROPERTY_ID"
  );
  expect(report.checks.find((check) => check.id === "bing-live-credential")?.envKeys).not.toContain(
    "SEARCHOPS_BING_API_KEY"
  );
});

it("uses persisted connector readiness instead of global customer env", () => {
  const report = createOperationalReadiness({
    env: {
      DATABASE_URL: "postgresql://localhost/searchops",
      REDIS_URL: "redis://localhost:6379",
      SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted"
    },
    generatedAt: new Date("2026-07-13T00:00:00.000Z"),
    connectorCredentials: {
      configuredByProvider: { gsc: 2, ga4: 2, bing: 1 },
      encryptedAccounts: 3,
      legacyFallbacks: 0
    }
  });
  expect(report.items.find((item) => item.id === "live-ga4")?.status).toBe("configured");
  expect(report.items.find((item) => item.id === "live-bing")?.status).toBe("configured");
});
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/readiness.test.ts src/connector-live-setup.test.ts
```

- [ ] **Step 3: Implement readiness separation**

Platform readiness checks:

- encryption keyring valid on API and Worker;
- Google OAuth app credentials valid on API and client ID/secret present on Worker for refresh;
- PageSpeed platform key optional/configured;
- SearchOps-funded GEO keys optional/configured.

Site readiness comes from `SiteConnector`/`ProviderAccount` status and is not inferred from global GA4/Bing environment variables. In `dual` mode, expose a warning while any sync summary reports `credentialSources.* = legacy`.

The authenticated `/ops/readiness` route loads `getCredentialReadinessSnapshot()` from the provider credential store and passes it to `createOperationalReadiness`. The local CLI remains safe without DB queries and reports only runtime/platform configuration.

- [ ] **Step 4: Update examples and runbooks**

Document only synthetic example values, never real values. Include these exact operational commands:

```bash
corepack pnpm db:migrate:status
corepack pnpm db:migrate:deploy
corepack pnpm credentials:migrate -- --dry-run
corepack pnpm credentials:migrate -- --apply --batch-size=100
corepack pnpm credentials:rotate -- --dry-run
corepack pnpm credentials:rotate -- --apply --batch-size=100
corepack pnpm check:connector-live
```

Document initial key generation as `openssl rand -base64 32`; instruct the operator to paste the output directly into Railway secrets and never into files, documentation, screenshots, or Git.

State that API and Worker receive encryption keys, Vercel does not, and the plaintext table cannot be dropped without a separate approval.

- [ ] **Step 5: Verify and commit**

```bash
corepack pnpm --filter @searchops/api exec vitest run src/readiness.test.ts src/connector-live-setup.test.ts
corepack pnpm check:connector-live
git diff --check
git add apps/api/src/readiness.ts apps/api/src/readiness.test.ts apps/api/src/connector-live-setup.ts apps/api/src/connector-live-setup.test.ts apps/api/src/server.ts apps/api/src/server.test.ts .env.example scripts/dev/api.env.example scripts/dev/worker.env.example docs/RUNBOOKS.md docs/PRODUCTION_LAUNCH_CHECKLIST.md docs/API_SPEC.md docs/ARCHITECTURE.md
git commit -m "docs(ops): document encrypted connector rollout"
```

### Task 13: Run full verification and prepare the expand release

**Files:**
- Modify only files required to fix failures caused by Tasks 1-12.

**Interfaces:**
- Produces: a buildable, migration-gated expand release in `dual` mode.
- Does not produce: the destructive contract migration.

- [ ] **Step 1: Confirm project and migration isolation**

```bash
test "$(git rev-parse --show-toplevel)" = "/Users/kionya/searchops-ai"
test "$(git remote get-url origin)" = "https://github.com/kionya/searchops-ai.git"
git status --short
corepack pnpm db:migrate:status
```

Expected: correct root/remote, intentional changes only, migration status readable.

- [ ] **Step 2: Run package-focused verification**

```bash
corepack pnpm --filter @searchops/types test
corepack pnpm --filter @searchops/db test
corepack pnpm --filter @searchops/connectors test
corepack pnpm --filter @searchops/api test
corepack pnpm --filter @searchops/worker test
corepack pnpm --filter @searchops/web test
```

Expected: all PASS with no live provider calls.

- [ ] **Step 3: Run repository verification**

```bash
corepack pnpm lint
corepack pnpm build
corepack pnpm -r typecheck
corepack pnpm -r test
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Rehearse the additive migration locally**

Against only this repository's approved PostgreSQL runtime:

```bash
corepack pnpm db:migrate:deploy
corepack pnpm db:migrate:status
corepack pnpm credentials:migrate -- --dry-run
```

Expected: additive migration applied, status current, dry-run reports counts without writes or secrets.

- [ ] **Step 5: Resolve failures in their owning task**

Task 13 creates no catch-all code commit. If a command fails, return to the task that owns the failing module, add a focused regression test, complete that task's RED/GREEN cycle, and amend only that task's listed commit. When every command passes, record the successful commands in the PR summary and do not create an empty commit.

### Task 14: Execute the production expand/backfill/cutover runbook

**Files:**
- No repository changes during expand/backfill unless a verified defect requires a normal reviewed fix.
- A later contract migration file is explicitly excluded until separate approval.

**Interfaces:**
- Consumes: completed Tasks 1-13 and production secrets managed by the operator.
- Produces: encrypted-only runtime after the observation gate.

- [ ] **Step 1: Preflight with operator-controlled secrets**

1. Create and verify a restorable Supabase backup.
2. Generate the initial key with `openssl rand -base64 32` and set active encryption key variables on Railway API and Worker only without writing the value to a file.
3. Set `SEARCHOPS_CREDENTIAL_STORAGE_MODE=dual` on API and Worker.
4. Confirm Vercel has no credential encryption key.
5. Confirm API and Worker health before deployment.

- [ ] **Step 2: Deploy expand release in dependency order**

1. Run `corepack pnpm db:migrate:deploy` against the production database.
2. Deploy API.
3. Deploy Worker.
4. Deploy Web.
5. Confirm `/health`, authenticated connector metadata, and queue processing.

- [ ] **Step 3: Backfill and reconcile**

Run in a Railway one-off API/DB execution environment:

```bash
corepack pnpm credentials:migrate -- --dry-run
corepack pnpm credentials:migrate -- --apply --batch-size=100
corepack pnpm credentials:migrate -- --dry-run
```

Expected: first dry-run reports candidates, apply reports migrated/skipped/failed counts, final dry-run reports zero unmigrated candidates. Reconcile legacy row count, migrated `legacyCredentialId` count, and GSC/GA4 site binding count without selecting token columns.

- [ ] **Step 4: Validate real provider routing**

1. Sync GSC and GA4 for two sites with different resources.
2. Confirm a shared Google account can serve both sites without resource crossover.
3. Confirm organization Bing key only accesses that organization's bound sites.
4. Confirm organization GEO BYOK overrides the platform key.
5. Confirm PageSpeed still uses the platform key.
6. Confirm no live result has `fixture=true`.

- [ ] **Step 5: Cut over after evidence is complete**

1. Confirm no new sync summary reports `credentialSources.* = legacy`.
2. Set `SEARCHOPS_CREDENTIAL_STORAGE_MODE=encrypted` on API and Worker.
3. Redeploy API and Worker.
4. Observe sync, token refresh, provider errors, and decryption errors for at least seven days.

- [ ] **Step 6: Stop at the contract gate**

Do not drop `ConnectorOAuthCredential`, remove its code paths, remove the global GA4/Bing fallback environment fields, or delete previous backups in this plan. After seven days of zero fallback, create a new separately reviewed contract-migration plan and request explicit operator approval before any destructive SQL.

---

## Completion Criteria

- All Tasks 1-13 are merged and repository verification passes.
- Production backfill reports zero failed and zero unmigrated legacy rows.
- Two-site GSC/GA4 routing proves resources do not cross.
- Organization Bing and GEO BYOK isolation is verified.
- PageSpeed remains platform-managed.
- Live mode produces no fixture fallback.
- Storage mode is `encrypted` after the observation gate.
- The plaintext legacy table remains untouched until the separately approved contract phase.
