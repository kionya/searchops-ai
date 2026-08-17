#!/usr/bin/env node
// API 없이 웹이 실데이터를 그리는 경로를 검증한다.
//
// 웹의 모든 사이트 화면은 @searchops/db 의 loadSiteDashboardSnapshot 하나로 모인다.
// 그 함수가 (1) 실데이터를 제대로 돌려주고 (2) 조직 스코프를 절대 벗어나지 않는지,
// 그리고 (3) Vercel 에 둘 최소권한 역할이 실제로 credential 테이블과 쓰기를 막는지를
// 진짜 Postgres 위에서 확인한다.
//
// 실행: pnpm smoke:web-db   (psql/createdb/dropdb 필요)

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbDist = resolve(here, "../packages/db/dist/index.js");
const roleSql = resolve(here, "sql/web-readonly-role.sql");

const keep = process.argv.includes("--keep");
let failures = 0;

function check(label, ok, actual) {
  if (ok) {
    console.log(`✅ ${label}`);
  } else {
    failures += 1;
    console.error(`❌ ${label}${actual === undefined ? "" : ` — 실제값: ${JSON.stringify(actual)}`}`);
  }
}

const dbName = `web_db_smoke_${process.pid}`;
const pgUser = process.env.PGUSER ?? process.env.USER ?? "postgres";
const pgAuth = process.env.PGPASSWORD
  ? `${encodeURIComponent(pgUser)}:${encodeURIComponent(process.env.PGPASSWORD)}`
  : encodeURIComponent(pgUser);
const pgHost = process.env.PGHOST ?? "localhost";
const pgPort = process.env.PGPORT ?? 5432;
const dbUrl = `postgresql://${pgAuth}@${pgHost}:${pgPort}/${dbName}`;
// 최소권한 역할로 접속할 때 쓸 URL. 비밀번호는 이 실행 안에서만 산다.
const webRolePassword = "smoke-web-readonly";
const webRoleUrl = `postgresql://searchops_web_readonly:${webRolePassword}@${pgHost}:${pgPort}/${dbName}`;

const psql = (args) =>
  execFileSync("psql", [dbUrl, "-qXAt", "-v", "ON_ERROR_STOP=1", ...args], { encoding: "utf8" });
const dropDb = () => execFileSync("dropdb", ["--force", "--if-exists", dbName], { encoding: "utf8" });

execFileSync("createdb", [dbName], { encoding: "utf8" });

let prisma;
let webPrisma;
try {
  execFileSync(
    "corepack",
    ["pnpm", "--filter", "@searchops/db", "exec", "prisma", "migrate", "deploy"],
    { encoding: "utf8", env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_DATABASE_URL: dbUrl }, stdio: "pipe" },
  );

  const {
    createSearchOpsPrismaClient,
    findUserMembershipByEmail,
    listOrganizationSites,
    loadSiteDashboardSnapshot
  } = await import(dbDist);

  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_DATABASE_URL = dbUrl;
  prisma = createSearchOpsPrismaClient();

  // ---- 두 조직을 심는다. 조직 A 에만 실제 크롤 산출물이 있다. ----
  const seedOrg = async (orgId, sites) => {
    await prisma.organization.create({ data: { id: orgId, name: orgId } });
    for (const site of sites) {
      await prisma.site.create({
        data: {
          country: "KR",
          domain: site.domain,
          id: site.id,
          industry: "other",
          language: "ko",
          name: site.domain,
          organizationId: orgId
        }
      });
    }
  };
  await seedOrg("org_a", [
    { id: "site_a1", domain: "a1.example.com" },
    { id: "site_a2", domain: "a2.example.com" }
  ]);
  await seedOrg("org_b", [{ id: "site_b1", domain: "b1.example.com" }]);

  await prisma.crawlRun.create({
    data: {
      endedAt: new Date("2026-08-17T00:10:00Z"),
      id: "crawl_a1",
      siteId: "site_a1",
      startedAt: new Date("2026-08-17T00:00:00Z"),
      status: "completed",
      summary: { pagesProcessed: 2 }
    }
  });
  await prisma.urlRecord.create({
    data: {
      crawlRunId: "crawl_a1",
      id: "url_a1",
      metaDescription: null,
      siteId: "site_a1",
      statusCode: 200,
      title: "홈",
      url: "https://a1.example.com/"
    }
  });
  await prisma.seoIssue.create({
    data: {
      crawlRunId: "crawl_a1",
      evidence: {
        expectedValue: "present",
        observedValue: null,
        sourceField: "title",
        url: "https://a1.example.com/"
      },
      id: "issue_a1",
      ruleId: "TITLE_MISSING",
      severity: "high",
      status: "open",
      title: "타이틀 누락",
      urlRecordId: "url_a1"
    }
  });
  await prisma.workOrder.create({
    data: {
      acceptanceCriteria: ["타이틀 태그가 있다."],
      estimatedEffort: "s",
      evidence: {
        expectedValue: "present",
        observedValue: null,
        sourceField: "title",
        url: "https://a1.example.com/"
      },
      id: "wo_a1",
      impact: "검색 스니펫에 제목이 필요하다.",
      instructions: ["타이틀 태그를 추가한다."],
      organizationId: "org_a",
      ownerType: "developer",
      priority: "p1",
      problem: "페이지에 타이틀이 없다.",
      relatedIssues: ["TITLE_MISSING"],
      seoIssueId: "issue_a1",
      siteId: "site_a1",
      status: "open",
      title: "타이틀 누락 수정",
      verificationMethod: "재크롤"
    }
  });
  await prisma.schemaRecommendation.create({
    data: {
      evidence: {
        expectedType: "WebPage",
        observedTypes: [],
        sourceField: "jsonLd",
        url: "https://a1.example.com/"
      },
      generatedBy: "deterministic",
      id: "rec_a1",
      instructions: ["WebPage JSON-LD 추가"],
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "홈" },
      pageUrl: "https://a1.example.com/",
      priority: "p1",
      reason: "WebPage JSON-LD 누락",
      recommendedFields: ["description"],
      requiredFields: ["name"],
      siteId: "site_a1",
      status: "open",
      type: "WebPage"
    }
  });

  // ---- 1) 실데이터가 그대로 나오는가 ----
  const snapshot = await loadSiteDashboardSnapshot(prisma, {
    organizationId: "org_a",
    siteId: "site_a1"
  });
  check("사이트 스냅샷을 API 없이 읽음", snapshot !== null);
  check("site 필드", snapshot?.site.domain === "a1.example.com", snapshot?.site.domain);
  check("crawlRuns 1건", snapshot?.crawlRuns.length === 1, snapshot?.crawlRuns.length);
  check("urlRecords 1건", snapshot?.urlRecords.length === 1, snapshot?.urlRecords.length);
  check("seoIssues 1건 (크롤런 경유 조회)", snapshot?.seoIssues.length === 1, snapshot?.seoIssues.length);
  check("workOrders 1건", snapshot?.workOrders.length === 1, snapshot?.workOrders.length);
  check(
    "schemaRecommendations 1건",
    snapshot?.schemaRecommendations.length === 1,
    snapshot?.schemaRecommendations.length,
  );
  // zod 스키마로 파싱하므로 날짜는 ISO 문자열이어야 한다 — API 응답과 같은 모양.
  check(
    "날짜가 ISO 문자열 (API 응답과 동형)",
    typeof snapshot?.crawlRuns[0]?.startedAt === "string" &&
      snapshot.crawlRuns[0].startedAt.endsWith("Z"),
    snapshot?.crawlRuns[0]?.startedAt,
  );

  // ---- 2) 테넌트 격리 ----
  check(
    "타 조직이 남의 사이트를 읽으면 null",
    (await loadSiteDashboardSnapshot(prisma, { organizationId: "org_b", siteId: "site_a1" })) === null,
  );
  check(
    "없는 사이트도 같은 null (존재 여부를 흘리지 않음)",
    (await loadSiteDashboardSnapshot(prisma, { organizationId: "org_a", siteId: "nope" })) === null,
  );
  const orgASites = await listOrganizationSites(prisma, "org_a");
  check(
    "사이트 목록이 조직 소유만 반환",
    orgASites.length === 2 && orgASites.every((site) => site.organizationId === "org_a"),
    orgASites.map((site) => site.id),
  );

  // ---- 2b) 소속 조회: custom access token hook 없이 로그인이 되게 하는 경로 ----
  await prisma.user.create({
    data: { email: "owner@a.example.com", id: "user_a", name: "A", organizationId: "org_a", role: "owner" }
  });
  const membership = await findUserMembershipByEmail(prisma, "owner@a.example.com");
  check(
    "이메일로 조직 소속을 찾는다",
    membership?.organizationId === "org_a" && membership?.role === "owner",
    membership,
  );
  check(
    "대소문자가 달라도 찾는다",
    (await findUserMembershipByEmail(prisma, "Owner@A.Example.com"))?.organizationId === "org_a",
  );
  check("없는 이메일은 null", (await findUserMembershipByEmail(prisma, "nobody@x.test")) === null);

  // User.email 은 조직별 unique 라 같은 이메일이 두 조직에 있을 수 있다. 그때 아무 조직이나
  // 고르면 그게 곧 테넌트 유출이므로 실패로 닫아야 한다.
  await prisma.user.create({
    data: { email: "owner@a.example.com", id: "user_b", name: "B", organizationId: "org_b", role: "owner" }
  });
  check(
    "같은 이메일이 두 조직에 있으면 fail-closed",
    (await findUserMembershipByEmail(prisma, "owner@a.example.com")) === null,
  );
  // 아래 최소권한 역할 검사에서 쓸, 조직이 하나뿐인 사용자.
  await prisma.user.create({
    data: { email: "solo@a.example.com", id: "user_solo", name: "Solo", organizationId: "org_a", role: "owner" }
  });

  // ---- 3) Vercel 에 둘 최소권한 역할이 실제로 막는가 ----
  // 운영에 적용할 SQL 을 그대로 돌린다. 비밀번호만 이 실행용으로 바꾼다.
  const roleSqlText = execFileSync("cat", [roleSql], { encoding: "utf8" }).replace(
    "'CHANGE_ME'",
    `'${webRolePassword}'`,
  );
  psql(["-c", roleSqlText]);

  const asWebRole = (sql) =>
    execFileSync("psql", [webRoleUrl, "-qXAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      encoding: "utf8",
      stdio: "pipe"
    });
  const deniedBy = (sql) => {
    try {
      asWebRole(sql);
      return null;
    } catch (error) {
      return `${error.stderr ?? ""}`;
    }
  };

  check(
    "최소권한 역할이 대시보드 테이블은 읽음",
    asWebRole('select count(*) from "Site"').trim() === "3",
    asWebRole('select count(*) from "Site"').trim(),
  );
  const credentialDenied = deniedBy('select count(*) from "ProviderAccount"');
  check(
    "credential 테이블은 권한 거부",
    credentialDenied !== null && /permission denied/i.test(credentialDenied),
    credentialDenied,
  );
  const connectorDenied = deniedBy('select count(*) from "ConnectorOAuthCredential"');
  check(
    "레거시 커넥터 credential 테이블도 권한 거부",
    connectorDenied !== null && /permission denied/i.test(connectorDenied),
    connectorDenied,
  );
  const writeDenied = deniedBy(`update "Site" set name = 'hacked' where id = 'site_a1'`);
  check(
    "쓰기는 권한 거부",
    writeDenied !== null && /permission denied/i.test(writeDenied),
    writeDenied,
  );

  // 그리고 그 역할로 Prisma 를 붙여도 대시보드는 정상 동작해야 한다 — 권한을 조인 하나
  // 때문에 더 열어야 하는 상황이면 여기서 걸린다.
  process.env.DATABASE_URL = webRoleUrl;
  webPrisma = createSearchOpsPrismaClient();
  const readonlySnapshot = await loadSiteDashboardSnapshot(webPrisma, {
    organizationId: "org_a",
    siteId: "site_a1"
  });
  // 소속 조회도 이 역할로 돼야 한다. 안 되면 운영에서 로그인 자체가 실패한다.
  // GRANT 가 빠지면 Prisma 가 던지므로, 스택트레이스 대신 실패한 검사로 보이게 잡는다.
  const readonlyMembership = await findUserMembershipByEmail(webPrisma, "solo@a.example.com").catch(
    (error) => ({ error: String(error).slice(0, 120) }),
  );
  check(
    "최소권한 역할로도 스냅샷 전체가 조회됨",
    readonlySnapshot !== null &&
      readonlySnapshot.seoIssues.length === 1 &&
      readonlySnapshot.workOrders.length === 1 &&
      readonlySnapshot.schemaRecommendations.length === 1,
    readonlySnapshot === null ? null : {
      issues: readonlySnapshot.seoIssues.length,
      recs: readonlySnapshot.schemaRecommendations.length,
      workOrders: readonlySnapshot.workOrders.length
    },
  );

  check(
    "최소권한 역할로도 조직 소속 조회가 됨 (로그인 경로)",
    readonlyMembership?.organizationId === "org_a",
    readonlyMembership,
  );
  // 이름·가입일까지 열리면 컬럼 단위 GRANT 가 무너진 것이다.
  const nameDenied = deniedBy('select "name" from "User" limit 1');
  check(
    "User 의 불필요한 컬럼은 여전히 거부",
    nameDenied !== null && /permission denied/i.test(nameDenied),
    nameDenied,
  );

  console.log(
    failures === 0
      ? "\n웹 직접 DB 경로 검증 통과 — API 없이 실데이터가 그려지고, 권한은 대시보드 밖으로 나가지 않는다."
      : `\n실패 ${failures}건`,
  );
} finally {
  await prisma?.$disconnect().catch(() => {});
  await webPrisma?.$disconnect().catch(() => {});
  if (keep) {
    console.log(`(--keep) 임시 DB 유지: ${dbUrl}`);
  } else {
    dropDb();
  }
}

process.exit(failures === 0 ? 0 : 1);
