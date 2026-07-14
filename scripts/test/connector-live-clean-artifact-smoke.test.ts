import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
    const pathDirectory = mkdtempSync(join(tmpdir(), "searchops-smoke-path-"));
    temporaryDirectories.push(pathDirectory);
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

function snapshotArtifactPaths() {
  const contentHash = createHash("sha256");
  const metadataHash = createHash("sha256");
  for (const relativePath of artifactPaths) {
    contentHash.update(relativePath);
    metadataHash.update(relativePath);
    hashPath(resolve(repoRoot, relativePath), contentHash, metadataHash);
  }
  return {
    contentHash: contentHash.digest("hex"),
    metadataHash: metadataHash.digest("hex"),
  };
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
