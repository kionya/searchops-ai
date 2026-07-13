ALTER TABLE "GeoVisibilityReport"
ADD COLUMN "credentialSources" JSONB NOT NULL DEFAULT '{}';
