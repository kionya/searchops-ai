import { RobotsTxtSchema, type RobotsRule, type RobotsTxt } from "@searchops/types";

import { normalizeUrl } from "./url.js";

interface MutableRobotsRule {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
}

export function parseRobotsTxt(input: string): RobotsTxt {
  const rules: MutableRobotsRule[] = [];
  const sitemaps: string[] = [];
  let currentRule: MutableRobotsRule | null = null;
  let hasDirectives = false;

  for (const rawLine of input.split(/\r?\n/u)) {
    const line = stripComment(rawLine).trim();
    if (!line) {
      if (currentRule !== null && hasDirectives) {
        currentRule = null;
        hasDirectives = false;
      }
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === "sitemap") {
      const sitemapUrl = tryNormalizeUrl(value);
      if (sitemapUrl !== null) {
        sitemaps.push(sitemapUrl);
      }
      continue;
    }

    if (field === "user-agent") {
      if (currentRule === null || hasDirectives) {
        currentRule = {
          userAgents: [],
          allow: [],
          disallow: [],
          crawlDelay: null
        };
        rules.push(currentRule);
        hasDirectives = false;
      }

      if (value.length > 0) {
        currentRule.userAgents.push(value.toLowerCase());
      }
      continue;
    }

    if (currentRule === null) {
      continue;
    }

    if (field === "allow") {
      currentRule.allow.push(value);
      hasDirectives = true;
      continue;
    }

    if (field === "disallow") {
      currentRule.disallow.push(value);
      hasDirectives = true;
      continue;
    }

    if (field === "crawl-delay") {
      currentRule.crawlDelay = parseCrawlDelay(value);
      hasDirectives = true;
    }
  }

  return RobotsTxtSchema.parse({
    rules: rules
      .filter((rule) => rule.userAgents.length > 0)
      .map((rule): RobotsRule => ({
        userAgents: rule.userAgents,
        allow: rule.allow,
        disallow: rule.disallow,
        crawlDelay: rule.crawlDelay
      })),
    sitemaps: [...new Set(sitemaps)]
  });
}

export function isPathAllowedByRobots(robots: RobotsTxt, pathname: string, userAgent = "*"): boolean {
  const rules = findApplicableRules(robots, userAgent);
  if (rules.length === 0) {
    return true;
  }

  const matches = rules.flatMap((rule) => [
    ...rule.allow.map((pattern) => ({ pattern, allowed: true })),
    ...rule.disallow.map((pattern) => ({ pattern, allowed: false }))
  ]);
  const matchingRule = matches
    .filter(({ pattern }) => pattern.length > 0 && pathname.startsWith(pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];

  return matchingRule?.allowed ?? true;
}

function findApplicableRules(robots: RobotsTxt, userAgent: string): RobotsRule[] {
  const normalizedAgent = userAgent.toLowerCase();
  const exactMatches = robots.rules.filter((rule) =>
    rule.userAgents.some((agent) => normalizedAgent.includes(agent) && agent !== "*"),
  );
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return robots.rules.filter((rule) => rule.userAgents.includes("*"));
}

function parseCrawlDelay(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stripComment(line: string): string {
  const commentIndex = line.indexOf("#");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function tryNormalizeUrl(input: string): string | null {
  try {
    return normalizeUrl(input);
  } catch {
    return null;
  }
}
