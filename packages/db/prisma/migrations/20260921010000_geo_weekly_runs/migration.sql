ALTER TABLE "Site"
ADD COLUMN "geoMonitorEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GeoVisibilityReport"
ADD COLUMN "runSeq" INTEGER,
ADD COLUMN "previousReportId" TEXT;

CREATE INDEX "GeoVisibilityReport_siteId_runSeq_idx" ON "GeoVisibilityReport"("siteId", "runSeq");
