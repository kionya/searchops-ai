ALTER TABLE "Site"
ADD COLUMN "competitors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "GeoVisibilityReport"
ADD COLUMN "sov" INTEGER,
ADD COLUMN "competitorMentions" JSONB;
