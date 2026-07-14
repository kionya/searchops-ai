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
    const artifactsBefore = hashArtifactPaths();
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
    expect(hashArtifactPaths()).toBe(artifactsBefore);
    expect(readTrackedStatus()).toBe(trackedBefore);
  });
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

function hashArtifactPaths() {
  const hash = createHash("sha256");
  for (const relativePath of artifactPaths) {
    hash.update(relativePath);
    hashPath(resolve(repoRoot, relativePath), hash);
  }
  return hash.digest("hex");
}

function hashPath(path: string, hash: ReturnType<typeof createHash>) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    hash.update("missing");
    return;
  }

  if (stat.isSymbolicLink()) {
    hash.update(`link:${readlinkSync(path)}`);
    return;
  }
  if (stat.isDirectory()) {
    hash.update("directory");
    for (const entry of readdirSync(path).sort()) {
      hash.update(entry);
      hashPath(join(path, entry), hash);
    }
    return;
  }

  hash.update("file");
  hash.update(readFileSync(path));
}
