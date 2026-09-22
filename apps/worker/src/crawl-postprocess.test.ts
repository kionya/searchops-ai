import { describe, expect, it } from "vitest";

import {
  deriveQuestionHeadings,
  isMedicalIndustry,
  isQuestionHeading,
  processAndPersistCrawlJob,
  toAeoPageSignal
} from "./processor.js";

const html = `<!doctype html><html lang="ko"><head>
<title>리쥬엘의원 리프팅 안내</title>
<meta name="description" content="리프팅 시술 안내 페이지" />
</head><body>
<h1>리프팅 시술 안내</h1>
<h2>리프팅 시술은 무엇인가요?</h2>
<p>리프팅 시술은 피부 탄력을 위한 시술입니다. 상담 후 진행합니다.</p>
<h2>시술 비용은 얼마인가요</h2>
<p>비용은 상담 시 안내드립니다.</p>
<h2>병원 오시는 길</h2>
<p>지하철 2번 출구에서 도보 3분 거리입니다. 주차 공간이 마련되어 있습니다.</p>
<h2>완치 를 약속드립니다</h2>
<p>이 문장은 의료광고법 검수 대상입니다. 충분한 길이를 확보하기 위한 본문입니다.</p>
</body></html>`;

function createCrawlClient() {
  return {
    crawlRun: {
      async update() {
        return { id: "crawl_1", siteId: "site_1", status: "completed" };
      }
    },
    urlRecord: {
      async upsert() {
        return { id: "url_1" };
      }
    }
  };
}

function createAeoClient(
  keywords: readonly { id: string; phrase: string; locale: string; intent: string | null; purpose: string }[],
) {
  const created: Record<string, unknown>[] = [];
  return {
    created,
    client: {
      keyword: {
        async findMany() {
          return [...keywords];
        }
      },
      aeoReadinessReport: {
        async create(args: { data: Record<string, unknown> }) {
          created.push(args.data);
          return { id: `aeo_${created.length}` };
        }
      }
    }
  };
}

interface FakeComplianceFlag extends Record<string, unknown> {
  id: string;
}

/**
 * prisma 처럼 where 를 실제로 지킨다. fake 가 where 를 무시하면 중복 방지 경로가
 * 검증되지 않는다 — 운영자가 기각한 플래그가 매일 되살아나도 테스트는 초록불이었다.
 */
function createComplianceClient(industry: string | null, locale = { country: "KR", language: "ko" }) {
  const created: FakeComplianceFlag[] = [];
  return {
    created,
    setStatus(id: string, status: string) {
      const flag = created.find((row) => row.id === id);
      if (flag === undefined) {
        throw new Error(`no such flag: ${id}`);
      }
      flag.status = status;
    },
    client: {
      site: {
        async findUnique() {
          return {
            country: locale.country,
            id: "site_1",
            industry,
            language: locale.language,
            organizationId: "org_1"
          };
        }
      },
      complianceFlag: {
        async findMany(args: { where: { siteId: string } }) {
          return created
            .filter((flag) => flag.siteId === args.where.siteId)
            .map((flag) => ({
              id: flag.id,
              ruleId: flag.ruleId as string | null,
              status: flag.status as string,
              url: flag.url as string | null
            }));
        },
        async create(args: { data: Record<string, unknown> }) {
          const flag: FakeComplianceFlag = { ...args.data, id: `flag_${created.length + 1}` };
          created.push(flag);
          return { id: flag.id };
        },
        async update(args: { where: { id: string }; data: Record<string, unknown> }) {
          const flag = created.find((row) => row.id === args.where.id);
          if (flag === undefined) {
            throw new Error(`no such flag: ${args.where.id}`);
          }
          Object.assign(flag, args.data);
          return { id: flag.id };
        }
      }
    }
  };
}

const analysisDefaults = {
  generateSchemaRecommendations: true,
  generateSeoIssues: true,
  generateWorkOrders: true
};

const payload = {
  crawlRunId: "crawl_1",
  maxPages: 5,
  pages: [{ url: "https://example.com/", html, statusCode: 200 }],
  requestedByUserId: "batch",
  siteDomain: "example.com",
  siteId: "site_1",
  startUrl: "https://example.com/"
};

describe("질문형 헤딩 파생 규칙", () => {
  it("물음표를 포함하면 질문형이다", () => {
    expect(isQuestionHeading("리프팅은 아픈가 ?")).toBe(true);
    expect(isQuestionHeading("리프팅 시술은 무엇인가요？")).toBe(true);
  });

  it("한국어 의문 어미로 끝나면 질문형이다", () => {
    for (const heading of [
      "시술 비용은 얼마인가요",
      "회복 기간은 어떻게",
      "재시술은 되나요",
      "부작용이 있나요",
      "가격은 인가요",
      "효과가 있을까",
      "리프팅이 무엇인가",
      "상담은 필요합니까"
    ]) {
      expect(isQuestionHeading(heading), heading).toBe(true);
    }
  });

  it("평서형 헤딩은 질문형이 아니다", () => {
    for (const heading of ["병원 오시는 길", "진료 시간 안내", "리프팅 시술 안내"]) {
      expect(isQuestionHeading(heading), heading).toBe(false);
    }
  });

  // 오탐이 나면 QUESTION_COVERAGE 가 fail→pass 로 뒤집혀 FAQ 0건 페이지가 "ready" 로 저장된다.
  it("평서형 마케팅 헤딩·명사를 질문으로 세지 않는다", () => {
    for (const heading of [
      "전문의가 직접 하니까",
      "10년 경력이니까",
      "보건복지부 인가",
      "정부 인가",
      "인기 가요",
      "함께 가요",
      "이유는 왜",
      "언제나 어디",
      "시술 비용은 얼마"
    ]) {
      expect(isQuestionHeading(heading), heading).toBe(false);
    }
  });

  it("물음표가 있으면 평서형 어미여도 질문형이다", () => {
    expect(isQuestionHeading("전문의가 직접 하니까?")).toBe(true);
    expect(isQuestionHeading("시술 비용은 얼마?")).toBe(true);
  });

  it("빈 헤딩과 중복을 제거하고 순서를 지킨다", () => {
    expect(
      deriveQuestionHeadings(["비용은 얼마인가요", "  ", "병원 안내", "비용은 얼마인가요", "효과는 어떻게"]),
    ).toEqual(["비용은 얼마인가요", "효과는 어떻게"]);
  });
});

describe("크롤 후처리 AEO 준비도", () => {
  it("geo_query 키워드를 제외하고 나머지만 평가·저장한다", async () => {
    const aeo = createAeoClient([
      { id: "kw_1", phrase: "리프팅 가격", locale: "ko-KR", intent: "transactional", purpose: "search_demand" },
      { id: "kw_2", phrase: "리프팅 어디서 받나요", locale: "ko-KR", intent: null, purpose: "geo_query" },
      { id: "kw_3", phrase: "리프팅 효과", locale: "ko-KR", intent: null, purpose: "both" }
    ]);

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      aeoReadinessClient: aeo.client
    });

    expect(aeo.created.map((row) => row.keywordId)).toEqual(["kw_1", "kw_3"]);
    expect(aeo.created[0]).toMatchObject({
      generatedBy: "deterministic",
      pageUrl: "https://example.com/",
      phrase: "리프팅 가격",
      siteId: "site_1"
    });
  });

  it("키워드 1건이 파싱에 실패해도 나머지는 저장된다", async () => {
    const aeo = createAeoClient([
      { id: "kw_bad", phrase: "", locale: "ko-KR", intent: null, purpose: "both" },
      { id: "kw_ok", phrase: "리프팅 효과", locale: "ko-KR", intent: null, purpose: "both" }
    ]);

    const result = await processAndPersistCrawlJob(payload, createCrawlClient(), {
      aeoReadinessClient: aeo.client
    });

    expect(result.status).toBe("completed");
    expect(aeo.created.map((row) => row.keywordId)).toEqual(["kw_ok"]);
  });

  it("generateAeoReadiness=false 면 아무것도 만들지 않는다", async () => {
    const aeo = createAeoClient([
      { id: "kw_1", phrase: "리프팅 효과", locale: "ko-KR", intent: null, purpose: "both" }
    ]);

    await processAndPersistCrawlJob(
      { ...payload, analysis: { ...analysisDefaults, generateAeoReadiness: false } },
      createCrawlClient(),
      { aeoReadinessClient: aeo.client },
    );

    expect(aeo.created).toHaveLength(0);
  });

  it("스냅샷의 h2 에서 질문형 헤딩을 뽑아 AeoPageSignal 로 넘긴다", () => {
    const signal = toAeoPageSignal({
      url: "https://example.com/",
      finalUrl: null,
      title: "제목",
      metaDescription: null,
      robotsMeta: null,
      canonicalUrl: null,
      h1Count: 1,
      h2Count: 2,
      headings: { h1: ["제목"], h2: ["비용은 얼마인가요", "병원 오시는 길"] },
      links: { internal: [], external: [] },
      images: [],
      jsonLd: [],
      indexability: { noindex: false, nofollow: false, canonicalMismatch: false, robotsBlocked: null },
      content: { textLength: 10, wordCount: 3, duplicateHash: "a".repeat(64) }
    });

    expect(signal.h1).toBe("제목");
    expect(signal.h2).toEqual(["비용은 얼마인가요", "병원 오시는 길"]);
    expect(signal.questionHeadings).toEqual(["비용은 얼마인가요"]);
  });
});

describe("크롤 후처리 의료광고법 검수", () => {
  it("의료 사이트는 kr-medical 룰팩이 선택돼 한국어 위반을 잡는다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      complianceFlagClient: compliance.client
    });

    // 한국어 "완치" 는 kr-medical 룰팩에만 있다. 잡혔다면 룰팩 선택이 맞은 것이다.
    expect(compliance.created.map((flag) => flag.ruleId)).toContain("GUARANTEED_RESULT_CLAIM");
    expect(compliance.created[0]).toMatchObject({
      organizationId: "org_1",
      siteId: "site_1",
      status: "open",
      subjectType: "page_copy",
      url: "https://example.com/",
      workOrderId: null
    });
  });

  it("같은 페이지를 다시 크롤해도 같은 (url, ruleId) 플래그가 순증하지 않는다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      complianceFlagClient: compliance.client
    });
    const firstRun = compliance.created.length;
    expect(firstRun).toBeGreaterThan(0);

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      complianceFlagClient: compliance.client
    });

    expect(compliance.created).toHaveLength(firstRun);
  });

  it("본문이 너무 짧은 페이지는 건너뛴다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(
      { ...payload, pages: [{ url: "https://example.com/", html: "<html><body>완치</body></html>", statusCode: 200 }] },
      createCrawlClient(),
      { complianceFlagClient: compliance.client },
    );

    expect(compliance.created).toHaveLength(0);
  });

  // 이 룰은 우리 CMS 초안의 draft-only 게이트다. 남의 공개 페이지에 붙이면 크롤 페이지 수
  // 만큼 critical 이 쌓여(기본 maxPages=25) 진짜 위반이 묻힌다.
  it("UNREVIEWED_MEDICAL_PUBLISH 는 크롤 후처리에서 만들지 않는다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      complianceFlagClient: compliance.client
    });

    expect(compliance.created.map((flag) => flag.ruleId)).not.toContain(
      "UNREVIEWED_MEDICAL_PUBLISH",
    );
  });

  it("위반 문구가 없는 의료 페이지는 플래그가 0건이다", async () => {
    const compliance = createComplianceClient("medical");
    const cleanHtml = `<!doctype html><html lang="ko"><head><title>병원 소개</title></head><body>
<h1>오시는 길</h1>
<p>저희는 강남에 위치한 clinic 입니다. 진료 시간은 평일 오전 9시부터 오후 6시까지이며 주차 공간을 제공합니다. 예약은 전화로 가능합니다.</p>
</body></html>`;

    await processAndPersistCrawlJob(
      { ...payload, pages: [{ url: "https://example.com/about", html: cleanHtml, statusCode: 200 }] },
      createCrawlClient(),
      { complianceFlagClient: compliance.client },
    );

    expect(compliance.created).toHaveLength(0);
  });

  // batch-crawl 은 DB 의 모든 Site 를 긁는다. 본문의 영어 단어 하나로 룰팩이 뒤집히면
  // 토너 판매 사이트에 매일 밤 의료법 플래그가 쌓인다.
  it("비의료 사이트는 본문에 laser·treatment 가 있어도 건너뛴다", async () => {
    const nonMedicalHtml = `<!doctype html><html lang="ko"><head><title>토너 판매</title></head><body>
<h1>프린터 토너</h1>
<p>레이저 프린터 토너 교체 안내. laser printer 유지보수 서비스를 제공합니다. 100% 효과 보장 하는 정품 토너입니다.</p>
</body></html>`;

    for (const industry of ["ecommerce", null]) {
      const compliance = createComplianceClient(industry);

      await processAndPersistCrawlJob(
        { ...payload, pages: [{ url: "https://example.com/", html: nonMedicalHtml, statusCode: 200 }] },
        createCrawlClient(),
        { complianceFlagClient: compliance.client },
      );

      expect(compliance.created, String(industry)).toHaveLength(0);
    }
  });

  // Site.industry 는 자유 문자열이라 한글 진료과명과 null 이 그대로 들어온다.
  it("의료 industry 판정은 한글 진료과명도 받는다", () => {
    for (const industry of ["medical", "Dermatology Clinic", "피부과", "성형외과", "한의원", "치과"]) {
      expect(isMedicalIndustry(industry), industry).toBe(true);
    }
    for (const industry of ["ecommerce", "saas", "커머스", null]) {
      expect(isMedicalIndustry(industry), String(industry)).toBe(false);
    }
  });

  // 운영자가 워크오더로 전환하거나 오탐으로 기각한 판정이 매일 밤 되살아나면 안 된다.
  it("open 이 아닌 상태로 전이된 플래그도 다시 만들지 않는다", async () => {
    for (const status of ["in_review", "dismissed", "resolved"]) {
      const compliance = createComplianceClient("medical");

      await processAndPersistCrawlJob(payload, createCrawlClient(), {
        complianceFlagClient: compliance.client
      });
      const firstRun = compliance.created.length;
      expect(firstRun).toBeGreaterThan(0);
      for (const flag of compliance.created) {
        compliance.setStatus(flag.id, status);
      }

      await processAndPersistCrawlJob(payload, createCrawlClient(), {
        complianceFlagClient: compliance.client
      });

      expect(compliance.created, status).toHaveLength(firstRun);
    }
  });

  it("열린 플래그의 근거 문장은 최신 본문으로 갱신된다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(payload, createCrawlClient(), {
      complianceFlagClient: compliance.client
    });
    const flag = compliance.created.find((row) => row.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect((flag?.evidence as { excerpt: string }).excerpt).toContain("완치");

    // 운영자가 "완치" 문장을 지우고 다른 위반 문구로 바꿨다(같은 룰에 걸린다).
    const updatedHtml = html.replace("완치 를 약속드립니다", "100% 효과 보장 합니다");
    await processAndPersistCrawlJob(
      { ...payload, pages: [{ url: "https://example.com/", html: updatedHtml, statusCode: 200 }] },
      createCrawlClient(),
      { complianceFlagClient: compliance.client },
    );

    const refreshed = compliance.created.find((row) => row.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect(compliance.created.filter((row) => row.ruleId === "GUARANTEED_RESULT_CLAIM")).toHaveLength(1);
    expect((refreshed?.evidence as { excerpt: string }).excerpt).toContain("100% 효과 보장");
    expect((refreshed?.evidence as { excerpt: string }).excerpt).not.toContain("완치");
  });

  it("generateComplianceFlags=false 면 아무것도 만들지 않는다", async () => {
    const compliance = createComplianceClient("medical");

    await processAndPersistCrawlJob(
      { ...payload, analysis: { ...analysisDefaults, generateComplianceFlags: false } },
      createCrawlClient(),
      { complianceFlagClient: compliance.client },
    );

    expect(compliance.created).toHaveLength(0);
  });
});

describe("후처리 실패 격리", () => {
  const failingClients = {
    aeoReadinessClient: {
      keyword: {
        async findMany(): Promise<never> {
          throw new Error("keyword read failed");
        }
      },
      aeoReadinessReport: {
        async create(): Promise<never> {
          throw new Error("unreachable");
        }
      }
    },
    complianceFlagClient: {
      site: {
        async findUnique(): Promise<never> {
          throw new Error("site read failed");
        }
      },
      complianceFlag: {
        async findMany() {
          return [];
        },
        async create(): Promise<never> {
          throw new Error("unreachable");
        },
        async update(): Promise<never> {
          throw new Error("unreachable");
        }
      }
    }
  };

  it("AEO·컴플라이언스가 던져도 크롤 잡은 성공으로 끝난다", async () => {
    const result = await processAndPersistCrawlJob(payload, createCrawlClient(), failingClients);

    expect(result.status).toBe("completed");
  });

  // 삼킨 실패를 배치로 올리지 않으면 매일 전패해도 워크플로가 초록불이다(0건 무증상).
  it("삼킨 실패를 onPostprocessFailure 로 올린다", async () => {
    const failures: string[] = [];

    const result = await processAndPersistCrawlJob(payload, createCrawlClient(), {
      ...failingClients,
      onPostprocessFailure: (label) => {
        failures.push(label);
      }
    });

    expect(result.status).toBe("completed");
    expect(failures).toEqual(["aeo-readiness", "compliance"]);
  });
});

/**
 * 운영 실측(2026-09, gowoonmom.co.kr 25페이지 79플래그 중 73건 오탐)의 원인 문자열.
 * ComplianceFlag.evidence.excerpt 원문 그대로 — 25개 페이지 HTML 에 전부 반복됐다.
 */
const NAV_BOILERPLATE =
  "스킨부스터 실리프팅 커뮤니티 시술후기 숏츠영상 공지사항 전후사진 리얼스토리 Login Join Keep your beauty for a long time";

const PLAIN_FOOTER = "리쥬엘의원 서울특별시 강남구 대표번호 02-000-0000";

/** 사이트 공통 블록 검수는 크롤런당 1회, 이 URL 로만 올라간다. */
const SITE_URL = payload.startUrl;

function navPage(
  path: string,
  body: string,
  options: { footer?: string; nav?: string; banner?: string } = {},
) {
  const banner = options.banner === undefined ? "" : `<div class="promo">${options.banner}</div>`;
  return {
    url: `https://example.com${path}`,
    html: `<!doctype html><html lang="ko"><head><title>리쥬엘의원 ${path}</title></head><body>
<div class="gnb">${(options.nav ?? NAV_BOILERPLATE).replace("{{path}}", path)}</div>
<p>${body}</p>
${banner}
<div class="footer">${options.footer ?? PLAIN_FOOTER}</div>
</body></html>`,
    statusCode: 200
  };
}

const cleanBodies = [
  "주차 공간은 건물 지하 2층에 마련되어 있으며 두 시간까지 무료로 이용하실 수 있습니다.",
  "평일 진료 시간은 오전 열 시부터 오후 일곱 시까지이며 점심시간은 한 시부터 두 시까지입니다.",
  "지하철 2호선 강남역 3번 출구에서 도보로 오 분 거리에 위치한 건물 사 층입니다.",
  "예약은 전화 또는 홈페이지 예약 게시판을 통해 접수하시면 담당자가 순서대로 확인합니다."
];

function navPayload(
  bodies: readonly string[],
  options: { footer?: string; nav?: string; banner?: string } = {},
) {
  return {
    ...payload,
    maxPages: bodies.length,
    pages: bodies.map((body, index) => navPage(`/p${index + 1}`, body, options))
  };
}

async function runCompliance(
  bodies: readonly string[],
  options: { footer?: string; nav?: string; banner?: string; industry?: string } = {},
) {
  const compliance = createComplianceClient(options.industry ?? "medical");
  await processAndPersistCrawlJob(navPayload(bodies, options), createCrawlClient(), {
    complianceFlagClient: compliance.client
  });
  const created = compliance.created;
  return {
    created,
    pageFlags: created.filter((flag) => flag.url !== SITE_URL),
    siteFlags: created.filter((flag) => flag.url === SITE_URL),
    ruleIds: (rows: readonly FakeComplianceFlag[]) => rows.map((flag) => flag.ruleId)
  };
}

describe("크롤 후처리 의료광고법 검수 — 공통 내비게이션 오탐", () => {
  it("메뉴에만 있는 '시술후기'·'전후사진'은 페이지가 아니라 사이트 1건으로만 남는다", async () => {
    const run = await runCompliance(cleanBodies);

    // 실측 오탐 25건 → 사이트 대표 URL 1건. 페이지에는 한 건도 생기지 않는다.
    expect(run.pageFlags).toHaveLength(0);
    expect(run.ruleIds(run.siteFlags)).toContain("PATIENT_TESTIMONIAL_REFERENCE");
    expect(
      run.siteFlags.filter((flag) => flag.ruleId === "PATIENT_TESTIMONIAL_REFERENCE"),
    ).toHaveLength(1);
  });

  it("본문의 진짜 위반은 여전히 잡힌다", async () => {
    const bodies = [...cleanBodies];
    bodies[2] = "저희 병원은 100% 효과 보장을 약속드리며 모든 분께 동일한 결과를 드립니다.";
    const run = await runCompliance(bodies);

    const flagged = run.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ url: "https://example.com/p3" });
    expect(run.ruleIds(run.pageFlags)).not.toContain("PATIENT_TESTIMONIAL_REFERENCE");
  });

  it("페이지가 1장이면 반복의 근거가 없으므로 아무것도 제거하지 않는다", async () => {
    const run = await runCompliance([cleanBodies[0] as string]);

    expect(run.ruleIds(run.pageFlags)).toContain("PATIENT_TESTIMONIAL_REFERENCE");
  });

  it("브레드크럼이 앞에 붙은 메뉴도 공통 블록으로 걷어낸다", async () => {
    // 블록 경계를 뒤에만 심으면 'HOME > 서브페이지 N' + 첫 메뉴가 한 덩어리가 되어
    // 페이지마다 달라지고, 메뉴 첫 항목만 오탐으로 되살아난다.
    const nav = "HOME &gt; 서브페이지 {{path}}<ul><li>시술후기</li><li>전후사진</li><li>공지사항</li></ul>";
    const run = await runCompliance(cleanBodies, { nav });

    expect(run.pageFlags).toHaveLength(0);
  });
});

describe("크롤 후처리 의료광고법 검수 — 공통 블록의 진짜 위반", () => {
  const BANNER = "100% 효과 보장 — 부작용 없는 무통 시술, 지금 상담하세요";

  it("전 페이지에 반복되는 배너의 위반이 사라지지 않는다", async () => {
    const run = await runCompliance(cleanBodies, { banner: BANNER });

    const guaranteed = run.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect(guaranteed).toHaveLength(1);
    expect(guaranteed[0]).toMatchObject({ riskLevel: "critical", url: SITE_URL });
    expect(run.ruleIds(run.siteFlags)).toContain("ABSOLUTE_SAFETY_CLAIM");
  });

  it("페이지 수가 늘어도 같은 위반이 뒤집히지 않는다", async () => {
    // 임계값이 '페이지 수' 함수라 3페이지·6페이지에서 판정이 갈리던 비단조성.
    const three = await runCompliance(cleanBodies.slice(0, 3), { banner: BANNER });
    const six = await runCompliance([...cleanBodies, ...cleanBodies.slice(0, 2)], {
      banner: BANNER
    });

    expect(three.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM")).toHaveLength(1);
    expect(six.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM")).toHaveLength(1);
  });

  it("페이지들이 서로 동일해도 위반이 조용히 사라지지 않는다", async () => {
    const same = "저희 병원은 100% 효과 보장을 약속드리며 모든 분께 동일한 결과를 드립니다.";
    const run = await runCompliance([same, same, same]);

    expect(run.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM")).toHaveLength(1);
  });
});

describe("크롤 후처리 의료광고법 검수 — 깎인 텍스트가 판정을 깎지 않는다", () => {
  it("고유 본문이 40자 미만인 이벤트 페이지도 건너뛰지 않는다", async () => {
    const bodies = [...cleanBodies];
    // 37자. 내비를 걷어내면 길이 게이트(40자)에 걸려 페이지 전체가 검수에서 빠졌다.
    bodies[3] = "9월 한정 이벤트 실리프팅 100% 효과 보장 지금 바로 예약하세요";
    const run = await runCompliance(bodies);

    const flagged = run.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ url: "https://example.com/p4" });
  });

  it("전 페이지 공통 푸터의 부작용 고지를 고지로 인정한다", async () => {
    const footer = `${PLAIN_FOOTER} 시술 및 수술 후 부작용이 발생할 수 있으므로 의료진과 충분히 상담하시기 바랍니다.`;
    const bodies = [
      "고주파 리프팅 시술은 피부 탄력 개선을 목적으로 진행하며 시술 시간은 약 삼십 분입니다.",
      "스킨부스터 주사 시술은 피부 수분 개선을 위해 시행하며 주기는 상담 후 결정합니다.",
      "레이저 시술은 색소와 흉터 개선 목적으로 시행하며 장비는 피부 상태에 따라 선택합니다.",
      "보톡스 시술은 상담 후 진행하며 시술 부위와 용량은 의료진이 판단합니다."
    ];

    const withFooter = await runCompliance(bodies, { footer });
    const withoutFooter = await runCompliance(bodies);

    expect(withFooter.ruleIds(withFooter.created)).not.toContain("SIDE_EFFECT_DISCLOSURE_MISSING");
    expect(withoutFooter.ruleIds(withoutFooter.pageFlags)).toContain(
      "SIDE_EFFECT_DISCLOSURE_MISSING",
    );
  });

  it("한글 industry 사이트는 내비를 걷어내도 kr-medical 로 남는다", async () => {
    const bodies = [...cleanBodies];
    bodies[0] = "저희는 100% 효과 보장을 약속드리며 모든 분께 같은 결과를 드립니다.";
    // 영문 의료 키워드가 내비에만 있는 사이트. 걷어내면 룰팩이 global 로 떨어졌다.
    const run = await runCompliance(bodies, {
      industry: "피부과",
      nav: "CLINIC 스킨부스터 실리프팅 커뮤니티 시술후기 전후사진 Login Join"
    });

    const flagged = run.created.filter((flag) => flag.ruleId === "GUARANTEED_RESULT_CLAIM");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ url: "https://example.com/p1" });
  });
});
