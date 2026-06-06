#!/usr/bin/env tsx
import { createConnectorLiveSetupReport } from "./connector-live-setup.js";

const args = new Set(process.argv.slice(2));
const environment = args.has("--deployment") ? "deployment" : "local";
const report = createConnectorLiveSetupReport({
  env: process.env,
  environment,
  generatedAt: new Date(),
});

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport();
}

if (report.summary.blocked > 0 || (args.has("--require-live") && !report.canRunLiveConnectorSync)) {
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
