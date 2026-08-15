// richdoc 계약 자체 검증 — 배포 플랫폼(Railway 등) 없이 로컬에서 실행한다.
//
// 실제 어댑터(packages/db/dist/richdoc.js)를 가짜 Prisma로 구동해 계약
// (richdoc-saas/supabase/searchops_contract.sql)이 적용된 Postgres에 적재하고,
// 그 결과를 다시 읽어 계약 준수를 검증한다. vitest는 요청 "모양"만 보지만
// 이 스크립트는 실제 스키마의 NOT NULL/unique/기본값/타입까지 통과시킨다.
//
// 모드 1 — local (기본, 자격증명 불필요):
//   임시 로컬 DB 생성 → 계약 SQL 적용 → 미니 PostgREST 셰임 → 검증 → DB 삭제
//     node scripts/richdoc-smoke.mjs
//   전제: 로컬 postgres 가동(`pg_isready`), `corepack pnpm --filter @searchops/db build`
//
// 모드 2 — live (실제 리쥬엘 Supabase 연결/RLS/service key 확인, 배포 전 1회):
//   SEARCHOPS_RICHDOC_SUPABASE_URL=... SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/richdoc-smoke.mjs --live
//   마커 도메인(richdoc-smoke.invalid)만 쓰고 끝나면 지운다. --keep 으로 보존.
//
// 옵션: --contract <path>  계약 SQL 경로 (기본 ../richdoc-saas/supabase/searchops_contract.sql)

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const adapterPath = resolve(here, "../packages/db/dist/richdoc.js");
if (!existsSync(adapterPath)) {
  console.error(
    `어댑터 빌드 산출물이 없다: ${adapterPath}\n` +
      `먼저 실행하라: corepack pnpm --filter @searchops/db build`,
  );
  process.exit(2);
}
const { createRichdocContractBridge, richdocUuidFromId } = await import(adapterPath);

const argv = process.argv.slice(2);
const live = argv.includes("--live");
const keep = argv.includes("--keep");
const contractArg = argv.includes("--contract")
  ? argv[argv.indexOf("--contract") + 1]
  : undefined;
const contractSql = resolve(
  here,
  contractArg ??
    process.env.RICHDOC_CONTRACT_SQL ??
    "../../richdoc-saas/supabase/searchops_contract.sql",
);

// .invalid TLD(RFC 2606)라 실데이터와 절대 충돌하지 않는다.
const DOMAIN = "richdoc-smoke.invalid";
const SITE_ID = "smoke-site-1";
const RUN_ID = "smoke-run-1";
const WO_ID = "smoke-wo-1";
const TABLES = ["searchops_issues", "searchops_work_orders", "searchops_runs"];

let failures = 0;
function check(label, ok, actual) {
  if (ok) {
    console.log(`✅ ${label}`);
  } else {
    failures += 1;
    console.error(`❌ ${label}${actual === undefined ? "" : ` — 실제값: ${JSON.stringify(actual)}`}`);
  }
}

// ---------------------------------------------------------------- local target

function createLocalTarget() {
  if (!existsSync(contractSql)) {
    throw new Error(
      `계약 SQL을 찾을 수 없다: ${contractSql}\n` +
        `--contract <path> 또는 RICHDOC_CONTRACT_SQL 로 경로를 지정하라.`,
    );
  }
  const dbName = `richdoc_smoke_${process.pid}`;
  const dbUrl = `postgresql:///${dbName}`;
  const psql = (args, options = {}) =>
    execFileSync("psql", [dbUrl, "-qXAt", "-v", "ON_ERROR_STOP=1", ...args], {
      encoding: "utf8",
      ...options
    });

  const dropDb = () => execFileSync("dropdb", ["--force", "--if-exists", dbName], { encoding: "utf8" });

  execFileSync("createdb", [dbName], { encoding: "utf8" });
  // createdb 이후의 실패는 임시 DB를 남기므로 여기서 되돌린다.
  try {
    // Supabase 전용 롤 — 계약 SQL의 grant 구문이 로컬에서도 그대로 통과해야 한다.
    // 롤은 DB가 아니라 클러스터 전역이라 임시 DB를 지워도 남는다 → 재실행 대비 조건부 생성.
    psql([
      "-c",
      `do $$ begin
         if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
         if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
       end $$;`
    ]);
    psql(["-f", contractSql]);
  } catch (error) {
    dropDb();
    throw error;
  }

  const quoteJson = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  const ident = (name) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error(`허용되지 않는 식별자: ${name}`);
    }
    return name;
  };

  // 어댑터가 쓰는 PostgREST 동작(POST + on_conflict + merge-duplicates)만 옮긴 셰임.
  // JSON 에 있는 키만 INSERT 하므로, 어댑터가 일부러 생략한 컬럼(issues.status,
  // first_seen)은 계약의 DEFAULT 가 그대로 적용된다 — 그 동작까지 검증 대상이다.
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const { pathname, searchParams } = new URL(req.url, "http://localhost");
        const table = ident(pathname.replace("/rest/v1/", ""));
        const rows = JSON.parse(Buffer.concat(chunks).toString());
        const cols = Object.keys(rows[0]).map(ident);
        const conflict = searchParams.get("on_conflict").split(",").map(ident);
        const assignments = cols
          .filter((col) => !conflict.includes(col))
          .map((col) => `${col} = excluded.${col}`)
          .join(", ");
        psql([
          "-c",
          `insert into public.${table} (${cols.join(", ")})
           select ${cols.join(", ")}
           from jsonb_populate_recordset(null::public.${table}, ${quoteJson(rows)}::jsonb)
           on conflict (${conflict.join(", ")}) do update set ${assignments}`
        ]);
        res.writeHead(201).end();
      } catch (error) {
        res.writeHead(400, { "content-type": "text/plain" }).end(String(error.message ?? error));
      }
    });
  });

  return {
    async start() {
      await new Promise((done) => server.listen(0, "127.0.0.1", done));
      return `http://127.0.0.1:${server.address().port}`;
    },
    async read(table, where) {
      const out = psql([
        "-c",
        `select coalesce(jsonb_agg(t), '[]'::jsonb) from public.${ident(table)} t where ${where}`
      ]);
      return JSON.parse(out.trim());
    },
    async patchIssueStatus(status) {
      psql(["-c", `update public.searchops_issues set status = '${status}' where site = '${DOMAIN}'`]);
    },
    async finish() {
      server.close();
      if (keep) {
        console.log(`(--keep) 임시 DB 유지: ${dbUrl}`);
        return;
      }
      dropDb();
    }
  };
}

// ----------------------------------------------------------------- live target

function createLiveTarget() {
  const baseUrl = process.env.SEARCHOPS_RICHDOC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    throw new Error(
      "--live 에는 SEARCHOPS_RICHDOC_SUPABASE_URL / SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY 가 필요하다.",
    );
  }
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const rest = async (method, path, body) => {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method
    });
    if (!response.ok) {
      throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? null : response.json();
  };

  return {
    async start() {
      return baseUrl;
    },
    async read(table, _where, restFilter) {
      return rest("GET", `${table}?${restFilter}`);
    },
    async patchIssueStatus(status) {
      await rest("PATCH", `searchops_issues?site=eq.${DOMAIN}`, { status });
    },
    async finish() {
      if (keep) {
        console.log(`(--keep) 마커 행 유지: site=${DOMAIN}`);
        return;
      }
      for (const table of TABLES) {
        await rest("DELETE", `${table}?site=eq.${DOMAIN}`).catch((error) => {
          console.error(`정리 실패(${table}): ${error.message}`);
        });
      }
    }
  };
}

// ------------------------------------------------------------------ fake prisma

// 어댑터가 읽는 세 쿼리만 메모리 데이터로 응답한다.
const state = {
  crawlRun: {
    endedAt: new Date(),
    id: RUN_ID,
    site: { domain: DOMAIN },
    siteId: SITE_ID,
    startedAt: new Date(Date.now() - 60_000),
    status: "completed",
    summary: { pagesProcessed: 7 }
  },
  issue: {
    evidence: { observedValue: null, url: `https://${DOMAIN}/a` },
    ruleId: "TITLE_MISSING",
    severity: "high",
    title: "smoke: 타이틀 누락",
    urlRecord: { url: `https://${DOMAIN}/a` }
  },
  workOrder: {
    createdAt: new Date(),
    id: WO_ID,
    relatedIssues: ["TITLE_MISSING"],
    seoIssueId: "smoke-issue-1",
    site: { domain: DOMAIN },
    status: "open",
    title: "smoke: 타이틀 누락 수정",
    updatedAt: new Date()
  }
};
const prisma = {
  crawlRun: { findUnique: async () => state.crawlRun },
  seoIssue: { findMany: async () => [state.issue] },
  workOrder: { findMany: async () => [state.workOrder] }
};

// ------------------------------------------------------------------------ run

let target;
try {
  target = live ? createLiveTarget() : createLocalTarget();
} catch (error) {
  console.error(`❌ 준비 실패: ${error.message}`);
  process.exit(2);
}
console.log(live ? "모드: live (실제 Supabase)" : `모드: local (계약 SQL ${contractSql})`);

try {
  const supabaseUrl = await target.start();
  const bridge = createRichdocContractBridge({
    prisma,
    serviceRoleKey: process.env.SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY ?? "local-smoke",
    siteIds: [SITE_ID],
    supabaseUrl
  });

  // ---- 1차 적재: insert 경로 ----
  await bridge.syncCrawlRun({ crawlRunId: RUN_ID, siteId: SITE_ID });

  const runUuid = richdocUuidFromId(RUN_ID);
  const [run] = await target.read("searchops_runs", `id = '${runUuid}'`, `id=eq.${runUuid}`);
  check("runs upsert (cuid→uuid 파생 PK가 계약 uuid 컬럼에 적재)", run !== undefined);
  check("runs.status → done", run?.status === "done", run?.status);
  check("runs.pages_crawled = summary.pagesProcessed", run?.pages_crawled === 7, run?.pages_crawled);
  check("runs.issues_found = 1", run?.issues_found === 1, run?.issues_found);
  check("runs.started_at 적재(NOT NULL 충족)", Boolean(run?.started_at), run?.started_at);
  check("runs.summary jsonb 왕복", run?.summary?.pagesProcessed === 7, run?.summary);

  const [issue] = await target.read("searchops_issues", `site = '${DOMAIN}'`, `site=eq.${DOMAIN}`);
  check("issues upsert (site,page_url,rule_id 유니크 키)", issue !== undefined);
  check("issues.severity high → warning", issue?.severity === "warning", issue?.severity);
  check("issues.status 계약 기본값 open (어댑터 미전송)", issue?.status === "open", issue?.status);
  check("issues.first_seen 계약 기본값 적용", Boolean(issue?.first_seen), issue?.first_seen);
  check("issues.page_url = urlRecord.url", issue?.page_url === `https://${DOMAIN}/a`, issue?.page_url);
  const firstLastSeen = issue?.last_seen;

  const woUuid = richdocUuidFromId(WO_ID);
  const [wo] = await target.read("searchops_work_orders", `id = '${woUuid}'`, `id=eq.${woUuid}`);
  check("work_orders upsert (cuid→uuid 파생 PK)", wo !== undefined);
  check("work_orders.status open → open", wo?.status === "open", wo?.status);
  check("work_orders.issue_count = 1", wo?.issue_count === 1, wo?.issue_count);

  // 콘솔이 이슈 상태를 바꿨다고 가정 — 재크롤이 이걸 되돌리면 계약 위반이다.
  await target.patchIssueStatus("in_order");

  // ---- 2차 적재: upsert(idempotency) + 콘솔 관리 컬럼 보존 ----
  await new Promise((done) => setTimeout(done, 1100));
  state.issue.severity = "critical";
  state.workOrder.status = "done";
  state.workOrder.updatedAt = new Date();
  await bridge.syncCrawlRun({ crawlRunId: RUN_ID, siteId: SITE_ID });

  const runs = await target.read("searchops_runs", `site = '${DOMAIN}'`, `site=eq.${DOMAIN}`);
  check("runs 재적재해도 1행 (idempotent)", runs.length === 1, runs.length);

  const issues = await target.read("searchops_issues", `site = '${DOMAIN}'`, `site=eq.${DOMAIN}`);
  check("issues 재적재해도 1행 (idempotent)", issues.length === 1, issues.length);
  check("issues.severity 갱신 → critical", issues[0]?.severity === "critical", issues[0]?.severity);
  check("콘솔 관리 status(in_order) 보존", issues[0]?.status === "in_order", issues[0]?.status);
  check(
    "issues.last_seen 전진",
    Boolean(firstLastSeen) && new Date(issues[0]?.last_seen) > new Date(firstLastSeen),
    { after: issues[0]?.last_seen, before: firstLastSeen },
  );

  const [wo2] = await target.read("searchops_work_orders", `id = '${woUuid}'`, `id=eq.${woUuid}`);
  check("work_orders.status done → verified", wo2?.status === "verified", wo2?.status);

  // ---- allowlist fail-closed (멀티테넌트 유출 방지) ----
  // 실제 취약 시나리오 재현: Site.domain 은 조직별 unique 라 타 조직이 같은
  // 도메인으로 사이트를 만들 수 있다. Site.id allowlist 가 유일한 방어선이므로
  // 진짜 타겟 URL 로 시도해서, 막히는 이유가 allowlist 하나뿐이게 만든다.
  const LEAK = "LEAKED-타-조직-데이터";
  state.crawlRun = { ...state.crawlRun, id: "smoke-attacker-run", siteId: "attacker-site" };
  state.issue = { ...state.issue, title: LEAK };
  state.workOrder = { ...state.workOrder, id: "smoke-attacker-wo", title: LEAK };
  const guarded = createRichdocContractBridge({
    prisma,
    serviceRoleKey: process.env.SEARCHOPS_RICHDOC_SUPABASE_SERVICE_ROLE_KEY ?? "local-smoke",
    siteIds: [SITE_ID], // attacker-site 는 목록에 없다
    supabaseUrl
  });
  await guarded.syncCrawlRun({ crawlRunId: "smoke-attacker-run", siteId: "attacker-site" });
  await guarded.syncSiteWorkOrders({ siteId: "attacker-site" });

  const afterIssues = await target.read("searchops_issues", `site = '${DOMAIN}'`, `site=eq.${DOMAIN}`);
  check(
    "타 조직 Site.id 데이터가 같은 도메인 이슈로 새지 않음",
    afterIssues.length === 1 && afterIssues[0]?.title !== LEAK,
    afterIssues.map((row) => row.title),
  );
  const attackerUuid = richdocUuidFromId("smoke-attacker-run");
  const leakedRuns = await target.read(
    "searchops_runs",
    `id = '${attackerUuid}'`,
    `id=eq.${attackerUuid}`,
  );
  check("allowlist 밖 crawl run 미적재 (fail-closed)", leakedRuns.length === 0, leakedRuns.length);
  const leakedWos = await target.read(
    "searchops_work_orders",
    `title = '${LEAK}'`,
    `title=eq.${LEAK}`,
  );
  check("allowlist 밖 지시서 미적재 (fail-closed)", leakedWos.length === 0, leakedWos.length);
} catch (error) {
  failures += 1;
  console.error(`❌ 스모크 실행 실패: ${error.message}`);
} finally {
  await target.finish().catch((error) => console.error(`정리 실패: ${error.message}`));
}

console.log(
  failures === 0
    ? "\n계약 검증 통과 — 어댑터 페이로드가 실제 계약 스키마를 만족한다."
    : `\n실패 ${failures}건`,
);
process.exit(failures === 0 ? 0 : 1);
