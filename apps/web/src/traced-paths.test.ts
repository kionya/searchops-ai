import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// next.config.mjs 는 Prisma 엔진을 outputFileTracingIncludes 로 람다에 딸려 보낸다.
// 그 경로가 gitignore 대상이고 빌드가 만들어내는 것이면 turbo build outputs 에도
// 있어야 한다. 없으면 캐시 히트에서 빌드 스크립트가 통째로 건너뛰어져 `.next` 의
// 트레이스만 복원되고 정작 바이너리는 사라진다. 그러면 Vercel 이 람다를 싸는
// 단계에서 죽는다:
//   ENOENT: no such file or directory, lstat
//   '/vercel/path0/apps/web/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node'
// packages/db 의 src/generated/prisma 에서 같은 사고를 한 번 겪고 고쳤는데,
// apps/web 쪽이 빠져 있어 두 번째로 터졌다.
describe("output file tracing", () => {
  it("declares every web-local traced path as a turbo build output", () => {
    const webRoot = process.cwd();
    const nextConfig = readFileSync(resolve(webRoot, "next.config.mjs"), "utf8");
    const turbo: { tasks: { build: { outputs: readonly string[] } } } = JSON.parse(
      readFileSync(resolve(webRoot, "../../turbo.json"), "utf8").replace(/^﻿/, ""),
    );

    const block = /const prismaEngine = \[([\s\S]*?)\];/.exec(nextConfig);
    if (block === null) {
      throw new Error("next.config.mjs 의 prismaEngine 배열을 찾지 못했다.");
    }
    const traced = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(traced.length).toBeGreaterThan(0);

    // ../.. 로 나가는 경로는 다른 패키지 소유라 그쪽 outputs 가 책임진다.
    const webLocal = traced.filter((entry) => !entry.startsWith("../"));
    expect(webLocal).not.toHaveLength(0);
    expect(turbo.tasks.build.outputs).toEqual(expect.arrayContaining(webLocal));
  });
});
