import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dbPackage, phaseOneSeedIds, prismaSchemaPath } from "./index.js";

describe("db foundation", () => {
  it("declares the Prisma schema location", () => {
    expect(prismaSchemaPath).toBe("packages/db/prisma/schema.prisma");
  });

  it("declares stable Phase 1 seed ids", () => {
    expect(phaseOneSeedIds).toMatchObject({ organizationId: "org_demo" });
  });

  it("identifies the package", () => {
    expect(dbPackage).toBe("db");
  });

  it("declares additive tenant-safe provider credential models", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migrationPath = resolve(
      process.cwd(),
      "prisma/migrations/20260713000000_provider_accounts_site_connectors/migration.sql",
    );

    expect(schema).toContain("model ProviderAccount");
    expect(schema).toContain("model SiteConnector");
    expect(schema).toMatch(/providerAccounts\s+ProviderAccount\[\]/);
    expect(schema).toMatch(/siteConnectors\s+SiteConnector\[\]/);
    expect(schema).toContain("@@unique([id, organizationId])");
    expect(schema).toContain("@@unique([siteId, provider])");
    expect(schema).toContain(
      "fields: [siteId, organizationId], references: [id, organizationId]",
    );
    expect(schema).toContain(
      "fields: [providerAccountId, organizationId], references: [id, organizationId]",
    );

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const statements = migration
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    expect(migration).toContain('CREATE TABLE "ProviderAccount"');
    expect(migration).toContain('CREATE TABLE "SiteConnector"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Site_id_organizationId_key" ON "Site"("id", "organizationId")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ProviderAccount_id_organizationId_key" ON "ProviderAccount"("id", "organizationId")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ProviderAccount_org_provider_default_key"\nON "ProviderAccount" ("organizationId", "provider")\nWHERE "isDefault" = true',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("providerAccountId", "organizationId") REFERENCES "ProviderAccount"("id", "organizationId")',
    );
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|INDEX|CONSTRAINT|COLUMN)\b/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+"ConnectorOAuthCredential"\b/i);
    for (const statement of statements) {
      expect(
        /^(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE\s+"[^"]+"\s+ADD CONSTRAINT)\b/s.test(
          statement,
        ),
      ).toBe(true);
    }
  });
});
