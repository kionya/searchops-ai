-- CreateTable
CREATE TABLE "ClosedLoopAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "cmsType" TEXT,
    "externalId" TEXT,
    "complianceFlagId" TEXT,
    "workOrderId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedLoopAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_organizationId_idx" ON "ClosedLoopAuditEvent"("organizationId");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_siteId_idx" ON "ClosedLoopAuditEvent"("siteId");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_eventType_idx" ON "ClosedLoopAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_status_idx" ON "ClosedLoopAuditEvent"("status");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_complianceFlagId_idx" ON "ClosedLoopAuditEvent"("complianceFlagId");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_workOrderId_idx" ON "ClosedLoopAuditEvent"("workOrderId");

-- CreateIndex
CREATE INDEX "ClosedLoopAuditEvent_createdAt_idx" ON "ClosedLoopAuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ClosedLoopAuditEvent" ADD CONSTRAINT "ClosedLoopAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedLoopAuditEvent" ADD CONSTRAINT "ClosedLoopAuditEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
