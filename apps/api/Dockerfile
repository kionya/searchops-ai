# SearchOps API 컨테이너. 호스트에 종속되지 않는다 — Render/Fly/Koyeb/Railway 어디든
# 같은 이미지가 올라간다. 레포 루트를 빌드 컨텍스트로 준다:
#
#   docker build -f apps/api/Dockerfile -t searchops-api .
#
# ⚠️ 이 컨테이너에는 SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY 가 들어간다. 그게 이 서비스를
# 따로 두는 이유다 — 웹(Vercel)에는 그 키를 두지 않기로 했고, 그 결정은 그대로다.
# 자세한 근거는 docs/WEB_DIRECT_DB.md 의 "자격증명 경계".

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# 워크스페이스 전체를 넣는다. API 는 packages/* 를 workspace: 프로토콜로 참조하므로
# 일부만 복사하면 lockfile 이 안 맞아 --frozen-lockfile 이 실패한다.
COPY . .

# openssl 은 Prisma 엔진이 링크한다. build 단계에서도 generate 가 돌므로 여기에도 필요하다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN pnpm install --frozen-lockfile

# 후행 "..." 로 워크스페이스 의존성(types, db, connectors 등)까지 함께 빌드한다.
# packages/db 의 prebuild 가 prisma generate 를 돌려 쿼리 엔진을 만든다.
RUN pnpm --filter "@searchops/api..." build

FROM node:22-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ponytail: 빌드 산출물만 골라내지 않고 /app 을 통째로 가져온다. pnpm 의 node_modules 는
# 심볼릭 링크 그래프라 골라 담다가 끊어 먹기 쉽고, 그 사고는 런타임에야 드러난다.
# 이미지가 커지는 대신 확실하다. 크기가 문제되면 `pnpm deploy --prod` 로 평탄화해라.
COPY --from=build /app /app

ENV NODE_ENV=production
# 플랫폼이 PORT 를 주입하면 그쪽이 이긴다(apps/api/src/index.ts 참고).
ENV PORT=4000
EXPOSE 4000

# 헬스체크 경로는 /health 다. 인증 없이 열려 있다(server.ts 의 예외 목록).
CMD ["node", "apps/api/dist/index.js"]
