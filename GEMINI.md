# SearchOps AI — Gemini/Antigravity Operating Manual
> SEO/AEO/GEO 진단, 콘텐츠 플래닝 및 구조화 데이터 자동화 SaaS 플랫폼.

## 0. Authority and Scope
- 이 프로젝트의 로컬 허용 경로는 오직 `/Users/kionya/searchops-ai` 입니다.
- 이 프로젝트의 유효한 GitHub 저장소는 `https://github.com/kionya/searchops-ai.git` 입니다.
- 모든 파일 수정, git 명령, 패키지 설치, Prisma 마이그레이션, 도커 빌드/컨테이너 실행 등 모든 커맨드 동작 전 작업 디렉토리가 `/Users/kionya/searchops-ai` 내부에 있는지 매번 확인하십시오.
- git write 작업을 처리하기 전 `git rev-parse --show-toplevel` 결과가 `/Users/kionya/searchops-ai` 이고, `git remote get-url origin` 이 `https://github.com/kionya/searchops-ai.git` 을 반환하는지 검증하십시오.
- 홈 디렉토리(`/Users/kionya`)나 상위 디렉토리에서 git 관련 명령을 절대로 실행해서는 안 됩니다.

## 1. 플랫폼 기술 스택
- **모노레포**: pnpm + Turborepo
- **프론트엔드**: Next.js
- **API**: NestJS 또는 Fastify
- **워커 (비동기 작업)**: BullMQ + Redis
- **DB**: PostgreSQL + Prisma
- **유효성 검증**: Zod
- **테스트**: Vitest/Jest + Playwright E2E

## 2. 작업 고립화 및 보안 규칙
- 사용자가 현재 명시적으로 요구한 대상이 아닌 타 저장소, 전역 쉘 설정, 전역 git 설정, 전역 패키지 매니저 설정을 변경, 삭제, 이동하지 마십시오.
- `/Users/kionya/searchops-ai` 외부에서 `git add .`를 수행하지 말고, 오직 현재 작업에 관련된 파일들만 선별적으로 스테이징하십시오.
- Docker 사용은 프로젝트 내 `compose.yaml` 및 `scripts/test/docker-compose.runtime-smoke.yml`로 명시적으로 구성된 컨테이너에 국한됩니다. 관련 없는 다른 컨테이너, 볼륨, 네트워크를 재구성하거나 정리하지 마십시오.

<!-- HARNESS-AI-MEMORY:BEGIN -->
## Harness Shared AI Memory

Codex, Claude Code, Gemini, and ChatGPT history is materialized in the shared Obsidian vault. Treat recalled notes as context, then verify important claims against current files or services.

Only use this memory automatically when the current project is harness-suite. For any other project, obtain explicit user approval before querying this Harness memory, syncing another project's files or history, or combining data across projects.

Before substantial work that may depend on prior history, run:

```bash
cd "${HARNESS_ROOT:?Set HARNESS_ROOT to the approved harness-suite root}" && tools/brain pack "task or question"
```

After approved Harness-local AI sessions change, refresh the bridge. Before running this command, verify its configured sources contain only projects the user approved:

```bash
cd "${HARNESS_ROOT:?Set HARNESS_ROOT to the approved harness-suite root}" && tools/sync_ai_memory.sh
```

For file-to-conversation handoff, query the memory pack with the task and file path, and consult `brain-vault/knowledge/00_지도_MOC/AI_FILE_CONVERSATION_MAP.md`. Never hand-edit generated notes under `brain-vault/domains/**`.
<!-- HARNESS-AI-MEMORY:END -->
