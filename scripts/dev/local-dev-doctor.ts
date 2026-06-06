#!/usr/bin/env tsx
import http from "node:http";
import net from "node:net";

type CheckStatus = "ok" | "warning" | "blocked";

interface DoctorCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly nextAction: string;
}

const args = new Set(process.argv.slice(2));
const host = "127.0.0.1";
const ports = {
  api: numberEnv("SEARCHOPS_LOCAL_API_PORT", 4000),
  postgres: numberEnv("SEARCHOPS_LOCAL_POSTGRES_PORT", 5432),
  redis: numberEnv("SEARCHOPS_LOCAL_REDIS_PORT", 6379),
  web: numberEnv("SEARCHOPS_LOCAL_WEB_PORT", 3000),
};

void main();

async function main() {
  const checks = await createLocalDevChecks();
  const summary = summarize(checks);

  if (args.has("--json")) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), checks, summary }, null, 2));
  } else {
    printTextReport(checks, summary);
  }

  if (args.has("--strict") && summary.blocked > 0) {
    process.exitCode = 1;
  }
}

async function createLocalDevChecks(): Promise<DoctorCheck[]> {
  const [postgresOpen, redisOpen, apiOpen, webOpen] = await Promise.all([
    canConnect(host, ports.postgres),
    canConnect(host, ports.redis),
    canConnect(host, ports.api),
    canConnect(host, ports.web),
  ]);
  const apiHealth = apiOpen ? await getApiHealth(ports.api) : "skipped";

  return [
    envCheck(
      "database-url",
      "DATABASE_URL",
      "API/worker cannot start without DATABASE_URL.",
      'export DATABASE_URL="postgresql://searchops:searchops@localhost:5432/searchops_ai?schema=public"',
    ),
    envCheck(
      "redis-url",
      "REDIS_URL",
      "API/worker queues cannot start without REDIS_URL.",
      'export REDIS_URL="redis://localhost:6379"',
    ),
    envCheck(
      "web-api-base-url",
      "SEARCHOPS_API_BASE_URL",
      "web connector actions call fixture mode unless SEARCHOPS_API_BASE_URL is set.",
      'export SEARCHOPS_API_BASE_URL="http://localhost:4000"',
      "warning",
    ),
    portCheck(
      "postgres-port",
      postgresOpen,
      `PostgreSQL is listening on ${host}:${ports.postgres}.`,
      "PostgreSQL is not reachable on the default local port.",
      "Run docker compose up -d from /Users/kionya/searchops-ai, then rerun this check.",
    ),
    portCheck(
      "redis-port",
      redisOpen,
      `Redis is listening on ${host}:${ports.redis}.`,
      "Redis is not reachable on the default local port.",
      "Run docker compose up -d from /Users/kionya/searchops-ai, then rerun this check.",
    ),
    portCheck(
      "api-port",
      apiOpen,
      `API is listening on ${host}:${ports.api}.`,
      "API is not listening on localhost:4000.",
      "Start the API terminal with corepack pnpm --filter @searchops/api dev.",
    ),
    {
      id: "api-health",
      status: apiHealth === "ok" ? "ok" : apiHealth === "skipped" ? "warning" : "blocked",
      summary:
        apiHealth === "ok"
          ? "API /health returned ok."
          : apiHealth === "skipped"
            ? "API /health was skipped because the API port is closed."
            : "API port is open, but /health did not return ok.",
      nextAction:
        apiHealth === "ok"
          ? "API health is ready for connector sync requests."
          : "Check the API terminal logs and restart the API process if needed.",
    },
    portCheck(
      "web-port",
      webOpen,
      `web is listening on ${host}:${ports.web}.`,
      "web is not listening on localhost:3000.",
      "Start the web terminal with corepack pnpm --filter @searchops/web dev.",
      "warning",
    ),
    {
      id: "worker-process",
      status: redisOpen ? "warning" : "blocked",
      summary: redisOpen
        ? "worker has no HTTP port. Confirm the worker terminal shows SearchOps worker listening for jobs."
        : "worker cannot process queues until Redis is reachable.",
      nextAction: "Start the worker terminal with corepack pnpm --filter @searchops/worker dev.",
    },
  ];
}

function envCheck(
  id: string,
  key: string,
  missingSummary: string,
  nextAction: string,
  missingStatus: CheckStatus = "blocked",
): DoctorCheck {
  if (process.env[key]?.trim()) {
    return {
      id,
      status: "ok",
      summary: `${key} is set.`,
      nextAction: "No action needed.",
    };
  }

  return {
    id,
    status: missingStatus,
    summary: missingSummary,
    nextAction,
  };
}

function portCheck(
  id: string,
  open: boolean,
  openSummary: string,
  closedSummary: string,
  nextAction: string,
  closedStatus: CheckStatus = "blocked",
): DoctorCheck {
  return {
    id,
    status: open ? "ok" : closedStatus,
    summary: open ? openSummary : closedSummary,
    nextAction: open ? "No action needed." : nextAction,
  };
}

function canConnect(targetHost: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: targetHost, port, timeout: 500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function getApiHealth(port: number): Promise<"ok" | "failed" | "skipped"> {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host,
        path: "/health",
        port,
        timeout: 800,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(response.statusCode === 200 && body.includes('"ok":true') ? "ok" : "failed");
        });
      },
    );
    request.once("error", () => resolve("failed"));
    request.once("timeout", () => {
      request.destroy();
      resolve("failed");
    });
  });
}

function summarize(items: readonly DoctorCheck[]) {
  return {
    ok: items.filter((item) => item.status === "ok").length,
    warning: items.filter((item) => item.status === "warning").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    total: items.length,
  };
}

function printTextReport(
  items: readonly DoctorCheck[],
  summary: ReturnType<typeof summarize>,
) {
  console.log("SearchOps local dev doctor");
  console.log(`summary: ok=${summary.ok}, warning=${summary.warning}, blocked=${summary.blocked}`);
  console.log("");

  for (const item of items) {
    console.log(`[${item.status}] ${item.id}`);
    console.log(`  ${item.summary}`);
    console.log(`  next: ${item.nextAction}`);
  }
}

function numberEnv(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
