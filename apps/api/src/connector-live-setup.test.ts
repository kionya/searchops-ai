import { describe, expect, it } from "vitest";

import { createConnectorLiveSetupReport, summarizeConnectorLiveSetupFailure } from "./connector-live-setup.js";

const baseEnv = {
  DATABASE_URL: "postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public",
  REDIS_URL: "redis://localhost:6379",
  SEARCHOPS_API_BASE_URL: "http://localhost:4000",
  SEARCHOPS_PUBLIC_APP_URL: "http://localhost:3000",
};
const validKeyringEnv = {
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
  SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON: "{}",
};

describe("connector live setup report", () => {
  it("keeps local fixture mode safe when live credentials are absent", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: { ...baseEnv },
      workerEnv: { ...baseEnv },
      environment: "local",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(report.liveExternalApis).toBe("disabled");
    expect(report.canRunFixtureMode).toBe(true);
    expect(report.canRunLiveConnectorSync).toBe(false);
    expect(report.summary.blocked).toBe(0);
    expect(report.checks.find((check) => check.id === "gsc-live-credential")).toMatchObject({
      status: "needs_provisioning",
    });
  });

  it("blocks partial Google OAuth without treating a legacy GA4 env as tenant readiness", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_GA4_PROPERTY_ID: "G-ABC123",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        ...validKeyringEnv,
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(report.liveExternalApis).toBe("enabled");
    expect(report.canRunFixtureMode).toBe(false);
    expect(report.canRunLiveConnectorSync).toBe(false);
    expect(report.summary.blocked).toBeGreaterThanOrEqual(1);
    expect(report.checks.find((check) => check.id === "google-oauth-env")).toMatchObject({
      status: "blocked",
    });
    expect(report.checks.find((check) => check.id === "ga4-live-credential")).toMatchObject({
      status: "needs_provisioning",
      envKeys: [],
    });
  });

  it("marks provider checks ready when live env is complete", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI: "https://api.searchops.test/connectors/google/oauth/callback",
        SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET: "state-secret-123456",
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        SEARCHOPS_PAGESPEED_API_KEY: "pagespeed-key",
      },
      connectorCredentials: {
        configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
        encryptedAccounts: 2,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 0,
      },
      environment: "deployment",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(report.liveExternalApis).toBe("enabled");
    expect(report.canRunFixtureMode).toBe(false);
    expect(report.canRunLiveConnectorSync).toBe(true);
    expect(report.summary.blocked).toBe(0);
    expect(report.checks.filter((check) => check.status === "ready").map((check) => check.area)).toEqual([
      "gsc",
      "ga4",
      "pagespeed",
      "bing",
    ]);
  });

  it("explains require-live failures without exposing secrets", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: { ...baseEnv },
      workerEnv: { ...baseEnv },
      environment: "deployment",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(summarizeConnectorLiveSetupFailure(report, { requireLive: true })).toBe(
      "Connector live setup check failed: require-live was requested, but no provider is ready for live connector sync.",
    );
  });

  it("does not treat global customer credentials as encrypted-mode readiness", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(report.checks.find((check) => check.id === "ga4-live-credential")?.envKeys).not.toContain(
      "SEARCHOPS_GA4_PROPERTY_ID",
    );
    expect(report.checks.find((check) => check.id === "bing-live-credential")?.envKeys).not.toContain(
      "SEARCHOPS_BING_API_KEY",
    );
    expect(report.checks.find((check) => check.id === "credential-encryption-keyring")).toMatchObject({
      status: "configured",
    });
  });

  it("blocks malformed keyrings instead of checking only environment presence", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID: "v1",
        SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY: "not-base64",
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(report.checks.find((check) => check.id === "credential-encryption-keyring")).toMatchObject({
      status: "blocked",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("blocks an invalid configured storage mode", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "invalid-mode",
        ...validKeyringEnv,
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "invalid-mode",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(report.checks.find((check) => check.id === "credential-encryption-keyring")).toMatchObject({
      status: "blocked",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("warns in dual mode while tenant syncs still use legacy credentials", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        ...validKeyringEnv,
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "dual",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
      connectorCredentials: {
        configuredByProvider: { gsc: 1, ga4: 1, bing: 1 },
        encryptedAccounts: 2,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 1,
      },
    });

    expect(report.checks.find((check) => check.id === "credential-storage-cutover")).toMatchObject({
      status: "warning",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("does not let tenant Google metadata replace the platform OAuth prerequisite", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_CREDENTIAL_STORAGE_MODE: "encrypted",
        ...validKeyringEnv,
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
      connectorCredentials: {
        configuredByProvider: { gsc: 1, ga4: 1, bing: 0 },
        encryptedAccounts: 1,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 0,
      },
    });

    expect(report.checks.find((check) => check.id === "gsc-live-credential")).toMatchObject({
      status: "ready",
    });
    expect(report.checks.find((check) => check.id === "google-oauth-env")).toMatchObject({
      status: "needs_provisioning",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("does not claim tenant Bing can run while the Worker live runtime is disabled", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: { ...baseEnv },
      workerEnv: { ...baseEnv },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
      connectorCredentials: {
        configuredByProvider: { gsc: 0, ga4: 0, bing: 1 },
        encryptedAccounts: 1,
        unmigratedLegacyCredentials: 0,
        observedLegacyFallbacks: 0,
      },
    });

    expect(report.liveExternalApis).toBe("disabled");
    expect(report.checks.find((check) => check.id === "bing-live-credential")).toMatchObject({
      status: "ready",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("requires an explicitly supplied Worker target before marking refresh ready", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: {
        ...baseEnv,
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "api-client-id",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET: "api-client-secret",
        SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI: "https://api.example.test/connectors/google/oauth/callback",
        SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET: "synthetic-state-secret",
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(report.checks.find((check) => check.id === "google-oauth-env")).toMatchObject({
      status: "configured",
    });
    expect(report.checks.find((check) => check.id === "google-worker-refresh-env")).toMatchObject({
      status: "warning",
    });
    expect(report.canRunLiveConnectorSync).toBe(false);
  });

  it("enables the same live runtime as the Worker when only PageSpeed is configured", () => {
    const report = createConnectorLiveSetupReport({
      apiEnv: { ...baseEnv },
      workerEnv: {
        ...baseEnv,
        SEARCHOPS_PAGESPEED_API_KEY: "synthetic-pagespeed-key",
      },
      environment: "deployment",
      generatedAt: new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(report.liveExternalApis).toBe("enabled");
    expect(report.checks.find((check) => check.id === "pagespeed-live-credential")).toMatchObject({
      status: "ready",
    });
    expect(report.canRunLiveConnectorSync).toBe(true);
  });
});
