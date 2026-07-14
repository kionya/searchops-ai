import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  lutimesSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "../..");
const artifactPaths = [
  "packages/types/dist",
  "packages/db/dist",
  "packages/connectors/dist",
  "packages/db/src/generated",
] as const;
const artifactTargets = artifactPaths.map((relativePath) => ({
  absolutePath: resolveRepoLocalPath(relativePath),
  relativePath,
}));
const injectAfterBuildFailure = process.argv.includes("--inject-after-build-failure");
const missingEnvPath = "scripts/test/connector-live-clean-artifact-missing.env";
const backupRoot = mkdtempSync(join(tmpdir(), "searchops-clean-artifacts-"));
const trackedBefore = readTrackedStatus();
let smokeFailure: Error | undefined;
let restorationFailure: Error | undefined;
const artifactStates = artifactTargets.map((target, index) => ({
  ...target,
  backupPath: join(backupRoot, String(index)),
  existed: existsSync(target.absolutePath),
  metadata: existsSync(target.absolutePath) ? captureTreeMetadata(target.absolutePath) : [],
  prepared: false,
}));

try {
  if (injectAfterBuildFailure && existsSync(resolveRepoLocalPath(missingEnvPath))) {
    throw new Error("connector_live_clean_artifact_failure_target_exists");
  }

  for (const state of artifactStates) {
    if (state.existed) {
      cpSync(state.absolutePath, state.backupPath, {
        preserveTimestamps: true,
        recursive: true,
        verbatimSymlinks: true,
      });
      rmSync(state.absolutePath, { force: true, recursive: true });
    }
    state.prepared = true;
  }

  const result = spawnSync(
    "corepack",
    [
      "pnpm",
      "check:connector-live",
      "--",
      "--deployment",
      "--json",
      ...(injectAfterBuildFailure ? [`--api-env-file=${missingEnvPath}`] : []),
    ],
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
  const builtArtifactPaths = artifactTargets
    .filter((target) => existsSync(target.absolutePath))
    .map((target) => target.relativePath);
  const buildEvidence = `builtArtifacts=${builtArtifactPaths.join(",")}`;

  if (result.error) {
    smokeFailure = new Error(
      `connector_live_clean_artifact_spawn_failed: ${formatSpawnError("corepack", result.error)}${formatOutput(stdout, stderr)}`,
      { cause: result.error },
    );
  } else if (injectAfterBuildFailure && builtArtifactPaths.length !== artifactTargets.length) {
    smokeFailure = new Error(
      `connector_live_clean_artifact_build_evidence_failed: ${buildEvidence}${formatOutput(stdout, stderr)}`,
    );
  } else if (
    result.status !== 0 ||
    !stdout.includes('"liveExternalApis": "disabled"') ||
    !stdout.includes('"worker-runtime-base-env"')
  ) {
    smokeFailure = new Error(
      `connector_live_clean_artifact_smoke_failed: status=${String(result.status)}; ${buildEvidence}${formatOutput(stdout, stderr)}`,
    );
  }
} catch (error) {
  smokeFailure = new Error(
    `connector_live_clean_artifact_execution_failed: ${formatUnknownError(error)}`,
    { cause: error },
  );
} finally {
  for (const state of artifactStates) {
    if (!state.prepared) {
      continue;
    }
    try {
      rmSync(state.absolutePath, { force: true, recursive: true });
      if (state.existed) {
        cpSync(state.backupPath, state.absolutePath, {
          preserveTimestamps: true,
          recursive: true,
          verbatimSymlinks: true,
        });
        restoreTreeMetadata(state.absolutePath, state.metadata);
      }
    } catch (error) {
      restorationFailure ??= new Error(
        `connector_live_clean_artifact_restore_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      );
    }
  }
  try {
    rmSync(backupRoot, { force: true, recursive: true });
  } catch (error) {
    restorationFailure ??= new Error(
      `connector_live_clean_artifact_backup_cleanup_failed: ${formatUnknownError(error)}`,
      { cause: error },
    );
  }
}

if (readTrackedStatus() !== trackedBefore) {
  throw new Error("connector_live_clean_artifact_modified_tracked_files");
}
if (restorationFailure) {
  throw restorationFailure;
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

interface TreeMetadata {
  readonly kind: "directory" | "file" | "symlink";
  readonly mode: number;
  readonly mtimeNs: bigint;
  readonly relativePath: string;
}

function captureTreeMetadata(rootPath: string) {
  const entries: TreeMetadata[] = [];
  visit(rootPath, "");
  return entries;

  function visit(path: string, relativePath: string) {
    const stat = lstatSync(path, { bigint: true });
    const kind = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file";
    entries.push({ kind, mode: Number(stat.mode), mtimeNs: stat.mtimeNs, relativePath });
    if (kind === "directory") {
      for (const entry of readdirSync(path).sort()) {
        visit(join(path, entry), join(relativePath, entry));
      }
    }
  }
}

function restoreTreeMetadata(rootPath: string, metadata: readonly TreeMetadata[]) {
  const entries = [...metadata].sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") {
      return 1;
    }
    if (left.kind !== "directory" && right.kind === "directory") {
      return -1;
    }
    return right.relativePath.length - left.relativePath.length;
  });

  for (const entry of entries) {
    const path = resolveRepoTreeEntry(rootPath, entry.relativePath);
    const timestamp = nanosecondsToSeconds(entry.mtimeNs);
    if (entry.kind === "symlink") {
      lutimesSync(path, timestamp, timestamp);
      continue;
    }
    chmodSync(path, entry.mode);
    utimesSync(path, timestamp, timestamp);
  }
}

function nanosecondsToSeconds(value: bigint) {
  const nanosecondsPerSecond = 1_000_000_000n;
  const nanosecondsPerMicrosecond = 1_000n;
  const microsecondMidpoint = 500n;
  const portableValue =
    (value / nanosecondsPerMicrosecond) * nanosecondsPerMicrosecond + microsecondMidpoint;
  return (
    Number(portableValue / nanosecondsPerSecond) +
    Number(portableValue % nanosecondsPerSecond) / Number(nanosecondsPerSecond)
  );
}

function resolveRepoLocalPath(relativePath: string) {
  if (isAbsolute(relativePath)) {
    throw new Error(`connector_live_clean_artifact_path_outside_repo:${relativePath}`);
  }
  const absolutePath = resolve(repoRoot, relativePath);
  const resolvedRelativePath = relative(repoRoot, absolutePath);
  if (
    resolvedRelativePath === "" ||
    resolvedRelativePath === ".." ||
    resolvedRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(resolvedRelativePath)
  ) {
    throw new Error(`connector_live_clean_artifact_path_outside_repo:${relativePath}`);
  }
  return absolutePath;
}

function resolveRepoTreeEntry(rootPath: string, relativePath: string) {
  const path = resolve(rootPath, relativePath);
  const resolvedRelativePath = relative(rootPath, path);
  if (
    resolvedRelativePath === ".." ||
    resolvedRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(resolvedRelativePath)
  ) {
    throw new Error(`connector_live_clean_artifact_metadata_path_invalid:${relativePath}`);
  }
  return path;
}
