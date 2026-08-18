#!/usr/bin/env node
// Render/GitHub 에 넣을 DATABASE_URL 을 **API 와 똑같은 방식으로** 검증한다.
//
// psql 로 하는 검증은 조건이 다르다: ?pgbouncer=true 를 떼고 붙어야 하고, 드라이버도
// libpq 다. 여기서는 실제 운영이 쓰는 Prisma 클라이언트로 붙어본다. 배포 왕복(2분)을
// 로컬 10초로 줄이는 게 목적이다.
//
// 실행 (URL 을 복사한 뒤):
//   pbpaste | pnpm check:database-url
//
// 클립보드에서 바로 읽으므로 셸 히스토리에도 화면에도 남지 않는다. 인자로 주면
// 히스토리에 남고, 대화형 프롬프트는 pnpm 을 거치면 입력을 못 받는 경우가 있어
// 쓰지 않는다(실제로 그렇게 막혔다).
//
// 값은 절대 출력하지 않는다. 사용자명(비밀 아님)과 비밀번호의 "모양" 만 낸다.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raw = await readUrlFromStdin();
// 붙여넣기 사고를 흡수한다. 따옴표째 복사하는 일이 잦고, 그러면 URL 파싱부터 실패해
// 정작 접속 문제인지 형식 문제인지 구분이 안 된다.
const url = raw.replace(/^["']|["']$/g, "").trim();
// ⚠️ 정리한 사실 자체를 보고한다. 이 도구는 정리 후 값으로 검사하는데, Render 는
// 붙여넣은 그대로 저장한다. 그래서 여기서 ✅ 가 나와도 Render 에서는 실패할 수 있다 —
// 실제로 그 차이 때문에 배포 왕복을 여러 번 했다.
if (raw.length > 0 && raw !== url) {
  const stray = raw.length - url.length;
  console.log("");
  console.log("⚠️⚠️ 입력에 군더더기 문자가 " + stray + "개 붙어 있다(공백·줄바꿈·따옴표).");
  console.log("     이 도구는 벗겨내고 검사하지만 Render 는 그대로 저장한다.");
  console.log("     Render 입력칸에 붙여넣을 때 그 문자가 같이 들어가면 비밀번호가 달라진다.");
  console.log("     아래 명령으로 정리된 값을 클립보드에 다시 담아라:");
  console.log("       pbpaste | tr -d '\\r\\n' | pbcopy");
}
if (!url) {
  console.error("입력이 없다. 프롬프트가 뜬 뒤에 붙여넣고 Enter 를 눌러라.");
  process.exit(2);
}

describeShape(url);

const clientPath = resolve(import.meta.dirname, "../packages/db/src/generated/prisma/index.js");
let PrismaClient;
try {
  ({ PrismaClient } = await import(pathToFileURL(clientPath).href));
} catch {
  console.error("\nPrisma 클라이언트가 없다. 먼저: corepack pnpm --filter @searchops/db build");
  process.exit(2);
}

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const rows = await prisma.$queryRaw`select current_user, current_database()`;
  console.log("\n============================================");
  console.log("✅ 접속 성공:", JSON.stringify(rows[0]));
  console.log("이 URL 을 그대로 Render 와 GitHub Secret 에 넣으면 된다.");
  console.log("============================================");
} catch (error) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  console.log("\n============================================");
  console.log(`❌ 접속 실패 — 분류: ${classify(text)}`);
  // 원문에는 호스트명이 들어 있다. 앞부분만, 그것도 사유 판단에 필요한 만큼만 낸다.
  console.log(text.replace(/\s+/g, " ").slice(0, 220));
  console.log(`\n${advice(classify(text))}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}

function describeShape(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    console.log("⚠️ URL 로 파싱되지 않는다.");
    // 글자를 전부 x 로 덮은 뼈대만 보여준다. 구두점과 길이가 남아 어디가 깨졌는지는
    // 보이지만 값은 복원할 수 없다.
    console.log("뼈대:", value.replace(/[^:/@?&=.\-_]/g, "x").slice(0, 120));
    return;
  }
  const decoded = decodeURIComponent(parsed.password);
  console.log("\n--- 입력한 URL 의 모양 (값은 출력하지 않음) ---");
  console.log("사용자명      :", parsed.username);
  console.log("호스트/포트   :", `${parsed.hostname}:${parsed.port || "(기본값)"}`);
  console.log("DB            :", parsed.pathname.replace(/^\//, "") || "(없음)");
  console.log("쿼리 옵션     :", [...parsed.searchParams.keys()].join(", ") || "(없음)");
  console.log("비밀번호 길이 :", decoded.length);
  console.log("대괄호 포함   :", /[[\]]/.test(decoded) ? "예 ← 플레이스홀더를 그대로 붙여넣었다" : "아니오");
  console.log("인코딩 필요   :", parsed.password !== encodeURIComponent(decoded) ? "예 ← 특수문자를 인코딩해야 한다" : "아니오");
  if (!parsed.username.includes(".")) {
    console.log("⚠️ 풀러는 사용자명이 `역할명.프로젝트ref` 형식이어야 한다.");
  }
  if (parsed.port !== "6543") {
    console.log("⚠️ 런타임은 트랜잭션 풀러(6543)를 쓴다. 5432 는 마이그레이션용이다.");
  }
  if (!parsed.searchParams.has("pgbouncer")) {
    console.log("⚠️ 트랜잭션 풀러에는 ?pgbouncer=true 가 필요하다.");
  }
}

function classify(text) {
  if (/prepared statement|bind message|PgBouncer|42P05|26000/i.test(text)) return "pgbouncer_option_missing";
  if (/Tenant or user not found|tenant.user .{0,80}not found|ENOIDENTIFIER|no tenant identifier/i.test(text)) return "tenant_not_found";
  if (/authentication failed|denied access|P1000|P1010/i.test(text)) return "auth_failed";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|reach database server|P1001|P1002/i.test(text)) return "unreachable";
  if (/query engine|libquery_engine/i.test(text)) return "engine_missing";
  return "unknown";
}

function advice(reason) {
  return {
    auth_failed: "비밀번호가 틀렸다. Supabase → Settings → Database → Reset database password 로 재설정하고, 영숫자로만 만들어라.",
    engine_missing: "Prisma 클라이언트를 다시 만들어라: corepack pnpm --filter @searchops/db build",
    pgbouncer_option_missing: "URL 끝에 ?pgbouncer=true 를 붙여라.",
    tenant_not_found: "사용자명이 `postgres.<프로젝트ref>` 형식이어야 한다. Supabase 의 Transaction pooler 문자열을 복사해라.",
    unknown: "위 원문을 그대로 공유해라. 호스트명이 포함되니 필요하면 가려도 된다.",
    unreachable: "호스트와 포트를 확인해라. db.<ref>.supabase.co 는 IPv6 전용이라 쓸 수 없다 — pooler.supabase.com:6543 이어야 한다.",
  }[reason];
}

async function readUrlFromStdin() {
  if (process.stdin.isTTY) {
    console.error("URL 을 표준입력으로 넘겨라. 클립보드에 복사한 뒤:");
    console.error("  pbpaste | pnpm check:database-url");
    process.exit(2);
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
