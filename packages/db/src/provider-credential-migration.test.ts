import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createPrismaProviderCredentialMaintenanceStore,
  migrateLegacyProviderCredentials,
  parseCredentialMaintenanceCliArgs,
  rotateProviderCredentialEncryption,
  type LegacyProviderCredentialRow,
  type ProviderCredentialMaintenanceStore,
  type ProviderCredentialMaintenanceTransaction,
  type RotatableProviderCredentialRow,
} from "./provider-credential-migration.js";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type CredentialKeyring,
} from "./credential-crypto.js";
import { deriveCanonicalProviderAccountId } from "./provider-credential-store.js";

const keyV1 = randomBytes(32).toString("base64");
const keyV2 = randomBytes(32).toString("base64");

describe("legacy provider credential migration", () => {
  it("is a no-op on dry run and reports exact counts", async () => {
    const store = createMigrationStore({ legacyRows: [legacyGscRow(), legacyGa4Row()] });

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: false,
      batchSize: 100,
      legacyGa4PropertyId: "123456789",
    });

    expect(summary).toEqual({
      examined: 2,
      migrated: 0,
      skipped: 0,
      failed: 0,
      pending: 2,
      dryRun: true,
    });
    expect(store.writes).toEqual([]);
  });

  it("does not duplicate rows on a second apply", async () => {
    const store = createMigrationStore({ legacyRows: [legacyGscRow()] });

    await migrateLegacyProviderCredentials(store, keyring(), { apply: true, batchSize: 100 });
    const second = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(second).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 1,
      failed: 0,
      pending: 0,
      dryRun: false,
    });
    expect(store.accounts).toHaveLength(1);
    expect(store.connectors).toHaveLength(1);
  });

  it("rolls back only a failed batch and resumes it later", async () => {
    const store = createMigrationStore({
      legacyRows: [
        legacyGscRow({ id: "legacy_1" }),
        legacyGscRow({ id: "legacy_2" }),
        legacyGscRow({ id: "legacy_3" }),
      ],
    });
    store.failNextCreateFor.add("legacy_2");

    const first = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 1,
    });

    expect(first).toEqual({
      examined: 3,
      migrated: 2,
      skipped: 0,
      failed: 1,
      pending: 1,
      dryRun: false,
    });
    expect(store.accounts.map((row) => row.legacyCredentialId)).toEqual(["legacy_1", "legacy_3"]);

    const resumed = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 1,
    });

    expect(resumed).toEqual({
      examined: 3,
      migrated: 1,
      skipped: 2,
      failed: 0,
      pending: 0,
      dryRun: false,
    });
    expect(store.accounts.map((row) => row.legacyCredentialId).sort()).toEqual([
      "legacy_1",
      "legacy_2",
      "legacy_3",
    ]);
  });

  it("rechecks idempotency inside the transaction", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({ legacyRows: [row] });
    store.beforeNextTransaction = () => store.seedMigratedAccount(row);

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 1,
      failed: 0,
      pending: 0,
      dryRun: false,
    });
    expect(store.accounts).toHaveLength(1);
    expect(store.connectors).toHaveLength(0);
  });

  it("rejects a site owned by another organization without writing", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({
      legacyRows: [row],
      sites: [{ id: row.siteId, organizationId: "org_other" }],
    });

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 0,
      failed: 1,
      pending: 0,
      dryRun: false,
    });
    expect(store.writes).toEqual([]);
  });

  it("creates a GSC connector with legacy automatic resource resolution", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({ legacyRows: [row] });

    await migrateLegacyProviderCredentials(store, keyring(), { apply: true, batchSize: 100 });

    expect(store.connectors[0]).toMatchObject({
      provider: "gsc",
      externalResourceId: null,
      config: { resourceResolution: "legacy_auto" },
      status: "connected",
    });
    expect(store.accounts[0]).toMatchObject({
      id: deriveCanonicalProviderAccountId({
        organizationId: row.organizationId,
        provider: "google",
        externalAccountId: `legacy:${row.id}`,
      }),
      externalAccountId: null,
      accountEmail: row.externalAccountEmail,
      scopes: row.scopes,
      status: row.status,
      connectedAt: row.connectedAt,
      connectedByUserId: row.connectedByUserId,
    });
    expect(decryptAccount(store.accounts[0]!, keyring())).toEqual({
      kind: "oauth2",
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenType: row.tokenType,
    });
  });

  it("normalizes a numeric GA4 property and marks a missing property as needing configuration", async () => {
    const withProperty = createMigrationStore({ legacyRows: [legacyGa4Row()] });
    const withoutProperty = createMigrationStore({ legacyRows: [legacyGa4Row()] });

    await migrateLegacyProviderCredentials(withProperty, keyring(), {
      apply: true,
      batchSize: 100,
      legacyGa4PropertyId: "123456789",
    });
    await migrateLegacyProviderCredentials(withoutProperty, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(withProperty.connectors[0]).toMatchObject({
      provider: "ga4",
      externalResourceId: "properties/123456789",
      config: {},
      status: "connected",
    });
    expect(withoutProperty.connectors[0]).toMatchObject({
      provider: "ga4",
      externalResourceId: null,
      config: {},
      status: "needs_configuration",
    });
  });

  it("counts unsupported providers and malformed legacy rows as failures", async () => {
    const store = createMigrationStore({
      legacyRows: [
        legacyGscRow({ id: "legacy_bing", provider: "bing" }),
        legacyGscRow({ id: "legacy_scopes", scopes: ["scope:a", ""] }),
      ],
    });

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: false,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 2,
      migrated: 0,
      skipped: 0,
      failed: 2,
      pending: 0,
      dryRun: true,
    });
    expect(JSON.stringify(summary)).not.toContain("access-token");
  });
});

describe("provider credential encryption rotation", () => {
  it("rotates a previous-key row to the active key without exposing the secret", async () => {
    const store = createMigrationStore({ encryptedRows: [encryptedV1Row()] });

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toMatchObject({
      examined: 1,
      migrated: 1,
      failed: 0,
      pending: 0,
      dryRun: false,
    });
    expect(store.encryptedRows[0]?.encryptionKeyId).toBe("v2");
    expect(JSON.stringify(summary)).not.toContain("access-token");
  });

  it("verifies decryptability on dry run without updating the envelope", async () => {
    const original = encryptedV1Row();
    const store = createMigrationStore({ encryptedRows: [original] });

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: false,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      pending: 1,
      dryRun: true,
    });
    expect(store.encryptedRows[0]).toEqual(original);
    expect(store.writes).toEqual([]);
  });

  it.each(["tampered", "unknown-key"] as const)("counts a %s envelope as failed", async (kind) => {
    const original = encryptedV1Row();
    const broken =
      kind === "unknown-key"
        ? { ...original, encryptionKeyId: "retired" }
        : { ...original, credentialAuthTag: tamperBase64(original.credentialAuthTag) };
    const store = createMigrationStore({ encryptedRows: [broken] });

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 0,
      failed: 1,
      pending: 0,
      dryRun: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /access-token|credentialCiphertext|credentialIv|credentialAuthTag|keyV1|keyV2/,
    );
  });

  it("leaves an optimistic update miss pending for a later run", async () => {
    const store = createMigrationStore({ encryptedRows: [encryptedV1Row()] });
    store.optimisticMissIds.add("account_1");

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 1,
      failed: 0,
      pending: 1,
      dryRun: false,
    });
    expect(store.encryptedRows[0]?.encryptionKeyId).toBe("v1");
  });
});

describe("credential maintenance CLI validation", () => {
  it.each([
    { args: [] },
    { args: ["--dry-run", "--apply"] },
    { args: ["--apply", "--batch-size=0"] },
    { args: ["--apply", "--batch-size=1.5"] },
    { args: ["--apply", "--unknown"] },
  ])("rejects invalid flags without reflecting their values: $args", ({ args }) => {
    expect(() => parseCredentialMaintenanceCliArgs(args)).toThrow(
      "credential_maintenance_arguments_invalid",
    );
  });

  it("requires one mode and defaults or parses a positive batch size", () => {
    expect(parseCredentialMaintenanceCliArgs(["--dry-run"])).toEqual({
      apply: false,
      batchSize: 100,
    });
    expect(parseCredentialMaintenanceCliArgs(["--apply", "--batch-size=25"])).toEqual({
      apply: true,
      batchSize: 25,
    });
  });

  it("keeps parser errors and summaries free of secrets", () => {
    const secret = "access-token-never-print";
    let message = "";
    try {
      parseCredentialMaintenanceCliArgs(["--apply", `--batch-size=${secret}`]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("credential_maintenance_arguments_invalid");
    expect(message).not.toContain(secret);
  });

  it("exposes a production adapter factory without opening a connection", () => {
    expect(typeof createPrismaProviderCredentialMaintenanceStore).toBe("function");
  });
});

interface AccountWrite {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: "google";
  readonly authType: "oauth2";
  readonly externalAccountId: null;
  readonly accountEmail: string | null;
  readonly displayName: string;
  readonly status: "connected" | "expired" | "revoked";
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly legacyCredentialId: string;
  readonly connectedByUserId: string;
  readonly connectedAt: Date;
  readonly encryptedCredential: RotatableEnvelope;
}

interface ConnectorWrite {
  readonly organizationId: string;
  readonly siteId: string;
  readonly provider: "gsc" | "ga4";
  readonly providerAccountId: string;
  readonly externalResourceId: string | null;
  readonly config: Record<string, unknown>;
  readonly status: "connected" | "needs_configuration" | "expired" | "revoked";
}

interface RotatableEnvelope {
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: 1;
}

function createMigrationStore(options: {
  readonly legacyRows?: readonly LegacyProviderCredentialRow[];
  readonly encryptedRows?: readonly RotatableProviderCredentialRow[];
  readonly sites?: readonly { readonly id: string; readonly organizationId: string }[];
}) {
  const defaultSites = (options.legacyRows ?? []).map((row) => ({
    id: row.siteId,
    organizationId: row.organizationId,
  }));
  const state = {
    accounts: [] as AccountWrite[],
    connectors: [] as ConnectorWrite[],
    encryptedRows: (options.encryptedRows ?? []).map((row) => ({ ...row })),
    sites: [...(options.sites ?? defaultSites)],
    writes: [] as string[],
  };

  const store: ProviderCredentialMaintenanceStore & {
    readonly accounts: AccountWrite[];
    readonly connectors: ConnectorWrite[];
    readonly encryptedRows: RotatableProviderCredentialRow[];
    readonly writes: string[];
    readonly failNextCreateFor: Set<string>;
    readonly optimisticMissIds: Set<string>;
    beforeNextTransaction: (() => void) | undefined;
    seedMigratedAccount(row: LegacyProviderCredentialRow): void;
  } = {
    accounts: state.accounts,
    connectors: state.connectors,
    encryptedRows: state.encryptedRows,
    writes: state.writes,
    failNextCreateFor: new Set(),
    optimisticMissIds: new Set(),
    beforeNextTransaction: undefined,

    async listLegacyCredentials(input) {
      return (options.legacyRows ?? [])
        .filter((row) => input.afterId === null || row.id > input.afterId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit);
    },

    async inspectLegacyCredential(input) {
      return inspectState(state, input);
    },

    async listProviderCredentialsForRotation(input) {
      return state.encryptedRows
        .filter((row) => row.encryptionKeyId !== input.activeKeyId)
        .filter((row) => input.afterId === null || row.id > input.afterId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit)
        .map((row) => ({ ...row }));
    },

    async transaction(operation) {
      store.beforeNextTransaction?.();
      store.beforeNextTransaction = undefined;
      const draft = {
        accounts: state.accounts.map((row) => ({ ...row })),
        connectors: state.connectors.map((row) => ({ ...row, config: { ...row.config } })),
        encryptedRows: state.encryptedRows.map((row) => ({ ...row })),
        sites: state.sites.map((row) => ({ ...row })),
        writes: [...state.writes],
      };
      const transaction = createFakeTransaction(draft, store);
      const result = await operation(transaction);

      state.accounts.splice(0, state.accounts.length, ...draft.accounts);
      state.connectors.splice(0, state.connectors.length, ...draft.connectors);
      state.encryptedRows.splice(0, state.encryptedRows.length, ...draft.encryptedRows);
      state.writes.splice(0, state.writes.length, ...draft.writes);
      return result;
    },

    seedMigratedAccount(row) {
      if (state.accounts.some((account) => account.legacyCredentialId === row.id)) return;
      state.accounts.push(accountFromLegacy(row, keyring()));
    },
  };

  return store;
}

function createFakeTransaction(
  draft: {
    accounts: AccountWrite[];
    connectors: ConnectorWrite[];
    encryptedRows: RotatableProviderCredentialRow[];
    sites: { id: string; organizationId: string }[];
    writes: string[];
  },
  controls: { readonly failNextCreateFor: Set<string>; readonly optimisticMissIds: Set<string> },
): ProviderCredentialMaintenanceTransaction {
  return {
    async inspectLegacyCredential(input) {
      return inspectState(draft, input);
    },

    async createLegacyProviderAccount(input) {
      if (controls.failNextCreateFor.delete(input.legacyCredentialId)) {
        throw new Error("provider_credential_maintenance_row_failed");
      }
      if (draft.accounts.some((row) => row.legacyCredentialId === input.legacyCredentialId)) {
        throw new Error("provider_credential_maintenance_duplicate");
      }
      draft.accounts.push({ ...input });
      draft.writes.push(`account:${input.legacyCredentialId}`);
    },

    async upsertLegacySiteConnector(input) {
      const index = draft.connectors.findIndex(
        (row) => row.siteId === input.siteId && row.provider === input.provider,
      );
      if (index === -1) draft.connectors.push({ ...input });
      else draft.connectors[index] = { ...input };
      draft.writes.push(`connector:${input.siteId}:${input.provider}`);
    },

    async updateProviderCredentialEncryption(input) {
      if (controls.optimisticMissIds.has(input.id)) return false;
      const index = draft.encryptedRows.findIndex(
        (row) =>
          row.id === input.id &&
          row.organizationId === input.organizationId &&
          row.updatedAt.getTime() === input.expectedUpdatedAt.getTime(),
      );
      if (index === -1) return false;
      draft.encryptedRows[index] = { ...draft.encryptedRows[index]!, ...input.encryptedCredential };
      draft.writes.push(`rotation:${input.id}`);
      return true;
    },
  };
}

function inspectState(
  state: {
    readonly accounts: readonly AccountWrite[];
    readonly sites: readonly { id: string; organizationId: string }[];
  },
  input: {
    readonly legacyCredentialId: string;
    readonly siteId: string;
    readonly organizationId: string;
  },
) {
  return Promise.resolve({
    providerAccountId:
      state.accounts.find((row) => row.legacyCredentialId === input.legacyCredentialId)?.id ?? null,
    siteBelongsToOrganization: state.sites.some(
      (row) => row.id === input.siteId && row.organizationId === input.organizationId,
    ),
  });
}

function legacyGscRow(
  overrides: Partial<LegacyProviderCredentialRow> = {},
): LegacyProviderCredentialRow {
  return {
    id: "legacy_gsc",
    organizationId: "org_a",
    siteId: "site_a",
    provider: "gsc",
    status: "connected",
    scopes: ["scope:gsc"],
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    tokenExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
    externalAccountEmail: "legacy@example.com",
    connectedByUserId: "user_a",
    connectedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function legacyGa4Row(
  overrides: Partial<LegacyProviderCredentialRow> = {},
): LegacyProviderCredentialRow {
  return legacyGscRow({ id: "legacy_ga4", provider: "ga4", scopes: ["scope:ga4"], ...overrides });
}

function encryptedV1Row(): RotatableProviderCredentialRow {
  const row = {
    id: "account_1",
    organizationId: "org_a",
    provider: "google" as const,
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
  };
  return {
    ...row,
    ...encryptProviderCredential(
      keyring(),
      {
        organizationId: row.organizationId,
        providerAccountId: row.id,
        provider: row.provider,
      },
      {
        kind: "oauth2",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
      },
    ),
  };
}

function accountFromLegacy(
  row: LegacyProviderCredentialRow,
  credentialKeyring: CredentialKeyring,
): AccountWrite {
  const id = deriveCanonicalProviderAccountId({
    organizationId: row.organizationId,
    provider: "google",
    externalAccountId: `legacy:${row.id}`,
  });
  return {
    id,
    organizationId: row.organizationId,
    provider: "google",
    authType: "oauth2",
    externalAccountId: null,
    accountEmail: row.externalAccountEmail,
    displayName: "Legacy Google account",
    status: row.status as AccountWrite["status"],
    scopes: row.scopes as readonly string[],
    tokenExpiresAt: row.tokenExpiresAt,
    legacyCredentialId: row.id,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt,
    encryptedCredential: encryptProviderCredential(
      credentialKeyring,
      {
        organizationId: row.organizationId,
        providerAccountId: id,
        provider: "google",
      },
      {
        kind: "oauth2",
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        tokenType: row.tokenType,
      },
    ),
  };
}

function decryptAccount(account: AccountWrite, credentialKeyring: CredentialKeyring) {
  return decryptProviderCredential(
    credentialKeyring,
    {
      organizationId: account.organizationId,
      providerAccountId: account.id,
      provider: account.provider,
    },
    account.encryptedCredential,
  );
}

function keyring(): CredentialKeyring {
  return parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: keyV1,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
  });
}

function rotatingKeyring(): CredentialKeyring {
  return parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v2",
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: keyV2,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JSON.stringify({ v1: keyV1 }),
  });
}

function tamperBase64(value: string): string {
  const decoded = Buffer.from(value, "base64");
  decoded[0] = (decoded[0] ?? 0) ^ 1;
  return decoded.toString("base64");
}
