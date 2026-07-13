import { createHash } from "node:crypto";

import {
  ProviderAccountAuthTypeSchema,
  ProviderAccountMetadataSchema,
  ProviderAccountProviderSchema,
  ProviderAccountStatusSchema,
  SiteConnectorConfigSchema,
  SiteConnectorProviderSchema,
  SiteConnectorSchema,
  SiteConnectorStatusSchema,
  type ProviderAccountAuthType,
  type ProviderAccountMetadata,
  type ProviderAccountProvider,
  type ProviderAccountStatus,
  type SiteConnector,
  type SiteConnectorConfig,
  type SiteConnectorProvider,
  type SiteConnectorStatus
} from "@searchops/types";

import type { EncryptedProviderCredential } from "./credential-crypto.js";
import type { Prisma } from "./generated/prisma/index.js";

const providerAccountMetadataSelect = {
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
  updatedAt: true
} as const satisfies Prisma.ProviderAccountSelect;

const providerAccountSecretSelect = {
  id: true,
  organizationId: true,
  provider: true,
  authType: true,
  status: true,
  scopes: true,
  tokenExpiresAt: true,
  credentialCiphertext: true,
  credentialIv: true,
  credentialAuthTag: true,
  encryptionKeyId: true,
  encryptionVersion: true,
  updatedAt: true
} as const satisfies Prisma.ProviderAccountSelect;

const siteConnectorSelect = {
  id: true,
  organizationId: true,
  siteId: true,
  provider: true,
  providerAccountId: true,
  externalResourceId: true,
  config: true,
  status: true,
  lastErrorCode: true,
  lastCheckedAt: true,
  createdAt: true,
  updatedAt: true
} as const satisfies Prisma.SiteConnectorSelect;

const readinessConnectorSelect = {
  provider: true,
  externalResourceId: true,
  status: true,
  providerAccount: {
    select: {
      status: true
    }
  }
} as const satisfies Prisma.SiteConnectorSelect;

export type ProviderAccountMetadataRow = Prisma.ProviderAccountGetPayload<{
  select: typeof providerAccountMetadataSelect;
}>;

type ProviderAccountSecretRow = Prisma.ProviderAccountGetPayload<{
  select: typeof providerAccountSecretSelect;
}>;

interface SiteRow {
  readonly id: string;
  readonly organizationId: string;
}

type SiteConnectorRow = Prisma.SiteConnectorGetPayload<{ select: typeof siteConnectorSelect }>;

type ReadinessConnectorRow = Prisma.SiteConnectorGetPayload<{
  select: typeof readinessConnectorSelect;
}>;

export interface ProviderCredentialStorePrismaTransactionPort {
  readonly providerAccount: {
    findFirst(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
      readonly select: typeof providerAccountMetadataSelect;
    }): Promise<ProviderAccountMetadataRow | null>;
    updateMany(args: {
      readonly where: ProviderAccountMetadataUpdateWhere;
      readonly data: ProviderAccountMetadataUpdateData;
    }): Promise<{ readonly count: number }>;
  };
}

export interface ProviderCredentialStorePrismaPort {
  $transaction<T>(
    operation: (transaction: ProviderCredentialStorePrismaTransactionPort) => Promise<T>,
  ): Promise<T>;
  readonly providerAccount: {
    findMany(args: {
      readonly where: { readonly organizationId: string };
      readonly select: typeof providerAccountMetadataSelect;
    }): Promise<ProviderAccountMetadataRow[]>;
    findFirst(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
      readonly select: typeof providerAccountMetadataSelect;
    }): Promise<ProviderAccountMetadataRow | null>;
    create(args: {
      readonly data: ProviderAccountCreateData;
      readonly select: typeof providerAccountMetadataSelect;
    }): Promise<ProviderAccountMetadataRow>;
    updateMany(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
      readonly data: ProviderAccountCredentialUpdateData;
    }): Promise<{ readonly count: number }>;
    upsert(args: {
      readonly where: {
        readonly id: string;
        readonly organizationId_provider_externalAccountId: {
          readonly organizationId: string;
          readonly provider: "google";
          readonly externalAccountId: string;
        };
      };
      readonly create: ProviderAccountCreateData;
      readonly update: ProviderAccountGoogleUpdateData;
      readonly select: typeof providerAccountMetadataSelect;
    }): Promise<ProviderAccountMetadataRow>;
    deleteMany(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
    }): Promise<{ readonly count: number }>;
    count(args: { readonly where: { readonly organizationId: string } }): Promise<number>;
  };
  readonly site: {
    findFirst(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
      readonly select: { readonly id: true; readonly organizationId: true };
    }): Promise<SiteRow | null>;
  };
  readonly siteConnector: {
    findMany(args: {
      readonly where: { readonly organizationId: string; readonly siteId?: string };
      readonly select: typeof siteConnectorSelect;
    }): Promise<SiteConnectorRow[]>;
    upsert(args: {
      readonly where: {
        readonly organizationId: string;
        readonly siteId_provider: {
          readonly siteId: string;
          readonly provider: SiteConnectorProvider;
        };
      };
      readonly create: SiteConnectorWriteData;
      readonly update: SiteConnectorWriteData;
      readonly select: typeof siteConnectorSelect;
    }): Promise<SiteConnectorRow>;
    deleteMany(args: {
      readonly where: {
        readonly organizationId: string;
        readonly siteId: string;
        readonly provider: SiteConnectorProvider;
      };
    }): Promise<{ readonly count: number }>;
    count(args: {
      readonly where: { readonly organizationId: string; readonly providerAccountId: string };
    }): Promise<number>;
  };
}

export interface ProviderAccountSecretRecord extends EncryptedProviderCredential {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: ProviderAccountProvider;
  readonly authType: ProviderAccountAuthType;
  readonly status: ProviderAccountStatus;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: string | null;
  readonly updatedAt: string;
}

export interface CreateApiKeyAccountStoreInput {
  readonly providerAccountId: string;
  readonly organizationId: string;
  readonly provider: ProviderAccountProvider;
  readonly authType: "api_key";
  readonly externalAccountId: string | null;
  readonly accountEmail: string | null;
  readonly displayName: string;
  readonly isDefault: boolean;
  readonly connectedByUserId: string;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export interface ReplaceCredentialStoreInput {
  readonly organizationId: string;
  readonly providerAccountId: string;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export type UpdateProviderAccountMetadataStoreInput = AccountLookupStoreInput &
  (
    | {
        readonly displayName: string;
        readonly isDefault?: boolean;
      }
    | {
        readonly displayName?: string;
        readonly isDefault: boolean;
      }
  );

export interface UpsertGoogleAccountStoreInput {
  readonly providerAccountId: string;
  readonly organizationId: string;
  readonly externalAccountId: string;
  readonly accountEmail: string;
  readonly displayName: string;
  readonly status: ProviderAccountStatus;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly connectedByUserId: string;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export interface DeleteAccountStoreInput {
  readonly organizationId: string;
  readonly providerAccountId: string;
}

export interface AccountLookupStoreInput {
  readonly organizationId: string;
  readonly providerAccountId: string;
}

export interface SiteConnectorLookupStoreInput {
  readonly organizationId: string;
  readonly siteId: string;
}

export interface UpsertSiteConnectorStoreInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly provider: SiteConnectorProvider;
  readonly providerAccountId: string;
  readonly externalResourceId: string | null;
  readonly config?: SiteConnectorConfig;
  readonly status?: SiteConnectorStatus;
  readonly lastErrorCode?: string | null;
  readonly lastCheckedAt?: Date | null;
}

export interface DeleteSiteConnectorStoreInput extends SiteConnectorLookupStoreInput {
  readonly provider: SiteConnectorProvider;
}

/** Non-secret organization readiness data consumed by operational readiness. */
export interface ConnectorCredentialReadinessSnapshot {
  readonly configuredByProvider: Readonly<Record<SiteConnectorProvider, number>>;
  readonly encryptedAccounts: number;
  readonly legacyFallbacks: number;
}

export interface ProviderCredentialStore {
  listAccounts(organizationId: string): Promise<ProviderAccountMetadata[]>;
  getAccountMetadata(input: AccountLookupStoreInput): Promise<ProviderAccountMetadata | null>;
  getAccountSecretRecord(input: AccountLookupStoreInput): Promise<ProviderAccountSecretRecord | null>;
  createApiKeyAccount(input: CreateApiKeyAccountStoreInput): Promise<ProviderAccountMetadata>;
  updateAccountMetadata(
    input: UpdateProviderAccountMetadataStoreInput,
  ): Promise<ProviderAccountMetadata | null>;
  replaceCredential(input: ReplaceCredentialStoreInput): Promise<ProviderAccountMetadata | null>;
  upsertGoogleAccount(input: UpsertGoogleAccountStoreInput): Promise<ProviderAccountMetadata>;
  deleteAccount(input: DeleteAccountStoreInput): Promise<boolean>;
  listSiteConnectors(input: SiteConnectorLookupStoreInput): Promise<SiteConnector[]>;
  upsertSiteConnector(input: UpsertSiteConnectorStoreInput): Promise<SiteConnector>;
  deleteSiteConnector(input: DeleteSiteConnectorStoreInput): Promise<boolean>;
  countAccountBindings(input: AccountLookupStoreInput): Promise<number>;
  getCredentialReadinessSnapshot(organizationId: string): Promise<ConnectorCredentialReadinessSnapshot>;
}

export class ProviderCredentialStoreError extends Error {
  constructor(readonly code: ProviderCredentialStoreErrorCode) {
    super(code);
    this.name = "ProviderCredentialStoreError";
  }
}

export type ProviderCredentialStoreErrorCode =
  | "account_in_use"
  | "provider_account_default_conflict"
  | "provider_account_identity_conflict"
  | "provider_account_identity_mismatch"
  | "provider_account_not_in_organization"
  | "provider_account_provider_mismatch"
  | "site_not_in_organization";

export function createPrismaProviderCredentialStore(
  prisma: ProviderCredentialStorePrismaPort,
): ProviderCredentialStore {
  return {
    async listAccounts(organizationId) {
      const rows = await prisma.providerAccount.findMany({
        where: { organizationId },
        select: providerAccountMetadataSelect
      });

      return rows.map(toProviderAccountMetadata);
    },

    async getAccountMetadata(input) {
      const row = await prisma.providerAccount.findFirst({
        where: { id: input.providerAccountId, organizationId: input.organizationId },
        select: providerAccountMetadataSelect
      });

      return row === null ? null : toProviderAccountMetadata(row);
    },

    async getAccountSecretRecord(input) {
      const row = await findSecretRecord(prisma, input);
      return row === null ? null : toProviderAccountSecretRecord(row);
    },

    async createApiKeyAccount(input) {
      const row = await prisma.providerAccount.create({
        data: {
          id: input.providerAccountId,
          organizationId: input.organizationId,
          provider: input.provider,
          authType: input.authType,
          externalAccountId: input.externalAccountId,
          accountEmail: input.accountEmail,
          displayName: input.displayName,
          status: "connected",
          scopes: [],
          tokenExpiresAt: null,
          credentialCiphertext: input.encryptedCredential.credentialCiphertext,
          credentialIv: input.encryptedCredential.credentialIv,
          credentialAuthTag: input.encryptedCredential.credentialAuthTag,
          encryptionKeyId: input.encryptedCredential.encryptionKeyId,
          encryptionVersion: input.encryptedCredential.encryptionVersion,
          isDefault: input.isDefault,
          connectedByUserId: input.connectedByUserId
        },
        select: providerAccountMetadataSelect
      });

      return toProviderAccountMetadata(row);
    },

    async updateAccountMetadata(input) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const target = await transaction.providerAccount.findFirst({
            where: { id: input.providerAccountId, organizationId: input.organizationId },
            select: providerAccountMetadataSelect
          });
          if (target === null) {
            return null;
          }

          if (input.isDefault === true) {
            await transaction.providerAccount.updateMany({
              where: {
                organizationId: input.organizationId,
                provider: target.provider,
                id: { not: input.providerAccountId },
                isDefault: true
              },
              data: { isDefault: false }
            });
          }

          const updated = await transaction.providerAccount.updateMany({
            where: { id: input.providerAccountId, organizationId: input.organizationId },
            data: providerAccountMetadataUpdateData(input)
          });
          if (updated.count === 0) {
            throw providerAccountMetadataTargetMissing;
          }

          const row = await transaction.providerAccount.findFirst({
            where: { id: input.providerAccountId, organizationId: input.organizationId },
            select: providerAccountMetadataSelect
          });
          if (row === null) {
            throw providerAccountMetadataTargetMissing;
          }
          return toProviderAccountMetadata(row);
        });
      } catch (error) {
        if (error === providerAccountMetadataTargetMissing) {
          return null;
        }
        if (hasPrismaErrorCode(error, "P2002")) {
          throw new ProviderCredentialStoreError("provider_account_default_conflict");
        }
        throw error;
      }
    },

    async replaceCredential(input) {
      const updated = await prisma.providerAccount.updateMany({
        where: { id: input.providerAccountId, organizationId: input.organizationId },
        data: encryptedCredentialUpdateData(input.encryptedCredential)
      });

      if (updated.count === 0) {
        return null;
      }

      return this.getAccountMetadata(input);
    },

    async upsertGoogleAccount(input) {
      const canonicalId = deriveCanonicalProviderAccountId({
        organizationId: input.organizationId,
        provider: "google",
        externalAccountId: input.externalAccountId
      });
      if (input.providerAccountId !== canonicalId) {
        throw new ProviderCredentialStoreError("provider_account_identity_mismatch");
      }

      const connectedAt = new Date();
      try {
        const row = await prisma.providerAccount.upsert({
          where: {
            id: canonicalId,
            organizationId_provider_externalAccountId: {
              organizationId: input.organizationId,
              provider: "google",
              externalAccountId: input.externalAccountId
            }
          },
          create: {
            id: canonicalId,
            organizationId: input.organizationId,
            provider: "google",
            authType: "oauth2",
            externalAccountId: input.externalAccountId,
            accountEmail: input.accountEmail,
            displayName: input.displayName,
            status: input.status,
            scopes: [...input.scopes],
            tokenExpiresAt: input.tokenExpiresAt,
            credentialCiphertext: input.encryptedCredential.credentialCiphertext,
            credentialIv: input.encryptedCredential.credentialIv,
            credentialAuthTag: input.encryptedCredential.credentialAuthTag,
            encryptionKeyId: input.encryptedCredential.encryptionKeyId,
            encryptionVersion: input.encryptedCredential.encryptionVersion,
            isDefault: false,
            connectedByUserId: input.connectedByUserId,
            connectedAt
          },
          update: {
            accountEmail: input.accountEmail,
            displayName: input.displayName,
            status: input.status,
            scopes: [...input.scopes],
            tokenExpiresAt: input.tokenExpiresAt,
            credentialCiphertext: input.encryptedCredential.credentialCiphertext,
            credentialIv: input.encryptedCredential.credentialIv,
            credentialAuthTag: input.encryptedCredential.credentialAuthTag,
            encryptionKeyId: input.encryptedCredential.encryptionKeyId,
            encryptionVersion: input.encryptedCredential.encryptionVersion,
            connectedByUserId: input.connectedByUserId,
            connectedAt
          },
          select: providerAccountMetadataSelect
        });

        return toProviderAccountMetadata(row);
      } catch (error) {
        if (hasPrismaErrorCode(error, "P2002")) {
          throw new ProviderCredentialStoreError("provider_account_identity_conflict");
        }
        throw error;
      }
    },

    async deleteAccount(input) {
      const bindings = await this.countAccountBindings(input);
      if (bindings > 0) {
        throw new ProviderCredentialStoreError("account_in_use");
      }

      try {
        const deleted = await prisma.providerAccount.deleteMany({
          where: { id: input.providerAccountId, organizationId: input.organizationId }
        });
        return deleted.count > 0;
      } catch (error) {
        if (hasPrismaErrorCode(error, "P2003")) {
          throw new ProviderCredentialStoreError("account_in_use");
        }
        throw error;
      }
    },

    async listSiteConnectors(input) {
      const rows = await prisma.siteConnector.findMany({
        where: { organizationId: input.organizationId, siteId: input.siteId },
        select: siteConnectorSelect
      });

      return rows.map(toSiteConnector);
    },

    async upsertSiteConnector(input) {
      const foundSite = await prisma.site.findFirst({
        where: { id: input.siteId, organizationId: input.organizationId },
        select: { id: true, organizationId: true }
      });
      if (foundSite === null) {
        throw new ProviderCredentialStoreError("site_not_in_organization");
      }

      const foundAccount = await prisma.providerAccount.findFirst({
        where: { id: input.providerAccountId, organizationId: input.organizationId },
        select: providerAccountMetadataSelect
      });
      if (foundAccount === null) {
        throw new ProviderCredentialStoreError("provider_account_not_in_organization");
      }

      assertConnectorProviderAccountCompatibility(input.provider, foundAccount.provider);
      const data = siteConnectorWriteData(input);
      const row = await prisma.siteConnector.upsert({
        where: {
          organizationId: input.organizationId,
          siteId_provider: { siteId: input.siteId, provider: input.provider }
        },
        create: data,
        update: data,
        select: siteConnectorSelect
      });

      return toSiteConnector(row);
    },

    async deleteSiteConnector(input) {
      const deleted = await prisma.siteConnector.deleteMany({
        where: {
          organizationId: input.organizationId,
          siteId: input.siteId,
          provider: input.provider
        }
      });
      return deleted.count > 0;
    },

    async countAccountBindings(input) {
      return prisma.siteConnector.count({
        where: { organizationId: input.organizationId, providerAccountId: input.providerAccountId }
      });
    },

    async getCredentialReadinessSnapshot(organizationId) {
      const [encryptedAccounts, connectors] = await Promise.all([
        prisma.providerAccount.count({ where: { organizationId } }),
        findReadinessConnectors(prisma, organizationId)
      ]);
      const configuredByProvider: Record<SiteConnectorProvider, number> = { gsc: 0, ga4: 0, bing: 0 };

      for (const connector of connectors) {
        const provider = SiteConnectorProviderSchema.safeParse(connector.provider);
        if (
          provider.success &&
          connector.externalResourceId !== null &&
          connector.status === "connected" &&
          connector.providerAccount?.status === "connected"
        ) {
          configuredByProvider[provider.data] += 1;
        }
      }

      return { configuredByProvider, encryptedAccounts, legacyFallbacks: 0 };
    }
  };
}

interface ProviderAccountCreateData {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: ProviderAccountProvider;
  readonly authType: ProviderAccountAuthType;
  readonly externalAccountId: string | null;
  readonly accountEmail: string | null;
  readonly displayName: string;
  readonly status: ProviderAccountStatus;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: 1;
  readonly isDefault: boolean;
  readonly connectedByUserId: string;
  readonly connectedAt?: Date;
}

interface ProviderAccountCredentialUpdateData {
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: 1;
}

type ProviderAccountMetadataUpdateWhere =
  | {
      readonly id: string;
      readonly organizationId: string;
    }
  | {
      readonly organizationId: string;
      readonly provider: string;
      readonly id: { readonly not: string };
      readonly isDefault: true;
    };

interface ProviderAccountMetadataUpdateData {
  readonly displayName?: string;
  readonly isDefault?: boolean;
}

interface ProviderAccountGoogleUpdateData extends ProviderAccountCredentialUpdateData {
  readonly accountEmail: string;
  readonly displayName: string;
  readonly status: ProviderAccountStatus;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly connectedByUserId: string;
  readonly connectedAt: Date;
}

interface SiteConnectorWriteData {
  readonly organizationId: string;
  readonly siteId: string;
  readonly provider: SiteConnectorProvider;
  readonly providerAccountId: string;
  readonly externalResourceId: string | null;
  readonly config: SiteConnectorConfig;
  readonly status: SiteConnectorStatus;
  readonly lastErrorCode: string | null;
  readonly lastCheckedAt: Date | null;
}

async function findSecretRecord(
  prisma: ProviderCredentialStorePrismaPort,
  input: AccountLookupStoreInput,
): Promise<ProviderAccountSecretRow | null> {
  return (prisma.providerAccount.findFirst as unknown as (args: {
    readonly where: { readonly id: string; readonly organizationId: string };
    readonly select: typeof providerAccountSecretSelect;
  }) => Promise<ProviderAccountSecretRow | null>)({
    where: { id: input.providerAccountId, organizationId: input.organizationId },
    select: providerAccountSecretSelect
  });
}

async function findReadinessConnectors(
  prisma: ProviderCredentialStorePrismaPort,
  organizationId: string,
): Promise<ReadinessConnectorRow[]> {
  return (prisma.siteConnector.findMany as unknown as (args: {
    readonly where: { readonly organizationId: string };
    readonly select: typeof readinessConnectorSelect;
  }) => Promise<ReadinessConnectorRow[]>)({
    where: { organizationId },
    select: readinessConnectorSelect
  });
}

function encryptedCredentialUpdateData(
  encryptedCredential: EncryptedProviderCredential,
): ProviderAccountCredentialUpdateData {
  return {
    credentialCiphertext: encryptedCredential.credentialCiphertext,
    credentialIv: encryptedCredential.credentialIv,
    credentialAuthTag: encryptedCredential.credentialAuthTag,
    encryptionKeyId: encryptedCredential.encryptionKeyId,
    encryptionVersion: encryptedCredential.encryptionVersion
  };
}

function providerAccountMetadataUpdateData(
  input: UpdateProviderAccountMetadataStoreInput,
): ProviderAccountMetadataUpdateData {
  return {
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
    ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault })
  };
}

function siteConnectorWriteData(input: UpsertSiteConnectorStoreInput): SiteConnectorWriteData {
  const config = SiteConnectorConfigSchema.parse(input.config ?? {});
  const status = input.status ?? (input.externalResourceId === null ? "needs_configuration" : "connected");

  return {
    organizationId: input.organizationId,
    siteId: input.siteId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    externalResourceId: input.externalResourceId,
    config,
    status: SiteConnectorStatusSchema.parse(status),
    lastErrorCode: input.lastErrorCode ?? null,
    lastCheckedAt: input.lastCheckedAt ?? null
  };
}

function assertConnectorProviderAccountCompatibility(
  connectorProvider: SiteConnectorProvider,
  accountProvider: string,
): void {
  const compatible =
    (connectorProvider === "gsc" || connectorProvider === "ga4") && accountProvider === "google" ||
    connectorProvider === "bing" && accountProvider === "bing";

  if (!compatible) {
    throw new ProviderCredentialStoreError("provider_account_provider_mismatch");
  }
}

function toProviderAccountMetadata(row: ProviderAccountMetadataRow): ProviderAccountMetadata {
  return ProviderAccountMetadataSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    provider: ProviderAccountProviderSchema.parse(row.provider),
    authType: ProviderAccountAuthTypeSchema.parse(row.authType),
    externalAccountId: row.externalAccountId,
    accountEmail: row.accountEmail,
    displayName: row.displayName,
    status: ProviderAccountStatusSchema.parse(row.status),
    scopes: parseScopes(row.scopes),
    tokenExpiresAt: toIsoDate(row.tokenExpiresAt),
    isDefault: row.isDefault,
    legacyCredentialId: row.legacyCredentialId,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    credentialSource: "encrypted"
  });
}

function toProviderAccountSecretRecord(row: ProviderAccountSecretRow): ProviderAccountSecretRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: ProviderAccountProviderSchema.parse(row.provider),
    authType: ProviderAccountAuthTypeSchema.parse(row.authType),
    status: ProviderAccountStatusSchema.parse(row.status),
    scopes: parseScopes(row.scopes),
    tokenExpiresAt: toIsoDate(row.tokenExpiresAt),
    credentialCiphertext: row.credentialCiphertext,
    credentialIv: row.credentialIv,
    credentialAuthTag: row.credentialAuthTag,
    encryptionKeyId: row.encryptionKeyId,
    encryptionVersion: parseEncryptionVersion(row.encryptionVersion),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toSiteConnector(row: SiteConnectorRow): SiteConnector {
  return SiteConnectorSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    siteId: row.siteId,
    provider: SiteConnectorProviderSchema.parse(row.provider),
    providerAccountId: row.providerAccountId,
    externalResourceId: row.externalResourceId,
    config: SiteConnectorConfigSchema.parse(row.config),
    status: SiteConnectorStatusSchema.parse(row.status),
    lastErrorCode: row.lastErrorCode,
    lastCheckedAt: toIsoDate(row.lastCheckedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function parseScopes(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((scope) => typeof scope !== "string" || scope.length === 0)) {
    throw new Error("invalid_provider_account_scopes");
  }
  return [...value];
}

function parseEncryptionVersion(value: number): 1 {
  if (value !== 1) {
    throw new Error("unsupported_credential_encryption_version");
  }
  return 1;
}

function toIsoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function deriveCanonicalProviderAccountId(input: {
  readonly organizationId: string;
  readonly provider: ProviderAccountProvider;
  readonly externalAccountId: string;
}): string {
  const tuple = JSON.stringify([input.organizationId, input.provider, input.externalAccountId]);
  return `pa_${createHash("sha256").update(tuple, "utf8").digest("base64url")}`;
}

function hasPrismaErrorCode(error: unknown, code: "P2002" | "P2003"): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

const providerAccountMetadataTargetMissing = Symbol("provider_account_metadata_target_missing");
