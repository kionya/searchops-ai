-- CDX-066 connector sync run history and result persistence.

CREATE TABLE "ConnectorSyncRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "providers" JSONB NOT NULL DEFAULT '[]',
  "requestedByUserId" TEXT NOT NULL,
  "fixture" BOOLEAN NOT NULL DEFAULT true,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "summary" JSONB,

  CONSTRAINT "ConnectorSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectorSyncResult" (
  "id" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "fixture" BOOLEAN NOT NULL DEFAULT true,
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "records" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConnectorSyncResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectorSyncRun_organizationId_idx" ON "ConnectorSyncRun"("organizationId");
CREATE INDEX "ConnectorSyncRun_siteId_idx" ON "ConnectorSyncRun"("siteId");
CREATE INDEX "ConnectorSyncRun_status_idx" ON "ConnectorSyncRun"("status");
CREATE INDEX "ConnectorSyncRun_startedAt_idx" ON "ConnectorSyncRun"("startedAt");

CREATE UNIQUE INDEX "ConnectorSyncResult_syncRunId_provider_key" ON "ConnectorSyncResult"("syncRunId", "provider");
CREATE INDEX "ConnectorSyncResult_provider_idx" ON "ConnectorSyncResult"("provider");
CREATE INDEX "ConnectorSyncResult_status_idx" ON "ConnectorSyncResult"("status");

ALTER TABLE "ConnectorSyncRun" ADD CONSTRAINT "ConnectorSyncRun_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectorSyncRun" ADD CONSTRAINT "ConnectorSyncRun_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectorSyncResult" ADD CONSTRAINT "ConnectorSyncResult_syncRunId_fkey"
  FOREIGN KEY ("syncRunId") REFERENCES "ConnectorSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
