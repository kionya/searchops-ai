import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function acquireGenerateLock() {
  const lockPath = join(tmpdir(), "searchops-prisma-generate.lock");
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    try {
      const fd = openSync(lockPath, "wx");
      return () => {
        closeSync(fd);
        rmSync(lockPath, { force: true });
      };
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code !== "EEXIST") {
        throw error;
      }

      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs;
        if (ageMs > 120_000) {
          rmSync(lockPath, { force: true });
        }
      } catch {
        // Another process may have released the lock between the EEXIST and stat calls.
      }

      await delay(250);
    }
  }

  throw new Error(`Timed out waiting for Prisma generate lock at ${lockPath}`);
}

function ensurePnpmShim() {
  const shimDir = join(tmpdir(), "searchops-prisma-bin");
  mkdirSync(shimDir, { recursive: true });

  if (process.platform === "win32") {
    writeFileSync(join(shimDir, "pnpm.cmd"), "@echo off\r\ncorepack pnpm %*\r\n", "ascii");
    return shimDir;
  }

  writeFileSync(join(shimDir, "pnpm"), "#!/usr/bin/env sh\ncorepack pnpm \"$@\"\n", {
    encoding: "utf8",
    mode: 0o755
  });
  return shimDir;
}

async function main() {
  const releaseLock = await acquireGenerateLock();
  const shimDir = ensurePnpmShim();
  const pathValue = `${shimDir}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`;
  const env = {
    ...process.env,
    npm_config_ignore_workspace_root_check: "true",
    ...(process.platform === "win32" ? { Path: pathValue } : {}),
    PATH: pathValue
  };
  delete env.PRISMA_GENERATE_SKIP_AUTOINSTALL;

  try {
    await new Promise<void>((resolve, reject) => {
      const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
      const child = spawn("prisma", ["generate", "--schema", "packages/db/prisma/schema.prisma"], {
        cwd: repoRoot,
        env,
        shell: process.platform === "win32",
        stdio: "inherit"
      });

      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`prisma generate exited with code ${code ?? "unknown"}`));
      });
    });
  } finally {
    releaseLock();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
