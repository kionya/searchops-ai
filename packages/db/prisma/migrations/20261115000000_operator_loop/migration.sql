-- 원장님 데일리 루프(docs/superpowers/specs/2026-11-15-daily-operator-loop-design.md).
-- 사용자가 "의도한 설정"이라 확인한 이슈 키. 크롤 뒤 자동 정리가 다시 열지 않는다.
ALTER TABLE "Site"
ADD COLUMN "ignoredIssueKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 이슈 하나에 매이지 않는 지시서(옛 주소 점검·체크리스트)의 정체성. NULL 은 여러 행 허용.
ALTER TABLE "WorkOrder"
ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "WorkOrder_sourceKey_key" ON "WorkOrder"("sourceKey");
