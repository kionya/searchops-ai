#!/usr/bin/env node
// Multi-tenant provider credential 경로를 "실행 주체가 붙었다고 가정하고" 검증한다.
//
// 왜 필요한가: 이 시스템의 유닛 테스트는 전부 인메모리 페이크다. 실제 Postgres,
// 실제 Prisma 마이그레이션, 실제 AES-256-GCM 위에서 돌아본 적이 없다. 운영에서는
// 커넥터 동기화를 실행하는 주체가 없어(배치는 크롤만 한다) 영영 검증되지 않는다.
// 여기서 그 주체를 흉내내 Task 14 의 4~5번(backfill 검증, 사이트별 resource isolation)을
// 배포 없이 돌린다.
//
// 외부 API 는 호출하지 않는다. 리졸버가 credential 을 복호화해 provider config 를
// 조립하는 지점까지가 검증 범위이며, 그 앞은 어댑터(별도 테스트)의 몫이다.
//
// 실행: pnpm smoke:credential   (psql/createdb/dropdb 필요)

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 워크스페이스 패키지는 레포 루트에서 이름으로 해석되지 않는다(richdoc-smoke 와 같은 이유).
// 빌드 산출물을 경로로 직접 임포트한다.
const here = dirname(fileURLToPath(import.meta.url));
const dbDist = resolve(here, "../packages/db/dist/index.js");
const resolverDist = resolve(here, "../apps/worker/dist/provider-credential-resolver.js");

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

const dbName = `credential_smoke_${process.pid}`;
// createdb/dropdb 는 libpq 표준 환경변수(PGHOST/PGUSER/...)를 알아서 읽지만 Prisma 는
// 호스트/사용자를 URL 에 명시해야 한다(안 하면 P1010). 같은 값으로 조립해 둘이 반드시
// 같은 DB 를 가리키게 한다 — 로컬은 peer 인증, CI 는 비밀번호 인증으로 갈린다.
const pgUser = process.env.PGUSER ?? process.env.USER ?? "postgres";
const pgAuth = process.env.PGPASSWORD
  ? `${encodeURIComponent(pgUser)}:${encodeURIComponent(process.env.PGPASSWORD)}`
  : encodeURIComponent(pgUser);
const dbUrl =
  process.env.SEARCHOPS_SMOKE_DATABASE_URL ??
  `postgresql://${pgAuth}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? 5432}/${dbName}`;
const dropDb = () => execFileSync("dropdb", ["--force", "--if-exists", dbName], { encoding: "utf8" });

execFileSync("createdb", [dbName], { encoding: "utf8" });

let prisma;
try {
  // 1) 스키마가 실제로 배포되는지 — Task 14 의 "production migration" 단계와 같은 명령이다.
  execFileSync(
    "corepack",
    ["pnpm", "--filter", "@searchops/db", "exec", "prisma", "migrate", "deploy"],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: dbUrl, DIRECT_DATABASE_URL: dbUrl },
      stdio: "pipe"
    },
  );
  check("prisma migrate deploy 성공 (ProviderAccount/SiteConnector 스키마 배포)", true);

  const {
    createPrismaConnectorSyncPersistenceClient,
    createPrismaProviderCredentialStore,
    createSearchOpsPrismaClient,
    deriveCanonicalProviderAccountId,
    encryptProviderCredential,
    parseCredentialKeyring
  } = await import(dbDist);
  const { createDbProviderCredentialResolverStore, createProviderCredentialResolver } =
    await import(resolverDist);

  // createSearchOpsPrismaClient 는 인자를 받지 않고 schema.prisma 의 env("DATABASE_URL")
  // 를 그대로 쓴다 — 운영과 같은 경로를 타려면 여기서 env 를 세팅한다.
  process.env.DATABASE_URL = dbUrl;
  process.env.DIRECT_DATABASE_URL = dbUrl;
  prisma = createSearchOpsPrismaClient();

  // 2) 실제 키링 — 운영과 같은 파서를 쓴다.
  const activeKey = randomBytes(32).toString("base64");
  const keyring = parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: activeKey,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "smoke-key-1"
  });
  check("키링 파싱 (AES-256-GCM 활성 키)", keyring !== undefined && keyring.activeKeyId === "smoke-key-1");

  // 3) 두 조직 / 세 사이트. 같은 조직 안의 두 사이트가 서로 다른 GSC 속성을 봐야 하고,
  //    다른 조직은 아예 닿으면 안 된다.
  const seed = async (orgId, orgName, sites) => {
    await prisma.organization.create({ data: { id: orgId, name: orgName } });
    await prisma.user.create({
      data: { id: `${orgId}_user`, organizationId: orgId, email: `${orgId}@smoke.test`, name: "smoke", role: "owner" }
    });
    for (const site of sites) {
      await prisma.site.create({
        data: {
          id: site.id,
          organizationId: orgId,
          domain: site.domain,
          name: site.domain,
          industry: "other",
          language: "ko",
          country: "KR"
        }
      });
    }
  };
  await seed("org_a", "조직 A", [
    { id: "site_a1", domain: "a1.example.com" },
    { id: "site_a2", domain: "a2.example.com" }
  ]);
  await seed("org_b", "조직 B", [{ id: "site_b1", domain: "b1.example.com" }]);

  const store = createPrismaProviderCredentialStore(prisma);

  // 4) 암호화된 Google 계정을 조직마다 하나씩. 토큰 만료를 먼 미래로 두어 refresh 경로를
  //    타지 않게 한다(refresh 는 외부 호출이라 이 검증기의 범위 밖이다).
  const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  // providerAccountId 는 임의 값이 아니라 (조직, provider, 외부계정) 에서 파생된 canonical id
  // 여야 한다. 스토어가 불일치를 거부하므로 운영과 같은 파생 함수를 쓴다.
  const createGoogleAccount = async (orgId, label, accessToken) => {
    const externalAccountId = `ext-${label}`;
    const providerAccountId = deriveCanonicalProviderAccountId({
      externalAccountId,
      organizationId: orgId,
      provider: "google"
    });
    const encryptedCredential = encryptProviderCredential(
      keyring,
      { organizationId: orgId, provider: "google", providerAccountId },
      { kind: "oauth2", accessToken, refreshToken: `${accessToken}-refresh`, tokenType: "Bearer" },
    );
    await store.upsertGoogleAccount({
      accountEmail: `${label}@smoke.test`,
      allowedConnectorProviders: ["gsc", "ga4"],
      connectedByUserId: `${orgId}_user`,
      displayName: label,
      encryptedCredential,
      expectedUpdatedAt: null,
      externalAccountId,
      organizationId: orgId,
      providerAccountId,
      // 스토어가 provider 별 필수 scope 를 강제한다(gsc=webmasters, ga4=analytics).
      scopes: [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly"
      ],
      status: "connected",
      tokenExpiresAt: farFuture
    });
    return providerAccountId;
  };
  const acctA = await createGoogleAccount("org_a", "acct_a", "token-org-a");
  const acctB = await createGoogleAccount("org_b", "acct_b", "token-org-b");

  // 저장된 것이 평문이 아님을 DB 에서 직접 확인한다. ORM 을 거치지 않고 컬럼을 그대로 읽는다.
  const [rawAccount] = await prisma.$queryRaw`
    select "credentialCiphertext" || "credentialIv" || "credentialAuthTag" as blob,
           "encryptionKeyId" as key_id
    from "ProviderAccount" where id = ${acctA}
  `;
  check(
    "credential 이 DB 에 평문으로 남지 않음",
    typeof rawAccount?.blob === "string" &&
      rawAccount.blob.length > 0 &&
      !rawAccount.blob.includes("token-org-a"),
  );
  check("암호화 키 id 가 함께 저장됨 (로테이션 전제)", rawAccount?.key_id === "smoke-key-1", rawAccount?.key_id);

  // 5) 사이트별 resource binding — 같은 계정, 다른 속성.
  const bind = (orgId, siteId, provider, accountId, resourceId) =>
    store.upsertSiteConnector({
      externalResourceId: resourceId,
      organizationId: orgId,
      provider,
      providerAccountId: accountId,
      siteId,
      status: "connected"
    });
  await bind("org_a", "site_a1", "gsc", acctA, "sc-domain:a1.example.com");
  await bind("org_a", "site_a2", "gsc", acctA, "sc-domain:a2.example.com");
  await bind("org_a", "site_a1", "ga4", acctA, "properties/111");
  await bind("org_b", "site_b1", "gsc", acctB, "sc-domain:b1.example.com");

  // 6) 운영 워커가 만드는 것과 같은 리졸버. fetch 는 호출되면 즉시 실패시켜
  //    "외부 호출 없이 해결된다"는 사실 자체를 검증 대상으로 만든다.
  const buildResolver = (storageMode) =>
    createProviderCredentialResolver({
      fetch: async () => {
        throw new Error("smoke: 외부 호출이 발생했다");
      },
      keyring,
      storageMode,
      store: createDbProviderCredentialResolverStore(
        createPrismaConnectorSyncPersistenceClient(prisma),
      )
    });
  const resolver = buildResolver("encrypted");

  const job = (organizationId, siteId, siteDomain, providers) => ({
    connectorSyncRunId: `run_${siteId}`,
    fetchedAt: new Date().toISOString(),
    organizationId,
    providers,
    requestedByUserId: `${organizationId}_user`,
    siteDomain,
    siteId
  });

  const a1 = await resolver.resolveConnectorProviderConfigs(
    job("org_a", "site_a1", "a1.example.com", ["gsc", "ga4"]),
  );
  const a2 = await resolver.resolveConnectorProviderConfigs(
    job("org_a", "site_a2", "a2.example.com", ["gsc"]),
  );

  check("복호화된 access token 이 리졸버까지 도달", a1.configs.gsc?.credential.accessToken === "token-org-a", a1.configs.gsc?.credential.accessToken);
  check("credentialSource = encrypted", a1.credentialSources.gsc === "encrypted", a1.credentialSources.gsc);
  check("gsc 실패 없음", a1.failures.gsc === undefined, a1.failures.gsc);
  check("ga4 도 같은 계정에서 해결", a1.configs.ga4?.propertyId === "properties/111", a1.configs.ga4?.propertyId);

  // 이게 Task 14 의 5번 — 같은 조직·같은 계정이라도 사이트마다 다른 속성을 봐야 한다.
  check(
    "사이트별 resource isolation (a1 ≠ a2)",
    a1.configs.gsc?.propertyId === "sc-domain:a1.example.com" &&
      a2.configs.gsc?.propertyId === "sc-domain:a2.example.com",
    { a1: a1.configs.gsc?.propertyId, a2: a2.configs.gsc?.propertyId },
  );

  // 7) 테넌트 격리 fail-closed — 조직 B 가 조직 A 의 사이트를 요청.
  const crossTenant = await resolver.resolveConnectorProviderConfigs(
    job("org_b", "site_a1", "a1.example.com", ["gsc"]),
  );
  check(
    "타 조직 사이트 요청은 fail-closed (config 없음)",
    crossTenant.configs.gsc === undefined && crossTenant.failures.gsc !== undefined,
    { configs: crossTenant.configs, failures: crossTenant.failures },
  );

  // 조직 B 의 자기 사이트는 자기 토큰으로 해결돼야 한다 — 위가 그냥 다 막는 게 아님을 보인다.
  const b1 = await resolver.resolveConnectorProviderConfigs(
    job("org_b", "site_b1", "b1.example.com", ["gsc"]),
  );
  check("조직 B 는 자기 토큰으로 해결", b1.configs.gsc?.credential.accessToken === "token-org-b", b1.configs.gsc?.credential.accessToken);

  // 8) binding 이 없는 provider 는 encrypted 모드에서 조용히 성공하면 안 된다.
  const unbound = await resolver.resolveConnectorProviderConfigs(
    job("org_a", "site_a2", "a2.example.com", ["ga4"]),
  );
  check(
    "binding 없는 provider 는 실패로 보고 (조용한 성공 금지)",
    unbound.configs.ga4 === undefined && unbound.failures.ga4 !== undefined,
    { configs: unbound.configs, failures: unbound.failures },
  );

  // 9) 키 로테이션 — 이전 키로 암호화된 credential 이 previous keys 로 계속 열려야 한다.
  //    운영 전환 시 키를 갈면 여기서 막히는지가 관건이다.
  const rotatedKey = randomBytes(32).toString("base64");
  const rotatedKeyring = parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: rotatedKey,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "smoke-key-2",
    // 형식은 배열이 아니라 { keyId: keyMaterial } 객체다.
    SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: JSON.stringify({ "smoke-key-1": activeKey })
  });
  const rotatedResolver = createProviderCredentialResolver({
    fetch: async () => {
      throw new Error("smoke: 외부 호출이 발생했다");
    },
    keyring: rotatedKeyring,
    storageMode: "encrypted",
    store: createDbProviderCredentialResolverStore(
      createPrismaConnectorSyncPersistenceClient(prisma),
    )
  });
  const rotated = await rotatedResolver.resolveConnectorProviderConfigs(
    job("org_a", "site_a1", "a1.example.com", ["gsc"]),
  );
  check("키 로테이션 후에도 이전 키 credential 복호화", rotated.configs.gsc?.credential.accessToken === "token-org-a", rotated.configs.gsc?.credential.accessToken);

  // 10) 이전 키를 뺀 키링은 열지 못해야 한다 — 9번이 그냥 암호화를 무시한 게 아님을 보인다.
  const strandedKeyring = parseCredentialKeyring({
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: rotatedKey,
    SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "smoke-key-2"
  });
  const strandedResolver = createProviderCredentialResolver({
    fetch: async () => {
      throw new Error("smoke: 외부 호출이 발생했다");
    },
    keyring: strandedKeyring,
    storageMode: "encrypted",
    store: createDbProviderCredentialResolverStore(
      createPrismaConnectorSyncPersistenceClient(prisma),
    )
  });
  const stranded = await strandedResolver.resolveConnectorProviderConfigs(
    job("org_a", "site_a1", "a1.example.com", ["gsc"]),
  );
  check(
    "이전 키가 빠지면 복호화 실패 (암호화가 실제로 걸려 있음)",
    stranded.configs.gsc === undefined && stranded.failures.gsc !== undefined,
    { configs: stranded.configs, failures: stranded.failures },
  );

  console.log(
    failures === 0
      ? "\ncredential 경로 검증 통과 — 실행 주체만 붙이면 동작한다."
      : `\n실패 ${failures}건`,
  );
} finally {
  await prisma?.$disconnect().catch(() => {});
  if (keep) {
    console.log(`(--keep) 임시 DB 유지: ${dbUrl}`);
  } else {
    dropDb();
  }
}

process.exit(failures === 0 ? 0 : 1);
