-- AlterTable
ALTER TABLE "ComplianceFlag" ADD COLUMN "subjectType" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "ruleId" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "url" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "title" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "evidence" JSONB;
ALTER TABLE "ComplianceFlag" ADD COLUMN "recommendation" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "replacementSuggestion" TEXT;
ALTER TABLE "ComplianceFlag" ADD COLUMN "generatedBy" TEXT NOT NULL DEFAULT 'deterministic';
ALTER TABLE "ComplianceFlag" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ComplianceFlag_workOrderId_idx" ON "ComplianceFlag"("workOrderId");

-- CreateIndex
CREATE INDEX "ComplianceFlag_ruleId_idx" ON "ComplianceFlag"("ruleId");

-- CreateIndex
CREATE INDEX "ComplianceFlag_status_idx" ON "ComplianceFlag"("status");

-- CreateIndex
CREATE INDEX "ComplianceFlag_createdAt_idx" ON "ComplianceFlag"("createdAt");
