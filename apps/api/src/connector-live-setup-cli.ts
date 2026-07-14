#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";

import { createConnectorLiveSetupCliEnv } from "./connector-live-setup-cli-env.js";
import { createConnectorLiveSetupReport, summarizeConnectorLiveSetupFailure } from "./connector-live-setup.js";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const environment = args.has("--deployment") ? "deployment" : "local";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const apiEnvFile = readOption(rawArgs, "--api-env-file");
const workerEnvFile = readOption(rawArgs, "--worker-env-file");
const cliEnv = createConnectorLiveSetupCliEnv({
  ...(apiEnvFile === undefined ? {} : { apiEnvFile }),
  baseEnv: process.env,
  environment,
  repoRoot,
  ...(workerEnvFile === undefined ? {} : { workerEnvFile }),
});
const report = createConnectorLiveSetupReport({
  apiEnv: cliEnv.apiEnv,
  environment,
  generatedAt: new Date(),
  ...(cliEnv.workerEnv === undefined ? {} : { workerEnv: cliEnv.workerEnv }),
});

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport();
}

const requireLive = args.has("--require-live");
const failureSummary = summarizeConnectorLiveSetupFailure(report, { requireLive });

if (failureSummary) {
  console.log(failureSummary);
  process.exitCode = 1;
}

function printTextReport() {
  console.log(`SearchOps connector live setup check (${report.environment})`);
  console.log(`liveExternalApis=${report.liveExternalApis}`);
  console.log(`canRunFixtureMode=${String(report.canRunFixtureMode)}`);
  console.log(`canRunLiveConnectorSync=${String(report.canRunLiveConnectorSync)}`);
  console.log(
    `summary: ready=${report.summary.ready}, configured=${report.summary.configured}, warnings=${report.summary.warnings}, needsProvisioning=${report.summary.needsProvisioning}, blocked=${report.summary.blocked}`,
  );
  console.log("");

  for (const check of report.checks) {
    console.log(`[${check.status}] ${check.id} - ${check.title}`);
    console.log(`  ${check.summary}`);
    console.log(`  next: ${check.nextAction}`);
    console.log(`  env: ${check.envKeys.join(", ")}`);
  }
}

function readOption(args: readonly string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
