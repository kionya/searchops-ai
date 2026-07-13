import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { describe, expect, it } from "vitest";

import { createOperationalReadiness } from "./readiness.js";

const generatedAt = new Date("2026-07-14T00:00:00.000Z");
const validKeyringEnv = {
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
};

describe("operational readiness", () => {
  it("uses tenant connector metadata instead of global customer environment values", () => {
    const report = createOperationalReadiness({
      env: {
        DATABASE_URL: "postgresql://localhost/searchops",
        REDIS_URL: "redis://localhost:6379",
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      generatedAt,
      connectorCredentials: {
        configuredByProvider: { gsc: 2, ga4: 2, bing: 1 },
        encryptedAccounts: 3,
        legacyFallbacks: 0,
      },
    });

    for (const itemId of ["live-gsc", "live-ga4", "live-bing"]) {
      expect(report.items.find((item) => item.id === itemId)).toMatchObject({
        status: "configured",
        envKeys: [],
      });
    }
    expect(JSON.stringify(report)).not.toContain("SEARCHOPS_GA4_PROPERTY_ID");
    expect(JSON.stringify(report)).not.toContain("SEARCHOPS_BING_API_KEY");
    expect(JSON.stringify(report)).not.toContain("SEARCHOPS_GSC_ACCESS_TOKEN");
  });

  it("reports missing tenant connector metadata as site configuration work", () => {
    const report = createOperationalReadiness({
      env: {
        DATABASE_URL: "postgresql://localhost/searchops",
        REDIS_URL: "redis://localhost:6379",
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      generatedAt,
      connectorCredentials: {
        configuredByProvider: { gsc: 0, ga4: 0, bing: 0 },
        encryptedAccounts: 0,
        legacyFallbacks: 0,
      },
    });

    for (const itemId of ["live-gsc", "live-ga4", "live-bing"]) {
      const item = report.items.find((candidate) => candidate.id === itemId);
      expect(item).toMatchObject({ status: "needs_provisioning", envKeys: [] });
      expect(`${item?.summary} ${item?.nextAction}`).toMatch(/조직|사이트|연결/);
      expect(`${item?.summary} ${item?.nextAction}`).not.toMatch(
        /SEARCHOPS_(GA4_PROPERTY_ID|BING_API_KEY|GSC_ACCESS_TOKEN)/,
      );
    }
  });

  it("warns in dual mode and blocks encrypted cutover while legacy fallback remains", () => {
    const dualReport = createOperationalReadiness({
      env: {
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        ...validKeyringEnv,
      },
      generatedAt,
      connectorCredentials: {
        configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
        encryptedAccounts: 2,
        legacyFallbacks: 2,
      },
    });
    const encryptedReport = createOperationalReadiness({
      env: {
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      generatedAt,
      connectorCredentials: {
        configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
        encryptedAccounts: 2,
        legacyFallbacks: 1,
      },
    });

    expect(dualReport.items.find((item) => item.id === "credential-storage-cutover")).toMatchObject({
      status: "manual_followup",
    });
    expect(
      dualReport.items.find((item) => item.id === "credential-storage-cutover")?.summary,
    ).toMatch(/경고|legacy/i);
    expect(
      encryptedReport.items.find((item) => item.id === "credential-storage-cutover"),
    ).toMatchObject({ status: "blocked" });
  });

  it("validates keyring semantics whenever encrypted storage is configured", () => {
    const missing = createOperationalReadiness({
      env: { SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted" },
      generatedAt,
    });
    const invalid = createOperationalReadiness({
      env: {
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
        SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: "not-base64",
      },
      generatedAt,
    });
    const valid = createOperationalReadiness({
      env: {
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      generatedAt,
    });

    expect(missing.items.find((item) => item.id === "credential-encryption-keyring")).toMatchObject({
      status: "blocked",
    });
    expect(invalid.items.find((item) => item.id === "credential-encryption-keyring")).toMatchObject({
      status: "blocked",
    });
    expect(valid.items.find((item) => item.id === "credential-encryption-keyring")).toMatchObject({
      status: "configured",
    });
  });
});

describe("connector provisioning documentation", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const readRepoFile = (path: string) => readFileSync(`${repoRoot}${path}`, "utf8");

  it("keeps committed environment examples parseable and Worker site credentials out of env", () => {
    for (const path of [
      ".env.example",
      "scripts/dev/api.env.example",
      "scripts/dev/worker.env.example",
    ]) {
      expect(() => parseEnv(readRepoFile(path))).not.toThrow();
    }

    const workerExample = readRepoFile("scripts/dev/worker.env.example");
    for (const staleSiteEnv of [
      "SEARCHOPS_GA4_PROPERTY_ID",
      "SEARCHOPS_BING_API_KEY",
      "SEARCHOPS_GSC_ACCESS_TOKEN",
      "SEARCHOPS_GA4_ACCESS_TOKEN",
      "SEARCHOPS_GSC_SERVICE_ACCOUNT_JSON",
      "SEARCHOPS_GA4_SERVICE_ACCOUNT_JSON",
    ]) {
      expect(workerExample).not.toContain(staleSiteEnv);
    }
  });

  it("documents a browser-safe Vercel block and exact rollout commands", () => {
    const provisioning = readRepoFile("docs/PROVISIONING_RUNBOOK.md");
    const vercelBlock = betweenMarkers(
      provisioning,
      "<!-- VERCEL_ENV_BEGIN -->",
      "<!-- VERCEL_ENV_END -->",
    );

    for (const forbiddenKey of [
      "DATABASE_URL",
      "REDIS_URL",
      "SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY",
      "SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET",
      "SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET",
      "SEARCHOPS_PAGESPEED_API_KEY",
      "SEARCHOPS_GA4_PROPERTY_ID",
      "SEARCHOPS_BING_API_KEY",
    ]) {
      expect(vercelBlock).not.toContain(forbiddenKey);
    }
    for (const allowedKey of [
      "SEARCHOPS_API_BASE_URL",
      "SEARCHOPS_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]) {
      expect(vercelBlock).toContain(allowedKey);
    }

    for (const command of [
      "corepack pnpm db:migrate:status",
      "corepack pnpm db:migrate:deploy",
      "corepack pnpm credentials:migrate -- --dry-run",
      "corepack pnpm credentials:migrate -- --apply --batch-size=100",
      "corepack pnpm credentials:rotate -- --dry-run",
      "corepack pnpm credentials:rotate -- --apply --batch-size=100",
      "corepack pnpm check:connector-live",
    ]) {
      expect(provisioning).toContain(command);
    }
    expect(provisioning).toContain("openssl rand -base64 32");
    expect(provisioning).toMatch(/7일|seven days/i);
    expect(provisioning).toMatch(/별도 승인|separate approval/i);
  });

  it("keeps the local connector CLI DB-free", () => {
    const cliSources = [
      readRepoFile("apps/api/src/connector-live-setup-cli.ts"),
      readRepoFile("apps/api/src/connector-live-setup-cli-env.ts"),
    ].join("\n");

    expect(cliSources).not.toContain("@searchops/db");
    expect(cliSources).not.toContain("getCredentialReadinessSnapshot");
  });
});

function betweenMarkers(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex + start.length, endIndex);
}
