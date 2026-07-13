import { ProviderAccountProviderSchema, type ProviderAccountProvider } from "@searchops/types";

import {
  decryptProviderCredential,
  encryptProviderCredential,
  type CredentialKeyring,
  type EncryptedProviderCredential,
} from "./credential-crypto.js";
import type { Prisma } from "./generated/prisma/index.js";
import { deriveCanonicalProviderAccountId } from "./provider-credential-store.js";
import type { SearchOpsPrismaClient } from "./client.js";

const DEFAULT_BATCH_SIZE = 100;
const LEGACY_ACCOUNT_DISPLAY_NAME = "Legacy Google account";
const MAINTENANCE_ARGUMENT_ERROR = "credential_maintenance_arguments_invalid";
const MAINTENANCE_OPTION_ERROR = "credential_maintenance_options_invalid";
const PRISMA_MAINTENANCE_TRANSACTION_OPTIONS = {
  maxWait: 30_000,
  timeout: 300_000,
} as const;
const legacyCredentialSelect = {
  id: true,
  organizationId: true,
  siteId: true,
  provider: true,
  status: true,
  scopes: true,
  accessToken: true,
  refreshToken: true,
  tokenType: true,
  tokenExpiresAt: true,
  externalAccountEmail: true,
  connectedByUserId: true,
  connectedAt: true,
} as const satisfies Prisma.ConnectorOAuthCredentialSelect;
const legacyAccountInspectionSelect = {
  id: true,
  organizationId: true,
} as const satisfies Prisma.ProviderAccountSelect;
const siteIdentitySelect = { id: true } as const satisfies Prisma.SiteSelect;
const rotationCredentialSelect = {
  id: true,
  organizationId: true,
  provider: true,
  credentialCiphertext: true,
  credentialIv: true,
  credentialAuthTag: true,
  encryptionKeyId: true,
  encryptionVersion: true,
  updatedAt: true,
} as const satisfies Prisma.ProviderAccountSelect;
const idSelect = { id: true } as const;

export interface CredentialMaintenanceSummary {
  readonly examined: number;
  readonly migrated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly pending: number;
  readonly dryRun: boolean;
}

export interface CredentialMaintenanceOptions {
  readonly apply: boolean;
  readonly batchSize: number;
}

export interface LegacyProviderCredentialMigrationOptions extends CredentialMaintenanceOptions {
  readonly legacyGa4PropertyId?: string;
}

export interface LegacyProviderCredentialRow {
  readonly id: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly provider: string;
  readonly status: string;
  readonly scopes: unknown;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenType: string | null;
  readonly tokenExpiresAt: Date | null;
  readonly externalAccountEmail: string | null;
  readonly connectedByUserId: string;
  readonly connectedAt: Date;
}

export interface RotatableProviderCredentialRow {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: string;
  readonly credentialCiphertext: string;
  readonly credentialIv: string;
  readonly credentialAuthTag: string;
  readonly encryptionKeyId: string;
  readonly encryptionVersion: number;
  readonly updatedAt: Date;
}

export interface LegacyCredentialInspection {
  readonly providerAccountId: string | null;
  readonly providerAccountOrganizationId: string | null;
  readonly siteBelongsToOrganization: boolean;
}

export interface LegacyProviderAccountCreateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: "google";
  readonly authType: "oauth2";
  readonly externalAccountId: null;
  readonly accountEmail: string | null;
  readonly displayName: string;
  readonly status: LegacyCredentialStatus;
  readonly scopes: readonly string[];
  readonly tokenExpiresAt: Date | null;
  readonly legacyCredentialId: string;
  readonly connectedByUserId: string;
  readonly connectedAt: Date;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export interface LegacySiteConnectorUpsertInput {
  readonly organizationId: string;
  readonly siteId: string;
  readonly provider: "gsc" | "ga4";
  readonly providerAccountId: string;
  readonly externalResourceId: string | null;
  readonly config: Prisma.InputJsonObject;
  readonly status: LegacyCredentialStatus | "needs_configuration";
}

export interface ProviderCredentialEncryptionUpdateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly expectedUpdatedAt: Date;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export interface ProviderCredentialMaintenanceTransaction {
  inspectLegacyCredential(input: {
    readonly legacyCredentialId: string;
    readonly siteId: string;
    readonly organizationId: string;
  }): Promise<LegacyCredentialInspection>;
  createLegacyProviderAccount(input: LegacyProviderAccountCreateInput): Promise<void>;
  upsertLegacySiteConnector(input: LegacySiteConnectorUpsertInput): Promise<void>;
  updateProviderCredentialEncryption(
    input: ProviderCredentialEncryptionUpdateInput,
  ): Promise<boolean>;
}

export interface ProviderCredentialMaintenanceStore {
  listLegacyCredentials(input: {
    readonly afterId: string | null;
    readonly limit: number;
  }): Promise<readonly LegacyProviderCredentialRow[]>;
  inspectLegacyCredential(input: {
    readonly legacyCredentialId: string;
    readonly siteId: string;
    readonly organizationId: string;
  }): Promise<LegacyCredentialInspection>;
  listProviderCredentialsForRotation(input: {
    readonly activeKeyId: string;
    readonly afterId: string | null;
    readonly limit: number;
  }): Promise<readonly RotatableProviderCredentialRow[]>;
  transaction<T>(
    operation: (transaction: ProviderCredentialMaintenanceTransaction) => Promise<T>,
  ): Promise<T>;
}

type LegacyProviderAccountCreateData = Omit<
  LegacyProviderAccountCreateInput,
  "encryptedCredential" | "scopes"
> &
  EncryptedProviderCredential & { readonly scopes: string[] };

type LegacySiteConnectorWriteData = LegacySiteConnectorUpsertInput & {
  readonly lastErrorCode: null;
};

export interface ProviderCredentialMaintenancePrismaTransactionPort {
  readonly connectorOAuthCredential: {
    findMany(args: {
      readonly where?: { readonly id: { readonly gt: string } };
      readonly orderBy: { readonly id: "asc" };
      readonly take: number;
      readonly select: typeof legacyCredentialSelect;
    }): Promise<readonly LegacyProviderCredentialRow[]>;
  };
  readonly providerAccount: {
    findUnique(args: {
      readonly where: { readonly legacyCredentialId: string };
      readonly select: typeof legacyAccountInspectionSelect;
    }): Promise<{ readonly id: string; readonly organizationId: string } | null>;
    findMany(args: {
      readonly where: {
        readonly encryptionKeyId: { readonly not: string };
        readonly id?: { readonly gt: string };
      };
      readonly orderBy: { readonly id: "asc" };
      readonly take: number;
      readonly select: typeof rotationCredentialSelect;
    }): Promise<readonly RotatableProviderCredentialRow[]>;
    create(args: {
      readonly data: LegacyProviderAccountCreateData;
      readonly select: typeof idSelect;
    }): Promise<{ readonly id: string }>;
    updateMany(args: {
      readonly where: {
        readonly id: string;
        readonly organizationId: string;
        readonly updatedAt: Date;
      };
      readonly data: EncryptedProviderCredential;
    }): Promise<{ readonly count: number }>;
  };
  readonly site: {
    findFirst(args: {
      readonly where: { readonly id: string; readonly organizationId: string };
      readonly select: typeof siteIdentitySelect;
    }): Promise<{ readonly id: string } | null>;
  };
  readonly siteConnector: {
    upsert(args: {
      readonly where: {
        readonly organizationId: string;
        readonly siteId_provider: {
          readonly siteId: string;
          readonly provider: "gsc" | "ga4";
        };
      };
      readonly create: LegacySiteConnectorWriteData;
      readonly update: LegacySiteConnectorWriteData;
      readonly select: typeof idSelect;
    }): Promise<{ readonly id: string }>;
  };
}

export interface ProviderCredentialMaintenancePrismaPort
  extends ProviderCredentialMaintenancePrismaTransactionPort {
  $transaction<T>(
    operation: (transaction: ProviderCredentialMaintenancePrismaTransactionPort) => Promise<T>,
    options: typeof PRISMA_MAINTENANCE_TRANSACTION_OPTIONS,
  ): Promise<T>;
}

export interface CredentialMaintenanceCliOptions {
  readonly apply: boolean;
  readonly batchSize: number;
}

interface MutableSummary {
  examined: number;
  migrated: number;
  skipped: number;
  failed: number;
  pending: number;
  dryRun: boolean;
}

type LegacyCredentialStatus = "connected" | "expired" | "revoked";

interface PlannedLegacyCredential {
  readonly account: LegacyProviderAccountCreateInput;
  readonly connector: LegacySiteConnectorUpsertInput;
}

interface PlannedRotation {
  readonly row: RotatableProviderCredentialRow;
  readonly encryptedCredential: EncryptedProviderCredential;
}

export function parseCredentialMaintenanceCliArgs(
  args: readonly string[],
): CredentialMaintenanceCliOptions {
  let apply: boolean | undefined;
  let batchSize = DEFAULT_BATCH_SIZE;
  let sawBatchSize = false;

  for (const argument of args) {
    if (argument === "--apply") {
      if (apply !== undefined) throw new Error(MAINTENANCE_ARGUMENT_ERROR);
      apply = true;
      continue;
    }
    if (argument === "--dry-run") {
      if (apply !== undefined) throw new Error(MAINTENANCE_ARGUMENT_ERROR);
      apply = false;
      continue;
    }
    if (argument.startsWith("--batch-size=") && !sawBatchSize) {
      const value = argument.slice("--batch-size=".length);
      if (!/^[1-9]\d*$/.test(value)) throw new Error(MAINTENANCE_ARGUMENT_ERROR);
      batchSize = Number(value);
      if (!Number.isSafeInteger(batchSize)) throw new Error(MAINTENANCE_ARGUMENT_ERROR);
      sawBatchSize = true;
      continue;
    }
    throw new Error(MAINTENANCE_ARGUMENT_ERROR);
  }

  if (apply === undefined) throw new Error(MAINTENANCE_ARGUMENT_ERROR);
  return { apply, batchSize };
}

export async function migrateLegacyProviderCredentials(
  store: ProviderCredentialMaintenanceStore,
  keyring: CredentialKeyring,
  options: LegacyProviderCredentialMigrationOptions,
): Promise<CredentialMaintenanceSummary> {
  validateMaintenanceOptions(options);
  const ga4PropertyId = parseLegacyGa4PropertyId(options.legacyGa4PropertyId);
  const summary = createSummary(!options.apply);
  let afterId: string | null = null;

  while (true) {
    const rows = await readMaintenanceStore(() =>
      store.listLegacyCredentials({ afterId, limit: options.batchSize }),
    );
    if (rows.length === 0) break;
    afterId = rows.at(-1)!.id;
    summary.examined += rows.length;

    const planned: PlannedLegacyCredential[] = [];
    for (const row of rows) {
      if (!hasValidLegacyCredentialIdentity(row)) {
        summary.failed += 1;
        continue;
      }

      const inspection = await readMaintenanceStore(() =>
        store.inspectLegacyCredential({
          legacyCredentialId: row.id,
          siteId: row.siteId,
          organizationId: row.organizationId,
        }),
      );
      if (!isTenantSafeInspection(inspection, row.organizationId)) {
        summary.failed += 1;
        continue;
      }
      if (inspection.providerAccountId !== null) {
        summary.skipped += 1;
        continue;
      }

      let candidate: PlannedLegacyCredential | null;
      try {
        candidate = planLegacyCredential(row, keyring, ga4PropertyId);
      } catch {
        candidate = null;
      }
      if (candidate === null) {
        summary.failed += 1;
        continue;
      }
      planned.push(candidate);
    }

    if (!options.apply) {
      summary.pending += planned.length;
      continue;
    }
    if (planned.length === 0) continue;

    let transactionMigrated = 0;
    let transactionSkipped = 0;
    try {
      await store.transaction(async (transaction) => {
        for (const candidate of planned) {
          const inspection = await transaction.inspectLegacyCredential({
            legacyCredentialId: candidate.account.legacyCredentialId,
            siteId: candidate.connector.siteId,
            organizationId: candidate.account.organizationId,
          });
          if (!isTenantSafeInspection(inspection, candidate.account.organizationId)) {
            throw new Error("provider_credential_maintenance_tenant_mismatch");
          }
          if (inspection.providerAccountId !== null) {
            transactionSkipped += 1;
            continue;
          }

          await transaction.createLegacyProviderAccount(candidate.account);
          await transaction.upsertLegacySiteConnector(candidate.connector);
          transactionMigrated += 1;
        }
      });
      summary.migrated += transactionMigrated;
      summary.skipped += transactionSkipped;
    } catch {
      const rolledBack = planned.length - transactionSkipped;
      summary.skipped += transactionSkipped;
      summary.failed += rolledBack;
      summary.pending += rolledBack;
    }
  }

  return summary;
}

export async function rotateProviderCredentialEncryption(
  store: ProviderCredentialMaintenanceStore,
  keyring: CredentialKeyring,
  options: CredentialMaintenanceOptions,
): Promise<CredentialMaintenanceSummary> {
  validateMaintenanceOptions(options);
  const summary = createSummary(!options.apply);
  let afterId: string | null = null;

  while (true) {
    const rows = await readMaintenanceStore(() =>
      store.listProviderCredentialsForRotation({
        activeKeyId: keyring.activeKeyId,
        afterId,
        limit: options.batchSize,
      }),
    );
    if (rows.length === 0) break;
    afterId = rows.at(-1)!.id;
    summary.examined += rows.length;

    const planned: PlannedRotation[] = [];
    for (const row of rows) {
      const provider = parseProvider(row.provider);
      if (provider === null || !isValidDate(row.updatedAt)) {
        summary.failed += 1;
        continue;
      }

      try {
        const context = {
          organizationId: row.organizationId,
          providerAccountId: row.id,
          provider,
        };
        const secret = decryptProviderCredential(keyring, context, toEncryptedCredential(row));
        planned.push({
          row,
          encryptedCredential: encryptProviderCredential(keyring, context, secret),
        });
      } catch {
        summary.failed += 1;
      }
    }

    if (!options.apply) {
      summary.pending += planned.length;
      continue;
    }
    if (planned.length === 0) continue;

    let transactionMigrated = 0;
    let transactionSkipped = 0;
    try {
      await store.transaction(async (transaction) => {
        for (const candidate of planned) {
          const updated = await transaction.updateProviderCredentialEncryption({
            id: candidate.row.id,
            organizationId: candidate.row.organizationId,
            expectedUpdatedAt: candidate.row.updatedAt,
            encryptedCredential: candidate.encryptedCredential,
          });
          if (updated) transactionMigrated += 1;
          else transactionSkipped += 1;
        }
      });
      summary.migrated += transactionMigrated;
      summary.skipped += transactionSkipped;
      summary.pending += transactionSkipped;
    } catch {
      const rolledBack = planned.length - transactionSkipped;
      summary.skipped += transactionSkipped;
      summary.failed += rolledBack;
      summary.pending += transactionSkipped + rolledBack;
    }
  }

  return summary;
}

export function createPrismaProviderCredentialMaintenanceStore(
  client: SearchOpsPrismaClient,
): ProviderCredentialMaintenanceStore;
export function createPrismaProviderCredentialMaintenanceStore(
  client: ProviderCredentialMaintenancePrismaPort,
): ProviderCredentialMaintenanceStore;
export function createPrismaProviderCredentialMaintenanceStore(
  client: SearchOpsPrismaClient | ProviderCredentialMaintenancePrismaPort,
): ProviderCredentialMaintenanceStore {
  const prisma = client as unknown as ProviderCredentialMaintenancePrismaPort;
  return {
    listLegacyCredentials: (input) => listLegacyCredentials(prisma, input),
    inspectLegacyCredential: (input) => inspectLegacyCredential(prisma, input),
    listProviderCredentialsForRotation: (input) =>
      listProviderCredentialsForRotation(prisma, input),
    transaction: (operation) =>
      prisma.$transaction(
        async (transaction) => operation(createTransactionAdapter(transaction)),
        PRISMA_MAINTENANCE_TRANSACTION_OPTIONS,
      ),
  };
}

function createTransactionAdapter(
  client: ProviderCredentialMaintenancePrismaTransactionPort,
): ProviderCredentialMaintenanceTransaction {
  return {
    inspectLegacyCredential: (input) => inspectLegacyCredential(client, input),
    async createLegacyProviderAccount(input) {
      await client.providerAccount.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          provider: input.provider,
          authType: input.authType,
          externalAccountId: input.externalAccountId,
          accountEmail: input.accountEmail,
          displayName: input.displayName,
          status: input.status,
          scopes: [...input.scopes],
          tokenExpiresAt: input.tokenExpiresAt,
          legacyCredentialId: input.legacyCredentialId,
          connectedByUserId: input.connectedByUserId,
          connectedAt: input.connectedAt,
          ...input.encryptedCredential,
        },
        select: { id: true },
      });
    },
    async upsertLegacySiteConnector(input) {
      const data = {
        organizationId: input.organizationId,
        siteId: input.siteId,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        externalResourceId: input.externalResourceId,
        config: input.config,
        status: input.status,
        lastErrorCode: null,
      };
      await client.siteConnector.upsert({
        where: {
          organizationId: input.organizationId,
          siteId_provider: { siteId: input.siteId, provider: input.provider },
        },
        create: data,
        update: data,
        select: { id: true },
      });
    },
    async updateProviderCredentialEncryption(input) {
      const result = await client.providerAccount.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          updatedAt: input.expectedUpdatedAt,
        },
        data: input.encryptedCredential,
      });
      return result.count === 1;
    },
  };
}

async function listLegacyCredentials(
  client: ProviderCredentialMaintenancePrismaTransactionPort,
  input: { readonly afterId: string | null; readonly limit: number },
): Promise<readonly LegacyProviderCredentialRow[]> {
  return client.connectorOAuthCredential.findMany({
    ...(input.afterId === null ? {} : { where: { id: { gt: input.afterId } } }),
    orderBy: { id: "asc" },
    take: input.limit,
    select: legacyCredentialSelect,
  });
}

async function inspectLegacyCredential(
  client: ProviderCredentialMaintenancePrismaTransactionPort,
  input: {
    readonly legacyCredentialId: string;
    readonly siteId: string;
    readonly organizationId: string;
  },
): Promise<LegacyCredentialInspection> {
  const providerAccount = await client.providerAccount.findUnique({
    where: { legacyCredentialId: input.legacyCredentialId },
    select: legacyAccountInspectionSelect,
  });
  const site = await client.site.findFirst({
    where: { id: input.siteId, organizationId: input.organizationId },
    select: siteIdentitySelect,
  });
  return {
    providerAccountId: providerAccount?.id ?? null,
    providerAccountOrganizationId: providerAccount?.organizationId ?? null,
    siteBelongsToOrganization: site !== null,
  };
}

async function listProviderCredentialsForRotation(
  client: ProviderCredentialMaintenancePrismaTransactionPort,
  input: { readonly activeKeyId: string; readonly afterId: string | null; readonly limit: number },
): Promise<readonly RotatableProviderCredentialRow[]> {
  return client.providerAccount.findMany({
    where: {
      encryptionKeyId: { not: input.activeKeyId },
      ...(input.afterId === null ? {} : { id: { gt: input.afterId } }),
    },
    orderBy: { id: "asc" },
    take: input.limit,
    select: rotationCredentialSelect,
  });
}

function planLegacyCredential(
  row: LegacyProviderCredentialRow,
  keyring: CredentialKeyring,
  ga4PropertyId: string | null,
): PlannedLegacyCredential | null {
  const validated = validateLegacyCredential(row);
  if (validated === null) return null;

  const providerAccountId = deriveCanonicalProviderAccountId({
    organizationId: row.organizationId,
    provider: "google",
    externalAccountId: `legacy:${row.id}`,
  });
  const encryptedCredential = encryptProviderCredential(
    keyring,
    {
      organizationId: row.organizationId,
      providerAccountId,
      provider: "google",
    },
    {
      kind: "oauth2",
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenType: row.tokenType,
    },
  );
  const missingGa4Resource = validated.provider === "ga4" && ga4PropertyId === null;

  return {
    account: {
      id: providerAccountId,
      organizationId: row.organizationId,
      provider: "google",
      authType: "oauth2",
      externalAccountId: null,
      accountEmail: row.externalAccountEmail,
      displayName: LEGACY_ACCOUNT_DISPLAY_NAME,
      status: validated.status,
      scopes: validated.scopes,
      tokenExpiresAt: row.tokenExpiresAt,
      legacyCredentialId: row.id,
      connectedByUserId: row.connectedByUserId,
      connectedAt: row.connectedAt,
      encryptedCredential,
    },
    connector: {
      organizationId: row.organizationId,
      siteId: row.siteId,
      provider: validated.provider,
      providerAccountId,
      externalResourceId:
        validated.provider === "ga4" && ga4PropertyId !== null
          ? `properties/${ga4PropertyId}`
          : null,
      config: validated.provider === "gsc" ? { resourceResolution: "legacy_auto" } : {},
      status: missingGa4Resource ? "needs_configuration" : validated.status,
    },
  };
}

function validateLegacyCredential(row: LegacyProviderCredentialRow): {
  readonly provider: "gsc" | "ga4";
  readonly status: "connected" | "expired" | "revoked";
  readonly scopes: readonly string[];
} | null {
  if (
    !isNonEmptyString(row.id) ||
    !isNonEmptyString(row.organizationId) ||
    !isNonEmptyString(row.siteId) ||
    !isNonEmptyString(row.connectedByUserId) ||
    !isNonEmptyString(row.accessToken) ||
    !isNullableNonEmptyString(row.refreshToken) ||
    !isNullableNonEmptyString(row.tokenType) ||
    !isNullableValidDate(row.tokenExpiresAt) ||
    !isValidDate(row.connectedAt) ||
    !isNullableEmail(row.externalAccountEmail) ||
    (row.provider !== "gsc" && row.provider !== "ga4") ||
    (row.status !== "connected" && row.status !== "expired" && row.status !== "revoked") ||
    !Array.isArray(row.scopes) ||
    row.scopes.some((scope) => !isNonEmptyString(scope))
  ) {
    return null;
  }
  return { provider: row.provider, status: row.status, scopes: [...row.scopes] };
}

function hasValidLegacyCredentialIdentity(row: LegacyProviderCredentialRow): boolean {
  return (
    isNonEmptyString(row.id) &&
    isNonEmptyString(row.organizationId) &&
    isNonEmptyString(row.siteId)
  );
}

function isTenantSafeInspection(
  inspection: LegacyCredentialInspection,
  organizationId: string,
): boolean {
  if (!inspection.siteBelongsToOrganization) return false;
  if (inspection.providerAccountId === null) {
    return inspection.providerAccountOrganizationId === null;
  }
  return inspection.providerAccountOrganizationId === organizationId;
}

function parseLegacyGa4PropertyId(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^[1-9]\d*$/.test(value)) throw new Error("credential_legacy_ga4_property_invalid");
  return value;
}

function parseProvider(value: string): ProviderAccountProvider | null {
  const result = ProviderAccountProviderSchema.safeParse(value);
  return result.success ? result.data : null;
}

function toEncryptedCredential(row: RotatableProviderCredentialRow): EncryptedProviderCredential {
  return {
    credentialCiphertext: row.credentialCiphertext,
    credentialIv: row.credentialIv,
    credentialAuthTag: row.credentialAuthTag,
    encryptionKeyId: row.encryptionKeyId,
    encryptionVersion: row.encryptionVersion as 1,
  };
}

function validateMaintenanceOptions(options: CredentialMaintenanceOptions): void {
  if (
    typeof options.apply !== "boolean" ||
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize <= 0
  ) {
    throw new Error(MAINTENANCE_OPTION_ERROR);
  }
}

function createSummary(dryRun: boolean): MutableSummary {
  return { examined: 0, migrated: 0, skipped: 0, failed: 0, pending: 0, dryRun };
}

async function readMaintenanceStore<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error("credential_maintenance_failed");
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isNullableValidDate(value: unknown): value is Date | null {
  return value === null || isValidDate(value);
}

function isNullableEmail(value: unknown): value is string | null {
  return value === null || (isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
