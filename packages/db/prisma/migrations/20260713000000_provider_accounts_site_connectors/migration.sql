CREATE TABLE "ProviderAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authType" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "accountEmail" TEXT,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "tokenExpiresAt" TIMESTAMP(3),
    "credentialCiphertext" TEXT NOT NULL,
    "credentialIv" TEXT NOT NULL,
    "credentialAuthTag" TEXT NOT NULL,
    "encryptionKeyId" TEXT NOT NULL,
    "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "legacyCredentialId" TEXT,
    "connectedByUserId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteConnector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "externalResourceId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'needs_configuration',
    "lastErrorCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteConnector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Site_id_organizationId_key" ON "Site"("id", "organizationId");
CREATE UNIQUE INDEX "ProviderAccount_legacyCredentialId_key" ON "ProviderAccount"("legacyCredentialId");
CREATE UNIQUE INDEX "ProviderAccount_id_organizationId_key" ON "ProviderAccount"("id", "organizationId");
CREATE UNIQUE INDEX "ProviderAccount_organizationId_provider_externalAccountId_key" ON "ProviderAccount"("organizationId", "provider", "externalAccountId");
CREATE INDEX "ProviderAccount_organizationId_idx" ON "ProviderAccount"("organizationId");
CREATE INDEX "ProviderAccount_provider_idx" ON "ProviderAccount"("provider");
CREATE INDEX "ProviderAccount_status_idx" ON "ProviderAccount"("status");
CREATE INDEX "ProviderAccount_encryptionKeyId_idx" ON "ProviderAccount"("encryptionKeyId");
CREATE UNIQUE INDEX "ProviderAccount_org_provider_default_key"
ON "ProviderAccount" ("organizationId", "provider")
WHERE "isDefault" = true;
CREATE UNIQUE INDEX "SiteConnector_siteId_provider_key" ON "SiteConnector"("siteId", "provider");
CREATE INDEX "SiteConnector_organizationId_idx" ON "SiteConnector"("organizationId");
CREATE INDEX "SiteConnector_providerAccountId_idx" ON "SiteConnector"("providerAccountId");
CREATE INDEX "SiteConnector_status_idx" ON "SiteConnector"("status");

ALTER TABLE "ProviderAccount" ADD CONSTRAINT "ProviderAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteConnector" ADD CONSTRAINT "SiteConnector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteConnector" ADD CONSTRAINT "SiteConnector_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteConnector" ADD CONSTRAINT "SiteConnector_providerAccountId_organizationId_fkey" FOREIGN KEY ("providerAccountId", "organizationId") REFERENCES "ProviderAccount"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
