-- 적합성 룰(PAGE_ANSWERS_QUESTION)이 동어반복 룰을 대체해 점수의 의미가 바뀐다.
-- 과거 행은 NULL = 룰 버전 1 이다. 과거 행엔 candidatePage 스냅샷이 없어 재계산이
-- 원리적으로 불가능하므로 백필하지 않는다 — 섞인 비교는 진단서 F 절이 거부한다.
ALTER TABLE "AeoReadinessReport"
ADD COLUMN "rulesVersion" TEXT;
