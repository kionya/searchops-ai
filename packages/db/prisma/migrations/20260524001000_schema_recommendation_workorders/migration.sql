-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "schemaRecommendationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_schemaRecommendationId_key" ON "WorkOrder"("schemaRecommendationId");

-- CreateIndex
CREATE INDEX "WorkOrder_schemaRecommendationId_idx" ON "WorkOrder"("schemaRecommendationId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_schemaRecommendationId_fkey" FOREIGN KEY ("schemaRecommendationId") REFERENCES "SchemaRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
