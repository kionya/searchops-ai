-- SeoIssue 의 정체성을 크롤 실행 단위에서 문제 단위(페이지 + 규칙)로 좁힌다.
--
-- 기존 유니크에 crawlRunId 가 있어 크롤할 때마다 같은 문제가 새 행으로 쌓였고,
-- WorkOrder 가 seoIssueId 로 1:1이라 지시서도 함께 증식했다.
-- UrlRecord 는 이미 @@unique([siteId, url]) 로 크롤 간 재사용되므로
-- (urlRecordId, ruleId) 는 안정적인 자연키다. SchemaRecommendation 이 이미
-- @@unique([siteId, pageUrl, type]) 인 것과 같은 규약으로 맞춘다.
--
-- Prisma diff 기본값을 쓰지 않고 손으로 쓴 이유: 인덱스를 바꾸기 전에 기존 중복을
-- 정리해야 하는데, 남길 행의 선택 기준이 데이터에 의존하기 때문이다.

-- 그룹마다 가장 최신 행만 남긴다. 최신을 남겨야 하는 이유: WorkOrder.seoIssueId 의
-- FK 가 ON DELETE SET NULL 이라, 지시서가 가리키는 행을 지우면 조용히 NULL 이 되어
-- 다음 크롤에서 지시서가 다시 생긴다. 운영 데이터에서 지시서는 전부 최신 이슈를 가리킨다.
-- urlRecordId 가 NULL 인 행은 Postgres 가 NULL 을 서로 구별하므로 대상에서 빠진다.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "urlRecordId", "ruleId"
           ORDER BY "createdAt" DESC, id DESC
         ) AS rn
  FROM "SeoIssue"
  WHERE "urlRecordId" IS NOT NULL
)
DELETE FROM "SeoIssue" s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

DROP INDEX "SeoIssue_crawlRunId_urlRecordId_ruleId_key";

CREATE UNIQUE INDEX "SeoIssue_urlRecordId_ruleId_key"
  ON "SeoIssue" ("urlRecordId", "ruleId");
