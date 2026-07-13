import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createConnectorLiveSetupCliEnv } from "./connector-live-setup-cli-env.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("createConnectorLiveSetupCliEnv", () => {
  it("loads API and worker local env files while preserving explicit process env", () => {
    const repoRoot = createTemporaryRepo();
    writeFileSync(
      join(repoRoot, ".env.api.local"),
      'DATABASE_URL="postgresql://local/db"\nSEARCHOPS_API_BASE_URL="http://localhost:4000"\n',
    );
    writeFileSync(
      join(repoRoot, ".env.worker.local"),
      'REDIS_URL="redis://localhost:6379"\nSEARCHOPS_GA4_PROPERTY_ID="123456789"\n',
    );

    const env = createConnectorLiveSetupCliEnv({
      baseEnv: { SEARCHOPS_GA4_PROPERTY_ID: "987654321" },
      environment: "local",
      repoRoot,
    });

    expect(env).toMatchObject({
      DATABASE_URL: "postgresql://local/db",
      REDIS_URL: "redis://localhost:6379",
      SEARCHOPS_API_BASE_URL: "http://localhost:4000",
      SEARCHOPS_GA4_PROPERTY_ID: "987654321",
    });
  });

  it("does not load local files for deployment checks", () => {
    const repoRoot = createTemporaryRepo();
    writeFileSync(join(repoRoot, ".env.api.local"), 'DATABASE_URL="postgresql://local/db"\n');
    const baseEnv = { NODE_ENV: "production" };

    expect(
      createConnectorLiveSetupCliEnv({ baseEnv, environment: "deployment", repoRoot }),
    ).toBe(baseEnv);
  });

  it("allows local checks when optional env files are absent", () => {
    const baseEnv = { NODE_ENV: "development" };

    expect(
      createConnectorLiveSetupCliEnv({
        baseEnv,
        environment: "local",
        repoRoot: createTemporaryRepo(),
      }),
    ).toMatchObject(baseEnv);
  });
});

function createTemporaryRepo() {
  const directory = mkdtempSync(join(tmpdir(), "searchops-connector-env-"));
  temporaryDirectories.push(directory);
  return directory;
}
