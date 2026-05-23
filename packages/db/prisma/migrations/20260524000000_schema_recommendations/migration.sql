-- CreateTable
CREATE TABLE "SchemaRecommendation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'p2',
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "jsonLd" JSONB NOT NULL,
    "instructions" JSONB NOT NULL DEFAULT '[]',
    "requiredFields" JSONB NOT NULL DEFAULT '[]',
    "recommendedFields" JSONB NOT NULL DEFAULT '[]',
    "generatedBy" TEXT NOT NULL DEFAULT 'deterministic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchemaRecommendation_siteId_pageUrl_type_key" ON "SchemaRecommendation"("siteId", "pageUrl", "type");

-- CreateIndex
CREATE INDEX "SchemaRecommendation_siteId_idx" ON "SchemaRecommendation"("siteId");

-- CreateIndex
CREATE INDEX "SchemaRecommendation_type_idx" ON "SchemaRecommendation"("type");

-- CreateIndex
CREATE INDEX "SchemaRecommendation_priority_idx" ON "SchemaRecommendation"("priority");

-- CreateIndex
CREATE INDEX "SchemaRecommendation_status_idx" ON "SchemaRecommendation"("status");

-- CreateIndex
CREATE INDEX "SchemaRecommendation_updatedAt_idx" ON "SchemaRecommendation"("updatedAt");

-- AddForeignKey
ALTER TABLE "SchemaRecommendation" ADD CONSTRAINT "SchemaRecommendation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
