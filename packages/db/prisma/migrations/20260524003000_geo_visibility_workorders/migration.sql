-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "geoVisibilityReportId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_geoVisibilityReportId_key" ON "WorkOrder"("geoVisibilityReportId");

-- CreateIndex
CREATE INDEX "WorkOrder_geoVisibilityReportId_idx" ON "WorkOrder"("geoVisibilityReportId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_geoVisibilityReportId_fkey" FOREIGN KEY ("geoVisibilityReportId") REFERENCES "GeoVisibilityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
