-- 데이터는 남기고 야간 배치(크롤·커넥터·GEO·키워드 볼륨)와 사이트 목록에서만 빼는 보관 표시.
-- NULL = 운영 중. 지우지 않는 이유: 삭제는 되돌릴 수 없고, 보관은 NULL 로 되돌리면 끝난다.
ALTER TABLE "Site"
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- 2026-11-01 운영 전환: 고운몸의원 단독 운영. 첫 운영 사이트(크롤런 94·워크오더 29)는 보관한다.
-- 운영 외 DB(로컬·CI)에는 이 id 가 없어 0행 갱신으로 끝난다.
UPDATE "Site" SET "archivedAt" = CURRENT_TIMESTAMP WHERE "id" = 'cmq3bbygu0001oj01ux3843ke';
