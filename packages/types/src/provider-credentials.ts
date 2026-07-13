import { z } from "zod";

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const IdSchema = z.string().min(1);

export const ProviderAccountProviderSchema = z.enum([
  "google",
  "bing",
  "geo_chatgpt",
  "geo_claude",
  "geo_gemini",
  "geo_perplexity",
]);
export type ProviderAccountProvider = z.infer<typeof ProviderAccountProviderSchema>;

export const ProviderAccountAuthTypeSchema = z.enum(["oauth2", "api_key"]);
export type ProviderAccountAuthType = z.infer<typeof ProviderAccountAuthTypeSchema>;

export const ProviderAccountStatusSchema = z.enum([
  "connected",
  "expired",
  "revoked",
  "invalid",
]);
export type ProviderAccountStatus = z.infer<typeof ProviderAccountStatusSchema>;

export const SiteConnectorProviderSchema = z.enum(["gsc", "ga4", "bing"]);
export type SiteConnectorProvider = z.infer<typeof SiteConnectorProviderSchema>;

export const SiteConnectorStatusSchema = z.enum([
  "connected",
  "needs_configuration",
  "expired",
  "revoked",
  "error",
]);
export type SiteConnectorStatus = z.infer<typeof SiteConnectorStatusSchema>;

export const CredentialStorageModeSchema = z.enum(["dual", "encrypted"]);
export type CredentialStorageMode = z.infer<typeof CredentialStorageModeSchema>;

export const CredentialSourceSchema = z.enum(["encrypted", "legacy", "platform"]);
export type CredentialSource = z.infer<typeof CredentialSourceSchema>;

export const SiteConnectorConfigSchema = z
  .object({
    resourceResolution: z.enum(["legacy_auto"]).optional(),
  })
  .strict();
export type SiteConnectorConfig = z.infer<typeof SiteConnectorConfigSchema>;

export const OAuthCredentialSecretSchema = z
  .object({
    kind: z.literal("oauth2"),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).nullable(),
    tokenType: z.string().min(1).nullable(),
  })
  .strict();

export const ApiKeyCredentialSecretSchema = z
  .object({
    kind: z.literal("api_key"),
    apiKey: z.string().min(1),
  })
  .strict();

export const ProviderCredentialSecretSchema = z.discriminatedUnion("kind", [
  OAuthCredentialSecretSchema,
  ApiKeyCredentialSecretSchema,
]);
export type ProviderCredentialSecret = z.infer<typeof ProviderCredentialSecretSchema>;

export const ProviderAccountMetadataSchema = z
  .object({
    id: IdSchema,
    organizationId: IdSchema,
    provider: ProviderAccountProviderSchema,
    authType: ProviderAccountAuthTypeSchema,
    externalAccountId: z.string().min(1).nullable(),
    accountEmail: z.string().email().nullable(),
    displayName: z.string().min(1),
    status: ProviderAccountStatusSchema,
    scopes: z.array(z.string().min(1)),
    tokenExpiresAt: IsoDateTimeSchema.nullable(),
    isDefault: z.boolean(),
    legacyCredentialId: IdSchema.nullable(),
    connectedByUserId: IdSchema,
    connectedAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    credentialSource: CredentialSourceSchema,
  })
  .strict();
export type ProviderAccountMetadata = z.infer<typeof ProviderAccountMetadataSchema>;

export const SiteConnectorSchema = z
  .object({
    id: IdSchema,
    organizationId: IdSchema,
    siteId: IdSchema,
    provider: SiteConnectorProviderSchema,
    providerAccountId: IdSchema,
    externalResourceId: z.string().min(1).nullable(),
    config: SiteConnectorConfigSchema,
    status: SiteConnectorStatusSchema,
    lastErrorCode: z.string().min(1).nullable(),
    lastCheckedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type SiteConnector = z.infer<typeof SiteConnectorSchema>;

export const CreateApiKeyProviderAccountRequestSchema = z
  .object({
    provider: ProviderAccountProviderSchema,
    externalAccountId: z.string().min(1).nullable().optional(),
    accountEmail: z.string().email().nullable().optional(),
    displayName: z.string().trim().min(1),
    apiKey: z.string().min(1),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type CreateApiKeyProviderAccountRequest = z.infer<
  typeof CreateApiKeyProviderAccountRequestSchema
>;

export const ReplaceProviderCredentialRequestSchema = z
  .object({
    apiKey: z.string().min(1),
  })
  .strict();
export type ReplaceProviderCredentialRequest = z.infer<
  typeof ReplaceProviderCredentialRequestSchema
>;

export const UpdateProviderAccountMetadataRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.displayName !== undefined || value.isDefault !== undefined, {
    message: "At least one metadata field is required",
  });
export type UpdateProviderAccountMetadataRequest = z.infer<
  typeof UpdateProviderAccountMetadataRequestSchema
>;

export const UpsertSiteConnectorRequestSchema = z
  .object({
    providerAccountId: z.string().min(1),
    externalResourceId: z.string().min(1),
  })
  .strict();
export type UpsertSiteConnectorRequest = z.infer<typeof UpsertSiteConnectorRequestSchema>;

export const ProviderAccountListResponseSchema = z
  .object({
    providerAccounts: z.array(ProviderAccountMetadataSchema),
  })
  .strict();
export type ProviderAccountListResponse = z.infer<typeof ProviderAccountListResponseSchema>;

export const ProviderAccountDetailResponseSchema = z
  .object({
    providerAccount: ProviderAccountMetadataSchema,
  })
  .strict();
export type ProviderAccountDetailResponse = z.infer<
  typeof ProviderAccountDetailResponseSchema
>;

export const SiteConnectorListResponseSchema = z
  .object({
    siteConnectors: z.array(SiteConnectorSchema),
  })
  .strict();
export type SiteConnectorListResponse = z.infer<typeof SiteConnectorListResponseSchema>;

export const SiteConnectorDetailResponseSchema = z
  .object({
    siteConnector: SiteConnectorSchema,
  })
  .strict();
export type SiteConnectorDetailResponse = z.infer<typeof SiteConnectorDetailResponseSchema>;

export const CompleteGoogleOAuthResponseSchema = z
  .object({
    account: ProviderAccountMetadataSchema,
    siteConnectors: z.array(SiteConnectorSchema),
    status: z.literal("connected"),
  })
  .strict();
export type CompleteGoogleOAuthResponse = z.infer<
  typeof CompleteGoogleOAuthResponseSchema
>;
