export const dbPackage = "db" as const;

export const prismaSchemaPath = "packages/db/prisma/schema.prisma" as const;

export const phaseOneSeedIds = {
  organizationId: "org_demo",
  userId: "user_demo_owner",
  siteId: "site_demo_rejuel",
  crawlRunId: "crawl_demo_initial"
} as const;