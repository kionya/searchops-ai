-- CDX-137 Google OAuth connector credentials for GSC and GA4.

CREATE TABLE "ConnectorOAuthCredential" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "scopes" JSONB NOT NULL DEFAULT '[]',
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "tokenType" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "externalAccountEmail" TEXT,
  "connectedByUserId" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConnectorOAuthCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorOAuthCredential_siteId_provider_key"
  ON "ConnectorOAuthCredential"("siteId", "provider");
CREATE INDEX "ConnectorOAuthCredential_organizationId_idx"
  ON "ConnectorOAuthCredential"("organizationId");
CREATE INDEX "ConnectorOAuthCredential_siteId_idx"
  ON "ConnectorOAuthCredential"("siteId");
CREATE INDEX "ConnectorOAuthCredential_provider_idx"
  ON "ConnectorOAuthCredential"("provider");
CREATE INDEX "ConnectorOAuthCredential_status_idx"
  ON "ConnectorOAuthCredential"("status");
CREATE INDEX "ConnectorOAuthCredential_updatedAt_idx"
  ON "ConnectorOAuthCredential"("updatedAt");

ALTER TABLE "ConnectorOAuthCredential" ADD CONSTRAINT "ConnectorOAuthCredential_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectorOAuthCredential" ADD CONSTRAINT "ConnectorOAuthCredential_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
