import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";

const composeFile = "scripts/test/docker-compose.runtime-smoke.yml";
const projectName = "searchops-runtime-smoke";

let smokeEnv: NodeJS.ProcessEnv = { ...process.env };

async function reserveOpenPorts(count: number) {
  const reservations = await Promise.all(
    Array.from({ length: count }, () =>
      new Promise<{ close(): Promise<void>; port: number }>((resolve, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address() as AddressInfo;
          resolve({
            async close() {
              await new Promise<void>((closeResolve, closeReject) => {
                server.close((error) => {
                  if (error) {
                    closeReject(error);
                    return;
                  }
                  closeResolve();
                });
              });
            },
            port: address.port
          });
        });
      }),
    ),
  );
  const ports = reservations.map((reservation) => reservation.port);
  await Promise.all(reservations.map((reservation) => reservation.close()));
  return ports;
}

function createSmokeEnv(input: { postgresPort: number; redisPort: number }) {
  const shimDir = ensurePnpmShim();
  const pathValue = `${shimDir}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`;
  return {
    ...process.env,
    DATABASE_URL: `postgresql://searchops:searchops@127.0.0.1:${input.postgresPort}/searchops_smoke?schema=public`,
    NODE_ENV: "test",
    npm_config_ignore_workspace_root_check: "true",
    ...(process.platform === "win32" ? { Path: pathValue } : {}),
    PATH: pathValue,
    REDIS_URL: `redis://127.0.0.1:${input.redisPort}`,
    RUN_RUNTIME_SMOKE: "1",
    SEARCHOPS_SMOKE_POSTGRES_PORT: String(input.postgresPort),
    SEARCHOPS_SMOKE_REDIS_PORT: String(input.redisPort)
  };
}

function ensurePnpmShim() {
  const shimDir = join(tmpdir(), "searchops-runtime-smoke-bin");
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

function commandName(command: string) {
  if (process.platform !== "win32") {
    return command;
  }
  return command === "corepack" ? "corepack.cmd" : command;
}

function commandArgs(command: string, args: readonly string[]) {
  if (command === "pnpm") {
    return {
      args: ["pnpm", ...args],
      command: "corepack"
    };
  }

  return { args, command };
}

function run(command: string, args: readonly string[], options: { allowFailure?: boolean } = {}) {
  return new Promise<void>((resolve, reject) => {
    const resolved = commandArgs(command, args);
    const child = spawn(commandName(resolved.command), resolved.args, {
      env: smokeEnv,
      shell: process.platform === "win32",
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure === true) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const [postgresPort, redisPort] = await reserveOpenPorts(2);
  if (postgresPort === undefined || redisPort === undefined) {
    throw new Error("Unable to reserve runtime smoke test ports.");
  }
  smokeEnv = createSmokeEnv({ postgresPort, redisPort });

  await run("pnpm", ["--filter", "@searchops/types", "build"]);
  await run("pnpm", ["--filter", "@searchops/crawler-core", "build"]);
  await run("pnpm", ["--filter", "@searchops/db", "build"]);

  try {
    await run("docker", ["compose", "-f", composeFile, "-p", projectName, "up", "-d", "--wait"]);
    await run("pnpm", [
      "--filter",
      "@searchops/db",
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma"
    ]);
    await run("pnpm", ["exec", "tsx", "scripts/test/runtime-smoke-runner.ts"]);
  } finally {
    await run(
      "docker",
      ["compose", "-f", composeFile, "-p", projectName, "down", "-v", "--remove-orphans"],
      { allowFailure: true },
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
