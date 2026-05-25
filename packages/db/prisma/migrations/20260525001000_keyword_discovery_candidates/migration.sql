-- CreateTable
CREATE TABLE "KeywordDiscoveryCandidate" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "keywordId" TEXT,
    "phrase" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko-KR',
    "language" TEXT NOT NULL DEFAULT 'ko',
    "country" TEXT NOT NULL DEFAULT 'KR',
    "intent" TEXT,
    "source" TEXT NOT NULL,
    "pageUrl" TEXT,
    "score" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'deterministic',
    "discoveredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordDiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeywordDiscoveryCandidate_siteId_phrase_locale_source_key" ON "KeywordDiscoveryCandidate"("siteId", "phrase", "locale", "source");

-- CreateIndex
CREATE INDEX "KeywordDiscoveryCandidate_siteId_idx" ON "KeywordDiscoveryCandidate"("siteId");

-- CreateIndex
CREATE INDEX "KeywordDiscoveryCandidate_keywordId_idx" ON "KeywordDiscoveryCandidate"("keywordId");

-- CreateIndex
CREATE INDEX "KeywordDiscoveryCandidate_source_idx" ON "KeywordDiscoveryCandidate"("source");

-- CreateIndex
CREATE INDEX "KeywordDiscoveryCandidate_score_idx" ON "KeywordDiscoveryCandidate"("score");

-- CreateIndex
CREATE INDEX "KeywordDiscoveryCandidate_discoveredAt_idx" ON "KeywordDiscoveryCandidate"("discoveredAt");

-- AddForeignKey
ALTER TABLE "KeywordDiscoveryCandidate" ADD CONSTRAINT "KeywordDiscoveryCandidate_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordDiscoveryCandidate" ADD CONSTRAINT "KeywordDiscoveryCandidate_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
