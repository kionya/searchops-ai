// 상시 워커 없이 커넥터 동기화(GSC/GA4/Bing/PageSpeed)를 한 번 돌리고 끝내는 배치
// 진입점. GitHub Actions cron 이 실행한다. batch-crawl.ts 와 같은 구조다.
//
// 왜 필요한가: API 는 "지금 동기화" 를 눌렀을 때 BullMQ 큐에 넣기만 한다. 큐를 소비하는
// 워커를 상시 띄우지 않으면 그 작업은 영원히 대기한다. 여기서 큐를 우회하고
// processAndPersistConnectorSyncJob 을 직접 불러, 워커 없이도 매일 데이터가 들어오게 한다.
//
// Redis 를 쓰지 않는다. 그래서 두 가지를 지켜야 한다:
//   - ./runtime.js 를 임포트하지 않는다 (최상단에서 bullmq 를 끌고 온다)
//   - parseSearchOpsEnv 를 쓰지 않는다 (REDIS_URL 을 필수로 요구해 즉시 죽는다)
//
// ⚠️ 이 프로세스에는 SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY 가 필요하다. 연동 토큰이
// 그 키로 암호화돼 있기 때문이다. GitHub Secret 으로 준다 — 이미 DATABASE_URL 과
// richdoc service_role 키를 갖고 있어 신뢰 경계가 같다. 웹(Vercel)에는 여전히 두지 않는다.

import { randomUUID } from "node:crypto";

import {
  createPrismaConnectorSyncPersistenceClient,
  createConnectorSyncRun,
  createSearchOpsPrismaClient,
  parseCredentialKeyring
} from "@searchops/db";
import {
  ConnectorProviderSchema,
  CredentialStorageModeSchema,
  type ConnectorProvider
} from "@searchops/types";

import { processAndPersistConnectorSyncJob } from "./processor.js";

// 모드가 없거나 오타면 복호화 경로가 통째로 꺼진 채 "성공" 으로 끝난다. 값까지 검증해 끊는다.
const storageMode = CredentialStorageModeSchema.safeParse(
  process.env.SEARCHOPS_CREDENTIAL_STORAGE_MODE,
);

async function main(): Promise<void> {
  if (!storageMode.success) {
    console.error(
      "[batch-connector-sync] SEARCHOPS_CREDENTIAL_STORAGE_MODE 가 없거나 값이 잘못됐다(encrypted 또는 dual). 연동 토큰을 복호화할 수 없어 아무것도 못 한다."
    );
    process.exitCode = 2;
    return;
  }

  let credentialKeyring;
  try {
    credentialKeyring = parseCredentialKeyring(process.env);
  } catch (error) {
    // 키가 틀리면 사이트마다 같은 실패가 반복된다. 시작할 때 한 번에 끊는다.
    console.error("[batch-connector-sync] 자격증명 키링을 읽지 못했다.", error);
    process.exitCode = 2;
    return;
  }

  const prisma = createSearchOpsPrismaClient();
  try {
    // 계정과 리소스가 모두 지정된 커넥터만 대상이다. needs_configuration 상태는
    // 사용자가 아직 연결을 안 끝낸 것이라 돌려봐야 실패만 쌓인다.
    const connectors = await prisma.siteConnector.findMany({
      orderBy: [{ siteId: "asc" }, { provider: "asc" }],
      select: {
        organizationId: true,
        provider: true,
        site: { select: { domain: true } },
        siteId: true
      },
      where: {
        externalResourceId: { not: null },
        status: { notIn: ["needs_configuration", "disabled"] }
      }
    });

    if (connectors.length === 0) {
      console.log("[batch-connector-sync] 설정된 커넥터가 없다. 할 일 없음.");
      return;
    }

    // 사이트 단위로 한 번씩 돈다. 커넥터마다 따로 돌리면 같은 사이트에 ConnectorSyncRun
    // 이 여러 개 생기고, 화면의 동기화 이력이 실제 실행 횟수와 어긋난다.
    const bySite = new Map<
      string,
      { organizationId: string; providers: ConnectorProvider[]; siteDomain: string; siteId: string }
    >();
    for (const connector of connectors) {
      // DB 의 provider 는 그냥 text 다. 계약에 없는 값이 들어 있으면 payload 파싱이
      // 통째로 던져서 그 사이트 전체가 동기화되지 않는다. 모르는 값만 버리고 간다.
      const parsed = ConnectorProviderSchema.safeParse(connector.provider);
      if (!parsed.success) {
        console.error(
          `[batch-connector-sync] 알 수 없는 provider 를 건너뛴다: ${connector.provider} (site=${connector.siteId})`
        );
        continue;
      }
      const existing = bySite.get(connector.siteId);
      if (existing === undefined) {
        bySite.set(connector.siteId, {
          organizationId: connector.organizationId,
          providers: [parsed.data],
          siteDomain: connector.site.domain,
          siteId: connector.siteId
        });
        continue;
      }
      existing.providers.push(parsed.data);
    }

    const persistenceClient = createPrismaConnectorSyncPersistenceClient(prisma);
    const processorOptions = {
      bingApiKey: process.env.SEARCHOPS_BING_API_KEY,
      credentialKeyring,
      credentialStorageMode: storageMode.data,
      ga4PropertyId: process.env.SEARCHOPS_GA4_PROPERTY_ID,
      googleOAuthClientId: process.env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID,
      googleOAuthClientSecret: process.env.SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET,
      // 배치의 존재 이유가 실제 외부 API 호출이다. disabled 면 픽스처만 쓰고 끝난다.
      liveExternalApis: "enabled" as const,
      pagespeedApiKey: process.env.SEARCHOPS_PAGESPEED_API_KEY
    };

    let failures = 0;
    for (const target of bySite.values()) {
      const payload = {
        connectorSyncRunId: randomUUID(),
        fetchedAt: new Date().toISOString(),
        organizationId: target.organizationId,
        providers: target.providers,
        requestedByUserId: "batch",
        siteDomain: target.siteDomain,
        siteId: target.siteId
      };

      try {
        // ConnectorSyncRun 행이 먼저 있어야 한다. 프로세서가 소유권을 그 행으로 확인하고,
        // 결과 저장도 update 라 행이 없으면 실패 경로까지 같이 터진다.
        await createConnectorSyncRun(persistenceClient, payload);
        const result = await processAndPersistConnectorSyncJob(
          payload,
          persistenceClient,
          processorOptions
        );
        const { failedProviders, okProviders, partialProviders } = result.summary;
        console.log(
          `[batch-connector-sync] ${target.siteDomain} ok=${okProviders} partial=${partialProviders} failed=${failedProviders} providers=${target.providers.join(",")}`
        );
        // provider 하나만 실패해도 그 데이터는 안 들어온다. 초록불로 넘기면
        // "동기화는 도는데 숫자가 안 바뀐다" 를 아무도 모르게 된다.
        if (failedProviders > 0) {
          failures += 1;
        }
      } catch (error) {
        // 한 사이트의 실패가 나머지를 막지 않게 한다.
        failures += 1;
        console.error(`[batch-connector-sync] ${target.siteDomain} 실패`, error);
      }
    }

    if (failures > 0) {
      process.exitCode = 1;
    }
  } finally {
    // 안 하면 Prisma 엔진이 프로세스를 붙잡아 Actions 스텝이 타임아웃까지 매달린다.
    await prisma.$disconnect();
  }
}

await main();
