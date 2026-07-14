import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const artifactPaths = [
  "packages/types/dist",
  "packages/db/dist",
  "packages/connectors/dist",
  "packages/db/src/generated",
] as const;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("connector live clean-artifact smoke", () => {
  it("reports missing corepack and restores artifact hashes and tracked state", () => {
    const pathDirectory = createLocalTemporaryDirectory("path-");
    symlinkSync(resolveExecutable("git"), join(pathDirectory, "git"));
    const artifactsBefore = snapshotArtifactPaths();
    const trackedBefore = readTrackedStatus();

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/test/connector-live-clean-artifact-smoke.ts"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          HOME: process.env.HOME ?? "",
          PATH: pathDirectory,
        },
      },
    );
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_spawn_failed");
    expect(diagnostic).toMatch(/spawn corepack ENOENT/);
    expect(snapshotArtifactPaths()).toEqual(artifactsBefore);
    expect(readTrackedStatus()).toBe(trackedBefore);
  });

  it("restores all generated trees after dependency builds complete and the CLI fails", () => {
    const artifactsBefore = snapshotArtifactPaths();
    const trackedBefore = readTrackedStatus();

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/test/connector-live-clean-artifact-smoke.ts",
        "--inject-after-build-failure",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          HOME: process.env.HOME ?? "",
          PATH: process.env.PATH ?? "",
        },
      },
    );
    const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_smoke_failed");
    expect(diagnostic).toContain("connector_env_file_not_found:");
    expect(diagnostic).toContain("@searchops/types@0.0.0 build");
    expect(diagnostic).toContain("@searchops/db@0.0.0 build");
    expect(diagnostic).toContain("@searchops/connectors@0.0.0 build");
    expect(diagnostic).toContain(`builtArtifacts=${artifactPaths.join(",")}`);
    expect(snapshotArtifactPaths()).toEqual(artifactsBefore);
    expect(readTrackedStatus()).toBe(trackedBefore);
  }, 30_000);

  it("restores earlier artifacts when a later backup copy fails", () => {
    const fixture = createTransactionFixture();
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture, "backup-copy:1");
    const diagnostic = collectDiagnostic(result);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_backup_failed");
    expect(snapshotArtifactPaths(fixture.repoRoot)).toEqual(fixture.artifactsBefore);
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);

  it("recovers a partially mutated target when original removal fails after backup", () => {
    const fixture = createTransactionFixture();
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture, "original-remove-partial:0");
    const diagnostic = collectDiagnostic(result);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_original_remove_failed");
    expect(snapshotArtifactPaths(fixture.repoRoot)).toEqual(fixture.artifactsBefore);
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);

  it("retains an exact repo-local recovery backup when restoration copy fails", () => {
    const fixture = createTransactionFixture();
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture, "restore-copy:0");
    const diagnostic = collectDiagnostic(result);
    const recoveryPath = readRecoveryPath(diagnostic, fixture.repoRoot);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_restore_failed");
    expect(snapshotTree(recoveryPath)).toEqual(fixture.artifactsBefore[artifactPaths[0]]);
    for (const unaffectedPath of artifactPaths.slice(1)) {
      expect(snapshotTree(resolve(fixture.repoRoot, unaffectedPath))).toEqual(
        fixture.artifactsBefore[unaffectedPath],
      );
    }
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);

  it("retains the verified backup when backup cleanup fails", () => {
    const fixture = createTransactionFixture();
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture, "backup-cleanup:0");
    const diagnostic = collectDiagnostic(result);
    const recoveryPath = readRecoveryPath(diagnostic, fixture.repoRoot);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_backup_cleanup_failed");
    expect(snapshotArtifactPaths(fixture.repoRoot)).toEqual(fixture.artifactsBefore);
    expect(snapshotTree(recoveryPath)).toEqual(fixture.artifactsBefore[artifactPaths[0]]);
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);

  it("rolls back the quarantined target and retains backup when restore install fails", () => {
    const fixture = createTransactionFixture();
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture, "restore-install:0");
    const diagnostic = collectDiagnostic(result);
    const recoveryPath = readRecoveryPath(diagnostic, fixture.repoRoot);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_restore_failed");
    expect(existsSync(resolve(fixture.repoRoot, artifactPaths[0]))).toBe(true);
    expect(snapshotTree(recoveryPath)).toEqual(fixture.artifactsBefore[artifactPaths[0]]);
    for (const unaffectedPath of artifactPaths.slice(1)) {
      expect(snapshotTree(resolve(fixture.repoRoot, unaffectedPath))).toEqual(
        fixture.artifactsBefore[unaffectedPath],
      );
    }
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);

  it("rejects a symlink ancestor that escapes a synthetic repository root", () => {
    const fixture = createTransactionFixture({ symlinkPackagesOutside: true });
    const trackedBefore = readTrackedStatus();

    const result = runFixtureSmoke(fixture);
    const diagnostic = collectDiagnostic(result);

    expect(result.status).not.toBe(0);
    expect(diagnostic).toContain("connector_live_clean_artifact_symlink_component");
    assertOutsideAndTrackedState(fixture, trackedBefore);
  }, 30_000);
});

function resolveExecutable(command: string) {
  const result = spawnSync("/usr/bin/which", [command], {
    encoding: "utf8",
  });
  const path = result.stdout?.trim();
  if (result.status !== 0 || !path) {
    throw new Error(`missing_test_executable:${command}`);
  }
  return path;
}

function readTrackedStatus() {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("test_git_status_failed");
  }
  return result.stdout ?? "";
}

function snapshotArtifactPaths(root = repoRoot) {
  return Object.fromEntries(
    artifactPaths.map((relativePath) => [relativePath, snapshotTree(resolve(root, relativePath))]),
  ) as Record<(typeof artifactPaths)[number], ArtifactSnapshot>;
}

function snapshotTree(path: string): ArtifactSnapshot {
  const contentHash = createHash("sha256");
  const metadataHash = createHash("sha256");
  hashPath(path, contentHash, metadataHash);
  return {
    contentHash: contentHash.digest("hex"),
    metadataHash: metadataHash.digest("hex"),
  };
}

interface ArtifactSnapshot {
  readonly contentHash: string;
  readonly metadataHash: string;
}

function hashPath(
  path: string,
  contentHash: ReturnType<typeof createHash>,
  metadataHash: ReturnType<typeof createHash>,
) {
  let stat;
  try {
    stat = lstatSync(path, { bigint: true });
  } catch {
    contentHash.update("missing");
    metadataHash.update("missing");
    return;
  }

  if (stat.isSymbolicLink()) {
    contentHash.update(`link:${readlinkSync(path)}`);
    metadataHash.update(`link:${stat.mode}:${stat.mtimeNs / 1_000n}`);
    return;
  }
  if (stat.isDirectory()) {
    contentHash.update("directory");
    metadataHash.update(`directory:${stat.mode}:${stat.mtimeNs / 1_000n}`);
    for (const entry of readdirSync(path).sort()) {
      contentHash.update(entry);
      metadataHash.update(entry);
      hashPath(join(path, entry), contentHash, metadataHash);
    }
    return;
  }

  contentHash.update("file");
  contentHash.update(readFileSync(path));
  metadataHash.update(`file:${stat.mode}:${stat.mtimeNs / 1_000n}:${stat.size}`);
}

interface TransactionFixture {
  readonly artifactsBefore: Record<(typeof artifactPaths)[number], ArtifactSnapshot>;
  readonly containerRoot: string;
  readonly outsideBefore: ArtifactSnapshot;
  readonly outsideRoot: string;
  readonly repoRoot: string;
  readonly repoRootRelative: string;
}

function createTransactionFixture({
  symlinkPackagesOutside = false,
}: {
  readonly symlinkPackagesOutside?: boolean;
} = {}): TransactionFixture {
  const containerRoot = createLocalTemporaryDirectory("fixture-");
  const fixtureRepoRoot = join(containerRoot, "repo");
  const outsideRoot = join(containerRoot, "outside");
  mkdirSync(fixtureRepoRoot, { recursive: true });
  mkdirSync(outsideRoot, { recursive: true });
  writeFileSync(join(outsideRoot, "sentinel.txt"), "outside-root-must-not-change\n");

  if (symlinkPackagesOutside) {
    symlinkSync(outsideRoot, join(fixtureRepoRoot, "packages"));
  } else {
    for (const [index, artifactPath] of artifactPaths.entries()) {
      const target = resolve(fixtureRepoRoot, artifactPath);
      mkdirSync(join(target, "nested"), { recursive: true });
      writeFileSync(join(target, "fixture.txt"), `original-${index}\n`);
      writeFileSync(join(target, "nested", ".metadata"), `nested-${index}\n`);
    }
  }

  return {
    artifactsBefore: snapshotArtifactPaths(fixtureRepoRoot),
    containerRoot,
    outsideBefore: snapshotTree(outsideRoot),
    outsideRoot,
    repoRoot: fixtureRepoRoot,
    repoRootRelative: relative(repoRoot, fixtureRepoRoot),
  };
}

function createLocalTemporaryDirectory(prefix: string) {
  const fixtureBase = resolve(repoRoot, ".superpowers/smoke-transaction-fixtures");
  mkdirSync(fixtureBase, { recursive: true });
  const directory = mkdtempSync(join(fixtureBase, prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runFixtureSmoke(fixture: TransactionFixture, failure?: string) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/test/connector-live-clean-artifact-smoke.ts",
      `--test-fixture-root=${fixture.repoRootRelative}`,
      ...(failure === undefined ? [] : [`--inject-transaction-failure=${failure}`]),
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        HOME: process.env.HOME ?? "",
        PATH: process.env.PATH ?? "",
      },
    },
  );
}

function collectDiagnostic(result: ReturnType<typeof spawnSync>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function readRecoveryPath(diagnostic: string, fixtureRepoRoot: string) {
  const match = /manualRecoveryPath=([^\s;]+)/.exec(diagnostic);
  expect(match?.[1]).toBeTruthy();
  const relativePath = match?.[1] ?? "";
  expect(isAbsolute(relativePath)).toBe(false);
  const absolutePath = resolve(fixtureRepoRoot, relativePath);
  expect(relative(fixtureRepoRoot, absolutePath)).not.toMatch(/^\.\.(?:\/|$)/);
  return absolutePath;
}

function assertOutsideAndTrackedState(fixture: TransactionFixture, trackedBefore: string) {
  expect(snapshotTree(fixture.outsideRoot)).toEqual(fixture.outsideBefore);
  expect(readTrackedStatus()).toBe(trackedBefore);
}
