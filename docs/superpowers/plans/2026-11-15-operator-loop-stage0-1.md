# 원장님 데일리 루프 — 단계 0·1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 낡은 할 일을 스스로 닫고, 옛 주소 깨짐을 매일 점검하며, 중요한 할 일 10개를 AI 지시문과 함께 휴대폰 화면·텔레그램 아침 요약으로 내보낸다.

**Architecture:** 판정은 전부 결정적 순수 함수(`packages/workorders`, `apps/worker` 의 compose/classify)로 두고, DB 읽기·쓰기는 `packages/db` 의 좁은 함수로, 실행은 기존 `batch-crawl.yml` 의 단계로 붙인다. 웹은 직접 DB 모드의 새 경로 `/sites/[siteId]/today` 하나.

**Tech Stack:** TypeScript, Prisma(Postgres/Supabase), Zod, Vitest, Next.js App Router(서버 컴포넌트 + server action), GitHub Actions, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-11-15-daily-operator-loop-design.md` (단계 0·1 절, 결정 2·3·8·9·10)

## Global Constraints

- 한 태스크 = 한 PR. 각 PR 은 `corepack pnpm -r build && corepack pnpm -r test && corepack pnpm -r lint` 통과.
- 패키지에 새 export 를 넣었으면 소비자 테스트 전에 그 패키지를 먼저 build 한다(worker·web 테스트는 dist 를 참조).
- 판정은 결정적. 이 계획의 어떤 단계도 LLM 을 호출하지 않는다.
- 화면·메시지의 모든 시각은 KST(`formatKstDateTime` 재사용). 판정용 "지금 시각"은 인자로 받는다(테스트 고정).
- 웹이 새로 읽거나 쓰는 컬럼은 `scripts/sql/web-role.sql` + `docs/WEB_DIRECT_DB.md` 증분 스니펫에 추가한다. 사용자가 SQL Editor 에서 실행 → 실행 전엔 해당 패널만 실패 문구.
- 새 secret 값은 사용자가 넣는다: `SEARCHOPS_TELEGRAM_OWNER_CHAT_ID`(secret). 봇 토큰은 기존 `SEARCHOPS_TELEGRAM_BOT_TOKEN` 재사용(결정 10). 웹 주소는 repo 변수 `SEARCHOPS_WEB_BASE_URL`(기본 `https://searchops.totopapa.com`).
- `/ebook` noindex 는 의도된 설정(결정 8) — 할 일로 다시 만들지 않는다.
- 할 일 개수 상한 **10**(결정 2).
- 텔레그램은 KST 07:00 이전 발송이면 무음(`disable_notification: true`).

## Review Focus

1. **부분 크롤(차단·1페이지)로 이슈가 대량 "해결" 처리되는 것** — 크롤이 `completed` 가 아니거나 `pagesProcessed <= 1` 이면 정리를 건너뛰어야 한다. → Task 2 테스트 `skips when crawl looks blocked`.
2. **옛 주소 점검 중 사이트 전체가 응답 불가(네트워크 오류·챌린지)** — 모두 "broken" 으로 세면 "옛 주소 90개 404" 오경보. 네트워크 오류는 `unknown`, unknown 이 절반 넘으면 할 일을 바꾸지 않는다. → Task 4 테스트 `does not touch work orders when most checks are unknown`.
3. **"했어요" 뒤 다음 크롤에서 여전히 같은 문제** — `in_review`/`done` 이 조용히 남으면 안 되고 `open` 으로 돌아와야 한다. → Task 2 테스트 `reopens in_review work order when issue is re-detected`.
4. **의도함으로 표시한 문제(예: `/ebook` noindex)가 다음 날 다시 할 일로 올라오는 것** — 무시 키는 재검출에도 열지 않는다. → Task 2 테스트 `keeps ignored issue closed on re-detection`.
5. **휴대폰 360px 에서 긴 URL·지시문이 가로 스크롤을 만드는 것** — URL·코드 블록에 `overflow-wrap: anywhere`. → Task 6 뷰모델 테스트는 못 잡으므로 Task 6 Step "360px 수동 확인" 으로 고정.

---

### Task 1: 스키마 — 무시 목록 · 소스 키

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `Site`, model `WorkOrder`)
- Create: `packages/db/prisma/migrations/20261115000000_operator_loop/migration.sql`
- Modify: `packages/types/src/index.ts` (`WorkOrderSchema`)
- Modify: `scripts/sql/web-role.sql`, `docs/WEB_DIRECT_DB.md`

**Interfaces:**
- Produces: `Site.ignoredIssueKeys: string[]`(기본 `[]`, 원소 형식 `"<RULE_ID>|<정규화 URL>"`), `WorkOrder.sourceKey: string | null`(unique). `WorkOrderSchema.sourceKey: z.string().nullable().optional()`.
- 소스 키 형식(후속 태스크가 그대로 쓴다): `legacy-redirect:<siteId>:broken`, `legacy-redirect:<siteId>:home_only`, `checklist:<siteId>:sitemap-naver`, `checklist:<siteId>:sitemap-google`.

- [ ] **Step 1:** schema 에 `ignoredIssueKeys String[] @default([])`(Site), `sourceKey String? @unique`(WorkOrder) 추가. 마이그레이션 SQL 은 `ALTER TABLE ... ADD COLUMN` 2개 + unique index 1개(기존 마이그레이션 `20261101000000_site_archived_at` 형식).
- [ ] **Step 2:** `WorkOrderSchema` 에 `sourceKey` 추가. 기존 `packages/types` 테스트가 깨지지 않는지 확인.
- [ ] **Step 3:** web-role.sql 에 `grant update ("ignoredIssueKeys") on public."Site" to searchops_web;` 추가, WEB_DIRECT_DB.md 증분 스니펫에도 같은 줄.
- [ ] **Step 4:** Run `corepack pnpm --filter @searchops/db exec prisma validate && corepack pnpm --filter @searchops/types build && corepack pnpm --filter @searchops/types test` → PASS.
- [ ] **Step 5:** Commit `feat(db): Site.ignoredIssueKeys · WorkOrder.sourceKey`.

---

### Task 2: 크롤 뒤 할 일 자동 정리

**Files:**
- Create: `packages/db/src/issue-reconcile.ts`, `packages/db/src/issue-reconcile.test.ts`
- Modify: `packages/db/src/index.ts` (export)
- Modify: `apps/worker/src/batch-crawl.ts` (processAndPersistCrawlJob 성공 직후 호출)

**Interfaces:**
- Consumes: Task 1 `Site.ignoredIssueKeys`.
- Produces:
  ```ts
  export type IssueReconcileClient = Pick<SearchOpsPrismaClient, "crawlRun" | "site" | "seoIssue" | "workOrder" | "closedLoopAuditEvent">;
  export function issueKey(ruleId: string, url: string): string; // `${ruleId}|${url}`
  export async function reconcileSiteIssues(
    client: IssueReconcileClient,
    input: { readonly siteId: string; readonly crawlRunId: string },
  ): Promise<{ readonly skipped: boolean; readonly resolved: number; readonly reopened: number; readonly ignored: number }>;
  export async function closeIssuesForGoneUrls(
    client: IssueReconcileClient,
    input: { readonly siteId: string; readonly urls: readonly string[] },
  ): Promise<number>; // 닫은 WorkOrder 수 (Task 4 가 호출)
  ```

규칙(이 순서로 판정, 이슈는 `urlRecord.siteId = siteId` 인 것만):
1. 크롤이 `completed` 가 아니거나 `summary.pagesProcessed <= 1` → `{ skipped: true }`, 아무것도 안 바꿈.
2. `issueKey` 가 `site.ignoredIssueKeys` 에 있음 → SeoIssue `ignored`, 연결 WorkOrder 가 done 이 아니면 `done` + 감사 `work_order_done`(metadata `{ reason: "intended" }`). 3·4 에서 제외.
3. 재검출(`issue.crawlRunId === crawlRunId`) + 연결 WorkOrder 가 `in_review`/`done` → WorkOrder `open` + 감사 `work_order_reopened`(message 에 "다시 확인 필요").
4. 미검출(`urlRecord.crawlRunId === crawlRunId && issue.crawlRunId !== crawlRunId && issue.status === "open"`) → SeoIssue `resolved`, 연결 WorkOrder 가 `open|in_progress|in_review` 면 `done` + 감사 `work_order_done`(metadata `{ reason: "not_redetected", crawlRunId }`).
5. URL 이 이번 크롤에 없으면(`urlRecord.crawlRunId !== crawlRunId`) 건드리지 않는다.
- 감사 이벤트: `source: "worker:reconcile"`, `subjectType: "work_order"`, 기존 `applyWorkOrderRecheck` 와 같은 필드 채움.
- `closeIssuesForGoneUrls`: 해당 URL 들의 열린 SeoIssue → `resolved`, 연결 WorkOrder(done 아님) → `done` + 감사(metadata `{ reason: "url_gone" }`).

- [ ] **Step 1: 실패 테스트** — 메모리 가짜 client(`work-order-recheck.test.ts` 의 가짜 패턴)로:
  - `resolves issue on crawled url that was not re-detected` → resolved 1, WorkOrder `done`, 감사 1건 `reason: "not_redetected"`.
  - `leaves issue on url outside this crawl untouched` → 상태 그대로.
  - `skips when crawl looks blocked` (pagesProcessed 1) → `skipped: true`, 변경 0.
  - `reopens in_review work order when issue is re-detected` → WorkOrder `open`, 감사 `work_order_reopened`.
  - `keeps ignored issue closed on re-detection` (`ignoredIssueKeys: ["NOINDEX_ON_IMPORTANT_PAGE|https://www.gowoonmom.co.kr/ebook"]`) → SeoIssue `ignored`, WorkOrder `done`, reopened 0.
  - `closeIssuesForGoneUrls closes issues and work orders for given urls` → 2 반환.
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/db test -- issue-reconcile` → FAIL(모듈 없음).
- [ ] **Step 3:** `issue-reconcile.ts` 구현. 한 사이트의 이슈를 `findMany({ include: { urlRecord: true, workOrders: true } })` 로 한 번에 읽고 변경은 건별 update.
- [ ] **Step 4:** Run 같은 명령 → PASS.
- [ ] **Step 5:** `batch-crawl.ts` 에서 `processAndPersistCrawlJob` 직후 `reconcileSiteIssues(prisma, { crawlRunId: crawlRun.id, siteId: site.id })` 호출, 결과를 `console.log("[batch-crawl] <domain> 정리 resolved=.. reopened=.. ignored=..")`. 예외는 `onPostprocessFailure` 와 같이 `failures += 1` + `console.error`.
- [ ] **Step 6:** Run `corepack pnpm --filter @searchops/db build && corepack pnpm --filter @searchops/worker test` → PASS.
- [ ] **Step 7:** Commit `feat(db): 크롤 뒤 미검출 이슈·지시서 자동 정리 + 재검출 재오픈`.

---

### Task 3: 할 일 순위 · AI 지시문 (순수 함수)

**Files:**
- Create: `packages/workorders/src/today.ts`, `packages/workorders/src/today.test.ts`
- Modify: `packages/workorders/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  ```ts
  export interface TodayCandidate {
    readonly id: string; readonly title: string; readonly status: WorkOrderStatus;
    readonly priority: WorkOrderPriority; readonly estimatedEffort: EstimatedEffort;
    readonly ruleId: SeoIssueRuleId | null; readonly sourceKey: string | null; readonly url: string | null;
    readonly problem: string; readonly description: string | null;
    readonly instructions: readonly string[]; readonly acceptanceCriteria: readonly string[];
  }
  export const todayLimit = 10;
  export function isLossType(candidate: TodayCandidate): boolean;
  export function isChecklist(candidate: TodayCandidate): boolean; // sourceKey 가 "checklist:" 로 시작
  export function rankTodayWorkOrders(
    candidates: readonly TodayCandidate[], trafficByUrl: ReadonlyMap<string, number>, limit?: number,
  ): readonly TodayCandidate[];
  export const defaultProtectedRules: readonly string[];
  export function protectedRulesFromIgnoredKeys(keys: readonly string[]): readonly string[];
  export function buildAiInstruction(
    candidate: TodayCandidate, context: { readonly siteName: string; readonly protectedRules: readonly string[] },
  ): string;
  ```
- 손실형: `ruleId === "NOINDEX_ON_IMPORTANT_PAGE"` 또는 `sourceKey` 가 `:broken` 으로 끝남.
- 정렬: ① 손실형 먼저 ② p0→p3 ③ `trafficByUrl.get(url) ?? 0` 큰 것 ④ effort s→m→l ⑤ id 오름차순. `done`·`blocked` 제외. 상한 `limit ?? todayLimit`.
- `defaultProtectedRules`(정확한 문구):
  - `"의료광고 관련 고지·주의 문구는 지우거나 바꾸지 마세요."`
  - `"이 요청과 관계없는 다른 페이지의 내용과 주소는 바꾸지 마세요."`
  - `"작업이 끝나면 바꾼 내용을 목록으로 정리해 알려 주세요."`
- `protectedRulesFromIgnoredKeys(["NOINDEX_ON_IMPORTANT_PAGE|https://www.gowoonmom.co.kr/ebook"])` → `["https://www.gowoonmom.co.kr/ebook 의 검색 제외(noindex) 설정은 의도된 것이니 그대로 두세요."]`. ruleId→표시명 맵은 이 파일에 둔다(모르는 ruleId 는 ruleId 그대로).
- `buildAiInstruction` 출력 구조(줄 단위, 빈 섹션은 생략):
  ```
  [{siteName} 홈페이지 수정 요청]
  대상 페이지: {url}
  지금 문제: {problem}
  {description}
  해야 할 일:
  1. {instructions[0]}
  ...
  지켜야 할 것:
  - {protectedRules...}
  끝나면 확인할 것:
  - {acceptanceCriteria...}
  ```

- [ ] **Step 1: 실패 테스트**
  - `ranks loss-type first, then priority, then traffic` — p0 손실형 1·p1 고트래픽·p1 저트래픽·p3 → 기대 id 순서 고정.
  - `caps at 10 and excludes done and blocked` — 13개 입력(2개 done, 1개 blocked) → 길이 10, done/blocked 없음.
  - `builds self-contained instruction` — 결과에 `"대상 페이지: https://www.gowoonmom.co.kr/body/head-filler"`, `"1. "`, `"의료광고 관련 고지·주의 문구는 지우거나 바꾸지 마세요."` 포함, `url: null` 이면 "대상 페이지" 줄 없음.
  - `derives protected rule from ignored key` — 위 예시 그대로 일치.
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/workorders test -- today` → FAIL.
- [ ] **Step 3:** `today.ts` 구현.
- [ ] **Step 4:** Run 같은 명령 → PASS.
- [ ] **Step 5:** Commit `feat(workorders): 오늘의 할 일 순위 + AI 지시문`.

---

### Task 4: 옛 주소 점검 배치 (단계 0)

**Files:**
- Create: `packages/db/src/legacy-urls.ts`, `packages/db/src/legacy-urls.test.ts`
- Create: `apps/worker/src/batch-redirect-check.ts`, `apps/worker/src/redirect-check.ts`, `apps/worker/src/redirect-check.test.ts`
- Modify: `packages/db/src/index.ts`, `.github/workflows/batch-crawl.yml`

**Interfaces:**
- Consumes: Task 1 `sourceKey`, Task 2 `closeIssuesForGoneUrls`, `fetchUrl` (`packages/crawler-core/src/fetch.ts` — 리다이렉트를 따라가 `finalUrl`·`statusCode` 반환, testcookie 해제 포함).
- Produces:
  ```ts
  // packages/db/src/legacy-urls.ts
  export function normalizeSiteUrl(raw: string, domain: string): string | null; // 상대경로→https://www.<domain>, apex→www, # 제거, 쿼리 유지, 다른 호스트면 null
  export async function loadLegacyUrlCandidates(
    prisma: SearchOpsPrismaClient, input: { readonly siteId: string; readonly since: Date },
  ): Promise<readonly { readonly url: string; readonly traffic: number }[]>;
  export async function upsertSourceWorkOrder(
    prisma: SearchOpsPrismaClient,
    input: { readonly organizationId: string; readonly siteId: string; readonly sourceKey: string;
             readonly draft: { title: string; problem: string; description: string | null; impact: string;
               instructions: readonly string[]; acceptanceCriteria: readonly string[]; verificationMethod: string;
               priority: WorkOrderPriority; ownerType: WorkOrderOwnerType; estimatedEffort: EstimatedEffort } | null;
             readonly mode: "track" | "create_once" },
  ): Promise<"created" | "updated" | "reopened" | "closed" | "unchanged">;
  // apps/worker/src/redirect-check.ts
  export type LegacyUrlOutcome = "ok" | "home_only" | "broken" | "unknown";
  export function classifyLegacyUrl(
    originalUrl: string, result: { readonly finalUrl: string; readonly statusCode: number } | { readonly error: unknown },
  ): LegacyUrlOutcome;
  export function buildLegacyWorkOrderDrafts(
    domain: string, checks: readonly { url: string; traffic: number; outcome: LegacyUrlOutcome }[],
  ): { readonly broken: Draft | null; readonly homeOnly: Draft | null }; // Draft = upsertSourceWorkOrder 의 draft 타입
  export const checklistDrafts: Record<"sitemap-naver" | "sitemap-google", Draft>;
  ```
- 후보: 최근 90일 비-fixture `ConnectorSyncResult`(provider `gsc` 의 `page`, `ga4` 의 `pagePath`) + 사이트의 모든 `UrlRecord.url` 의 합집합 − 최신 completed 크롤의 UrlRecord URL 집합. traffic = 스냅샷별 노출 최댓값 + 방문 최댓값. traffic 내림차순 상위 **200**.
- `classifyLegacyUrl`: error → `unknown`; status ≥ 400 → `broken`; status 200 이고 원래 경로가 `/` 가 아닌데 최종 경로가 `/` → `home_only`; status 200 → `ok`; 그 밖(3xx 남음 등) → `broken`.
- `upsertSourceWorkOrder`: `mode: "track"` — draft 가 null 이면 열린 행을 `done`(closed), draft 가 있으면 없을 때 create(open), 있으면 내용 갱신 + done 이었으면 `open`(reopened). `mode: "create_once"` — 없을 때만 create, 이후엔 절대 수정 안 함. 상태가 바뀔 때 감사 이벤트(`source: "worker:redirect-check"`).
- broken 초안: priority `p0`, ownerType `developer`, title `` `옛 주소 ${n}개가 열리지 않음(404) — 새 주소로 연결 필요` ``, description = 마크다운 표(옛 주소 | 4주 노출+방문) traffic 상위 30행 + "외 N개", instructions 에 "각 옛 주소를 내용이 같은 새 주소로 301 리다이렉트", "내용이 없어진 글은 가장 가까운 새 페이지로 연결", acceptance "다음 점검에서 이 목록이 0개". home_only: p2, title `` `옛 주소 ${n}개가 홈으로만 연결됨 — 맞는 페이지로 연결 권장` ``.
- checklistDrafts: `sitemap-naver` title `"네이버 서치어드바이저에 새 사이트맵 제출"`, `sitemap-google` title `"구글 서치콘솔에 새 사이트맵 제출"`, 둘 다 p1·marketer·s, 후보가 1개 이상일 때(=리뉴얼 흔적) `create_once`.
- 배치 흐름(`batch-redirect-check.ts`): 보관 안 된 사이트마다 후보 로드 → 동시성 4 로 `fetchUrl({ url, timeoutMs: 15000 })` → 분류 → **unknown 이 50% 초과면 `console.error` + exitCode 1, 할 일 변경 없음** → 아니면 broken/home_only `track`, checklist `create_once`, `ok|home_only|broken` URL 로 `closeIssuesForGoneUrls`. 키(`DATABASE_URL`) 없으면 exit 0.

- [ ] **Step 1: 실패 테스트**
  - db: `normalizeSiteUrl("/web/blog/view?id=22", "gowoonmom.co.kr")` → `"https://www.gowoonmom.co.kr/web/blog/view?id=22"`; `"https://gowoonmom.co.kr/a#x"` → `"https://www.gowoonmom.co.kr/a"`; `"https://other.com/a"` → `null`.
  - db: `upsertSourceWorkOrder track reopens done row when draft returns` / `closes open row when draft is null` / `create_once never updates existing row`.
  - worker: `classifyLegacyUrl` 5가지(404→broken, 200 같은 경로→ok, 200 홈으로→home_only, `/` 원본이 `/`→ok, error→unknown).
  - worker: `buildLegacyWorkOrderDrafts` — broken 32개 입력 → title `"옛 주소 32개가 열리지 않음(404) — 새 주소로 연결 필요"`, 표 30행 + `"외 2개"`; broken 0개 → `broken: null`.
  - worker: `does not touch work orders when most checks are unknown` — main 의 판정부를 `runRedirectCheckForSite(deps)` 로 분리해 가짜 deps 로 검증(unknown 3/4 → upsert 호출 0회).
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/db test -- legacy-urls` · `corepack pnpm --filter @searchops/worker test -- redirect-check` → FAIL.
- [ ] **Step 3:** 구현(`runRedirectCheckForSite(deps: { loadCandidates, fetch, upsert, closeGone }, site)` 를 `redirect-check.ts` 에 export, `batch-redirect-check.ts` 는 실제 deps 연결 + 루프만).
- [ ] **Step 4:** Run 두 명령 → PASS (db 먼저 build).
- [ ] **Step 5:** `batch-crawl.yml` 의 "Run keyword volume batch" 다음에 `Run legacy redirect check` 스텝(`if: always()`, env `DATABASE_URL`·`DIRECT_DATABASE_URL`, `run: node apps/worker/dist/batch-redirect-check.js`) 추가. 파일 상단 주석의 단계 목록에도 한 줄.
- [ ] **Step 6:** Commit `feat(worker): 리뉴얼 옛 주소 점검 배치 + 사이트맵 체크리스트 할 일`.

---

### Task 5: 오늘의 할 일 데이터 로더

**Files:**
- Create: `packages/db/src/today-board.ts`, `packages/db/src/today-board.test.ts`
- Modify: `packages/db/src/index.ts`, `apps/web/src/site-database.ts`

**Interfaces:**
- Consumes: Task 3 `TodayCandidate`, `site-dashboard.ts` 의 `loadScopedSiteRecord`(같은 파일에서 export 로 바꿔 재사용).
- Produces:
  ```ts
  export interface TodayBoard {
    readonly site: { readonly id: string; readonly domain: string; readonly name: string; readonly ignoredIssueKeys: readonly string[] };
    readonly candidates: readonly TodayCandidate[];          // open|in_progress|in_review 전부
    readonly trafficByUrl: Readonly<Record<string, number>>; // 최신 gsc 스냅샷 노출 + 최신 ga4 스냅샷 방문, 정규화 URL 키
    readonly search: { readonly clicks: number; readonly impressions: number; readonly fetchedAt: string } | null; // 최신 gsc 합계
    readonly changes: readonly string[]; // searchChanges(직전 gsc 스냅샷, 최신 gsc 스냅샷)
  }
  export interface GscRow { readonly query: string; readonly country: string; readonly impressions: number; readonly position: number }
  export function searchChanges(previous: readonly GscRow[], current: readonly GscRow[], limit?: number): readonly string[];
  export async function loadTodayBoard(prisma: SearchOpsPrismaClient, input: { organizationId: string; siteId: string }): Promise<TodayBoard | null>;
  export async function addIgnoredIssueKey(prisma: SearchOpsPrismaClient, input: { organizationId: string; siteId: string; key: string }): Promise<boolean>;
  // web
  export const getTodayBoard: (siteId: string) => Promise<TodayBoard | null>;
  export async function markIssueIntended(siteId: string, key: string): Promise<boolean>;
  ```
- `candidates[].ruleId`·`url` 은 연결 SeoIssue 의 ruleId·urlRecord.url 에서, 없으면 null.
- `addIgnoredIssueKey`: 조직 대조 후 중복 없이 push. 다른 조직이면 false.
- `searchChanges`: 같은 query(country `kor`) 의 노출가중 평균 순위 비교, 직전 스냅샷 대비 변화 ≥ 0.5 이고 현재 노출 ≥ 50 인 것, 변화 큰 순 상위 `limit ?? 3`. 문구 `"'{query}' 구글 순위 {prev}→{curr}위"`(소수 1자리).

- [ ] **Step 1: 실패 테스트** — `loadTodayBoard returns null for other organization`, `maps seo issue rule and url onto candidates`, `sums latest gsc snapshot`, `addIgnoredIssueKey is idempotent`, `searchChanges reports position move`(골반 필러 4.7→3.9, 노출 479 → `"'골반 필러' 구글 순위 4.7→3.9위"`), `searchChanges ignores low impressions`(노출 30 → 빈 배열).
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/db test -- today-board` → FAIL.
- [ ] **Step 3:** 구현. web 쪽은 `readScoped` 로 감싸고, `markIssueIntended` 는 기존 `setWorkOrderStatus` 와 같은 쓰기 경로 패턴.
- [ ] **Step 4:** Run → PASS. `corepack pnpm --filter @searchops/db build && corepack pnpm --filter @searchops/web test` → PASS.
- [ ] **Step 5:** Commit `feat(db): 오늘의 할 일 보드 로더`.

---

### Task 6: 휴대폰용 `/today` 화면

**Files:**
- Create: `apps/web/app/sites/[siteId]/today/page.tsx`, `apps/web/app/sites/[siteId]/today/actions.ts`
- Create: `apps/web/src/today-view-model.ts`, `apps/web/src/today-view-model.test.ts`, `apps/web/src/copy-button.tsx`
- Modify: `apps/web/app/sites/[siteId]/page.tsx` (개요 상단에 "오늘의 할 일" 링크 버튼)

**Interfaces:**
- Consumes: Task 5 `getTodayBoard`·`markIssueIntended`, Task 3 `rankTodayWorkOrders`·`buildAiInstruction`·`protectedRulesFromIgnoredKeys`·`defaultProtectedRules`·`isChecklist`, 기존 `setWorkOrderStatus`, 기존 `DataFreshnessPanel`.
- Produces: `buildTodayView(board: TodayBoard): { items: readonly { id; title; statusLabel; isChecklist; aiInstruction: string; intendedKey: string | null }[]; remaining: number; searchLine: string | null; changes: readonly string[] }` (`changes` 는 `board.changes` 그대로).
  - `statusLabel`: open `"할 일"`, in_progress `"진행 중"`, in_review `"확인 대기 — 다음 크롤에서 확인"`.
  - `intendedKey`: ruleId·url 둘 다 있을 때 `issueKey(ruleId, url)`.
  - `remaining`: 상한 밖 남은 개수(`candidates.length - items.length`).
  - `searchLine`: `"구글 4주: 노출 ${impressions.toLocaleString("ko-KR")} · 클릭 ${clicks}"`.
- actions: `markDoneAction(siteId, workOrderId, isChecklist)` → 체크리스트면 `"done"`, 아니면 `"in_review"`; `markIntendedAction(siteId, key)`. 둘 다 bind 로 id 를 받고(폼 필드 금지 — 기존 `updateWorkOrderStatusAction` 주석 참고), 끝나면 `revalidatePath` + `redirect(?today=updated|failed)`.
- 화면: 한 열, 위→아래: 제목 "오늘의 할 일" + 남은 개수 → `changes`(있을 때) → `searchLine` → 항목 카드(`<details>`: summary = 번호·제목·statusLabel, 펼치면 지시문 `<pre>` + `CopyButton` + [했어요] + (intendedKey 있으면) [의도한 설정이에요]) → `DataFreshnessPanel` → "자세히 보기" 링크(기존 개요). 토큰은 `--so-*`, 카드 내부 `overflow-wrap: anywhere`, `<pre>` 는 `white-space: pre-wrap`.
- `CopyButton`: `"use client"`, `navigator.clipboard.writeText`, 성공 시 2초간 "복사됨". 실패 시 "복사 실패 — 길게 눌러 선택하세요".
- 직접 DB 모드가 아니거나 board 가 null 이면 기존 화면과 같은 안내 문구.

- [ ] **Step 1: 실패 테스트** (`today-view-model.test.ts`): `limits to 10 and reports remaining`, `labels in_review as waiting for crawl`, `includes ebook protected rule in instruction when key is ignored`, `formats search line in Korean locale`(노출 3,812).
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/web test -- today-view-model` → FAIL.
- [ ] **Step 3:** `buildTodayView` 구현 → PASS 확인.
- [ ] **Step 4:** page·actions·CopyButton 구현. Run `corepack pnpm --filter @searchops/web lint && corepack pnpm --filter @searchops/web build` → PASS.
- [ ] **Step 5: 360px 수동 확인** — `corepack pnpm --filter @searchops/web dev` 후 브라우저 폭 360px 로 `/sites/<id>/today` 열기(fixture 모드 가능): 가로 스크롤 없음, 긴 URL 줄바꿈, 복사 버튼 동작.
- [ ] **Step 6:** Commit `feat(web): 휴대폰용 오늘의 할 일 화면`.

---

### Task 7: 텔레그램 아침 요약

**Files:**
- Modify: `packages/connectors/src/telegram.ts`, `packages/connectors/src/telegram.test.ts`
- Create: `apps/worker/src/daily-digest.ts`, `apps/worker/src/daily-digest.test.ts`, `apps/worker/src/batch-digest.ts`
- Modify: `.github/workflows/batch-crawl.yml`

**Interfaces:**
- Consumes: Task 5 `loadTodayBoard`(`changes` 포함 — 다시 계산하지 않는다), Task 3 `rankTodayWorkOrders`, `TelegramNotifier`.
- Produces:
  ```ts
  // telegram.ts — 기존 호출부 호환
  sendMessage(text: string, options?: { readonly silent?: boolean }): Promise<void>; // silent → disable_notification: true
  // daily-digest.ts
  export interface DigestInput {
    readonly siteName: string; readonly todayUrl: string; readonly now: Date;
    readonly batchStatus: "success" | "failure" | "cancelled" | string;
    readonly warnings: readonly { readonly key: string; readonly text: string }[];
    readonly previousWarningKeys: readonly string[];
    readonly changes: readonly string[];          // 최대 3줄
    readonly search: TodayBoard["search"];
    readonly remaining: number; readonly topTitle: string | null;
  }
  export function isQuietHourKst(now: Date): boolean; // Asia/Seoul 시 < 7
  export function composeDailyDigest(input: DigestInput): { readonly text: string; readonly silent: boolean; readonly warningKeys: readonly string[] };
  ```
- 메시지 구조(빈 줄 생략):
  ```
  [{siteName}] {M월 D일} 아침 요약
  🚨 {새 경고 text}            ← previousWarningKeys 에 없는 것만
  계속되는 경고 {n}건          ← 이미 알린 것은 한 줄로
  ⚠️ 어제 배치가 실패했습니다   ← batchStatus === "failure"
  {changes 각 줄}
  구글 4주: 노출 {n} · 클릭 {n}
  할 일 {remaining}개 · 1순위: {topTitle}
  {todayUrl}
  ```
- 경고 키: 열린 `legacy-redirect:*:broken` → `legacy-broken`(text `"옛 주소 {n}개가 열리지 않아요 — 오늘 할 일 1순위"`), 최신 크롤 pagesProcessed ≤ 1 → `crawl-blocked`, 데이터 지연(`summarizeDataFreshness` 의 stale/failed) → `stale-<key>`.
- 직전 경고 키: 마지막 `ClosedLoopAuditEvent(eventType "daily_digest", siteId)` 의 `metadata.warningKeys`. 발송 성공 뒤 새 이벤트 기록(`source: "worker:digest"`).
- `batch-digest.ts`: env 없으면(`SEARCHOPS_TELEGRAM_BOT_TOKEN`·`SEARCHOPS_TELEGRAM_OWNER_CHAT_ID`) 로그 후 exit 0. 발송 실패는 `console.error` 후 exit 0(알림 실패가 배치를 실패로 뒤집지 않는다 — batch-crawl.yml "Report batch status" 주석과 같은 원칙). `todayUrl = ${SEARCHOPS_WEB_BASE_URL ?? "https://searchops.totopapa.com"}/sites/${siteId}/today`.
- workflow: "Report batch status" 직전에 `Send daily digest` 스텝, `if: always()`, `continue-on-error: true`, env `BATCH_STATUS: ${{ job.status }}`, 위 secret 2개, `SEARCHOPS_WEB_BASE_URL: ${{ vars.SEARCHOPS_WEB_BASE_URL }}`, DB env.

- [ ] **Step 1: 실패 테스트**
  - telegram: `sends disable_notification when silent` (요청 body 에 `"disable_notification":true`), 기존 테스트 유지.
  - digest: `isQuietHourKst` — `2026-11-15T21:30:00Z`(KST 06:30) true, `2026-11-15T22:30:00Z`(KST 07:30) false.
  - digest: `announces only new warnings` — previous `["legacy-broken"]`, warnings `legacy-broken`+`crawl-blocked` → 텍스트에 `"🚨"` 1회(크롤), `"계속되는 경고 1건"`.
  - digest: `adds batch failure line` / `includes today link last`.
- [ ] **Step 2:** Run `corepack pnpm --filter @searchops/connectors test -- telegram` · `corepack pnpm --filter @searchops/worker test -- daily-digest` → FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** Run → PASS (connectors·db build 먼저).
- [ ] **Step 5:** workflow 스텝 추가, 상단 주석에 secret `SEARCHOPS_TELEGRAM_OWNER_CHAT_ID`·변수 `SEARCHOPS_WEB_BASE_URL` 기록.
- [ ] **Step 6:** Commit `feat(worker): 텔레그램 아침 요약`.

---

## 배포 후 사용자 작업 (계획 밖, 순서대로)

1. Task 1 머지 뒤: `docs/WEB_DIRECT_DB.md` 증분 GRANT 를 Supabase SQL Editor 에서 실행.
2. Task 7 머지 전: 봇과 1:1 대화 시작 → chat id 확인 → `gh secret set SEARCHOPS_TELEGRAM_OWNER_CHAT_ID`.
3. 첫 배치 뒤: `/today` 에서 `/ebook` 항목이 남아 있으면 [의도한 설정이에요] 1회.
