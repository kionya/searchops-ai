#!/usr/bin/env node
// Prisma 쿼리 엔진을 Next 빌드 전에 `apps/web/.prisma/client/` 로 복사한다.
//
// 왜 이 자리인가: Vercel 람다에서 실제로 찍힌 Prisma 의 탐색 경로가 근거다.
//   /var/task/apps/web/packages/db/src/generated/prisma
//   /var/task/apps/web/.next/server
//   /vercel/path0/packages/db/src/generated/prisma
//   /var/task/apps/web/.prisma/client        ← 이 자리
//   /tmp/prisma-engines
// 람다의 cwd 는 /var/task/apps/web 이고, outputFileTracingRoot 가 레포 루트라
// packages/db/** 를 트레이싱하면 /var/task/packages/db/** 로 떨어진다 — Prisma 가
// 보지 않는 곳이다. 그래서 cwd 기준 경로인 .prisma/client 에 직접 놓는다.
//
// next build 가 트레이스를 계산하기 전에 파일이 있어야 하므로 build 스크립트의
// 앞단에서 돌린다(lifecycle prebuild 에만 기대지 않는다 — 호스팅마다 다르다).

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(webRoot, "../../packages/db/src/generated/prisma");
const target = join(webRoot, ".prisma/client");

// ⚠️ 여기서 조용히 넘어가면 안 된다. 예전에는 엔진이 없을 때 exit 0 이었고, 그 결과
// 엔진 없는 람다가 초록불로 배포돼 로그인한 사용자만 500 을 봤다. 실제 원인은
// turbo 캐시였다 — `src/generated/prisma` 가 gitignore 대상인데 build outputs 에
// 없어서, packages/db 가 캐시 히트하면 dist 만 복원되고 엔진은 사라졌다.
// outputs 에 넣어 고쳤지만(turbo.json), 같은 부류의 사고가 다시 조용히 나가지
// 않도록 여기서 빌드를 세운다. 배포 후 런타임에 아는 것보다 빌드에서 죽는 게 낫다.
const fail = (message) => {
  console.error(`[copy-prisma-engine] ${message}`);
  console.error("  해결: corepack pnpm --filter @searchops/db build");
  process.exit(1);
};

// schema.prisma 도 함께 둔다 — Prisma 가 엔진 옆에서 찾는 경우가 있다.
async function readEngines() {
  const entries = await readdir(source).catch(() => null);
  if (entries === null) {
    return null;
  }
  const wanted = entries.filter(
    (entry) => entry.startsWith("libquery_engine-") || entry === "schema.prisma",
  );
  // 빌드 머신(macOS/debian)과 람다 런타임(rhel)의 타깃이 달라서, native 만 있으면
  // 로컬에선 멀쩡하고 배포에서만 죽는다. schema.prisma 의 binaryTargets 가 정본이다.
  return wanted.some((entry) => entry.includes("rhel-openssl-3.0.x")) ? wanted : null;
}

const wanted = await readEngines();
if (wanted === null) {
  fail(`rhel-openssl-3.0.x 쿼리 엔진이 없다: ${source}`);
}

await mkdir(target, { recursive: true });
for (const entry of wanted) {
  await copyFile(join(source, entry), join(target, entry));
}
console.log(`[copy-prisma-engine] ${wanted.join(", ")} → ${target}`);
