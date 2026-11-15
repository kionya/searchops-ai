import type { SourceWorkOrderDraft } from "@searchops/db";

// 리뉴얼 옛 주소 점검의 판정부. 실제 DB·네트워크는 batch-redirect-check.ts 가 deps 로 넣는다.

export type LegacyUrlOutcome = "ok" | "home_only" | "broken" | "unknown";

// 2026-11-15 고운몸 실측 후보 255개. 잘리면 그날의 broken 0 을 "해결"로 믿지 않는다(아래).
export const legacyCandidateLimit = 400;
const concurrency = 4;
// 응답 없는 주소가 이만큼 쌓이면 사이트 장애로 보고 멈춘다 — 잡 타임아웃(30분) 전에 끝내기 위해서.
const unknownStopCount = 20;
const tableRows = 30;

export function classifyLegacyUrl(
  originalUrl: string,
  result: { readonly finalUrl: string; readonly statusCode: number } | { readonly error: unknown },
): LegacyUrlOutcome {
  if ("error" in result) {
    return "unknown";
  }
  // 없어진 주소는 404/410 뿐이다. 403·429·5xx·남은 3xx 는 차단·과부하일 수 있어 판단을 미룬다(리뷰 C1).
  if (result.statusCode === 404 || result.statusCode === 410) {
    return "broken";
  }
  if (result.statusCode !== 200) {
    return "unknown";
  }
  const original = new URL(originalUrl).pathname;
  const final = new URL(result.finalUrl).pathname;
  // 깊은 주소가 홈으로만 넘어가면 구글은 soft 404 로 본다(설계 단계 0).
  return original !== "/" && final === "/" ? "home_only" : "ok";
}

interface Check {
  readonly url: string;
  readonly traffic: number;
  readonly outcome: LegacyUrlOutcome;
  /** 최종 주소가 원래 주소와 다르다(리다이렉트됨). 판단 근거로만 쓴다. */
  readonly redirected?: boolean;
}

export function buildLegacyWorkOrderDrafts(
  domain: string,
  checks: readonly Check[],
): { readonly broken: SourceWorkOrderDraft | null; readonly homeOnly: SourceWorkOrderDraft | null } {
  const broken = checks.filter((check) => check.outcome === "broken");
  const homeOnly = checks.filter((check) => check.outcome === "home_only");
  return {
    broken:
      broken.length === 0
        ? null
        : {
            acceptanceCriteria: ["다음 날 점검에서 이 목록이 0개가 된다.", "각 옛 주소를 열면 내용이 같은 새 페이지가 뜬다."],
            description: urlTable(broken),
            estimatedEffort: broken.length > 10 ? "m" : "s",
            impact: "구글은 404 가 며칠 이어지면 그 주소를 검색 결과에서 빼고, 쌓아 둔 순위도 사라집니다.",
            instructions: [
              `아래 옛 주소마다 ${domain} 의 내용이 같은 새 주소로 301 리다이렉트를 걸어 주세요.`,
              "내용이 새 사이트에 없는 글은 가장 가까운 새 페이지(같은 시술·같은 주제)로 연결해 주세요.",
              "홈(/)으로 한꺼번에 보내지 마세요 — 구글이 없는 페이지로 취급합니다."
            ],
            ownerType: "developer",
            priority: "p0",
            problem: `리뉴얼 전 주소 ${broken.length}개가 열리지 않습니다(404). 검색·방문 기록이 남아 있는 주소입니다.`,
            title: `옛 주소 ${broken.length}개가 열리지 않음(404) — 새 주소로 연결 필요`,
            verificationMethod: "SearchOps 가 매일 옛 주소를 다시 열어 보고, 전부 연결되면 자동으로 닫습니다."
          },
    homeOnly:
      homeOnly.length === 0
        ? null
        : {
            acceptanceCriteria: ["다음 날 점검에서 이 목록이 0개가 된다."],
            description: urlTable(homeOnly),
            estimatedEffort: "s",
            impact: "깊은 주소가 홈으로만 넘어가면 구글은 없는 페이지로 보고 순위를 넘겨주지 않습니다.",
            instructions: ["아래 옛 주소가 홈 대신 내용이 같은 새 페이지로 넘어가도록 리다이렉트를 고쳐 주세요."],
            ownerType: "developer",
            priority: "p2",
            problem: `옛 주소 ${homeOnly.length}개가 맞는 페이지가 아니라 홈으로만 넘어갑니다.`,
            title: `옛 주소 ${homeOnly.length}개가 홈으로만 연결됨 — 맞는 페이지로 연결 권장`,
            verificationMethod: "SearchOps 가 매일 옛 주소를 다시 열어 확인합니다."
          }
  };
}

function urlTable(checks: readonly Check[]): string {
  const sorted = [...checks].sort((left, right) => right.traffic - left.traffic);
  const lines = ["| 옛 주소 | 4주 노출+방문 |", "|---|---|", ...sorted.slice(0, tableRows).map((check) => `| ${check.url} | ${check.traffic} |`)];
  if (sorted.length > tableRows) {
    lines.push(`외 ${sorted.length - tableRows}개`);
  }
  return lines.join("\n");
}

const checklistBase = {
  acceptanceCriteria: ["제출 화면에서 '성공' 또는 '처리됨' 상태를 확인했다."],
  description: null,
  estimatedEffort: "s",
  impact: "검색엔진이 리뉴얼한 새 주소를 더 빨리 알아갑니다.",
  ownerType: "marketer",
  priority: "p1",
  verificationMethod: "자동 확인이 안 되는 일이라 [했어요] 를 누르면 완료됩니다."
} as const;

export const checklistDrafts: Record<"sitemap-naver" | "sitemap-google", SourceWorkOrderDraft> = {
  "sitemap-google": {
    ...checklistBase,
    instructions: ["구글 서치콘솔 → 색인 생성 → Sitemaps 에서 새 사이트맵 주소를 제출합니다."],
    problem: "리뉴얼 후 새 사이트맵을 구글에 알려야 새 주소가 빨리 색인됩니다.",
    title: "구글 서치콘솔에 새 사이트맵 제출"
  },
  "sitemap-naver": {
    ...checklistBase,
    instructions: ["네이버 서치어드바이저 → 요청 → 사이트맵 제출에서 새 사이트맵 주소를 제출합니다."],
    problem: "리뉴얼 후 새 사이트맵을 네이버에 알려야 새 주소가 빨리 수집됩니다.",
    title: "네이버 서치어드바이저에 새 사이트맵 제출"
  }
};

export interface RedirectCheckDeps {
  /** null = 최신 크롤이 없거나 차단 의심이라 이번엔 점검하지 않는다. */
  loadCandidates(siteId: string): Promise<readonly { readonly url: string; readonly traffic: number }[] | null>;
  fetch(url: string): Promise<{ readonly finalUrl: string; readonly statusCode: number }>;
  upsert(input: {
    readonly organizationId: string;
    readonly siteId: string;
    readonly sourceKey: string;
    readonly draft: SourceWorkOrderDraft | null;
    readonly mode: "track" | "create_once";
  }): Promise<unknown>;
  closeGone(urls: readonly string[]): Promise<number>;
}

export interface RedirectCheckResult {
  readonly aborted: boolean;
  readonly checked: number;
  readonly ok: number;
  readonly homeOnly: number;
  readonly broken: number;
  readonly unknown: number;
}

export async function runRedirectCheckForSite(
  deps: RedirectCheckDeps,
  site: { readonly id: string; readonly domain: string; readonly organizationId: string },
): Promise<RedirectCheckResult> {
  const loaded = await deps.loadCandidates(site.id);
  if (loaded === null) {
    return { aborted: true, broken: 0, checked: 0, homeOnly: 0, ok: 0, unknown: 0 };
  }
  const truncated = loaded.length > legacyCandidateLimit;
  const candidates = loaded.slice(0, legacyCandidateLimit);
  const checks: Check[] = [];
  let stopped = false;
  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = await Promise.all(
      candidates.slice(index, index + concurrency).map(async (candidate): Promise<Check> => {
        try {
          const response = await deps.fetch(candidate.url);
          return { ...candidate, outcome: classifyLegacyUrl(candidate.url, response), redirected: response.finalUrl !== candidate.url };
        } catch (error) {
          return { ...candidate, outcome: classifyLegacyUrl(candidate.url, { error }) };
        }
      }),
    );
    checks.push(...batch);
    const unknownSoFar = checks.filter((check) => check.outcome === "unknown").length;
    // 첫 묶음이 전부 응답 없음이거나 응답 없음이 쌓이면 사이트 장애다 — 더 기다리지 않는다.
    if ((index === 0 && batch.every((check) => check.outcome === "unknown")) || unknownSoFar >= unknownStopCount) {
      stopped = true;
      break;
    }
  }
  const count = (outcome: LegacyUrlOutcome) => checks.filter((check) => check.outcome === outcome).length;
  const result = {
    aborted: false,
    broken: count("broken"),
    checked: checks.length,
    homeOnly: count("home_only"),
    ok: count("ok"),
    unknown: count("unknown")
  };
  if (checks.length === 0) {
    return result;
  }
  // 사이트 전체가 응답하지 않는 날(차단·장애)에 "옛 주소 N개 404" 를 만들면 거짓 경보다.
  if (stopped || result.unknown * 2 > checks.length) {
    return { ...result, aborted: true };
  }

  const drafts = buildLegacyWorkOrderDrafts(site.domain, checks);
  const base = { organizationId: site.organizationId, siteId: site.id };
  // 후보가 잘린 날 broken 0 은 "못 본 것"일 수 있어 열린 할 일을 닫지 않는다(리뷰 I5).
  if (drafts.broken !== null || !truncated) {
    await deps.upsert({ ...base, draft: drafts.broken, mode: "track", sourceKey: `legacy-redirect:${site.id}:broken` });
  }
  await deps.upsert({ ...base, draft: drafts.homeOnly, mode: "track", sourceKey: `legacy-redirect:${site.id}:home_only` });
  for (const key of ["sitemap-naver", "sitemap-google"] as const) {
    await deps.upsert({ ...base, draft: checklistDrafts[key], mode: "create_once", sourceKey: `checklist:${site.id}:${key}` });
  }
  // 닫는 건 실제로 없어졌거나(404/410) 다른 주소로 넘어간 것만. 그대로 200 인 주소는 살아 있는
  // 페이지라(수집 한도 밖 새 페이지 등) 그 문제를 "주소 폐기"로 닫으면 안 된다(리뷰 C1).
  await deps.closeGone(
    checks.filter((check) => check.outcome === "broken" || (check.outcome !== "unknown" && check.redirected === true)).map((check) => check.url),
  );
  return result;
}
