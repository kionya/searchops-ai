-- Phase 1 core product shell schema.
-- Generated manually for the Codex-ready foundation because local PostgreSQL is not required for scaffold verification.

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "name" TEXT,
  "industry" TEXT,
  "language" TEXT NOT NULL DEFAULT 'ko',
  "country" TEXT NOT NULL DEFAULT 'KR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrawlRun" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "summary" JSONB,
  CONSTRAINT "CrawlRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UrlRecord" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "crawlRunId" TEXT,
  "url" TEXT NOT NULL,
  "statusCode" INTEGER,
  "title" TEXT,
  "metaDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UrlRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeoIssue" (
  "id" TEXT NOT NULL,
  "crawlRunId" TEXT NOT NULL,
  "urlRecordId" TEXT,
  "ruleId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "seoIssueId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Keyword" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "phrase" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ko-KR',
  "intent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentBrief" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "keywordId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "outline" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPrompt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiResult" (
  "id" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "output" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceFlag" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT,
  "workOrderId" TEXT,
  "riskLevel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Site_organizationId_domain_key" ON "Site"("organizationId", "domain");
CREATE UNIQUE INDEX "UrlRecord_siteId_url_key" ON "UrlRecord"("siteId", "url");
CREATE UNIQUE INDEX "Keyword_siteId_phrase_locale_key" ON "Keyword"("siteId", "phrase", "locale");

CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX "Site_organizationId_idx" ON "Site"("organizationId");
CREATE INDEX "CrawlRun_siteId_idx" ON "CrawlRun"("siteId");
CREATE INDEX "CrawlRun_status_idx" ON "CrawlRun"("status");
CREATE INDEX "UrlRecord_crawlRunId_idx" ON "UrlRecord"("crawlRunId");
CREATE INDEX "SeoIssue_crawlRunId_idx" ON "SeoIssue"("crawlRunId");
CREATE INDEX "SeoIssue_ruleId_idx" ON "SeoIssue"("ruleId");
CREATE INDEX "SeoIssue_status_idx" ON "SeoIssue"("status");
CREATE INDEX "WorkOrder_organizationId_idx" ON "WorkOrder"("organizationId");
CREATE INDEX "WorkOrder_siteId_idx" ON "WorkOrder"("siteId");
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");
CREATE INDEX "Keyword_siteId_idx" ON "Keyword"("siteId");
CREATE INDEX "ContentBrief_siteId_idx" ON "ContentBrief"("siteId");
CREATE INDEX "ContentBrief_keywordId_idx" ON "ContentBrief"("keywordId");
CREATE INDEX "AiPrompt_organizationId_idx" ON "AiPrompt"("organizationId");
CREATE INDEX "AiResult_promptId_idx" ON "AiResult"("promptId");
CREATE INDEX "AiResult_status_idx" ON "AiResult"("status");
CREATE INDEX "ComplianceFlag_organizationId_idx" ON "ComplianceFlag"("organizationId");
CREATE INDEX "ComplianceFlag_siteId_idx" ON "ComplianceFlag"("siteId");
CREATE INDEX "ComplianceFlag_riskLevel_idx" ON "ComplianceFlag"("riskLevel");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UrlRecord" ADD CONSTRAINT "UrlRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UrlRecord" ADD CONSTRAINT "UrlRecord_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeoIssue" ADD CONSTRAINT "SeoIssue_crawlRunId_fkey" FOREIGN KEY ("crawlRunId") REFERENCES "CrawlRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeoIssue" ADD CONSTRAINT "SeoIssue_urlRecordId_fkey" FOREIGN KEY ("urlRecordId") REFERENCES "UrlRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_seoIssueId_fkey" FOREIGN KEY ("seoIssueId") REFERENCES "SeoIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiPrompt" ADD CONSTRAINT "AiPrompt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "AiPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceFlag" ADD CONSTRAINT "ComplianceFlag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceFlag" ADD CONSTRAINT "ComplianceFlag_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplianceFlag" ADD CONSTRAINT "ComplianceFlag_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;