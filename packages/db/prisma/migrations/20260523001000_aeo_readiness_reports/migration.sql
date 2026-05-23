CREATE TABLE "AeoReadinessReport" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "keywordId" TEXT,
  "phrase" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ko-KR',
  "intent" TEXT,
  "pageUrl" TEXT,
  "status" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "checks" JSONB NOT NULL DEFAULT '[]',
  "generatedBy" TEXT NOT NULL DEFAULT 'deterministic',
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AeoReadinessReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AeoReadinessReport_siteId_idx" ON "AeoReadinessReport"("siteId");
CREATE INDEX "AeoReadinessReport_keywordId_idx" ON "AeoReadinessReport"("keywordId");
CREATE INDEX "AeoReadinessReport_status_idx" ON "AeoReadinessReport"("status");
CREATE INDEX "AeoReadinessReport_evaluatedAt_idx" ON "AeoReadinessReport"("evaluatedAt");

ALTER TABLE "AeoReadinessReport"
  ADD CONSTRAINT "AeoReadinessReport_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AeoReadinessReport"
  ADD CONSTRAINT "AeoReadinessReport_keywordId_fkey"
  FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
