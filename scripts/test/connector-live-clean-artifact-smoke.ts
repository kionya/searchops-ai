import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "../..");
const artifactPaths = [
  "packages/types/dist",
  "packages/db/dist",
  "packages/connectors/dist",
] as const;
const backupRoot = mkdtempSync(join(tmpdir(), "searchops-clean-artifacts-"));
const trackedBefore = readTrackedStatus();

try {
  for (const [index, relativePath] of artifactPaths.entries()) {
    const artifactPath = resolve(repoRoot, relativePath);
    if (existsSync(artifactPath)) {
      cpSync(artifactPath, join(backupRoot, String(index)), { recursive: true });
      rmSync(artifactPath, { force: true, recursive: true });
    }
  }

  const result = spawnSync(
    "corepack",
    ["pnpm", "check:connector-live", "--", "--deployment", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
        DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic",
        REDIS_URL: "redis://127.0.0.1:1",
        SEARCHOPS_API_BASE_URL: "https://api.synthetic.invalid",
        SEARCHOPS_PUBLIC_APP_URL: "https://app.synthetic.invalid",
      },
    },
  );

  if (
    result.status !== 0 ||
    !result.stdout.includes('"liveExternalApis": "disabled"') ||
    !result.stdout.includes('"worker-runtime-base-env"')
  ) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("connector_live_clean_artifact_smoke_failed");
  }
} finally {
  for (const [index, relativePath] of artifactPaths.entries()) {
    const artifactPath = resolve(repoRoot, relativePath);
    const backupPath = join(backupRoot, String(index));
    rmSync(artifactPath, { force: true, recursive: true });
    if (existsSync(backupPath)) {
      cpSync(backupPath, artifactPath, { recursive: true });
    }
  }
  rmSync(backupRoot, { force: true, recursive: true });
}

if (readTrackedStatus() !== trackedBefore) {
  throw new Error("connector_live_clean_artifact_modified_tracked_files");
}

console.log("Connector live clean-artifact smoke passed.");

function readTrackedStatus() {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("connector_live_clean_artifact_git_status_failed");
  }
  return result.stdout;
}
