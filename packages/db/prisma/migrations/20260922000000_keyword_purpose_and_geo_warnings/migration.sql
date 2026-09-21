-- AI 질문 세트와 검색 수요 키워드를 구분한다. 기존 행은 both 로 남아 동작이 바뀌지 않는다.
ALTER TABLE "Keyword"
ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'both';

CREATE INDEX "Keyword_siteId_purpose_idx" ON "Keyword"("siteId", "purpose");

-- 리포트 경고를 저장한다. 지금까지는 읽을 때 관측 소스로만 파생해
-- citations-dropped / citations-unresolved 같은 경고가 API 응답에서 사라졌다.
ALTER TABLE "GeoVisibilityReport"
ADD COLUMN "warnings" JSONB;
