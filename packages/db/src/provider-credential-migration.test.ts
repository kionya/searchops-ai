import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createPrismaProviderCredentialMaintenanceStore,
  migrateLegacyProviderCredentials,
  parseCredentialMaintenanceCliArgs,
  rotateProviderCredentialEncryption,
  type CredentialMaintenanceCliOptions,
  type CredentialMaintenanceSummary,
  type LegacyProviderCredentialRow,
  type ProviderCredentialMaintenancePrismaPort,
  type ProviderCredentialMaintenancePrismaTransactionPort,
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

  it("inspects before validating historical secret metadata and skips a tenant-safe match", async () => {
    const row = legacyGscRow({
      accessToken: "",
      externalAccountEmail: "not-an-email",
      scopes: [""],
      connectedAt: new Date("invalid"),
    });
    const store = createMigrationStore({ legacyRows: [row] });
    store.seedMigratedAccount(legacyGscRow({ id: row.id }));

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
    expect(store.inspectionInputs).toHaveLength(1);
    expect(store.writes).toEqual([]);
  });

  it("inspects a new row before full validation but never inspects an invalid identity", async () => {
    const store = createMigrationStore({
      legacyRows: [
        legacyGscRow({ id: "legacy_bad_secret", accessToken: "" }),
        legacyGscRow({ id: "", accessToken: "" }),
      ],
    });

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: false,
      batchSize: 100,
    });

    expect(summary.failed).toBe(2);
    expect(store.inspectionInputs).toEqual([
      {
        legacyCredentialId: "legacy_bad_secret",
        organizationId: "org_a",
        siteId: "site_a",
      },
    ]);
  });

  it("fails an existing legacy match bound to another organization", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({ legacyRows: [row] });
    store.seedMigratedAccount(row, "org_other");

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

  it("fails an existing legacy match when the site is outside the row organization", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({
      legacyRows: [row],
      sites: [{ id: row.siteId, organizationId: "org_other" }],
    });
    store.seedMigratedAccount(row);

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toMatchObject({ migrated: 0, skipped: 0, failed: 1, pending: 0 });
    expect(store.writes).toEqual([]);
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

  it("rechecks tenant ownership for an existing match inside the transaction", async () => {
    const row = legacyGscRow();
    const store = createMigrationStore({ legacyRows: [row] });
    store.beforeNextTransaction = () => store.seedMigratedAccount(row, "org_other");

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 1,
      migrated: 0,
      skipped: 0,
      failed: 1,
      pending: 1,
      dryRun: false,
    });
    expect(store.connectors).toHaveLength(0);
    expect(store.writes).toEqual([]);
  });

  it("keeps a transaction-observed skip when a later migration row throws", async () => {
    const first = legacyGscRow({ id: "legacy_1" });
    const second = legacyGscRow({ id: "legacy_2" });
    const store = createMigrationStore({ legacyRows: [first, second] });
    store.beforeNextTransaction = () => store.seedMigratedAccount(first);
    store.failNextCreateFor.add(second.id);

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 2,
      migrated: 0,
      skipped: 1,
      failed: 1,
      pending: 1,
      dryRun: false,
    });
    expect(store.accounts.map((account) => account.legacyCredentialId)).toEqual([first.id]);
    expect(store.connectors).toEqual([]);
    expect(store.writes).toEqual([]);
  });

  it("keeps a transaction-observed skip when the migration commit throws", async () => {
    const first = legacyGscRow({ id: "legacy_1" });
    const second = legacyGscRow({ id: "legacy_2" });
    const store = createMigrationStore({ legacyRows: [first, second] });
    store.beforeNextTransaction = () => store.seedMigratedAccount(first);
    store.failNextCommit = true;

    const summary = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toMatchObject({ migrated: 0, skipped: 1, failed: 1, pending: 1 });
    expect(store.accounts.map((account) => account.legacyCredentialId)).toEqual([first.id]);
    expect(store.connectors).toEqual([]);
    expect(store.writes).toEqual([]);
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

  it("keeps an optimistic miss when a later rotation update throws", async () => {
    const store = createMigrationStore({
      encryptedRows: [encryptedV1Row({ id: "account_1" }), encryptedV1Row({ id: "account_2" })],
    });
    store.optimisticMissIds.add("account_1");
    store.failNextRotationFor.add("account_2");

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toEqual({
      examined: 2,
      migrated: 0,
      skipped: 1,
      failed: 1,
      pending: 2,
      dryRun: false,
    });
    expect(store.encryptedRows.map((row) => row.encryptionKeyId)).toEqual(["v1", "v1"]);
    expect(store.writes).toEqual([]);
  });

  it("keeps an optimistic miss when the rotation commit throws", async () => {
    const store = createMigrationStore({
      encryptedRows: [encryptedV1Row({ id: "account_1" }), encryptedV1Row({ id: "account_2" })],
    });
    store.optimisticMissIds.add("account_1");
    store.failNextCommit = true;

    const summary = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 100,
    });

    expect(summary).toMatchObject({ migrated: 0, skipped: 1, failed: 1, pending: 2 });
    expect(store.encryptedRows.map((row) => row.encryptionKeyId)).toEqual(["v1", "v1"]);
    expect(store.writes).toEqual([]);
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

describe("Prisma credential maintenance adapter", () => {
  it("uses redacted projections, transaction clients, exact options, and stable pagination", async () => {
    const legacyRows = [
      legacyGscRow({ id: "legacy_1" }),
      legacyGa4Row({ id: "legacy_2" }),
    ];
    const rotationRows = [
      encryptedV1Row({ id: "account_1" }),
      encryptedV1Row({ id: "account_2" }),
    ];
    const fake = createMaintenancePrismaPort({ legacyRows, rotationRows });
    const store = createPrismaProviderCredentialMaintenanceStore(fake.prisma);

    const migration = await migrateLegacyProviderCredentials(store, keyring(), {
      apply: true,
      batchSize: 1,
      legacyGa4PropertyId: "123456789",
    });
    const rotation = await rotateProviderCredentialEncryption(store, rotatingKeyring(), {
      apply: true,
      batchSize: 1,
    });

    expect(migration).toMatchObject({ examined: 2, migrated: 2, failed: 0 });
    expect(rotation).toMatchObject({ examined: 2, migrated: 2, failed: 0 });
    expect(fake.calls.legacyList.map((call) => call.where?.id.gt ?? null)).toEqual([
      null,
      "legacy_1",
      "legacy_2",
    ]);
    expect(fake.calls.legacyList.every((call) => call.take === 1)).toBe(true);
    expect(fake.calls.legacyList.every((call) => call.orderBy.id === "asc")).toBe(true);
    expect(fake.calls.rotationList.map((call) => call.where.id?.gt ?? null)).toEqual([
      null,
      "account_1",
      "account_2",
    ]);
    expect(fake.calls.rotationList.every((call) => call.take === 1)).toBe(true);
    expect(fake.calls.rotationList.every((call) => call.orderBy.id === "asc")).toBe(true);
    expect(fake.calls.inspections).not.toHaveLength(0);
    for (const call of fake.calls.inspections) {
      expect(call.select).toEqual({ id: true, organizationId: true });
      expect(JSON.stringify(call)).not.toMatch(
        /credentialCiphertext|credentialIv|credentialAuthTag|encryptionKeyId|accessToken|refreshToken|tokenType/i,
      );
    }
    expect(fake.calls.inspections.map((call) => call.where.legacyCredentialId)).toEqual([
      "legacy_1",
      "legacy_1",
      "legacy_2",
      "legacy_2",
    ]);
    expect(fake.calls.transactionOptions).toEqual(
      Array.from({ length: 4 }, () => ({ maxWait: 30_000, timeout: 300_000 })),
    );
    expect(fake.calls.writes.map((write) => write.client)).toEqual([
      "transaction",
      "transaction",
      "transaction",
      "transaction",
      "transaction",
      "transaction",
    ]);
    expect(fake.calls.accountCreates.map((call) => call.data.id)).toEqual(
      legacyRows.map((row) =>
        deriveCanonicalProviderAccountId({
          organizationId: row.organizationId,
          provider: "google",
          externalAccountId: `legacy:${row.id}`,
        }),
      ),
    );
    const firstCreated = fake.calls.accountCreates[0]!.data;
    expect(
      decryptProviderCredential(
        keyring(),
        {
          organizationId: firstCreated.organizationId,
          providerAccountId: firstCreated.id,
          provider: firstCreated.provider,
        },
        firstCreated,
      ),
    ).toEqual({
      kind: "oauth2",
      accessToken: legacyRows[0]!.accessToken,
      refreshToken: legacyRows[0]!.refreshToken,
      tokenType: legacyRows[0]!.tokenType,
    });
    expect(fake.calls.connectorUpserts.map((call) => call.create.provider)).toEqual([
      "gsc",
      "ga4",
    ]);
    expect(fake.calls.connectorUpserts.map((call) => call.create.externalResourceId)).toEqual([
      null,
      "properties/123456789",
    ]);
    expect(fake.calls.rotationUpdates.map((call) => call.where)).toEqual([
      {
        id: "account_1",
        organizationId: "org_a",
        updatedAt: rotationRows[0]!.updatedAt,
      },
      {
        id: "account_2",
        organizationId: "org_a",
        updatedAt: rotationRows[1]!.updatedAt,
      },
    ]);
    expect(fake.state.rotationRows.map((row) => row.encryptionKeyId)).toEqual(["v2", "v2"]);
  });
});

describe("credential maintenance CLI bindings", () => {
  it("has no output side effects when both CLI modules are imported", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await importMigrateCliModule();
    await importRotationCliModule();

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    error.mockRestore();
  });

  it("binds injected migration dependencies and emits success JSON", async () => {
    const { runMigrateProviderCredentialsCli } = await importMigrateCliModule();
    const summary = maintenanceSummary();
    const output: string[] = [];
    const errors: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };
    const store = createMigrationStore({});

    const exitCode = await runMigrateProviderCredentialsCli(
      ["--injected-test-mode"],
      {},
      {
        parseArgs: () => ({ apply: true, batchSize: 7 }),
        parseKeyring: () => keyring(),
        createClient: () => client,
        createStore: (received) => {
          expect(received).toBe(client);
          return store;
        },
        execute: async (receivedStore, _keyring, options) => {
          expect(receivedStore).toBe(store);
          expect(options).toEqual({ apply: true, batchSize: 7 });
          return summary;
        },
        writeOutput: (message) => output.push(message),
        writeError: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(output).toEqual([JSON.stringify(summary)]);
    expect(errors).toEqual([]);
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("returns migration exit 1 for a failed summary and still disconnects", async () => {
    const { runMigrateProviderCredentialsCli } = await importMigrateCliModule();
    const summary = maintenanceSummary({ failed: 1, pending: 1 });
    const output: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };

    const exitCode = await runMigrateProviderCredentialsCli(
      ["--injected-test-mode"],
      {},
      migrationCliDependencies({
        client,
        execute: async () => summary,
        writeOutput: (message) => output.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(output).toEqual([JSON.stringify(summary)]);
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("redacts migration runtime failures and disconnects without raw output", async () => {
    const { runMigrateProviderCredentialsCli } = await importMigrateCliModule();
    const token = "token-never-print";
    const env = { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: token };
    const output: string[] = [];
    const errors: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };

    const exitCode = await runMigrateProviderCredentialsCli(
      ["--injected-test-mode"],
      env,
      migrationCliDependencies({
        client,
        execute: async () => {
          throw new Error(`P2002 Prisma ${token} ${JSON.stringify(env)}\nraw stack`);
        },
        writeOutput: (message) => output.push(message),
        writeError: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual(["credential_maintenance_failed"]);
    expect(JSON.stringify(errors)).not.toMatch(/P2002|Prisma|token-never-print|raw stack/);
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("binds injected rotation dependencies and emits success JSON", async () => {
    const { runRotateProviderCredentialsCli } = await importRotationCliModule();
    const summary = maintenanceSummary();
    const output: string[] = [];
    const errors: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };
    const store = createMigrationStore({});

    const exitCode = await runRotateProviderCredentialsCli(
      ["--injected-test-mode"],
      {},
      {
        parseArgs: () => ({ apply: true, batchSize: 9 }),
        parseKeyring: () => keyring(),
        createClient: () => client,
        createStore: (received) => {
          expect(received).toBe(client);
          return store;
        },
        execute: async (receivedStore, _keyring, options) => {
          expect(receivedStore).toBe(store);
          expect(options).toEqual({ apply: true, batchSize: 9 });
          return summary;
        },
        writeOutput: (message) => output.push(message),
        writeError: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(output).toEqual([JSON.stringify(summary)]);
    expect(errors).toEqual([]);
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("returns rotation exit 1 for a failed summary and still disconnects", async () => {
    const { runRotateProviderCredentialsCli } = await importRotationCliModule();
    const summary = maintenanceSummary({ failed: 1, pending: 1 });
    const output: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };

    const exitCode = await runRotateProviderCredentialsCli(
      ["--injected-test-mode"],
      {},
      rotationCliDependencies({
        client,
        execute: async () => summary,
        writeOutput: (message) => output.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(output).toEqual([JSON.stringify(summary)]);
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("redacts rotation runtime failures and disconnects without raw output", async () => {
    const { runRotateProviderCredentialsCli } = await importRotationCliModule();
    const token = "rotation-token-never-print";
    const env = { SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: token };
    const output: string[] = [];
    const errors: string[] = [];
    const client = { $disconnect: vi.fn(async () => undefined) };

    const exitCode = await runRotateProviderCredentialsCli(
      ["--injected-test-mode"],
      env,
      rotationCliDependencies({
        client,
        execute: async () => {
          throw new Error(`P2002 Prisma ${token} ${JSON.stringify(env)}\nraw stack`);
        },
        writeOutput: (message) => output.push(message),
        writeError: (message) => errors.push(message),
      }),
    );

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual(["credential_maintenance_failed"]);
    expect(JSON.stringify(errors)).not.toMatch(
      /P2002|Prisma|rotation-token-never-print|raw stack/,
    );
    expect(client.$disconnect).toHaveBeenCalledOnce();
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

interface TestCredentialMaintenanceCliClient {
  $disconnect(): Promise<void>;
}

interface TestCredentialMaintenanceCliDependencies<Options> {
  parseArgs(args: readonly string[]): CredentialMaintenanceCliOptions;
  parseKeyring(env: NodeJS.ProcessEnv): CredentialKeyring;
  createClient(): TestCredentialMaintenanceCliClient;
  createStore(client: TestCredentialMaintenanceCliClient): ProviderCredentialMaintenanceStore;
  execute(
    store: ProviderCredentialMaintenanceStore,
    keyring: CredentialKeyring,
    options: Options,
  ): Promise<CredentialMaintenanceSummary>;
  writeOutput(message: string): void;
  writeError(message: string): void;
}

type TestCredentialMaintenanceCliRunner<Options> = (
  args?: readonly string[],
  env?: NodeJS.ProcessEnv,
  dependencies?: TestCredentialMaintenanceCliDependencies<Options>,
) => Promise<number>;

async function importMigrateCliModule(): Promise<{
  runMigrateProviderCredentialsCli: TestCredentialMaintenanceCliRunner<
    CredentialMaintenanceCliOptions & { readonly legacyGa4PropertyId?: string }
  >;
}> {
  const path = `../scripts/${"migrate-provider-credentials"}.js`;
  return (await import(path)) as {
    runMigrateProviderCredentialsCli: TestCredentialMaintenanceCliRunner<
      CredentialMaintenanceCliOptions & { readonly legacyGa4PropertyId?: string }
    >;
  };
}

async function importRotationCliModule(): Promise<{
  runRotateProviderCredentialsCli: TestCredentialMaintenanceCliRunner<CredentialMaintenanceCliOptions>;
}> {
  const path = `../scripts/${"rotate-provider-credentials"}.js`;
  return (await import(path)) as {
    runRotateProviderCredentialsCli: TestCredentialMaintenanceCliRunner<CredentialMaintenanceCliOptions>;
  };
}

function maintenanceSummary(
  overrides: Partial<CredentialMaintenanceSummary> = {},
): CredentialMaintenanceSummary {
  return {
    examined: 1,
    migrated: 1,
    skipped: 0,
    failed: 0,
    pending: 0,
    dryRun: false,
    ...overrides,
  };
}

function migrationCliDependencies(options: {
  readonly client: { $disconnect(): Promise<void> };
  readonly execute: () => Promise<CredentialMaintenanceSummary>;
  readonly writeOutput: (message: string) => void;
  readonly writeError?: (message: string) => void;
}) {
  return {
    parseArgs: () => ({ apply: true, batchSize: 7 }),
    parseKeyring: () => keyring(),
    createClient: () => options.client,
    createStore: () => createMigrationStore({}),
    execute: options.execute,
    writeOutput: options.writeOutput,
    writeError: options.writeError ?? (() => undefined),
  };
}

function rotationCliDependencies(options: {
  readonly client: { $disconnect(): Promise<void> };
  readonly execute: () => Promise<CredentialMaintenanceSummary>;
  readonly writeOutput: (message: string) => void;
  readonly writeError?: (message: string) => void;
}) {
  return {
    parseArgs: () => ({ apply: true, batchSize: 9 }),
    parseKeyring: () => keyring(),
    createClient: () => options.client,
    createStore: () => createMigrationStore({}),
    execute: options.execute,
    writeOutput: options.writeOutput,
    writeError: options.writeError ?? (() => undefined),
  };
}

function createMaintenancePrismaPort(options: {
  readonly legacyRows: readonly LegacyProviderCredentialRow[];
  readonly rotationRows: readonly RotatableProviderCredentialRow[];
}) {
  const state = {
    createdAccounts: [] as {
      id: string;
      organizationId: string;
      legacyCredentialId: string;
      [key: string]: unknown;
    }[],
    rotationRows: options.rotationRows.map((row) => ({ ...row })),
    connectorUpserts: [] as unknown[],
  };
  const calls = {
    legacyList: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["connectorOAuthCredential"]["findMany"]
    >[0][],
    rotationList: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["providerAccount"]["findMany"]
    >[0][],
    inspections: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["providerAccount"]["findUnique"]
    >[0][],
    transactionOptions: [] as unknown[],
    writes: [] as { client: "root" | "transaction"; kind: string }[],
    accountCreates: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["providerAccount"]["create"]
    >[0][],
    connectorUpserts: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["siteConnector"]["upsert"]
    >[0][],
    rotationUpdates: [] as Parameters<
      ProviderCredentialMaintenancePrismaTransactionPort["providerAccount"]["updateMany"]
    >[0][],
  };
  const sites = options.legacyRows.map((row) => ({
    id: row.siteId,
    organizationId: row.organizationId,
  }));

  function createDelegates(
    client: "root" | "transaction",
  ): ProviderCredentialMaintenancePrismaTransactionPort {
    return {
      connectorOAuthCredential: {
        async findMany(args) {
          const afterId = args.where?.id.gt ?? null;
          calls.legacyList.push(args);
          return options.legacyRows
            .filter((row) => afterId === null || row.id > afterId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .slice(0, args.take);
        },
      },
      providerAccount: {
        async findUnique(args) {
          calls.inspections.push(args);
          const row = state.createdAccounts.find(
            (account) => account.legacyCredentialId === args.where.legacyCredentialId,
          );
          return row === undefined
            ? null
            : { id: row.id, organizationId: row.organizationId };
        },
        async findMany(args) {
          const afterId = args.where.id?.gt ?? null;
          calls.rotationList.push(args);
          return state.rotationRows
            .filter((row) => row.encryptionKeyId !== args.where.encryptionKeyId.not)
            .filter((row) => afterId === null || row.id > afterId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .slice(0, args.take)
            .map((row) => ({ ...row }));
        },
        async create(args) {
          calls.writes.push({ client, kind: "account.create" });
          calls.accountCreates.push(args);
          state.createdAccounts.push({ ...args.data });
          return { id: args.data.id };
        },
        async updateMany(args) {
          calls.writes.push({ client, kind: "account.updateMany" });
          calls.rotationUpdates.push(args);
          const index = state.rotationRows.findIndex(
            (row) =>
              row.id === args.where.id &&
              row.organizationId === args.where.organizationId &&
              row.updatedAt.getTime() === args.where.updatedAt.getTime(),
          );
          if (index === -1) return { count: 0 };
          state.rotationRows[index] = { ...state.rotationRows[index]!, ...args.data };
          return { count: 1 };
        },
      },
      site: {
        async findFirst(args) {
          const site = sites.find(
            (row) =>
              row.id === args.where.id && row.organizationId === args.where.organizationId,
          );
          return site === undefined ? null : { id: site.id };
        },
      },
      siteConnector: {
        async upsert(args) {
          calls.writes.push({ client, kind: "siteConnector.upsert" });
          calls.connectorUpserts.push(args);
          state.connectorUpserts.push(args);
          return { id: `${args.create.siteId}:${args.create.provider}` };
        },
      },
    };
  }

  const root = createDelegates("root");
  const transaction = createDelegates("transaction");
  const prisma: ProviderCredentialMaintenancePrismaPort = {
    ...root,
    async $transaction(operation, transactionOptions) {
      calls.transactionOptions.push(transactionOptions);
      return operation(transaction);
    },
  };

  return { prisma, state, calls };
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
    readonly inspectionInputs: {
      readonly legacyCredentialId: string;
      readonly siteId: string;
      readonly organizationId: string;
    }[];
    readonly failNextCreateFor: Set<string>;
    readonly failNextRotationFor: Set<string>;
    readonly optimisticMissIds: Set<string>;
    beforeNextTransaction: (() => void) | undefined;
    failNextCommit: boolean;
    seedMigratedAccount(row: LegacyProviderCredentialRow, organizationId?: string): void;
  } = {
    accounts: state.accounts,
    connectors: state.connectors,
    encryptedRows: state.encryptedRows,
    writes: state.writes,
    inspectionInputs: [],
    failNextCreateFor: new Set(),
    failNextRotationFor: new Set(),
    optimisticMissIds: new Set(),
    beforeNextTransaction: undefined,
    failNextCommit: false,

    async listLegacyCredentials(input) {
      return (options.legacyRows ?? [])
        .filter((row) => input.afterId === null || row.id > input.afterId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit);
    },

    async inspectLegacyCredential(input) {
      store.inspectionInputs.push(input);
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

      if (store.failNextCommit) {
        store.failNextCommit = false;
        throw new Error("provider_credential_maintenance_commit_failed");
      }

      state.accounts.splice(0, state.accounts.length, ...draft.accounts);
      state.connectors.splice(0, state.connectors.length, ...draft.connectors);
      state.encryptedRows.splice(0, state.encryptedRows.length, ...draft.encryptedRows);
      state.writes.splice(0, state.writes.length, ...draft.writes);
      return result;
    },

    seedMigratedAccount(row, organizationId = row.organizationId) {
      if (state.accounts.some((account) => account.legacyCredentialId === row.id)) return;
      state.accounts.push(
        accountFromLegacy({ ...row, organizationId }, keyring()),
      );
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
  controls: {
    readonly failNextCreateFor: Set<string>;
    readonly failNextRotationFor: Set<string>;
    readonly optimisticMissIds: Set<string>;
  },
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
      if (controls.failNextRotationFor.delete(input.id)) {
        throw new Error("provider_credential_maintenance_rotation_failed");
      }
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
    providerAccountOrganizationId:
      state.accounts.find((row) => row.legacyCredentialId === input.legacyCredentialId)
        ?.organizationId ?? null,
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

function encryptedV1Row(
  overrides: Partial<Pick<RotatableProviderCredentialRow, "id" | "organizationId" | "updatedAt">> = {},
): RotatableProviderCredentialRow {
  const row = {
    id: "account_1",
    organizationId: "org_a",
    provider: "google" as const,
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    ...overrides,
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
