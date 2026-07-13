import { describe, expect, it } from "vitest";

import type { SearchOpsPrismaClient } from "./client.js";
import {
  createPrismaProviderCredentialStore,
  type ProviderCredentialStore,
  type ProviderCredentialStorePrismaPort
} from "./provider-credential-store.js";

const now = new Date("2026-07-13T00:00:00.000Z");

describe("provider credential store", () => {
  it("accepts the real Prisma client through its narrow port", () => {
    expect(createStoreFromPrismaClient).toBeTypeOf("function");
  });

  it("lists tenant-scoped metadata without encrypted columns", async () => {
    const prisma = fakePrisma({
      accounts: [account(), account({ id: "pa_b", organizationId: "org_b" })]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.listAccounts("org_a")).resolves.toEqual([
      expect.objectContaining({
        id: "pa_a",
        connectedAt: now.toISOString(),
        credentialSource: "encrypted",
        scopes: ["scope:a"]
      })
    ]);
    expect(prisma.calls.providerAccount.findMany[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.providerAccount.findMany[0]?.select).not.toHaveProperty("credentialCiphertext");
    expect(JSON.stringify(await store.listAccounts("org_a"))).not.toContain("ciphertext-a");
  });

  it("keeps metadata and secret-bearing account reads separately tenant scoped", async () => {
    const prisma = fakePrisma({ accounts: [account()] });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.getAccountMetadata({ organizationId: "org_b", providerAccountId: "pa_a" })).resolves.toBeNull();
    await expect(store.getAccountSecretRecord({ organizationId: "org_a", providerAccountId: "pa_a" })).resolves.toEqual(
      expect.objectContaining({ credentialCiphertext: "ciphertext-a", credentialIv: "iv-a" })
    );

    expect(prisma.calls.providerAccount.findFirst[0]?.where).toEqual({ id: "pa_a", organizationId: "org_b" });
    expect(prisma.calls.providerAccount.findFirst[0]?.select).not.toHaveProperty("credentialCiphertext");
    expect(prisma.calls.providerAccount.findFirst[1]?.where).toEqual({ id: "pa_a", organizationId: "org_a" });
    expect(prisma.calls.providerAccount.findFirst[1]?.select).toHaveProperty("credentialCiphertext", true);
  });

  it("creates and replaces encrypted API-key accounts without raw credential inputs", async () => {
    const prisma = fakePrisma();
    const store = createPrismaProviderCredentialStore(prisma);

    const created = await store.createApiKeyAccount({
      organizationId: "org_a",
      provider: "geo_chatgpt",
      authType: "api_key",
      externalAccountId: null,
      accountEmail: null,
      displayName: "Primary ChatGPT",
      isDefault: true,
      connectedByUserId: "user_a",
      encryptedCredential: encryptedCredential("created")
    });
    const replaced = await store.replaceCredential({
      organizationId: "org_a",
      providerAccountId: created.id,
      encryptedCredential: encryptedCredential("replacement")
    });

    expect(created).toMatchObject({ provider: "geo_chatgpt", authType: "api_key", credentialSource: "encrypted" });
    expect(replaced).toMatchObject({ id: created.id });
    expect(prisma.accounts[0]).toMatchObject({ credentialCiphertext: "ciphertext-replacement" });
    expect(JSON.stringify(prisma.calls)).not.toContain("apiKey");
    expect(prisma.calls.providerAccount.updateMany[0]?.where).toEqual({ id: created.id, organizationId: "org_a" });
  });

  it("upserts canonical Google accounts only within their organization", async () => {
    const prisma = fakePrisma({ accounts: [account({ externalAccountId: "google-sub" })] });
    const store = createPrismaProviderCredentialStore(prisma);

    const result = await store.upsertGoogleAccount({
      organizationId: "org_a",
      externalAccountId: "google-sub",
      accountEmail: "updated@example.com",
      displayName: "Updated Google",
      status: "connected",
      scopes: ["scope:b"],
      tokenExpiresAt: new Date("2026-07-14T00:00:00.000Z"),
      connectedByUserId: "user_a",
      encryptedCredential: encryptedCredential("google")
    });

    expect(result).toMatchObject({ id: "pa_a", accountEmail: "updated@example.com", scopes: ["scope:b"] });
    expect(prisma.calls.providerAccount.upsert[0]?.where).toEqual({
      organizationId_provider_externalAccountId: {
        organizationId: "org_a",
        provider: "google",
        externalAccountId: "google-sub"
      }
    });
    expect(prisma.accounts[0]).toMatchObject({ credentialCiphertext: "ciphertext-google" });
  });

  it("counts bindings and prevents deleting a bound account without crossing tenants", async () => {
    const prisma = fakePrisma({
      accounts: [account(), account({ id: "pa_b", organizationId: "org_b" })],
      connectors: [connector()]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.countAccountBindings({ organizationId: "org_a", providerAccountId: "pa_a" })).resolves.toBe(1);
    await expect(store.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_a" })).rejects.toThrow("account_in_use");
    await expect(store.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_b" })).resolves.toBe(false);

    prisma.connectors.length = 0;
    await expect(store.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_a" })).resolves.toBe(true);
    await expect(store.deleteAccount({ organizationId: "org_a", providerAccountId: "pa_a" })).resolves.toBe(false);
    expect(prisma.calls.siteConnector.count[0]?.where).toEqual({ organizationId: "org_a", providerAccountId: "pa_a" });
    expect(prisma.accounts.map((row) => row.id)).toEqual(["pa_b"]);
  });

  it("lists site connectors with tenant-scoped non-secret metadata", async () => {
    const prisma = fakePrisma({
      connectors: [connector(), connector({ id: "connector_b", organizationId: "org_b", siteId: "site_b" })]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.listSiteConnectors({ organizationId: "org_a", siteId: "site_a" })).resolves.toEqual([
      expect.objectContaining({ id: "connector_a", externalResourceId: "properties/1", config: {} })
    ]);
    expect(prisma.calls.siteConnector.findMany[0]?.where).toEqual({ organizationId: "org_a", siteId: "site_a" });
  });

  it("tenant-checks both binding parents and enforces provider compatibility", async () => {
    const prisma = fakePrisma({
      sites: [site(), site({ id: "site_b", organizationId: "org_b" })],
      accounts: [account(), account({ id: "bing_a", provider: "bing" }), account({ id: "pa_b", organizationId: "org_b" })]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_b",
      provider: "ga4",
      providerAccountId: "pa_a",
      externalResourceId: "properties/1"
    })).rejects.toThrow("site_not_in_organization");
    await expect(store.upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_a",
      provider: "ga4",
      providerAccountId: "pa_b",
      externalResourceId: "properties/1"
    })).rejects.toThrow("provider_account_not_in_organization");
    await expect(store.upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_a",
      provider: "gsc",
      providerAccountId: "bing_a",
      externalResourceId: "sc-domain:example.com"
    })).rejects.toThrow("provider_account_provider_mismatch");

    await expect(store.upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_a",
      provider: "ga4",
      providerAccountId: "pa_a",
      externalResourceId: null
    })).resolves.toMatchObject({ status: "needs_configuration", externalResourceId: null });
    expect(prisma.calls.site.findFirst[0]?.where).toEqual({ id: "site_b", organizationId: "org_a" });
    expect(prisma.calls.providerAccount.findFirst[0]?.where).toEqual({ id: "pa_b", organizationId: "org_a" });
  });

  it("deletes site connectors idempotently within the tenant", async () => {
    const prisma = fakePrisma({
      connectors: [connector(), connector({ id: "connector_b", organizationId: "org_b", siteId: "site_a" })]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.deleteSiteConnector({ organizationId: "org_a", siteId: "site_a", provider: "ga4" })).resolves.toBe(true);
    await expect(store.deleteSiteConnector({ organizationId: "org_a", siteId: "site_a", provider: "ga4" })).resolves.toBe(false);
    expect(prisma.connectors).toEqual([expect.objectContaining({ id: "connector_b", organizationId: "org_b" })]);
  });

  it("returns only tenant-scoped non-secret readiness counts and sources", async () => {
    const prisma = fakePrisma({
      accounts: [account(), account({ id: "pa_expired", status: "expired" }), account({ id: "pa_b", organizationId: "org_b" })],
      connectors: [
        connector({ provider: "gsc", externalResourceId: "sc-domain:example.com" }),
        connector({ id: "connector_ga4", provider: "ga4", externalResourceId: null }),
        connector({ id: "connector_bing", provider: "bing", status: "error" }),
        connector({ id: "connector_b", organizationId: "org_b", siteId: "site_b", provider: "bing" })
      ]
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.getCredentialReadinessSnapshot("org_a")).resolves.toEqual({
      configuredByProvider: { gsc: 1, ga4: 0, bing: 0 },
      encryptedAccounts: 2,
      legacyFallbacks: 0
    });
    expect(prisma.calls.providerAccount.count[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.siteConnector.findMany[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.siteConnector.findMany[0]?.select).not.toHaveProperty("providerAccount.credentialCiphertext");
  });
});

function createStoreFromPrismaClient(prisma: SearchOpsPrismaClient): ProviderCredentialStore {
  return createPrismaProviderCredentialStore(prisma);
}

function encryptedCredential(label: string) {
  return {
    credentialCiphertext: `ciphertext-${label}`,
    credentialIv: `iv-${label}`,
    credentialAuthTag: `tag-${label}`,
    encryptionKeyId: "v1",
    encryptionVersion: 1 as const
  };
}

function account(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: "pa_a",
    organizationId: "org_a",
    provider: "google",
    authType: "oauth2",
    externalAccountId: null,
    accountEmail: "account@example.com",
    displayName: "Google account",
    status: "connected",
    scopes: ["scope:a"],
    tokenExpiresAt: null,
    credentialCiphertext: "ciphertext-a",
    credentialIv: "iv-a",
    credentialAuthTag: "tag-a",
    encryptionKeyId: "v1",
    encryptionVersion: 1,
    isDefault: false,
    legacyCredentialId: null,
    connectedByUserId: "user_a",
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function site(overrides: Partial<SiteRow> = {}): SiteRow {
  return { id: "site_a", organizationId: "org_a", ...overrides };
}

function connector(overrides: Partial<ConnectorRow> = {}): ConnectorRow {
  return {
    id: "connector_a",
    organizationId: "org_a",
    siteId: "site_a",
    provider: "ga4",
    providerAccountId: "pa_a",
    externalResourceId: "properties/1",
    config: {},
    status: "connected",
    lastErrorCode: null,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

interface AccountRow {
  id: string;
  organizationId: string;
  provider: string;
  authType: string;
  externalAccountId: string | null;
  accountEmail: string | null;
  displayName: string;
  status: string;
  scopes: unknown;
  tokenExpiresAt: Date | null;
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  encryptionKeyId: string;
  encryptionVersion: number;
  isDefault: boolean;
  legacyCredentialId: string | null;
  connectedByUserId: string;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface SiteRow {
  id: string;
  organizationId: string;
}

interface ConnectorRow {
  id: string;
  organizationId: string;
  siteId: string;
  provider: string;
  providerAccountId: string;
  externalResourceId: string | null;
  config: unknown;
  status: string;
  lastErrorCode: string | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaCall {
  readonly where?: unknown;
  readonly select?: unknown;
  readonly data?: unknown;
  readonly create?: unknown;
  readonly update?: unknown;
}

function fakePrisma(seed: {
  accounts?: AccountRow[];
  sites?: SiteRow[];
  connectors?: ConnectorRow[];
} = {}) {
  const accounts = seed.accounts ?? [];
  const sites = seed.sites ?? [];
  const connectors = seed.connectors ?? [];
  const calls = {
    providerAccount: {
      findMany: [] as PrismaCall[],
      findFirst: [] as PrismaCall[],
      create: [] as PrismaCall[],
      updateMany: [] as PrismaCall[],
      upsert: [] as PrismaCall[],
      deleteMany: [] as PrismaCall[],
      count: [] as PrismaCall[]
    },
    site: { findFirst: [] as PrismaCall[] },
    siteConnector: {
      findMany: [] as PrismaCall[],
      upsert: [] as PrismaCall[],
      deleteMany: [] as PrismaCall[],
      count: [] as PrismaCall[]
    }
  };
  let nextId = 1;

  const prisma: ProviderCredentialStorePrismaPort = {
    providerAccount: {
      async findMany(args) {
        calls.providerAccount.findMany.push(args);
        return accounts.filter((row) => row.organizationId === args.where.organizationId).map((row) => select(row, args.select));
      },
      async findFirst(args) {
        calls.providerAccount.findFirst.push(args);
        const row = accounts.find((candidate) => matches(candidate, args.where));
        return row === undefined ? null : select(row, args.select);
      },
      async create(args) {
        calls.providerAccount.create.push(args);
        const row = account({ id: `pa_created_${nextId++}`, ...args.data, connectedAt: now, createdAt: now, updatedAt: now });
        accounts.push(row);
        return select(row, args.select);
      },
      async updateMany(args) {
        calls.providerAccount.updateMany.push(args);
        let count = 0;
        for (const row of accounts) {
          if (matches(row, args.where)) {
            Object.assign(row, args.data, { updatedAt: now });
            count += 1;
          }
        }
        return { count };
      },
      async upsert(args) {
        calls.providerAccount.upsert.push(args);
        const existing = accounts.find((row) => matchesUniqueAccount(row, args.where));
        if (existing !== undefined) {
          Object.assign(existing, args.update, { updatedAt: now });
          return select(existing, args.select);
        }
        const row = account({ id: `pa_upserted_${nextId++}`, ...args.create, connectedAt: now, createdAt: now, updatedAt: now });
        accounts.push(row);
        return select(row, args.select);
      },
      async deleteMany(args) {
        calls.providerAccount.deleteMany.push(args);
        const before = accounts.length;
        for (let index = accounts.length - 1; index >= 0; index -= 1) {
          if (matches(accounts[index]!, args.where)) accounts.splice(index, 1);
        }
        return { count: before - accounts.length };
      },
      async count(args) {
        calls.providerAccount.count.push(args);
        return accounts.filter((row) => matches(row, args.where)).length;
      }
    },
    site: {
      async findFirst(args) {
        calls.site.findFirst.push(args);
        const row = sites.find((candidate) => matches(candidate, args.where));
        return row === undefined ? null : select(row, args.select);
      }
    },
    siteConnector: {
      async findMany(args) {
        calls.siteConnector.findMany.push(args);
        return connectors.filter((row) => matches(row, args.where)).map((row) => selectConnector(row, args.select, accounts));
      },
      async upsert(args) {
        calls.siteConnector.upsert.push(args);
        const existing = connectors.find((row) => row.siteId === args.where.siteId_provider.siteId && row.provider === args.where.siteId_provider.provider);
        if (existing !== undefined) {
          Object.assign(existing, args.update, { updatedAt: now });
          return selectConnector(existing, args.select, accounts);
        }
        const row = connector({ id: `connector_created_${nextId++}`, ...args.create, createdAt: now, updatedAt: now });
        connectors.push(row);
        return selectConnector(row, args.select, accounts);
      },
      async deleteMany(args) {
        calls.siteConnector.deleteMany.push(args);
        const before = connectors.length;
        for (let index = connectors.length - 1; index >= 0; index -= 1) {
          if (matches(connectors[index]!, args.where)) connectors.splice(index, 1);
        }
        return { count: before - connectors.length };
      },
      async count(args) {
        calls.siteConnector.count.push(args);
        return connectors.filter((row) => matches(row, args.where)).length;
      }
    }
  };

  return Object.assign(prisma, { accounts, sites, connectors, calls });
}

function matches<T extends object>(row: T, where: Record<string, unknown>) {
  const values = row as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => values[key] === value);
}

function matchesUniqueAccount(
  row: AccountRow,
  where: { organizationId_provider_externalAccountId?: { organizationId: string; provider: string; externalAccountId: string } },
) {
  const unique = where.organizationId_provider_externalAccountId;
  return unique !== undefined && row.organizationId === unique.organizationId && row.provider === unique.provider && row.externalAccountId === unique.externalAccountId;
}

function select<T extends object>(row: T, fields: Record<string, unknown>): T {
  const values = row as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => [key, values[key]]),
  ) as T;
}

function selectConnector(row: ConnectorRow, fields: Record<string, unknown>, accounts: AccountRow[]): ConnectorRow {
  const selected = select(row, fields) as ConnectorRow & { providerAccount?: unknown };
  if (fields.providerAccount !== undefined) {
    const accountRow = accounts.find((account) => account.id === row.providerAccountId && account.organizationId === row.organizationId);
    const providerAccount = fields.providerAccount as { select: Record<string, unknown> };
    selected.providerAccount = accountRow === undefined ? null : select(accountRow, providerAccount.select);
  }
  return selected as ConnectorRow;
}
