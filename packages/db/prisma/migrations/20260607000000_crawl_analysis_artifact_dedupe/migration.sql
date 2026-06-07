-- Add idempotency keys for crawl-derived analysis artifacts.
CREATE UNIQUE INDEX "SeoIssue_crawlRunId_urlRecordId_ruleId_key"
ON "SeoIssue"("crawlRunId", "urlRecordId", "ruleId");

CREATE UNIQUE INDEX "WorkOrder_seoIssueId_key"
ON "WorkOrder"("seoIssueId");
