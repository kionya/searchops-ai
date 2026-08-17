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

let entries;
try {
  entries = await readdir(source);
} catch {
  // 아직 generate 전이면 조용히 넘어간다. 엔진이 없으면 런타임 진단
  // (/api/deployment 의 database.reason)이 engine_missing 으로 알려준다.
  console.log(`[copy-prisma-engine] generated client 없음, 건너뜀: ${source}`);
  process.exit(0);
}

// schema.prisma 도 함께 둔다 — Prisma 가 엔진 옆에서 찾는 경우가 있다.
const wanted = entries.filter(
  (entry) => entry.startsWith("libquery_engine-") || entry === "schema.prisma",
);
if (wanted.length === 0) {
  console.log("[copy-prisma-engine] 복사할 엔진이 없다");
  process.exit(0);
}

await mkdir(target, { recursive: true });
for (const entry of wanted) {
  await copyFile(join(source, entry), join(target, entry));
}
console.log(`[copy-prisma-engine] ${wanted.join(", ")} → ${target}`);
