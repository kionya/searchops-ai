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
let smokeFailure: Error | undefined;

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
  const stdout = normalizeSpawnOutput(result.stdout);
  const stderr = normalizeSpawnOutput(result.stderr);

  if (result.error) {
    smokeFailure = new Error(
      `connector_live_clean_artifact_spawn_failed: ${formatSpawnError("corepack", result.error)}${formatOutput(stdout, stderr)}`,
      { cause: result.error },
    );
  } else if (
    result.status !== 0 ||
    !stdout.includes('"liveExternalApis": "disabled"') ||
    !stdout.includes('"worker-runtime-base-env"')
  ) {
    smokeFailure = new Error(
      `connector_live_clean_artifact_smoke_failed: status=${String(result.status)}${formatOutput(stdout, stderr)}`,
    );
  }
} catch (error) {
  smokeFailure = new Error(
    `connector_live_clean_artifact_execution_failed: ${formatUnknownError(error)}`,
    { cause: error },
  );
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
if (smokeFailure) {
  throw smokeFailure;
}

console.log("Connector live clean-artifact smoke passed.");

function readTrackedStatus() {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `connector_live_clean_artifact_git_status_failed: ${formatSpawnError("git", result.error)}${formatOutput(result.stdout, result.stderr)}`,
      { cause: result.error },
    );
  }
  return normalizeSpawnOutput(result.stdout);
}

function normalizeSpawnOutput(output: unknown) {
  if (typeof output === "string") {
    return output;
  }
  if (output instanceof Uint8Array) {
    return Buffer.from(output).toString("utf8");
  }
  return "";
}

function formatSpawnError(command: string, error: unknown) {
  if (!(error instanceof Error)) {
    return `spawn ${command}: ${formatUnknownError(error)}`;
  }

  const code = getStringProperty(error, "code");
  const cause = getProperty(error, "cause");
  return [
    `spawn ${command}${code ? ` ${code}` : ""}: ${error.message}`,
    cause === undefined ? "" : `cause=${formatUnknownError(cause)}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function formatOutput(stdout: unknown, stderr: unknown) {
  const normalizedStdout = normalizeSpawnOutput(stdout).trim();
  const normalizedStderr = normalizeSpawnOutput(stderr).trim();
  return [
    normalizedStdout ? `stdout:\n${normalizedStdout}` : "",
    normalizedStderr ? `stderr:\n${normalizedStderr}` : "",
  ]
    .filter(Boolean)
    .map((output) => `\n${output}`)
    .join("");
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function getStringProperty(value: object, key: string) {
  const property = getProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function getProperty(value: object, key: string): unknown {
  try {
    return key in value ? (value as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
}
