import { describe, expect, it } from "vitest";
import type { SiteConnectorProvider } from "@searchops/types";

import type { SearchOpsPrismaClient } from "./client.js";
import {
  CredentialDecryptionError,
  decryptProviderCredential,
  encryptProviderCredential,
  parseCredentialKeyring,
  type CredentialContext,
  type EncryptedProviderCredential
} from "./credential-crypto.js";
import type { Prisma } from "./generated/prisma/index.js";
import {
  createPrismaProviderCredentialStore,
  deriveCanonicalProviderAccountId,
  ProviderCredentialStoreError,
  type ProviderCredentialStore,
  type ProviderCredentialStorePrismaPort,
  type ProviderCredentialStorePrismaTransactionPort
} from "./provider-credential-store.js";

const now = new Date("2026-07-13T00:00:00.000Z");
const keyring = parseCredentialKeyring({
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "test-v1",
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64")
});
const metadataSelect = {
  id: true,
  organizationId: true,
  provider: true,
  authType: true,
  externalAccountId: true,
  accountEmail: true,
  displayName: true,
  status: true,
  scopes: true,
  tokenExpiresAt: true,
  isDefault: true,
  legacyCredentialId: true,
  connectedByUserId: true,
  connectedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

  it("lists multiple account binding counts with one tenant-scoped aggregate query", async () => {
    const prisma = fakePrisma({
      accounts: [
        account(),
        account({ id: "pa_zero" }),
        account({ id: "pa_other", organizationId: "org_b" }),
      ],
      connectors: [
        connector(),
        connector({ id: "connector_cross", organizationId: "org_b", providerAccountId: "pa_a" }),
      ],
    });

    await expect(createPrismaProviderCredentialStore(prisma).listAccounts("org_a")).resolves.toEqual([
      expect.objectContaining({ id: "pa_a", bindingCount: 1 }),
      expect.objectContaining({ id: "pa_zero", bindingCount: 0 }),
    ]);
    expect(prisma.calls.providerAccount.findMany).toHaveLength(1);
    expect(prisma.calls.providerAccount.findMany[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.siteConnector.count).toHaveLength(0);
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

  it("updates displayName in a tenant-scoped transaction with secret-free selects", async () => {
    const prisma = fakePrisma({ accounts: [account()] });
    const store = createPrismaProviderCredentialStore(prisma);

    const updated = await store.updateAccountMetadata({
      organizationId: "org_a",
      providerAccountId: "pa_a",
      displayName: "Renamed Google",
    });

    expect(updated).toMatchObject({ id: "pa_a", displayName: "Renamed Google" });
    expect(JSON.stringify(updated)).not.toContain("ciphertext-a");
    expect(prisma.calls.$transaction).toHaveLength(1);
    expect(prisma.calls.transactionProviderAccount.findFirst).toEqual([
      {
        where: { id: "pa_a", organizationId: "org_a" },
        select: metadataSelect,
      },
      {
        where: { id: "pa_a", organizationId: "org_a" },
        select: metadataSelect,
      },
    ]);
    expect(prisma.calls.transactionProviderAccount.updateMany).toEqual([
      {
        where: { id: "pa_a", organizationId: "org_a" },
        data: { displayName: "Renamed Google" },
      },
    ]);
    for (const call of prisma.calls.transactionProviderAccount.findFirst) {
      expect(call.select).not.toHaveProperty("credentialCiphertext");
      expect(call.select).not.toHaveProperty("credentialIv");
      expect(call.select).not.toHaveProperty("credentialAuthTag");
    }
    expect(prisma.calls.providerAccount.findFirst).toHaveLength(0);
    expect(prisma.calls.providerAccount.updateMany).toHaveLength(0);
  });

  it("sets one default while clearing only other same-provider tenant accounts", async () => {
    const currentDefaultUpdatedAt = new Date("2026-07-13T00:00:01.000Z");
    const alreadyFalseUpdatedAt = new Date("2026-07-13T00:00:02.000Z");
    const otherProviderUpdatedAt = new Date("2026-07-13T00:00:03.000Z");
    const otherOrganizationUpdatedAt = new Date("2026-07-13T00:00:04.000Z");
    const prisma = fakePrisma({
      accounts: [
        account(),
        account({ id: "pa_google_default", isDefault: true, updatedAt: currentDefaultUpdatedAt }),
        account({ id: "pa_google_false", updatedAt: alreadyFalseUpdatedAt }),
        account({ id: "pa_bing", provider: "bing", isDefault: true, updatedAt: otherProviderUpdatedAt }),
        account({ id: "pa_org_b", organizationId: "org_b", isDefault: true, updatedAt: otherOrganizationUpdatedAt }),
      ],
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(
      store.updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_a",
        isDefault: true,
      }),
    ).resolves.toMatchObject({ id: "pa_a", isDefault: true });

    expect(prisma.calls.transactionProviderAccount.updateMany).toEqual([
      {
        where: {
          organizationId: "org_a",
          provider: "google",
          id: { not: "pa_a" },
          isDefault: true,
        },
        data: { isDefault: false },
      },
      {
        where: { id: "pa_a", organizationId: "org_a" },
        data: { isDefault: true },
      },
    ]);
    expect(prisma.accounts.find((row) => row.id === "pa_google_default")?.isDefault).toBe(false);
    expect(prisma.accounts.find((row) => row.id === "pa_google_default")?.updatedAt).toBe(now);
    expect(prisma.accounts.find((row) => row.id === "pa_google_false")?.isDefault).toBe(false);
    expect(prisma.accounts.find((row) => row.id === "pa_google_false")?.updatedAt).toBe(alreadyFalseUpdatedAt);
    expect(prisma.accounts.find((row) => row.id === "pa_bing")?.isDefault).toBe(true);
    expect(prisma.accounts.find((row) => row.id === "pa_bing")?.updatedAt).toBe(otherProviderUpdatedAt);
    expect(prisma.accounts.find((row) => row.id === "pa_org_b")?.isDefault).toBe(true);
    expect(prisma.accounts.find((row) => row.id === "pa_org_b")?.updatedAt).toBe(otherOrganizationUpdatedAt);
  });

  it("can clear a target default without updating sibling accounts", async () => {
    const prisma = fakePrisma({
      accounts: [account({ isDefault: true }), account({ id: "pa_google_other" })],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_a",
        isDefault: false,
      }),
    ).resolves.toMatchObject({ id: "pa_a", isDefault: false });

    expect(prisma.calls.transactionProviderAccount.updateMany).toEqual([
      {
        where: { id: "pa_a", organizationId: "org_a" },
        data: { isDefault: false },
      },
    ]);
  });

  it("returns null without writes for a cross-organization target", async () => {
    const prisma = fakePrisma({ accounts: [account({ organizationId: "org_b" })] });

    await expect(
      createPrismaProviderCredentialStore(prisma).updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_a",
        displayName: "Must not write",
        isDefault: true,
      }),
    ).resolves.toBeNull();

    expect(prisma.calls.transactionProviderAccount.findFirst).toEqual([
      {
        where: { id: "pa_a", organizationId: "org_a" },
        select: metadataSelect,
      },
    ]);
    expect(prisma.calls.transactionProviderAccount.updateMany).toHaveLength(0);
    expect(prisma.accounts[0]?.displayName).toBe("Google account");
  });

  it("returns null when the tenant-scoped target disappears before update", async () => {
    const siblingUpdatedAt = new Date("2026-07-13T00:00:05.000Z");
    const prisma = fakePrisma({
      accounts: [account(), account({ id: "pa_google_default", isDefault: true, updatedAt: siblingUpdatedAt })],
      providerAccountMetadataUpdateCountZero: true,
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_a",
        isDefault: true,
      }),
    ).resolves.toBeNull();

    expect(prisma.calls.transactionProviderAccount.findFirst).toHaveLength(1);
    expect(prisma.calls.transactionProviderAccount.updateMany).toHaveLength(2);
    expect(prisma.accounts.find((row) => row.id === "pa_google_default")?.isDefault).toBe(true);
    expect(prisma.accounts.find((row) => row.id === "pa_google_default")?.updatedAt).toBe(siblingUpdatedAt);
  });

  it("rolls back default clearing and redacts unique conflicts", async () => {
    const prisma = fakePrisma({
      accounts: [account(), account({ id: "pa_google_other", isDefault: true })],
      providerAccountMetadataUpdateError: {
        code: "P2002",
        message: "sensitive prisma partial unique details",
      },
    });

    let caught: unknown;
    try {
      await createPrismaProviderCredentialStore(prisma).updateAccountMetadata({
        organizationId: "org_a",
        providerAccountId: "pa_a",
        isDefault: true,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(new ProviderCredentialStoreError("provider_account_default_conflict"));
    expect(String(caught)).not.toContain("sensitive prisma partial unique details");
    expect(prisma.accounts.find((row) => row.id === "pa_a")?.isDefault).toBe(false);
    expect(prisma.accounts.find((row) => row.id === "pa_google_other")?.isDefault).toBe(true);
  });

  it("atomically creates a default API-key account with a secret-free result", async () => {
    const defaultUpdatedAt = new Date("2026-07-13T00:00:06.000Z");
    const falseUpdatedAt = new Date("2026-07-13T00:00:07.000Z");
    const otherProviderUpdatedAt = new Date("2026-07-13T00:00:08.000Z");
    const otherOrganizationUpdatedAt = new Date("2026-07-13T00:00:09.000Z");
    const prisma = fakePrisma({
      accounts: [
        account({ id: "pa_chatgpt_default", provider: "geo_chatgpt", authType: "api_key", isDefault: true, updatedAt: defaultUpdatedAt }),
        account({ id: "pa_chatgpt_false", provider: "geo_chatgpt", authType: "api_key", updatedAt: falseUpdatedAt }),
        account({ id: "pa_bing_default", provider: "bing", isDefault: true, updatedAt: otherProviderUpdatedAt }),
        account({ id: "pa_org_b_default", organizationId: "org_b", provider: "geo_chatgpt", authType: "api_key", isDefault: true, updatedAt: otherOrganizationUpdatedAt }),
      ],
    });
    const store = createPrismaProviderCredentialStore(prisma);
    const providerAccountId = "pa_task6_api_key";
    const context = credentialContext({ providerAccountId, provider: "geo_chatgpt" });
    const encryptedCredential = encryptProviderCredential(keyring, context, {
      kind: "api_key",
      apiKey: "created-secret"
    });

    const created = await store.createApiKeyAccount({
      providerAccountId,
      organizationId: "org_a",
      provider: "geo_chatgpt",
      authType: "api_key",
      externalAccountId: null,
      accountEmail: null,
      displayName: "Primary ChatGPT",
      isDefault: true,
      connectedByUserId: "user_a",
      encryptedCredential
    });

    expect(created).toMatchObject({ provider: "geo_chatgpt", authType: "api_key", credentialSource: "encrypted" });
    expect(created.id).toBe(providerAccountId);
    expect(prisma.calls.$transaction).toHaveLength(1);
    expect(prisma.calls.providerAccount.create).toHaveLength(0);
    expect(prisma.calls.transactionProviderAccount.updateMany).toEqual([
      {
        where: { organizationId: "org_a", provider: "geo_chatgpt", isDefault: true },
        data: { isDefault: false },
      },
    ]);
    expect(prisma.calls.transactionProviderAccount.create).toEqual([
      {
        data: {
          id: providerAccountId,
          organizationId: "org_a",
          provider: "geo_chatgpt",
          authType: "api_key",
          externalAccountId: null,
          accountEmail: null,
          displayName: "Primary ChatGPT",
          status: "connected",
          scopes: [],
          tokenExpiresAt: null,
          ...encryptedCredential,
          isDefault: true,
          connectedByUserId: "user_a",
        },
        select: metadataSelect,
      },
    ]);
    const persistedCreate = prisma.calls.transactionProviderAccount.create[0]!.data;
    expect(decryptProviderCredential(
      keyring,
      { ...context, providerAccountId: created.id },
      envelopeFromCredentialData(persistedCreate),
    )).toEqual({ kind: "api_key", apiKey: "created-secret" });
    expect(() => decryptProviderCredential(
      keyring,
      { ...context, providerAccountId: "pa_another_account" },
      envelopeFromCredentialData(persistedCreate),
    )).toThrow(CredentialDecryptionError);
    expect(prisma.calls.transactionProviderAccount.create[0]?.select).not.toHaveProperty("credentialCiphertext");
    expect(prisma.accounts.find((row) => row.id === "pa_chatgpt_default")?.isDefault).toBe(false);
    expect(prisma.accounts.find((row) => row.id === "pa_chatgpt_default")?.updatedAt).toBe(now);
    expect(prisma.accounts.find((row) => row.id === "pa_chatgpt_false")?.updatedAt).toBe(falseUpdatedAt);
    expect(prisma.accounts.find((row) => row.id === "pa_bing_default")?.isDefault).toBe(true);
    expect(prisma.accounts.find((row) => row.id === "pa_bing_default")?.updatedAt).toBe(otherProviderUpdatedAt);
    expect(prisma.accounts.find((row) => row.id === "pa_org_b_default")?.isDefault).toBe(true);
    expect(prisma.accounts.find((row) => row.id === "pa_org_b_default")?.updatedAt).toBe(otherOrganizationUpdatedAt);
    expect(JSON.stringify(prisma.calls)).not.toContain("apiKey");
  });

  it("keeps non-default API-key account creation direct and tenant scoped", async () => {
    const prisma = fakePrisma();
    const providerAccountId = "pa_task6_non_default";
    const encryptedCredential = encryptProviderCredential(
      keyring,
      credentialContext({ providerAccountId, provider: "geo_perplexity" }),
      { kind: "api_key", apiKey: "non-default-secret" },
    );

    await expect(createPrismaProviderCredentialStore(prisma).createApiKeyAccount({
      providerAccountId,
      organizationId: "org_a",
      provider: "geo_perplexity",
      authType: "api_key",
      externalAccountId: null,
      accountEmail: null,
      displayName: "Perplexity",
      isDefault: false,
      connectedByUserId: "user_a",
      encryptedCredential,
    })).resolves.toMatchObject({ id: providerAccountId, isDefault: false });

    expect(prisma.calls.$transaction).toHaveLength(0);
    expect(prisma.calls.transactionProviderAccount.updateMany).toHaveLength(0);
    expect(prisma.calls.providerAccount.create).toEqual([
      {
        data: {
          id: providerAccountId,
          organizationId: "org_a",
          provider: "geo_perplexity",
          authType: "api_key",
          externalAccountId: null,
          accountEmail: null,
          displayName: "Perplexity",
          status: "connected",
          scopes: [],
          tokenExpiresAt: null,
          ...encryptedCredential,
          isDefault: false,
          connectedByUserId: "user_a",
        },
        select: metadataSelect,
      },
    ]);
  });

  it("replaces encrypted API-key credentials without raw credential inputs", async () => {
    const providerAccountId = "pa_task6_replace";
    const context = credentialContext({ providerAccountId, provider: "geo_chatgpt" });
    const prisma = fakePrisma({
      accounts: [account({ id: providerAccountId, provider: "geo_chatgpt", authType: "api_key" })],
    });

    await expect(createPrismaProviderCredentialStore(prisma).replaceCredential({
      organizationId: "org_a",
      providerAccountId,
      encryptedCredential: encryptProviderCredential(keyring, context, {
        kind: "api_key",
        apiKey: "replacement-secret"
      })
    })).resolves.toMatchObject({ id: providerAccountId, credentialSource: "encrypted" });

    expect(decryptProviderCredential(keyring, context, envelopeFromAccount(prisma.accounts[0]!))).toEqual({
      kind: "api_key",
      apiKey: "replacement-secret"
    });
    expect(JSON.stringify(prisma.calls)).not.toContain("apiKey");
    expect(prisma.calls.providerAccount.updateMany[0]?.where).toEqual({ id: providerAccountId, organizationId: "org_a" });
  });

  it("rolls back cleared defaults when default API-key account creation throws", async () => {
    const defaultUpdatedAt = new Date("2026-07-13T00:00:10.000Z");
    const prisma = fakePrisma({
      accounts: [account({ id: "pa_chatgpt_default", provider: "geo_chatgpt", authType: "api_key", isDefault: true, updatedAt: defaultUpdatedAt })],
      providerAccountCreateError: new Error("synthetic create failure"),
    });

    await expect(createPrismaProviderCredentialStore(prisma).createApiKeyAccount({
      providerAccountId: "pa_task6_create_failure",
      organizationId: "org_a",
      provider: "geo_chatgpt",
      authType: "api_key",
      externalAccountId: null,
      accountEmail: null,
      displayName: "Primary ChatGPT",
      isDefault: true,
      connectedByUserId: "user_a",
      encryptedCredential: encryptProviderCredential(
        keyring,
        credentialContext({ providerAccountId: "pa_task6_create_failure", provider: "geo_chatgpt" }),
        { kind: "api_key", apiKey: "created-secret" },
      ),
    })).rejects.toThrow("synthetic create failure");

    expect(prisma.accounts).toEqual([
      expect.objectContaining({ id: "pa_chatgpt_default", isDefault: true, updatedAt: defaultUpdatedAt }),
    ]);
  });

  it("rolls back defaults and redacts unique conflicts from default API-key creation", async () => {
    const prisma = fakePrisma({
      accounts: [account({ id: "pa_chatgpt_default", provider: "geo_chatgpt", authType: "api_key", isDefault: true })],
      providerAccountCreateError: { code: "P2002", message: "sensitive prisma create details" },
    });

    let caught: unknown;
    try {
      await createPrismaProviderCredentialStore(prisma).createApiKeyAccount({
        providerAccountId: "pa_task6_unique_conflict",
        organizationId: "org_a",
        provider: "geo_chatgpt",
        authType: "api_key",
        externalAccountId: null,
        accountEmail: null,
        displayName: "Duplicate ChatGPT",
        isDefault: true,
        connectedByUserId: "user_a",
        encryptedCredential: encryptProviderCredential(
          keyring,
          credentialContext({ providerAccountId: "pa_task6_unique_conflict", provider: "geo_chatgpt" }),
          { kind: "api_key", apiKey: "created-secret" },
        ),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(new ProviderCredentialStoreError("provider_account_identity_conflict"));
    expect(String(caught)).not.toContain("sensitive prisma create details");
    expect(prisma.accounts).toEqual([expect.objectContaining({ id: "pa_chatgpt_default", isDefault: true })]);
  });

  it("upserts canonical Google accounts only within their organization", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub");
    const prisma = fakePrisma({ accounts: [account({ id: providerAccountId, externalAccountId: "google-sub" })] });
    const store = createPrismaProviderCredentialStore(prisma);

    const result = await store.upsertGoogleAccount({
      providerAccountId,
      organizationId: "org_a",
      externalAccountId: "google-sub",
      accountEmail: "updated@example.com",
      displayName: "Updated Google",
      status: "connected",
      scopes: ["scope:b"],
      allowedConnectorProviders: [],
      expectedUpdatedAt: now.toISOString(),
      tokenExpiresAt: new Date("2026-07-14T00:00:00.000Z"),
      connectedByUserId: "user_a",
      encryptedCredential: encryptGoogleCredential("org_a", providerAccountId)
    });

    expect(result).toMatchObject({ id: providerAccountId, accountEmail: "updated@example.com", scopes: ["scope:b"] });
    expect(prisma.calls.transactionProviderAccount.upsert[0]?.where).toEqual({
      id: providerAccountId,
      organizationId_provider_externalAccountId: {
        organizationId: "org_a",
        provider: "google",
        externalAccountId: "google-sub"
      }
    });
    expect(decryptProviderCredential(
      keyring,
      credentialContext({ providerAccountId, provider: "google" }),
      envelopeFromAccount(prisma.accounts[0]!),
    )).toMatchObject({ kind: "oauth2", refreshToken: "refresh-token" });
  });

  it("atomically rejects a Google scope regression when bindings change before upsert", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub");
    const existing = account({ id: providerAccountId, externalAccountId: "google-sub" });
    const originalEnvelope = envelopeFromAccount(existing);
    const prisma = fakePrisma({
      accounts: [existing],
      connectors: [
        connector({ provider: "gsc", providerAccountId }),
      ],
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(
      store.upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub",
        accountEmail: "updated@example.com",
        displayName: "Updated Google",
        status: "connected",
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        allowedConnectorProviders: ["ga4"],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));
    expect(prisma.calls.transactionSiteConnector.findMany).toEqual([
      {
        where: { organizationId: "org_a", providerAccountId },
        select: { provider: true },
      },
    ]);
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(0);
    expect(prisma.calls.transactionOptions).toEqual([{ isolationLevel: "Serializable" }]);
    expect(envelopeFromAccount(prisma.accounts[0]!)).toEqual(originalEnvelope);
  });

  it("rejects a stale Google credential snapshot without replacing encrypted data", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-stale");
    const existing = account({ id: providerAccountId, externalAccountId: "google-sub-stale" });
    const originalEnvelope = envelopeFromAccount(existing);
    const prisma = fakePrisma({ accounts: [existing] });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-stale",
        accountEmail: "updated@example.com",
        displayName: "Updated Google",
        status: "connected",
        scopes: ["scope:b"],
        allowedConnectorProviders: [],
        expectedUpdatedAt: "2026-07-12T23:59:59.000Z",
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_concurrent_update"),
    );

    expect(prisma.calls.transactionProviderAccount.findFirst).toEqual([
      {
        where: { id: providerAccountId, organizationId: "org_a" },
        select: metadataSelect,
      },
    ]);
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(0);
    expect(envelopeFromAccount(prisma.accounts[0]!)).toEqual(originalEnvelope);
  });

  it("rejects a concurrent canonical account creation after a P2034 retry", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-concurrent-create");
    const concurrentlyCreated = account({
      id: providerAccountId,
      externalAccountId: "google-sub-concurrent-create",
      accountEmail: "newer@example.com",
    });
    const concurrentEnvelope = envelopeFromAccount(concurrentlyCreated);
    const prisma = fakePrisma({
      transactionCommitErrors: [{ code: "P2034" }],
      beforeTransactionAttempt({ attempt, accounts }) {
        if (attempt === 2) {
          accounts.push(concurrentlyCreated);
        }
      },
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-concurrent-create",
        accountEmail: "stale@example.com",
        displayName: "Stale Google",
        status: "connected",
        scopes: [],
        allowedConnectorProviders: [],
        expectedUpdatedAt: null,
        tokenExpiresAt: null,
        connectedByUserId: "user_stale",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_concurrent_update"),
    );

    expect(prisma.calls.$transaction).toHaveLength(2);
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(1);
    expect(prisma.accounts).toHaveLength(1);
    expect(prisma.accounts[0]?.accountEmail).toBe("newer@example.com");
    expect(envelopeFromAccount(prisma.accounts[0]!)).toEqual(concurrentEnvelope);
  });

  it("retries the full Google transaction after P2034 and then succeeds", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-retry");
    const prisma = fakePrisma({
      accounts: [account({ id: providerAccountId, externalAccountId: "google-sub-retry" })],
      transactionCommitErrors: [{ code: "P2034" }, { code: "P2034" }],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-retry",
        accountEmail: "retried@example.com",
        displayName: "Retried Google",
        status: "connected",
        scopes: ["scope:b"],
        allowedConnectorProviders: [],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_retry",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).resolves.toMatchObject({ accountEmail: "retried@example.com" });

    expect(prisma.calls.$transaction).toHaveLength(3);
    expect(prisma.calls.transactionSiteConnector.findMany).toHaveLength(3);
    expect(prisma.calls.transactionProviderAccount.findFirst).toHaveLength(3);
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(3);
  });

  it("maps exhausted Google P2034 retries and leaves the account unchanged", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-exhausted");
    const existing = account({ id: providerAccountId, externalAccountId: "google-sub-exhausted" });
    const originalEnvelope = envelopeFromAccount(existing);
    const prisma = fakePrisma({
      accounts: [existing],
      transactionCommitErrors: [
        { code: "P2034", message: "sensitive attempt 1" },
        { code: "P2034", message: "sensitive attempt 2" },
        { code: "P2034", message: "sensitive attempt 3" },
      ],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-exhausted",
        accountEmail: "not-committed@example.com",
        displayName: "Not Committed",
        status: "connected",
        scopes: ["scope:b"],
        allowedConnectorProviders: [],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_concurrent_update"),
    );

    expect(prisma.calls.$transaction).toHaveLength(3);
    expect(envelopeFromAccount(prisma.accounts[0]!)).toEqual(originalEnvelope);
    expect(prisma.accounts[0]?.accountEmail).toBe("account@example.com");
  });

  it("rechecks bindings after a Google P2034 retry and rejects the new scope requirement", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-interleaved");
    const existing = account({ id: providerAccountId, externalAccountId: "google-sub-interleaved" });
    const originalEnvelope = envelopeFromAccount(existing);
    const prisma = fakePrisma({
      accounts: [existing],
      transactionCommitErrors: [{ code: "P2034" }],
      beforeTransactionAttempt({ attempt, connectors }) {
        if (attempt === 2) {
          connectors.push(connector({ provider: "gsc", providerAccountId }));
        }
      },
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-interleaved",
        accountEmail: "updated@example.com",
        displayName: "Updated Google",
        status: "connected",
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        allowedConnectorProviders: ["ga4"],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));

    expect(prisma.calls.$transaction).toHaveLength(2);
    expect(prisma.calls.transactionSiteConnector.findMany).toHaveLength(2);
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(1);
    expect(envelopeFromAccount(prisma.accounts[0]!)).toEqual(originalEnvelope);
    expect(prisma.connectors).toHaveLength(1);
  });

  it("does not retry Google domain errors", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-domain");
    const prisma = fakePrisma({
      accounts: [account({ id: providerAccountId, externalAccountId: "google-sub-domain" })],
      connectors: [connector({ provider: "gsc", providerAccountId })],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-domain",
        accountEmail: "updated@example.com",
        displayName: "Updated Google",
        status: "connected",
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        allowedConnectorProviders: ["ga4"],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));

    expect(prisma.calls.$transaction).toHaveLength(1);
  });

  it("creates a canonical Google account with the caller-provided AAD identity", async () => {
    const prisma = fakePrisma();
    const store = createPrismaProviderCredentialStore(prisma);
    const providerAccountId = googleAccountId("org_a", "new-google-sub");

    const result = await store.upsertGoogleAccount({
      providerAccountId,
      organizationId: "org_a",
      externalAccountId: "new-google-sub",
      accountEmail: "new@example.com",
      displayName: "New Google",
      status: "connected",
      scopes: ["scope:a"],
      allowedConnectorProviders: [],
      expectedUpdatedAt: null,
      tokenExpiresAt: null,
      connectedByUserId: "user_a",
      encryptedCredential: encryptGoogleCredential("org_a", providerAccountId)
    });

    expect(result.id).toBe(providerAccountId);
    expect(prisma.calls.transactionProviderAccount.upsert[0]?.create).toMatchObject({
      id: providerAccountId,
    });
    expect(decryptProviderCredential(
      keyring,
      credentialContext({ providerAccountId, provider: "google" }),
      envelopeFromAccount(prisma.accounts[0]!),
    )).toMatchObject({ kind: "oauth2", accessToken: "access-token" });
  });

  it("derives deterministic, component-sensitive canonical account IDs", () => {
    const base = { organizationId: "org_a", provider: "google" as const, externalAccountId: "google-sub" };

    expect(deriveCanonicalProviderAccountId(base)).toBe(deriveCanonicalProviderAccountId(base));
    expect(deriveCanonicalProviderAccountId(base)).toMatch(/^pa_[A-Za-z0-9_-]{43}$/);
    expect(new Set([
      deriveCanonicalProviderAccountId(base),
      deriveCanonicalProviderAccountId({ ...base, organizationId: "org_b" }),
      deriveCanonicalProviderAccountId({ ...base, provider: "bing" }),
      deriveCanonicalProviderAccountId({ ...base, externalAccountId: "other-sub" })
    ])).toHaveLength(4);
  });

  it("rejects mismatched and conflicting canonical Google identities with redacted errors", async () => {
    const canonicalId = googleAccountId("org_a", "google-sub");
    const mismatchPrisma = fakePrisma();
    const mismatchStore = createPrismaProviderCredentialStore(mismatchPrisma);
    const input = {
      providerAccountId: canonicalId,
      organizationId: "org_a",
      externalAccountId: "google-sub",
      accountEmail: "account@example.com",
      displayName: "Google",
      status: "connected" as const,
      scopes: ["scope:a"],
      allowedConnectorProviders: [],
      expectedUpdatedAt: null,
      tokenExpiresAt: null,
      connectedByUserId: "user_a",
      encryptedCredential: encryptGoogleCredential("org_a", canonicalId)
    };

    await expect(mismatchStore.upsertGoogleAccount({ ...input, providerAccountId: "pa_wrong" }))
      .rejects.toMatchObject({ code: "provider_account_identity_mismatch" });
    expect(mismatchPrisma.calls.providerAccount.upsert).toHaveLength(0);

    const conflictPrisma = fakePrisma({
      accounts: [account({ id: "pa_legacy", externalAccountId: "google-sub" })]
    });
    await expect(createPrismaProviderCredentialStore(conflictPrisma).upsertGoogleAccount(input))
      .rejects.toEqual(new ProviderCredentialStoreError("provider_account_identity_conflict"));
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

  it("maps a delete foreign-key race to account_in_use", async () => {
    const prisma = fakePrisma({
      accounts: [account()],
      providerAccountDeleteError: { code: "P2003", message: "sensitive prisma details" }
    });

    await expect(createPrismaProviderCredentialStore(prisma).deleteAccount({
      organizationId: "org_a",
      providerAccountId: "pa_a"
    })).rejects.toEqual(new ProviderCredentialStoreError("account_in_use"));
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

  it("lists account connector providers by exact tenant and account without secret columns", async () => {
    const prisma = fakePrisma({
      connectors: [
        connector({ id: "gsc_a", provider: "gsc", providerAccountId: "pa_a" }),
        connector({ id: "ga4_a", provider: "ga4", providerAccountId: "pa_a" }),
        connector({ id: "other_account", provider: "bing", providerAccountId: "pa_other" }),
        connector({
          id: "other_tenant",
          organizationId: "org_b",
          provider: "gsc",
          providerAccountId: "pa_a",
          siteId: "site_b",
        }),
      ],
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(
      store.listAccountConnectorProviders({
        organizationId: "org_a",
        providerAccountId: "pa_a",
      }),
    ).resolves.toEqual(["gsc", "ga4"]);
    expect(prisma.calls.siteConnector.findMany[0]).toEqual({
      where: { organizationId: "org_a", providerAccountId: "pa_a" },
      select: { provider: true },
    });
    expect(prisma.calls.siteConnector.findMany[0]?.select).not.toHaveProperty(
      "credentialCiphertext",
    );
  });

  it("maps corrupt persisted connector providers during account binding reads", async () => {
    const prisma = fakePrisma({
      connectors: [connector({ provider: "corrupt_provider" })],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).listAccountConnectorProviders({
        organizationId: "org_a",
        providerAccountId: "pa_a",
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_provider_mismatch"),
    );
  });

  it("maps corrupt persisted connector providers inside Google replacement", async () => {
    const providerAccountId = googleAccountId("org_a", "google-sub-corrupt");
    const prisma = fakePrisma({
      accounts: [account({ id: providerAccountId, externalAccountId: "google-sub-corrupt" })],
      connectors: [connector({ provider: "corrupt_provider", providerAccountId })],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertGoogleAccount({
        providerAccountId,
        organizationId: "org_a",
        externalAccountId: "google-sub-corrupt",
        accountEmail: "updated@example.com",
        displayName: "Updated Google",
        status: "connected",
        scopes: [],
        allowedConnectorProviders: [],
        expectedUpdatedAt: now.toISOString(),
        tokenExpiresAt: null,
        connectedByUserId: "user_a",
        encryptedCredential: encryptGoogleCredential("org_a", providerAccountId),
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_provider_mismatch"),
    );
    expect(prisma.calls.transactionProviderAccount.upsert).toHaveLength(0);
  });

  it("maps approved legacy GSC resolution metadata through connector reads", async () => {
    const prisma = fakePrisma({
      connectors: [connector({
        id: "connector_gsc",
        provider: "gsc",
        config: { resourceResolution: "legacy_auto" },
      })],
    });
    const store = createPrismaProviderCredentialStore(prisma);

    await expect(store.listSiteConnectors({ organizationId: "org_a", siteId: "site_a" })).resolves.toEqual([
      expect.objectContaining({
        id: "connector_gsc",
        provider: "gsc",
        config: { resourceResolution: "legacy_auto" },
      }),
    ]);
  });

  it("tenant-checks both binding parents and enforces provider compatibility", async () => {
    const prisma = fakePrisma({
      sites: [site(), site({ id: "site_b", organizationId: "org_b" })],
      accounts: [
        account({ scopes: ["https://www.googleapis.com/auth/analytics.readonly"] }),
        account({ id: "bing_a", provider: "bing" }),
        account({ id: "pa_b", organizationId: "org_b" }),
      ]
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
    expect(prisma.calls.transactionSite.findFirst[0]?.where).toEqual({ id: "site_b", organizationId: "org_a" });
    expect(prisma.calls.transactionProviderAccount.findFirst[0]?.where).toEqual({ id: "pa_b", organizationId: "org_a" });
    expect(prisma.calls.transactionSiteConnector.upsert[0]?.where).toEqual({
      organizationId: "org_a",
      siteId_provider: { siteId: "site_a", provider: "ga4" }
    });
  });

  it.each([
    ["gsc", "https://www.googleapis.com/auth/webmasters.readonly"],
    ["ga4", "https://www.googleapis.com/auth/analytics.readonly"],
  ] as const)("requires the persisted Google scope before binding %s", async (provider, requiredScope) => {
    const missingScopePrisma = fakePrisma({ sites: [site()], accounts: [account({ scopes: [] })] });

    await expect(
      createPrismaProviderCredentialStore(missingScopePrisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider,
        providerAccountId: "pa_a",
        externalResourceId: provider === "gsc" ? "sc-domain:example.com" : "properties/1",
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));
    expect(missingScopePrisma.connectors).toHaveLength(0);
    expect(missingScopePrisma.calls.$transaction).toHaveLength(1);

    const allowedPrisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: [requiredScope] })],
    });
    await expect(
      createPrismaProviderCredentialStore(allowedPrisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider,
        providerAccountId: "pa_a",
        externalResourceId: provider === "gsc" ? "sc-domain:example.com" : "properties/1",
      }),
    ).resolves.toMatchObject({ provider, providerAccountId: "pa_a" });
    expect(allowedPrisma.calls.$transaction).toHaveLength(1);
    expect(allowedPrisma.calls.transactionOptions).toEqual([
      { isolationLevel: "Serializable" },
    ]);
  });

  it.each([
    ["gsc", "https://www.googleapis.com/auth/webmasters"],
    ["ga4", "https://www.googleapis.com/auth/analytics"],
  ] as const)("accepts the persisted full Google scope before binding %s", async (provider, fullScope) => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: [fullScope] })],
    });

    await expect(createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_a",
      provider,
      providerAccountId: "pa_a",
      externalResourceId: provider === "gsc" ? "sc-domain:example.com" : "properties/1",
    })).resolves.toMatchObject({ provider, providerAccountId: "pa_a" });
  });

  it.each([
    ["gsc", [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/webmasters",
    ]],
    ["ga4", [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics",
    ]],
  ] as const)("accepts both persisted Google scopes before binding %s", async (provider, scopes) => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: [...scopes] })],
    });

    await expect(createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
      organizationId: "org_a",
      siteId: "site_a",
      provider,
      providerAccountId: "pa_a",
      externalResourceId: provider === "gsc" ? "sc-domain:example.com" : "properties/1",
    })).resolves.toMatchObject({ provider, providerAccountId: "pa_a" });
  });

  it("keeps Bing API-key binding compatibility without a Google scope rule", async () => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ id: "pa_bing", provider: "bing", authType: "api_key", scopes: [] })],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider: "bing",
        providerAccountId: "pa_bing",
        externalResourceId: "https://example.com/",
      }),
    ).resolves.toMatchObject({ provider: "bing", providerAccountId: "pa_bing" });
    expect(prisma.calls.$transaction).toHaveLength(1);
  });

  it("retries every connector binding read after P2034 and then succeeds", async () => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })],
      transactionCommitErrors: [{ code: "P2034" }],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider: "gsc",
        providerAccountId: "pa_a",
        externalResourceId: "sc-domain:example.com",
      }),
    ).resolves.toMatchObject({ provider: "gsc" });

    expect(prisma.calls.$transaction).toHaveLength(2);
    expect(prisma.calls.transactionSite.findFirst).toHaveLength(2);
    expect(prisma.calls.transactionProviderAccount.findFirst).toHaveLength(2);
    expect(prisma.calls.transactionSiteConnector.upsert).toHaveLength(2);
    expect(prisma.calls.transactionOptions).toEqual([
      { isolationLevel: "Serializable" },
      { isolationLevel: "Serializable" },
    ]);
  });

  it("maps exhausted connector P2034 retries without committing a binding", async () => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })],
      transactionCommitErrors: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider: "gsc",
        providerAccountId: "pa_a",
        externalResourceId: "sc-domain:example.com",
      }),
    ).rejects.toEqual(
      new ProviderCredentialStoreError("provider_account_concurrent_update"),
    );
    expect(prisma.calls.$transaction).toHaveLength(3);
    expect(prisma.connectors).toHaveLength(0);
  });

  it("rechecks account scopes after a connector P2034 retry and rejects a dropped grant", async () => {
    const prisma = fakePrisma({
      sites: [site()],
      accounts: [account({ scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })],
      transactionCommitErrors: [{ code: "P2034" }],
      beforeTransactionAttempt({ attempt, accounts }) {
        if (attempt === 2) {
          accounts[0]!.scopes = ["https://www.googleapis.com/auth/analytics.readonly"];
          accounts[0]!.updatedAt = new Date("2026-07-13T00:00:01.000Z");
        }
      },
    });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider: "gsc",
        providerAccountId: "pa_a",
        externalResourceId: "sc-domain:example.com",
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));

    expect(prisma.calls.$transaction).toHaveLength(2);
    expect(prisma.connectors).toHaveLength(0);
  });

  it("does not retry connector domain errors", async () => {
    const prisma = fakePrisma({ sites: [site()], accounts: [account({ scopes: [] })] });

    await expect(
      createPrismaProviderCredentialStore(prisma).upsertSiteConnector({
        organizationId: "org_a",
        siteId: "site_a",
        provider: "gsc",
        providerAccountId: "pa_a",
        externalResourceId: "sc-domain:example.com",
      }),
    ).rejects.toEqual(new ProviderCredentialStoreError("scope_missing"));
    expect(prisma.calls.$transaction).toHaveLength(1);
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
      accounts: [
        account({ legacyCredentialId: "legacy_migrated" }),
        account({ id: "pa_expired", status: "expired" }),
        account({ id: "pa_b", organizationId: "org_b" }),
      ],
      legacyCredentials: [
        { id: "legacy_migrated", organizationId: "org_a" },
        { id: "legacy_pending", organizationId: "org_a" },
        { id: "legacy_other", organizationId: "org_b" },
      ],
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
      legacyFallbacks: 1
    });
    expect(prisma.calls.providerAccount.count[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.providerAccount.count[1]?.where).toEqual({
      organizationId: "org_a",
      legacyCredentialId: { not: null },
    });
    expect(prisma.calls.connectorOAuthCredential.count[0]?.where).toEqual({
      organizationId: "org_a",
    });
    expect(prisma.calls.siteConnector.findMany[0]?.where).toEqual({ organizationId: "org_a" });
    expect(prisma.calls.siteConnector.findMany[0]?.select).not.toHaveProperty("providerAccount.credentialCiphertext");
  });
});

function createStoreFromPrismaClient(prisma: SearchOpsPrismaClient): ProviderCredentialStore {
  return createPrismaProviderCredentialStore(prisma);
}

function credentialContext(overrides: Partial<CredentialContext> = {}): CredentialContext {
  return { organizationId: "org_a", providerAccountId: "pa_a", provider: "google", ...overrides };
}

function googleAccountId(organizationId: string, externalAccountId: string) {
  return deriveCanonicalProviderAccountId({ organizationId, provider: "google", externalAccountId });
}

function encryptGoogleCredential(organizationId: string, providerAccountId: string) {
  return encryptProviderCredential(
    keyring,
    credentialContext({ organizationId, providerAccountId, provider: "google" }),
    { kind: "oauth2", accessToken: "access-token", refreshToken: "refresh-token", tokenType: "Bearer" },
  );
}

function envelopeFromAccount(row: AccountRow): EncryptedProviderCredential {
  return envelopeFromCredentialData(row);
}

function envelopeFromCredentialData(data: EncryptedProviderCredential): EncryptedProviderCredential {
  return {
    credentialCiphertext: data.credentialCiphertext,
    credentialIv: data.credentialIv,
    credentialAuthTag: data.credentialAuthTag,
    encryptionKeyId: data.encryptionKeyId,
    encryptionVersion: 1
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
  scopes: Prisma.JsonValue;
  tokenExpiresAt: Date | null;
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  encryptionKeyId: string;
  encryptionVersion: 1;
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
  config: Prisma.JsonValue;
  status: string;
  lastErrorCode: string | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyCredentialRow {
  id: string;
  organizationId: string;
}

function fakePrisma(seed: {
  accounts?: AccountRow[];
  sites?: SiteRow[];
  connectors?: ConnectorRow[];
  legacyCredentials?: LegacyCredentialRow[];
  beforeTransactionAttempt?: (input: {
    readonly attempt: number;
    readonly accounts: AccountRow[];
    readonly connectors: ConnectorRow[];
  }) => void;
  transactionCommitErrors?: unknown[];
  providerAccountDeleteError?: unknown;
  providerAccountCreateError?: unknown;
  providerAccountMetadataUpdateError?: unknown;
  providerAccountMetadataUpdateCountZero?: boolean;
} = {}) {
  const accounts = seed.accounts ?? [];
  const sites = seed.sites ?? [];
  const connectors = seed.connectors ?? [];
  const legacyCredentials = seed.legacyCredentials ?? [];
  type ProviderAccountPort = ProviderCredentialStorePrismaPort["providerAccount"];
  type TransactionProviderAccountPort =
    ProviderCredentialStorePrismaTransactionPort["providerAccount"];
  type TransactionSiteConnectorPort =
    ProviderCredentialStorePrismaTransactionPort["siteConnector"];
  type TransactionSitePort = ProviderCredentialStorePrismaTransactionPort["site"];
  type SitePort = ProviderCredentialStorePrismaPort["site"];
  type SiteConnectorPort = ProviderCredentialStorePrismaPort["siteConnector"];
  type ConnectorOAuthCredentialPort =
    ProviderCredentialStorePrismaPort["connectorOAuthCredential"];
  const calls = {
    $transaction: [] as ProviderCredentialStorePrismaTransactionPort[],
    providerAccount: {
      findMany: [] as Parameters<ProviderAccountPort["findMany"]>[0][],
      findFirst: [] as Parameters<ProviderAccountPort["findFirst"]>[0][],
      create: [] as Parameters<ProviderAccountPort["create"]>[0][],
      updateMany: [] as Parameters<ProviderAccountPort["updateMany"]>[0][],
      upsert: [] as Parameters<ProviderAccountPort["upsert"]>[0][],
      deleteMany: [] as Parameters<ProviderAccountPort["deleteMany"]>[0][],
      count: [] as Parameters<ProviderAccountPort["count"]>[0][]
    },
    connectorOAuthCredential: {
      count: [] as Parameters<ConnectorOAuthCredentialPort["count"]>[0][],
    },
    transactionProviderAccount: {
      findFirst: [] as Parameters<TransactionProviderAccountPort["findFirst"]>[0][],
      updateMany: [] as Parameters<TransactionProviderAccountPort["updateMany"]>[0][],
      create: [] as Parameters<TransactionProviderAccountPort["create"]>[0][],
      upsert: [] as Parameters<TransactionProviderAccountPort["upsert"]>[0][],
    },
    transactionSiteConnector: {
      findMany: [] as Parameters<TransactionSiteConnectorPort["findMany"]>[0][],
      upsert: [] as Parameters<TransactionSiteConnectorPort["upsert"]>[0][],
    },
    transactionSite: {
      findFirst: [] as Parameters<TransactionSitePort["findFirst"]>[0][],
    },
    transactionOptions: [] as Array<{ isolationLevel: "Serializable" } | undefined>,
    site: { findFirst: [] as Parameters<SitePort["findFirst"]>[0][] },
    siteConnector: {
      findMany: [] as Parameters<SiteConnectorPort["findMany"]>[0][],
      upsert: [] as Parameters<SiteConnectorPort["upsert"]>[0][],
      deleteMany: [] as Parameters<SiteConnectorPort["deleteMany"]>[0][],
      count: [] as Parameters<SiteConnectorPort["count"]>[0][]
    }
  };
  let nextId = 1;
  let transactionAttempt = 0;

  async function createProviderAccount(
    args: Parameters<ProviderAccountPort["create"]>[0],
    callsFor: "providerAccount" | "transactionProviderAccount",
  ) {
    calls[callsFor].create.push(args);
    if (seed.providerAccountCreateError !== undefined) throw seed.providerAccountCreateError;
    const row = account({
      ...args.data,
      scopes: [...args.data.scopes],
      connectedAt: now,
      createdAt: now,
      updatedAt: now
    });
    accounts.push(row);
    return select(row, args.select);
  }

  async function upsertProviderAccount(
    args: Parameters<ProviderAccountPort["upsert"]>[0],
    callsFor: "providerAccount" | "transactionProviderAccount",
  ) {
    calls[callsFor].upsert.push(args);
    const existing = accounts.find((row) => matchesUniqueAccount(row, args.where));
    if (existing !== undefined) {
      Object.assign(existing, args.update, { updatedAt: now });
      return select(existing, args.select);
    }
    if (accounts.some((row) => matchesCanonicalAccount(row, args.create))) {
      throw { code: "P2002", message: "sensitive prisma details" };
    }
    const row = account({
      ...args.create,
      scopes: [...args.create.scopes],
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    accounts.push(row);
    return select(row, args.select);
  }

  async function findSite(
    args: Parameters<SitePort["findFirst"]>[0],
    callsFor: "site" | "transactionSite",
  ) {
    calls[callsFor].findFirst.push(args);
    const row = sites.find((candidate) => matches(candidate, args.where));
    return row === undefined ? null : select(row, args.select);
  }

  async function upsertConnector(
    args: Parameters<SiteConnectorPort["upsert"]>[0],
    callsFor: "siteConnector" | "transactionSiteConnector",
  ) {
    calls[callsFor].upsert.push(args);
    const existing = connectors.find((row) =>
      row.organizationId === args.where.organizationId &&
      row.siteId === args.where.siteId_provider.siteId &&
      row.provider === args.where.siteId_provider.provider
    );
    if (existing !== undefined) {
      Object.assign(existing, args.update, { updatedAt: now });
      return selectConnector(existing, args.select, accounts);
    }
    const row = connector({
      id: `connector_created_${nextId++}`,
      ...args.create,
      createdAt: now,
      updatedAt: now,
    });
    connectors.push(row);
    return selectConnector(row, args.select, accounts);
  }

  const transactionProviderAccount: TransactionProviderAccountPort = {
    async findFirst(args) {
      calls.transactionProviderAccount.findFirst.push(args);
      const row = accounts.find((candidate) => matches(candidate, args.where));
      return row === undefined ? null : select(row, args.select);
    },
    async updateMany(args) {
      calls.transactionProviderAccount.updateMany.push(args);
      const isTargetUpdate =
        "id" in args.where &&
        typeof args.where.id === "string" &&
        args.where.organizationId !== undefined;
      if (isTargetUpdate && seed.providerAccountMetadataUpdateError !== undefined) {
        throw seed.providerAccountMetadataUpdateError;
      }
      if (isTargetUpdate && seed.providerAccountMetadataUpdateCountZero === true) {
        return { count: 0 };
      }
      let count = 0;
      for (const row of accounts) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data, { updatedAt: now });
          count += 1;
        }
      }
      return { count };
    },
    async create(args) {
      return createProviderAccount(args, "transactionProviderAccount");
    },
    async upsert(args) {
      return upsertProviderAccount(args, "transactionProviderAccount");
    },
  };

  const transactionSiteConnector: TransactionSiteConnectorPort = {
    async findMany(args) {
      calls.transactionSiteConnector.findMany.push(args);
      return connectors
        .filter((row) => matches(row, args.where))
        .map((row) => ({ provider: row.provider as SiteConnectorProvider }));
    },
    async upsert(args) {
      return upsertConnector(args, "transactionSiteConnector");
    },
  };

  const transactionSite: TransactionSitePort = {
    async findFirst(args) {
      return findSite(args, "transactionSite");
    },
  };

  const prisma: ProviderCredentialStorePrismaPort = {
    async $transaction(callback, options) {
      transactionAttempt += 1;
      seed.beforeTransactionAttempt?.({ attempt: transactionAttempt, accounts, connectors });
      const accountSnapshot = accounts.map((row) => ({ ...row, scopes: structuredClone(row.scopes) }));
      const connectorSnapshot = connectors.map((row) => ({
        ...row,
        config: structuredClone(row.config),
      }));
      const transactionClient: ProviderCredentialStorePrismaTransactionPort = {
        providerAccount: transactionProviderAccount,
        site: transactionSite,
        siteConnector: transactionSiteConnector,
      };
      calls.$transaction.push(transactionClient);
      calls.transactionOptions.push(options);
      try {
        const result = await callback(transactionClient);
        const commitError = seed.transactionCommitErrors?.[transactionAttempt - 1];
        if (commitError !== undefined) {
          throw commitError;
        }
        return result;
      } catch (error) {
        accounts.splice(0, accounts.length, ...accountSnapshot);
        connectors.splice(0, connectors.length, ...connectorSnapshot);
        throw error;
      }
    },
    providerAccount: {
      async findMany(args) {
        calls.providerAccount.findMany.push(args);
        return accounts
          .filter((row) => row.organizationId === args.where.organizationId)
          .map((row) => selectAccountSummary(row, args.select, connectors));
      },
      async findFirst(args) {
        calls.providerAccount.findFirst.push(args);
        const row = accounts.find((candidate) => matches(candidate, args.where));
        return row === undefined ? null : select(row, args.select);
      },
      async create(args) {
        return createProviderAccount(args, "providerAccount");
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
        return upsertProviderAccount(args, "providerAccount");
      },
      async deleteMany(args) {
        calls.providerAccount.deleteMany.push(args);
        if (seed.providerAccountDeleteError !== undefined) throw seed.providerAccountDeleteError;
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
    connectorOAuthCredential: {
      async count(args) {
        calls.connectorOAuthCredential.count.push(args);
        return legacyCredentials.filter((row) => matches(row, args.where)).length;
      },
    },
    site: {
      async findFirst(args) {
        return findSite(args, "site");
      }
    },
    siteConnector: {
      async findMany(args) {
        calls.siteConnector.findMany.push(args);
        return connectors.filter((row) => matches(row, args.where)).map((row) => selectConnector(row, args.select, accounts));
      },
      async upsert(args) {
        return upsertConnector(args, "siteConnector");
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
  return Object.entries(where).every(([key, value]) => {
    if (typeof value === "object" && value !== null && "not" in value) {
      return values[key] !== value.not;
    }
    if (key === "isDefault") {
      return values.isDefault === value;
    }
    return values[key] === value;
  });
}

function matchesUniqueAccount(
  row: AccountRow,
  where: { id?: string; organizationId_provider_externalAccountId?: { organizationId: string; provider: string; externalAccountId: string } },
) {
  const unique = where.organizationId_provider_externalAccountId;
  return unique !== undefined && row.id === where.id && row.organizationId === unique.organizationId && row.provider === unique.provider && row.externalAccountId === unique.externalAccountId;
}

function matchesCanonicalAccount(row: AccountRow, data: { organizationId: string; provider: string; externalAccountId: string | null }) {
  return row.organizationId === data.organizationId && row.provider === data.provider && row.externalAccountId === data.externalAccountId;
}

function select<T extends object>(row: T, fields: Record<string, unknown>): T {
  const values = row as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => [key, values[key]]),
  ) as T;
}

function selectAccountSummary(
  row: AccountRow,
  fields: Record<string, unknown>,
  connectors: ConnectorRow[],
) {
  return {
    ...select(row, fields),
    _count: {
      siteConnectors: connectors.filter(
        (connectorRow) =>
          connectorRow.organizationId === row.organizationId &&
          connectorRow.providerAccountId === row.id,
      ).length,
    },
  };
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
