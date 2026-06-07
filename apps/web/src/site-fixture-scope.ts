import type { Site } from "@searchops/types";

type JsonLike =
  | boolean
  | null
  | number
  | string
  | readonly JsonLike[]
  | { readonly [key: string]: JsonLike | undefined };

const demoFixtureSite = {
  country: "KR",
  createdAt: "2026-05-19T00:00:00.000Z",
  domain: "example-clinic.com",
  id: "site_demo_rejuel",
  industry: "medical",
  language: "ko",
  name: "예시 클리닉",
  organizationId: "org_demo"
} as const satisfies Site;

export function scopeDemoFixtureToSite<T>(value: T, site: Site): T {
  return replaceFixtureValue(value as JsonLike, site) as T;
}

export function getFixtureSite(siteOrId: Site | string): Site {
  return typeof siteOrId === "string" ? { ...demoFixtureSite, id: siteOrId } : siteOrId;
}

export function getFixtureSiteId(siteOrId: Site | string): string {
  return typeof siteOrId === "string" ? siteOrId : siteOrId.id;
}

function replaceFixtureValue(value: JsonLike | undefined, site: Site): JsonLike | undefined {
  if (typeof value === "string") {
    return replaceFixtureString(value, site);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceFixtureValue(item, site) as JsonLike);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, replaceFixtureValue(entryValue as JsonLike, site)]),
    );
  }

  return value;
}

function replaceFixtureString(value: string, site: Site): string {
  const siteName = site.name ?? site.domain;
  return value
    .replaceAll(demoFixtureSite.organizationId, site.organizationId)
    .replaceAll(demoFixtureSite.id, site.id)
    .replaceAll(demoFixtureSite.domain, site.domain)
    .replaceAll(demoFixtureSite.name, siteName)
    .replaceAll("demo-property", `${site.id}-property`);
}
