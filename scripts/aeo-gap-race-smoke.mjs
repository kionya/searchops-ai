#!/usr/bin/env node
// AEO 콘텐츠 공백 워크오더의 멱등성을 실제 Postgres 동시 요청으로 검증한다.
//
// 왜 필요한가: createAeoContentGapWorkOrder 는 "찾아서 있으면 갱신, 없으면 생성" 이다.
// 유닛 테스트의 인메모리 레포는 단일 스레드라 레이스가 원리적으로 안 난다. 실제 PG(Read
// Committed)에서는 동시 요청 두 건이 각각 "없음" 을 보고 둘 다 insert 했고(2026-10-11
// 로컬 재현: 동시 2건 → 2행), 이후 조회는 한 건만 갱신하므로 나머지가 영구히 남았다.
//
// 실행: pnpm smoke:aeo-gap-race   (psql/createdb/dropdb 필요)

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbDist = resolve(here, "../packages/db/dist/index.js");
const repositoryDist = resolve(here, "../apps/api/dist/prisma-repository.js");

// 레이스는 확률적이다 — 한 번 통과로는 아무것도 증명하지 못한다. 라운드를 반복한다.
// 수정 전 코드에서 이 설정은 매번 실패했다.
const rounds = 30;
const concurrency = 5;

const dbName = `aeo_gap_race_smoke_${process.pid}`;
// credential-smoke 와 같은 조립 — createdb 와 Prisma 가 반드시 같은 DB 를 가리키게 한다.
const pgUser = process.env.PGUSER ?? process.env.USER ?? "postgres";
const pgAuth = process.env.PGPASSWORD
  ? `${encodeURIComponent(pgUser)}:${encodeURIComponent(process.env.PGPASSWORD)}`
  : encodeURIComponent(pgUser);
const dbUrl = `postgresql://${pgAuth}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? 5432}/${dbName}`;

execFileSync("createdb", [dbName], { encoding: "utf8" });

let prisma;
let failedRounds = 0;
try {
  execFileSync(
    "corepack",
    ["pnpm", "--filter", "@searchops/db", "exec", "prisma", "migrate", "deploy"],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_DATABASE_URL: dbUrl },
      stdio: "pipe"
    },
  );
  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_DATABASE_URL = dbUrl;

  const { createSearchOpsPrismaClient } = await import(dbDist);
  const { createPrismaRepository } = await import(repositoryDist);
  prisma = createSearchOpsPrismaClient();

  await prisma.organization.create({ data: { id: "org_race", name: "race" } });
  await prisma.site.create({ data: { id: "site_race", organizationId: "org_race", domain: "race.example.com" } });
  const repository = createPrismaRepository(prisma);
  const draft = {
    title: "콘텐츠 공백: 답변 없는 질문 1개",
    problem: "다음 질문에 답하는 페이지가 없습니다.",
    evidence: {
      url: "https://race.example.com",
      observedValue: ["보톡스 가격"],
      expectedValue: "질문형 헤딩 또는 답변 블록으로 각 질문에 답하는 페이지",
      sourceField: "aeoReadinessReport.checks.PAGE_ANSWERS_QUESTION"
    },
    impact: "i",
    instructions: ["i"],
    ownerType: "content",
    priority: "p2",
    acceptanceCriteria: ["a"],
    verificationMethod: "v",
    estimatedEffort: "s",
    relatedIssues: []
  };

  for (let round = 1; round <= rounds; round += 1) {
    await prisma.workOrder.deleteMany({ where: { siteId: "site_race" } });
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, () => repository.createAeoContentGapWorkOrder("site_race", { draft })),
    );
    const rejected = results.filter((result) => result.status === "rejected");
    const rows = await prisma.workOrder.count({ where: { siteId: "site_race" } });
    if (rows !== 1 || rejected.length > 0) {
      failedRounds += 1;
      console.error(
        `❌ 라운드 ${round}: 동시 ${concurrency}건 → 워크오더 ${rows}행, 실패 ${rejected.length}건` +
          (rejected[0] ? ` — ${String(rejected[0].reason?.message ?? rejected[0].reason).slice(0, 200)}` : ""),
      );
    }
  }

  console.log(
    failedRounds === 0
      ? `✅ ${rounds}라운드 × 동시 ${concurrency}건 — 매번 워크오더 1행`
      : `\n실패 ${failedRounds}/${rounds}라운드`,
  );
} finally {
  await prisma?.$disconnect().catch(() => {});
  execFileSync("dropdb", ["--force", "--if-exists", dbName], { encoding: "utf8" });
}

process.exit(failedRounds === 0 ? 0 : 1);
