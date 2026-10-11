import { describe, expect, it } from "vitest";

import { createPrismaRepository } from "./prisma-repository.js";

/**
 * prisma 경로는 지금까지 테스트가 0건이었다. 인메모리 레포(repository.ts)만 server.test.ts 가
 * 덮기 때문에, prisma 쪽이 필드를 떨어뜨려도 타입체크·테스트가 전부 통과한다 —
 * rulesVersion 이 실제로 그렇게 유실됐다(적합성 룰로 평가한 리포트가 DB 에 NULL 로 저장되고
 * 진단서가 "구버전 룰로 계산됐습니다" 라는 거짓을 고지했다).
 */
describe("prisma 레포 — AEO 리포트 저장", () => {
  it("rulesVersion 을 DB 로 넘긴다", async () => {
    const created: Record<string, unknown>[] = [];
    const now = new Date("2026-10-09T00:00:00.000Z");
    const prisma = {
      site: {
        async findUnique() {
          return { id: "site_1", organizationId: "org_1" };
        }
      },
      keyword: {
        async findFirst() {
          return { id: "kw_1", siteId: "site_1" };
        },
        async create() {
          return { id: "kw_1", siteId: "site_1" };
        }
      },
      aeoReadinessReport: {
        async create(args: { data: Record<string, unknown> }) {
          created.push(args.data);
          return {
            ...args.data,
            id: "aeo_1",
            createdAt: now,
            evaluatedAt: now
          };
        }
      }
    };

    const repository = createPrismaRepository(prisma as never);
    await repository.createAeoReadinessReport("site_1", {
      keywordId: "kw_1",
      readinessReport: {
        keyword: {
          siteId: "site_1",
          phrase: "보톡스 가격",
          locale: "ko-KR",
          language: "ko",
          country: "KR",
          intent: null,
          source: "manual"
        },
        pageUrl: "https://example-clinic.com/botox",
        status: "not_ready",
        score: 31,
        checks: [
          {
            checkId: "PAGE_ANSWERS_QUESTION",
            status: "fail",
            score: 0,
            evidence: {
              url: "https://example-clinic.com/botox",
              observedValue: [],
              expectedValue: "Question-form heading or answer block covering the keyword",
              sourceField: "questionHeadings"
            }
          }
        ],
        generatedBy: "deterministic",
        rulesVersion: "2",
        evaluatedAt: "2026-10-09T00:00:00.000Z"
      }
    });

    expect(created[0]).toMatchObject({ rulesVersion: "2" });
  });
});
