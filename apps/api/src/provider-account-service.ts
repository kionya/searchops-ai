import { randomUUID } from "node:crypto";

import {
  CredentialDecryptionError,
  decryptProviderCredential,
  deriveCanonicalProviderAccountId,
  encryptProviderCredential,
  ProviderCredentialStoreError,
  type CredentialKeyring,
  type ProviderCredentialStore,
} from "@searchops/db";
import {
  CreateApiKeyProviderAccountRequestSchema,
  SiteConnectorConfigSchema,
  SiteConnectorProviderSchema,
  SiteConnectorStatusSchema,
  UpdateProviderAccountMetadataRequestSchema,
  UpsertSiteConnectorRequestSchema,
  type ProviderAccountMetadata,
  type ProviderAccountProvider,
  type SiteConnector,
  type SiteConnectorProvider,
  type UpdateProviderAccountMetadataRequest,
} from "@searchops/types";
import { z, ZodError } from "zod";

const IdSchema = z.string().min(1);
const ApiKeyProviderSchema = z.enum([
  "bing",
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity",
]);
const GeoProviderSchema = z.enum([
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity",
]);
const GoogleConnectorProviderSchema = z.enum(["gsc", "ga4"]);
const GoogleScopeByProvider = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
} as const satisfies Record<z.infer<typeof GoogleConnectorProviderSchema>, string>;

const CreateApiKeyAccountInputSchema = CreateApiKeyProviderAccountRequestSchema.extend({
  actorUserId: IdSchema,
  organizationId: IdSchema,
});
const ReplaceApiKeyCredentialInputSchema = z
  .object({
    apiKey: z.string().min(1),
    organizationId: IdSchema,
    providerAccountId: IdSchema,
  })
  .strict();
const UpdateAccountMetadataInputSchema = z
  .object({
    organizationId: IdSchema,
    providerAccountId: IdSchema,
    update: UpdateProviderAccountMetadataRequestSchema,
  })
  .strict();
const AccountLookupInputSchema = z
  .object({ organizationId: IdSchema, providerAccountId: IdSchema })
  .strict();
const SiteConnectorLookupInputSchema = z
  .object({ organizationId: IdSchema, siteId: IdSchema })
  .strict();
const DeleteSiteConnectorInputSchema = SiteConnectorLookupInputSchema.extend({
  provider: SiteConnectorProviderSchema,
});
const UpsertSiteConnectorInputSchema = SiteConnectorLookupInputSchema.extend({
  provider: SiteConnectorProviderSchema,
  ...UpsertSiteConnectorRequestSchema.shape,
});
const UpsertGooglePlaceholderInputSchema = SiteConnectorLookupInputSchema.extend({
  externalResourceId: z.null(),
  provider: GoogleConnectorProviderSchema,
  providerAccountId: IdSchema,
});
const PreserveGoogleSiteConnectorInputSchema = SiteConnectorLookupInputSchema.extend({
  config: SiteConnectorConfigSchema.optional(),
  externalResourceId: z.string().min(1).nullable(),
  lastCheckedAt: z.string().datetime({ offset: true }).nullable().optional(),
  lastErrorCode: z.string().min(1).nullable().optional(),
  provider: GoogleConnectorProviderSchema,
  providerAccountId: IdSchema,
  status: SiteConnectorStatusSchema.optional(),
});
const InternalUpsertSiteConnectorInputSchema = z.union([
  UpsertSiteConnectorInputSchema,
  UpsertGooglePlaceholderInputSchema,
  PreserveGoogleSiteConnectorInputSchema,
]);
const GoogleAccountInputSchema = z
  .object({
    accessToken: z.string().min(1),
    actorUserId: IdSchema,
    displayName: z.string().trim().min(1),
    organizationId: IdSchema,
    refreshToken: z.string().min(1).nullable(),
    scopes: z.array(z.string().min(1)),
    selectedProviders: z.array(GoogleConnectorProviderSchema),
    status: z.enum(["connected", "expired", "revoked", "invalid"]).default("connected"),
    tokenExpiresAt: z.union([z.date(), z.string().datetime({ offset: true })]).nullable(),
    tokenType: z.string().min(1).nullable(),
    verifiedAccountEmail: z.string().email(),
    verifiedExternalAccountId: z.string().min(1),
  })
  .strict();
const PrepareGoogleConnectorsInputSchema = AccountLookupInputSchema.extend({
  grantedScopes: z.array(z.string().min(1)),
  selectedProviders: z.array(GoogleConnectorProviderSchema),
});

export type ProviderAccountServiceErrorCode =
  | "account_in_use"
  | "account_not_found"
  | "credential_decryption_failed"
  | "provider_account_concurrent_update"
  | "provider_account_default_conflict"
  | "provider_account_identity_conflict"
  | "provider_account_identity_mismatch"
  | "provider_account_not_in_organization"
  | "provider_account_provider_mismatch"
  | "scope_missing"
  | "site_not_in_organization"
  | "validation_error";

export class ProviderAccountServiceError extends Error {
  constructor(readonly code: ProviderAccountServiceErrorCode) {
    super(code);
    this.name = "ProviderAccountServiceError";
  }
}

export interface CreateProviderAccountServiceOptions {
  readonly generateProviderAccountId?: () => string;
  readonly keyring: CredentialKeyring;
  readonly store: ProviderCredentialStore;
}

export interface ProviderAccountService {
  createApiKeyAccount(input: {
    readonly actorUserId: string;
    readonly apiKey: string;
    readonly displayName: string;
    readonly externalAccountId?: string | null;
    readonly accountEmail?: string | null;
    readonly isDefault?: boolean;
    readonly organizationId: string;
    readonly provider: ProviderAccountProvider;
  }): Promise<ProviderAccountMetadata>;
  updateAccountMetadata(input: {
    readonly organizationId: string;
    readonly providerAccountId: string;
    readonly update: UpdateProviderAccountMetadataRequest;
  }): Promise<ProviderAccountMetadata>;
  replaceApiKeyCredential(input: {
    readonly apiKey: string;
    readonly organizationId: string;
    readonly providerAccountId: string;
  }): Promise<ProviderAccountMetadata>;
  upsertGoogleAccount(input: z.input<typeof GoogleAccountInputSchema>): Promise<ProviderAccountMetadata>;
  prepareGoogleConnectors(input: z.input<typeof PrepareGoogleConnectorsInputSchema>): Promise<{
    readonly requiredScopes: readonly string[];
  }>;
  listAccounts(input: { readonly organizationId: string }): Promise<ProviderAccountMetadata[]>;
  deleteAccount(input: {
    readonly organizationId: string;
    readonly providerAccountId: string;
  }): Promise<void>;
  listSiteConnectors(input: {
    readonly organizationId: string;
    readonly siteId: string;
  }): Promise<SiteConnector[]>;
  upsertSiteConnector(
    input:
      | {
          readonly externalResourceId: string;
          readonly organizationId: string;
          readonly provider: SiteConnectorProvider;
          readonly providerAccountId: string;
          readonly siteId: string;
        }
      | {
          readonly externalResourceId: null;
          readonly organizationId: string;
          readonly provider: "gsc" | "ga4";
          readonly providerAccountId: string;
          readonly siteId: string;
        }
      | {
          readonly config?: SiteConnector["config"];
          readonly externalResourceId: string | null;
          readonly lastCheckedAt?: string | null;
          readonly lastErrorCode?: string | null;
          readonly organizationId: string;
          readonly provider: "gsc" | "ga4";
          readonly providerAccountId: string;
          readonly siteId: string;
          readonly status?: SiteConnector["status"];
        },
  ): Promise<SiteConnector>;
  deleteSiteConnector(input: {
    readonly organizationId: string;
    readonly provider: SiteConnectorProvider;
    readonly siteId: string;
  }): Promise<void>;
}

export function createProviderAccountService({
  generateProviderAccountId = () => `pa_${randomUUID()}`,
  keyring,
  store,
}: CreateProviderAccountServiceOptions): ProviderAccountService {
  return {
    async createApiKeyAccount(input) {
      const parsed = parseBoundary(CreateApiKeyAccountInputSchema, input);
      const provider = parseBoundary(ApiKeyProviderSchema, parsed.provider);
      if (parsed.isDefault === true && !GeoProviderSchema.safeParse(provider).success) {
        throw new ProviderAccountServiceError("validation_error");
      }
      const providerAccountId = parseBoundary(IdSchema, generateProviderAccountId());
      const encryptedCredential = encryptProviderCredential(
        keyring,
        { organizationId: parsed.organizationId, providerAccountId, provider },
        { kind: "api_key", apiKey: parsed.apiKey },
      );

      return mapStoreErrors(() =>
        store.createApiKeyAccount({
          providerAccountId,
          organizationId: parsed.organizationId,
          provider,
          authType: "api_key",
          externalAccountId: parsed.externalAccountId ?? null,
          accountEmail: parsed.accountEmail ?? null,
          displayName: parsed.displayName,
          isDefault: parsed.isDefault ?? false,
          connectedByUserId: parsed.actorUserId,
          encryptedCredential,
        }),
      );
    },

    async updateAccountMetadata(input) {
      const parsed = parseBoundary(UpdateAccountMetadataInputSchema, input);
      if (parsed.update.isDefault === true) {
        const account = await mapStoreErrors(() =>
          store.getAccountMetadata({
            organizationId: parsed.organizationId,
            providerAccountId: parsed.providerAccountId,
          }),
        );
        if (account === null) {
          throw new ProviderAccountServiceError("account_not_found");
        }
        if (!GeoProviderSchema.safeParse(account.provider).success) {
          throw new ProviderAccountServiceError("validation_error");
        }
      }
      const metadataUpdate =
        parsed.update.displayName === undefined
          ? { isDefault: parsed.update.isDefault as boolean }
          : parsed.update.isDefault === undefined
            ? { displayName: parsed.update.displayName }
            : {
                displayName: parsed.update.displayName,
                isDefault: parsed.update.isDefault,
              };
      const updated = await mapStoreErrors(() =>
        store.updateAccountMetadata({
          organizationId: parsed.organizationId,
          providerAccountId: parsed.providerAccountId,
          ...metadataUpdate,
        }),
      );
      if (updated === null) {
        throw new ProviderAccountServiceError("account_not_found");
      }
      return updated;
    },

    async replaceApiKeyCredential(input) {
      const parsed = parseBoundary(ReplaceApiKeyCredentialInputSchema, input);
      const account = await mapStoreErrors(() =>
        store.getAccountMetadata({
          organizationId: parsed.organizationId,
          providerAccountId: parsed.providerAccountId,
        }),
      );
      if (account === null) {
        throw new ProviderAccountServiceError("account_not_found");
      }
      if (account.authType !== "api_key") {
        throw new ProviderAccountServiceError("validation_error");
      }

      const encryptedCredential = encryptProviderCredential(
        keyring,
        {
          organizationId: account.organizationId,
          providerAccountId: account.id,
          provider: account.provider,
        },
        { kind: "api_key", apiKey: parsed.apiKey },
      );
      const updated = await mapStoreErrors(() =>
        store.replaceCredential({
          organizationId: parsed.organizationId,
          providerAccountId: parsed.providerAccountId,
          encryptedCredential,
        }),
      );
      if (updated === null) {
        throw new ProviderAccountServiceError("account_not_found");
      }
      return updated;
    },

    async upsertGoogleAccount(input) {
      const parsed = parseBoundary(GoogleAccountInputSchema, input);
      const providerAccountId = deriveCanonicalProviderAccountId({
        organizationId: parsed.organizationId,
        provider: "google",
        externalAccountId: parsed.verifiedExternalAccountId,
      });
      await validateGoogleConnectorScopes({
        grantedScopes: parsed.scopes,
        organizationId: parsed.organizationId,
        providerAccountId,
        selectedProviders: parsed.selectedProviders,
        store,
      });
      const existing = await mapStoreErrors(() =>
        store.getAccountSecretRecord({
          organizationId: parsed.organizationId,
          providerAccountId,
        }),
      );
      let refreshToken = parsed.refreshToken;
      if (refreshToken === null && existing !== null) {
        if (existing.provider !== "google" || existing.authType !== "oauth2") {
          throw new ProviderAccountServiceError("provider_account_identity_mismatch");
        }
        let existingSecret;
        try {
          existingSecret = decryptProviderCredential(
            keyring,
            {
              organizationId: existing.organizationId,
              providerAccountId: existing.id,
              provider: existing.provider,
            },
            existing,
          );
        } catch (error) {
          if (error instanceof CredentialDecryptionError) {
            throw new ProviderAccountServiceError("credential_decryption_failed");
          }
          throw error;
        }
        if (existingSecret.kind !== "oauth2") {
          throw new ProviderAccountServiceError("provider_account_identity_mismatch");
        }
        refreshToken = existingSecret.refreshToken;
      }

      const encryptedCredential = encryptProviderCredential(
        keyring,
        { organizationId: parsed.organizationId, providerAccountId, provider: "google" },
        {
          kind: "oauth2",
          accessToken: parsed.accessToken,
          refreshToken,
          tokenType: parsed.tokenType,
        },
      );
      return mapStoreErrors(() =>
        store.upsertGoogleAccount({
          providerAccountId,
          organizationId: parsed.organizationId,
          externalAccountId: parsed.verifiedExternalAccountId,
          accountEmail: parsed.verifiedAccountEmail,
          displayName: parsed.displayName,
          status: parsed.status ?? "connected",
          scopes: [...new Set(parsed.scopes)].sort(),
          allowedConnectorProviders: googleConnectorProvidersAllowedByScopes(parsed.scopes),
          expectedUpdatedAt: existing?.updatedAt ?? null,
          tokenExpiresAt:
            typeof parsed.tokenExpiresAt === "string"
              ? new Date(parsed.tokenExpiresAt)
              : parsed.tokenExpiresAt,
          connectedByUserId: parsed.actorUserId,
          encryptedCredential,
        }),
      );
    },

    async prepareGoogleConnectors(input) {
      const parsed = parseBoundary(PrepareGoogleConnectorsInputSchema, input);
      return validateGoogleConnectorScopes({ ...parsed, store });
    },

    async listAccounts(input) {
      const organizationId = parseBoundary(IdSchema, input.organizationId);
      return mapStoreErrors(() => store.listAccounts(organizationId));
    },

    async deleteAccount(input) {
      const parsed = parseBoundary(AccountLookupInputSchema, input);
      const deleted = await mapStoreErrors(() => store.deleteAccount(parsed));
      if (!deleted) {
        throw new ProviderAccountServiceError("account_not_found");
      }
    },

    async listSiteConnectors(input) {
      const parsed = parseBoundary(SiteConnectorLookupInputSchema, input);
      return mapStoreErrors(() => store.listSiteConnectors(parsed));
    },

    async upsertSiteConnector(input) {
      const parsed = parseBoundary(InternalUpsertSiteConnectorInputSchema, input);
      const preservedMetadata = PreserveGoogleSiteConnectorInputSchema.safeParse(parsed);
      const externalResourceId =
        parsed.externalResourceId === null
          ? null
          : normalizeExternalResource(parsed.provider, parsed.externalResourceId);
      return mapStoreErrors(() =>
        store.upsertSiteConnector({
          organizationId: parsed.organizationId,
          siteId: parsed.siteId,
          provider: parsed.provider,
          providerAccountId: parsed.providerAccountId,
          externalResourceId,
          ...(preservedMetadata.success && preservedMetadata.data.config !== undefined
            ? { config: preservedMetadata.data.config }
            : {}),
          ...(preservedMetadata.success && preservedMetadata.data.status !== undefined
            ? { status: preservedMetadata.data.status }
            : {}),
          ...(preservedMetadata.success && preservedMetadata.data.lastErrorCode !== undefined
            ? { lastErrorCode: preservedMetadata.data.lastErrorCode }
            : {}),
          ...(preservedMetadata.success && preservedMetadata.data.lastCheckedAt !== undefined
            ? {
                lastCheckedAt:
                  preservedMetadata.data.lastCheckedAt === null
                    ? null
                    : new Date(preservedMetadata.data.lastCheckedAt),
              }
            : {}),
        }),
      );
    },

    async deleteSiteConnector(input) {
      const parsed = parseBoundary(DeleteSiteConnectorInputSchema, input);
      await mapStoreErrors(() => store.deleteSiteConnector(parsed));
    },
  };
}

function normalizeExternalResource(provider: SiteConnectorProvider, value: string): string {
  if (provider === "ga4") {
    const match = /^(?:properties\/)?([1-9][0-9]*)$/.exec(value);
    if (match === null) {
      throw new ProviderAccountServiceError("validation_error");
    }
    return `properties/${match[1]}`;
  }

  if (provider === "gsc" && value.startsWith("sc-domain:")) {
    const domain = value.slice("sc-domain:".length).toLowerCase();
    if (!isValidBareDomain(domain)) {
      throw new ProviderAccountServiceError("validation_error");
    }
    return `sc-domain:${domain}`;
  }

  return normalizeHttpUrl(value);
}

async function validateGoogleConnectorScopes(input: {
  readonly grantedScopes: readonly string[];
  readonly organizationId: string;
  readonly providerAccountId: string;
  readonly selectedProviders: readonly z.infer<typeof GoogleConnectorProviderSchema>[];
  readonly store: ProviderCredentialStore;
}): Promise<{ readonly requiredScopes: readonly string[] }> {
  const account = await mapStoreErrors(() =>
    input.store.getAccountMetadata({
      organizationId: input.organizationId,
      providerAccountId: input.providerAccountId,
    }),
  );
  if (account !== null && (account.provider !== "google" || account.authType !== "oauth2")) {
    throw new ProviderAccountServiceError("provider_account_provider_mismatch");
  }

  const attachedProviders = await mapStoreErrors(() =>
    input.store.listAccountConnectorProviders({
      organizationId: input.organizationId,
      providerAccountId: input.providerAccountId,
    }),
  );
  if (account === null && attachedProviders.length > 0) {
    throw new ProviderAccountServiceError("account_not_found");
  }
  if (attachedProviders.some((provider) => !GoogleConnectorProviderSchema.safeParse(provider).success)) {
    throw new ProviderAccountServiceError("provider_account_provider_mismatch");
  }

  const connectorProviders = [
    ...(attachedProviders as z.infer<typeof GoogleConnectorProviderSchema>[]),
    ...input.selectedProviders,
  ];
  const requiredScopes = [
    ...new Set(connectorProviders.map((provider) => GoogleScopeByProvider[provider])),
  ].sort();
  const grantedScopes = new Set(input.grantedScopes);
  if (requiredScopes.some((scope) => !grantedScopes.has(scope))) {
    throw new ProviderAccountServiceError("scope_missing");
  }
  return { requiredScopes };
}

function googleConnectorProvidersAllowedByScopes(
  scopes: readonly string[],
): z.infer<typeof GoogleConnectorProviderSchema>[] {
  const grantedScopes = new Set(scopes);
  return GoogleConnectorProviderSchema.options.filter((provider) =>
    grantedScopes.has(GoogleScopeByProvider[provider]),
  );
}

function normalizeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error("invalid_url");
    }
    return url.toString();
  } catch {
    throw new ProviderAccountServiceError("validation_error");
  }
}

function isValidBareDomain(value: string): boolean {
  if (value.length > 253 || value.includes(":")) {
    return false;
  }
  const labels = value.split(".");
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  );
}

function parseBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ProviderAccountServiceError("validation_error");
    }
    throw error;
  }
}

async function mapStoreErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderCredentialStoreError) {
      throw new ProviderAccountServiceError(error.code);
    }
    throw error;
  }
}
