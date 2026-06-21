import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  // 배포(Vercel) 빌드에서 타입/린트 재검사를 생략한다. 근거:
  // - CI의 `verify` 잡이 typecheck+lint 전체를 PR 게이트로 이미 강제한다.
  // - Vercel은 NODE_ENV=production 으로 의존성을 설치해 devDeps(@types/react 등) 타입 해석이
  //   달라지고, 그 결과 next/script 의 ScriptProps.src 타입이 클린 빌드에서만 spurious 하게
  //   실패한다(동일 코드가 로컬/CI tsc 에서는 통과). 이 잠복 버그로 Turbo 캐시 미스 배포가
  //   전부 막혀 왔다(main 포함). 타입 안전성은 CI에서 보장되므로 배포 빌드에서만 끈다.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
