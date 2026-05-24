-- CreateTable
CREATE TABLE "GeoVisibilityReport" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko-KR',
    "market" TEXT NOT NULL DEFAULT 'KR',
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "mentionRate" INTEGER NOT NULL,
    "citationRate" INTEGER NOT NULL,
    "competitorCitationRate" INTEGER NOT NULL,
    "queryCount" INTEGER NOT NULL,
    "providerCount" INTEGER NOT NULL,
    "observations" JSONB NOT NULL DEFAULT '[]',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "checks" JSONB NOT NULL DEFAULT '[]',
    "generatedBy" TEXT NOT NULL DEFAULT 'deterministic',
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoVisibilityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoVisibilityReport_siteId_idx" ON "GeoVisibilityReport"("siteId");

-- CreateIndex
CREATE INDEX "GeoVisibilityReport_status_idx" ON "GeoVisibilityReport"("status");

-- CreateIndex
CREATE INDEX "GeoVisibilityReport_score_idx" ON "GeoVisibilityReport"("score");

-- CreateIndex
CREATE INDEX "GeoVisibilityReport_evaluatedAt_idx" ON "GeoVisibilityReport"("evaluatedAt");

-- AddForeignKey
ALTER TABLE "GeoVisibilityReport" ADD CONSTRAINT "GeoVisibilityReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
