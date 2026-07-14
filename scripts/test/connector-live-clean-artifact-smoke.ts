import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import {
  type ArtifactTransactionFaultEvent,
  connectorLiveArtifactPaths,
  formatUnknownError,
  runConnectorLiveArtifactTransaction,
} from "./connector-live-artifact-transaction.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const rawArgs = process.argv.slice(2);
const injectAfterBuildFailure = rawArgs.includes("--inject-after-build-failure");
const fixtureRootOption = readOption(rawArgs, "--test-fixture-root");
const transactionFailure = readOption(rawArgs, "--inject-transaction-failure");
const missingEnvPath = "scripts/test/connector-live-clean-artifact-missing.env";
const trackedBefore = readTrackedStatus();
let smokeFailure: unknown;

try {
  if (fixtureRootOption !== undefined) {
    runFixtureTransaction(fixtureRootOption, transactionFailure);
  } else {
    if (transactionFailure !== undefined) {
      throw new Error("connector_live_clean_artifact_fixture_required_for_fault");
    }
    runRealConnectorSmoke();
  }
} catch (error) {
  smokeFailure = error;
}

if (readTrackedStatus() !== trackedBefore) {
  throw new Error("connector_live_clean_artifact_modified_tracked_files", {
    cause: smokeFailure,
  });
}
if (smokeFailure !== undefined) {
  throw smokeFailure;
}

console.log("Connector live clean-artifact smoke passed.");

function runRealConnectorSmoke() {
  if (injectAfterBuildFailure && existsSync(resolve(repositoryRoot, missingEnvPath))) {
    throw new Error("connector_live_clean_artifact_failure_target_exists");
  }

  runConnectorLiveArtifactTransaction({
    repositoryRoot,
    runOperation: ({ artifactTargets }) => {
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
          cwd: repositoryRoot,
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
        throw new Error(
          `connector_live_clean_artifact_spawn_failed: ${formatSpawnError("corepack", result.error)}${formatOutput(stdout, stderr)}`,
          { cause: result.error },
        );
      }
      if (injectAfterBuildFailure && builtArtifactPaths.length !== artifactTargets.length) {
        throw new Error(
          `connector_live_clean_artifact_build_evidence_failed: ${buildEvidence}${formatOutput(stdout, stderr)}`,
        );
      }
      if (
        result.status !== 0 ||
        !stdout.includes('"liveExternalApis": "disabled"') ||
        !stdout.includes('"worker-runtime-base-env"')
      ) {
        throw new Error(
          `connector_live_clean_artifact_smoke_failed: status=${String(result.status)}; ${buildEvidence}${formatOutput(stdout, stderr)}`,
        );
      }
    },
  });
}

function runFixtureTransaction(fixtureRoot: string, failure: string | undefined) {
  const validatedFixtureRoot = resolveFixtureRoot(fixtureRoot);
  const injectFault = createFixtureFault(failure);

  runConnectorLiveArtifactTransaction({
    repositoryRoot: validatedFixtureRoot,
    ...(injectFault === undefined ? {} : { injectFault }),
    runOperation: ({ artifactTargets }) => {
      for (const [index, target] of artifactTargets.entries()) {
        mkdirSync(target.absolutePath, { recursive: true });
        writeFileSync(join(target.absolutePath, "built.txt"), `built-${index}\n`);
      }
    },
  });
}

function createFixtureFault(failure: string | undefined) {
  if (failure === undefined) {
    return undefined;
  }
  const match =
    /^(backup-copy|original-remove-partial|restore-copy|restore-install|backup-cleanup):(\d+)$/.exec(
      failure,
    );
  if (match === null) {
    throw new Error(`connector_live_clean_artifact_unknown_fixture_fault:${failure}`);
  }
  const fault = match[1];
  const artifactIndex = Number(match[2]);

  return (event: ArtifactTransactionFaultEvent) => {
    if (event.artifactIndex !== artifactIndex) {
      return;
    }
    if (fault === "backup-copy" && event.point === "before-backup-copy") {
      throw new Error("injected_later_backup_copy_failure");
    }
    if (fault === "original-remove-partial" && event.point === "before-original-remove") {
      rmSync(join(event.targetPath, "fixture.txt"), { force: true });
      writeFileSync(join(event.targetPath, "partial-mutation.txt"), "partial\n");
      throw new Error("injected_partial_original_remove_failure");
    }
    if (fault === "restore-copy" && event.point === "before-restore-copy") {
      throw new Error("injected_restore_copy_failure");
    }
    if (fault === "restore-install" && event.point === "before-restore-install") {
      throw new Error("injected_restore_install_failure");
    }
    if (fault === "backup-cleanup" && event.point === "before-backup-cleanup") {
      throw new Error("injected_backup_cleanup_failure");
    }
  };
}

function resolveFixtureRoot(relativePath: string) {
  if (isAbsolute(relativePath)) {
    throw new Error("connector_live_clean_artifact_fixture_outside_repo");
  }
  const fixtureBase = resolve(repositoryRoot, ".superpowers/smoke-transaction-fixtures");
  const absolutePath = resolve(repositoryRoot, relativePath);
  const relativeToFixtureBase = relative(fixtureBase, absolutePath);
  if (
    relativeToFixtureBase === ".." ||
    relativeToFixtureBase.startsWith(`..${sep}`) ||
    isAbsolute(relativeToFixtureBase)
  ) {
    throw new Error("connector_live_clean_artifact_fixture_outside_repo");
  }
  return absolutePath;
}

function readTrackedStatus() {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repositoryRoot,
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

function readOption(args: readonly string[], name: string) {
  const prefix = `${name}=`;
  const option = args.find((argument) => argument.startsWith(prefix));
  return option?.slice(prefix.length);
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

if (connectorLiveArtifactPaths.length !== 4) {
  throw new Error("connector_live_clean_artifact_contract_changed");
}
