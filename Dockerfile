# SearchOps API / Worker 공용 이미지.
# 배포 대상: Oracle Cloud Always Free ARM(Ampere A1, 도쿄/오사카) 1대에서
# docker compose 로 api / worker / redis 세 컨테이너를 상시 구동한다.
# Postgres=Supabase(외부), Redis=같은 VM(자체 호스팅 — Upstash per-command 한도 회피).
# ARM64/AMD64 양쪽에서 빌드된다. 실행 커맨드는 compose 가 서비스별로 지정한다.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma engines need openssl at generate/runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Copy the whole workspace (lockfile-driven install needs all manifests).
COPY . .

# Install all workspace deps (frozen), then build only api + worker + their deps.
# The db package's prebuild runs `prisma generate`; postbuild copies the client.
RUN corepack pnpm install --frozen-lockfile \
  && corepack pnpm --filter @searchops/api... --filter @searchops/worker... build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# 플랫폼이 PORT 를 주입하지 않아도 compose 의 포트 매핑과 맞도록 기본값을 고정한다.
ENV PORT=8000
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy the built workspace (includes node_modules symlink tree + dist + generated Prisma).
COPY --from=build /app /app

# 런타임에 쓰지 않는 것은 덜어낸다(web 앱과 문서는 이 이미지의 실행 경로에 없다).
RUN rm -rf /app/apps/web /app/docs

EXPOSE 8000
USER node
# 기본값은 API. worker 는 compose 에서 command 로 덮어쓴다.
CMD ["node", "apps/api/dist/index.js"]
