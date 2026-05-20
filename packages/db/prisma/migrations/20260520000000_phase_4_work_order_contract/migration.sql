-- Phase 4 work order automation contract.
-- Adds actionable task fields while keeping existing Phase 1 rows migratable.

ALTER TABLE "WorkOrder" ADD COLUMN "problem" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkOrder" ADD COLUMN "evidence" JSONB;
ALTER TABLE "WorkOrder" ADD COLUMN "impact" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkOrder" ADD COLUMN "instructions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN "ownerType" TEXT NOT NULL DEFAULT 'developer';
ALTER TABLE "WorkOrder" ADD COLUMN "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN "verificationMethod" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkOrder" ADD COLUMN "estimatedEffort" TEXT NOT NULL DEFAULT 'm';
ALTER TABLE "WorkOrder" ADD COLUMN "relatedIssues" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkOrder" ADD COLUMN "assignedTo" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WorkOrder" ALTER COLUMN "priority" SET DEFAULT 'p2';

CREATE INDEX "WorkOrder_priority_idx" ON "WorkOrder"("priority");
CREATE INDEX "WorkOrder_ownerType_idx" ON "WorkOrder"("ownerType");
