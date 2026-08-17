import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  // Prisma 를 번들에 말아넣지 말고 런타임 require 로 남긴다.
  // 번들되면 webpack 이 generated client 의 상대 require('./runtime/library.js') 를 따라가
  // 런타임 코드만 청크에 넣고, 정작 쿼리 엔진 바이너리(libquery_engine-*.node)는
  // output file trace 에 안 잡힌다. 그러면 Vercel 람다에 엔진이 없어서 첫 쿼리에
  // PrismaClientInitializationError 가 나고 사이트 라우트가 전부 500 이 된다.
  // Next 기본 externals 목록에는 @prisma/client 만 있고 우리 워크스페이스 패키지는 없다.
  serverExternalPackages: ["@searchops/db", "@prisma/client"],
  // externals 로 빼는 것만으로는 부족했다. 실제로 확인해 보면 nft 트레이스가
  // packages/db/dist/index.js 에서 멈추고 generated client 와 엔진 바이너리를 안 따라간다
  // (`.nft.json` 에 generated/prisma 0개, `*.node` 0개). 그래서 명시적으로 포함시킨다.
  // 빠지면 SEARCHOPS_WEB_DATABASE_URL 을 켜는 순간 사이트 라우트가 전부 500 이 된다.
  outputFileTracingIncludes: {
    "/sites": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/[[...segments]]": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/crawls": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/issues": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/schema": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/urls": ["../../packages/db/dist/generated/prisma/**"],
    "/sites/[siteId]/workorders": ["../../packages/db/dist/generated/prisma/**"]
  },
  // 배포(Vercel) 빌드에서 타입/린트 재검사를 생략한다. 근거:
  // - CI의 `verify` 잡이 typecheck+lint 전체를 PR 게이트로 이미 강제한다.
  // - Vercel은 NODE_ENV=production 으로 의존성을 설치해 devDeps(@types/react 등) 타입 해석이
  //   달라지고, 그 결과 next/script 의 ScriptProps.src 타입이 클린 빌드에서만 spurious 하게
  //   실패한다(동일 코드가 로컬/CI tsc 에서는 통과). 이 잠복 버그로 Turbo 캐시 미스 배포가
  //   전부 막혀 왔다(main 포함). 타입 안전성은 CI에서 보장되므로 배포 빌드에서만 끈다.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // 기본 보안 헤더. CSP는 GTM/GA inline script(layout.tsx) 때문에 nonce 정비 전까지 보류.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
