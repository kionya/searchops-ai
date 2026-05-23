ALTER TABLE "ContentBrief"
  ADD COLUMN "primaryKeyword" TEXT NOT NULL DEFAULT 'untitled',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ko-KR',
  ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'informational',
  ADD COLUMN "summary" TEXT NOT NULL DEFAULT 'Draft content brief.',
  ADD COLUMN "faqQuestions" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "generationMode" TEXT NOT NULL DEFAULT 'deterministic',
  ADD COLUMN "publishPolicy" TEXT NOT NULL DEFAULT 'draft_only';
