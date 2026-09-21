ALTER TABLE "ComplianceFlag"
ADD COLUMN "legalClause" TEXT,
ADD COLUMN "checklistItem" INTEGER,
ADD COLUMN "priorReviewRequired" BOOLEAN NOT NULL DEFAULT false;
