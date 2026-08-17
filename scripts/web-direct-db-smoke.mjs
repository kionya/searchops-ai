#!/usr/bin/env node
// API 없이 웹이 실데이터를 그리는 경로를 검증한다.
//
// 웹의 모든 사이트 화면은 @searchops/db 의 loadSiteDashboardSnapshot 하나로 모인다.
// 그 함수가 (1) 실데이터를 제대로 돌려주고 (2) 조직 스코프를 절대 벗어나지 않는지,
// 그리고 (3) Vercel 에 둘 최소권한 역할이 credential 테이블과 허용되지 않은 쓰기를 막으면서
// (4) 허용된 두 쓰기(사이트 등록·지시서 상태 이동)는 실제로 되는지를 진짜 Postgres 위에서
// 확인한다. "막힌다" 만 보면 권한을 너무 좁혀 기능이 죽은 것을 못 잡는다.
//
// 실행: pnpm smoke:web-db   (psql/createdb/dropdb 필요)

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbDist = resolve(here, "../packages/db/dist/index.js");
const roleSql = resolve(here, "sql/web-role.sql");

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
const webRolePassword = "smoke-web-role";
const webRoleUrl = `postgresql://searchops_web:${webRolePassword}@${pgHost}:${pgPort}/${dbName}`;

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
    loadSiteDashboardSnapshot,
    registerOrganizationSite,
    updateOrganizationWorkOrderStatus
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

  // ⚠️ 와일드카드 주입. Prisma 의 mode:"insensitive" 는 ILIKE 로 컴파일되고 값이 그대로
  // 바인딩되므로 % 와 _ 가 패턴 문자로 동작한다. 한 행만 맞히는 좁은 패턴이면
  // "1건이 아니면 거부" 가드도 통과해 남의 조직 소속을 얻는다.
  // _ 는 이메일에 쓸 수 있는 문자라 어떤 주소 검증기도 막지 못한다.
  await prisma.user.create({
    data: { email: "victim@corp.example.com", id: "user_victim", name: "V", organizationId: "org_b", role: "owner" }
  });
  check(
    "와일드카드 % 로 남의 조직을 얻지 못한다",
    (await findUserMembershipByEmail(prisma, "%@corp.example.com")) === null,
    await findUserMembershipByEmail(prisma, "%@corp.example.com"),
  );
  check(
    "와일드카드 _ 로 남의 조직을 얻지 못한다",
    (await findUserMembershipByEmail(prisma, "______@corp.example.com")) === null,
    await findUserMembershipByEmail(prisma, "______@corp.example.com"),
  );
  // 비악의적 변종: _ 가 든 정상 주소가 다른 조직의 유사 주소로 잘못 매칭되면 안 된다.
  check(
    "밑줄이 든 정상 주소가 남의 행으로 새지 않는다",
    (await findUserMembershipByEmail(prisma, "v_ctim@corp.example.com")) === null,
    await findUserMembershipByEmail(prisma, "v_ctim@corp.example.com"),
  );
  check(
    "정확히 일치하는 주소는 여전히 찾는다",
    (await findUserMembershipByEmail(prisma, "victim@corp.example.com"))?.organizationId === "org_b",
  );
  // 아래 최소권한 역할 검사에서 쓸, 조직이 하나뿐인 사용자.
  await prisma.user.create({
    data: { email: "solo@a.example.com", id: "user_solo", name: "Solo", organizationId: "org_a", role: "owner" }
  });

  // ---- 3) Vercel 에 둘 최소권한 역할이 실제로 막는가 ----
  // 운영에 적용할 SQL 을 그대로 돌린다. 비밀번호만 이 실행용으로 바꾼다.
  // 역할 SQL 은 비밀번호를 psql 변수로 받는다(파일에 기본값을 두지 않는다).
  // 운영에서 쓰는 것과 같은 파일을 같은 방식으로 실행해야 검증에 의미가 있다.
  execFileSync(
    "psql",
    [dbUrl, "-qXAt", "-v", "ON_ERROR_STOP=1", "-v", `web_password=${webRolePassword}`, "-f", roleSql],
    { encoding: "utf8" },
  );

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
  // 이 역할은 정확히 두 가지 쓰기만 할 수 있다. 나머지는 전부 막혀 있어야 한다.
  // 아래 네 개가 그 경계다 — 하나라도 뒤집히면 GRANT 를 잘못 넓힌 것이다.
  const siteUpdateDenied = deniedBy(`update "Site" set name = 'hacked' where id = 'site_a1'`);
  check(
    "이미 등록된 Site 의 수정은 권한 거부",
    siteUpdateDenied !== null && /permission denied/i.test(siteUpdateDenied),
    siteUpdateDenied,
  );
  const siteDeleteDenied = deniedBy(`delete from "Site" where id = 'site_a1'`);
  check(
    "Site 삭제는 권한 거부",
    siteDeleteDenied !== null && /permission denied/i.test(siteDeleteDenied),
    siteDeleteDenied,
  );
  const workOrderTitleDenied = deniedBy(`update "WorkOrder" set title = 'hacked'`);
  check(
    "WorkOrder 의 status 외 컬럼 수정은 권한 거부",
    workOrderTitleDenied !== null && /permission denied/i.test(workOrderTitleDenied),
    workOrderTitleDenied,
  );
  const issueWriteDenied = deniedBy(`update "SeoIssue" set status = 'resolved'`);
  check(
    "SeoIssue 쓰기는 권한 거부",
    issueWriteDenied !== null && /permission denied/i.test(issueWriteDenied),
    issueWriteDenied,
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

  // ---- 4) 허용된 두 쓰기가 그 역할로 실제로 되는가 ----
  // 위에서 "막힌다"만 확인하면, 권한을 너무 좁혀 기능이 죽은 것을 못 잡는다.
  // 웹이 실제로 부르는 함수를 웹의 역할로 그대로 돌린다.
  const registered = await registerOrganizationSite(webPrisma, {
    country: "KR",
    domain: "new.example.com",
    industry: "medical",
    language: "ko",
    name: "새 사이트",
    organizationId: "org_a"
  }).catch((error) => ({ error: String(error).slice(0, 160) }));
  check("최소권한 역할로 사이트 등록이 됨", registered?.domain === "new.example.com", registered);
  check(
    "등록된 사이트의 조직이 호출자 조직으로 고정됨",
    registered?.organizationId === "org_a",
    registered?.organizationId,
  );

  // 같은 도메인을 다시 등록해도 실패하지 않고 같은 행이 돌아와야 한다(폼 두 번 제출).
  const registeredAgain = await registerOrganizationSite(webPrisma, {
    country: "KR",
    domain: "new.example.com",
    industry: "other",
    language: "en",
    name: "덮어쓰기 시도",
    organizationId: "org_a"
  }).catch((error) => ({ error: String(error).slice(0, 160) }));
  check("같은 도메인 재등록은 기존 행을 그대로 돌려줌", registeredAgain?.id === registered?.id, {
    again: registeredAgain?.id,
    first: registered?.id
  });
  check(
    "재등록이 기존 값을 덮어쓰지 않음",
    registeredAgain?.name === "새 사이트" && registeredAgain?.language === "ko",
    { language: registeredAgain?.language, name: registeredAgain?.name },
  );

  const moved = await updateOrganizationWorkOrderStatus(webPrisma, {
    organizationId: "org_a",
    status: "done",
    workOrderId: "wo_a1"
  }).catch((error) => ({ error: String(error).slice(0, 160) }));
  check("최소권한 역할로 지시서 상태 변경이 됨", moved === true, moved);
  check(
    "변경이 실제로 저장됨",
    asWebRole(`select status from "WorkOrder" where id = 'wo_a1'`).trim() === "done",
    asWebRole(`select status from "WorkOrder" where id = 'wo_a1'`).trim(),
  );

  // 남의 조직 지시서는 id 를 알아도 못 바꾼다. 조직 조건이 UPDATE 문 안에 있어서다.
  const foreignMove = await updateOrganizationWorkOrderStatus(webPrisma, {
    organizationId: "org_b",
    status: "blocked",
    workOrderId: "wo_a1"
  }).catch((error) => ({ error: String(error).slice(0, 160) }));
  check("남의 조직 지시서는 상태가 안 바뀜", foreignMove === false, foreignMove);
  check(
    "남의 조직 시도 후에도 값이 그대로",
    asWebRole(`select status from "WorkOrder" where id = 'wo_a1'`).trim() === "done",
    asWebRole(`select status from "WorkOrder" where id = 'wo_a1'`).trim(),
  );

  // 상태 문자열은 열거형 밖으로 나갈 수 없다. DB 의 status 는 그냥 text 라
  // 오타가 들어가면 보드의 어느 칼럼에도 안 잡히고 조용히 사라진다.
  const badStatus = await updateOrganizationWorkOrderStatus(webPrisma, {
    organizationId: "org_a",
    status: "shipped",
    workOrderId: "wo_a1"
  }).then(
    () => "저장됨",
    () => "거부됨",
  );
  check("허용되지 않은 상태 문자열은 거부", badStatus === "거부됨", badStatus);

  console.log(
    failures === 0
      ? "\n웹 직접 DB 경로 검증 통과 — API 없이 실데이터를 읽고 쓴다. 권한은 허용된 두 쓰기 밖으로 나가지 않는다."
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
