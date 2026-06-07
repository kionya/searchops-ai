import { describe, expect, it } from "vitest";

import { createConnectorLiveSetupReport, summarizeConnectorLiveSetupFailure } from "./connector-live-setup.js";

const baseEnv = {
  DATABASE_URL: "postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public",
  REDIS_URL: "redis://localhost:6379",
  SEARCHOPS_API_BASE_URL: "http://localhost:4000",
  SEARCHOPS_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("connector live setup report", () => {
  it("keeps local fixture mode safe when live credentials are absent", () => {
    const report = createConnectorLiveSetupReport({
      env: { ...baseEnv },
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

  it("blocks partial Google OAuth and non-numeric GA4 property ids", () => {
    const report = createConnectorLiveSetupReport({
      env: {
        ...baseEnv,
        SEARCHOPS_GA4_PROPERTY_ID: "G-ABC123",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
      },
      environment: "deployment",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(report.liveExternalApis).toBe("enabled");
    expect(report.canRunFixtureMode).toBe(false);
    expect(report.canRunLiveConnectorSync).toBe(false);
    expect(report.summary.blocked).toBeGreaterThanOrEqual(2);
    expect(report.checks.find((check) => check.id === "google-oauth-env")).toMatchObject({
      status: "blocked",
    });
    expect(report.checks.find((check) => check.id === "ga4-live-credential")).toMatchObject({
      status: "blocked",
    });
  });

  it("marks provider checks ready when live env is complete", () => {
    const report = createConnectorLiveSetupReport({
      env: {
        ...baseEnv,
        SEARCHOPS_BING_API_KEY: "bing-key",
        SEARCHOPS_GA4_PROPERTY_ID: "123456789",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID: "client-id",
        SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI: "https://api.searchops.test/connectors/google/oauth/callback",
        SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET: "state-secret-123456",
        SEARCHOPS_PAGESPEED_API_KEY: "pagespeed-key",
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
      env: { ...baseEnv },
      environment: "deployment",
      generatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });

    expect(summarizeConnectorLiveSetupFailure(report, { requireLive: true })).toBe(
      "Connector live setup check failed: require-live was requested, but no provider is ready for live connector sync.",
    );
  });
});
