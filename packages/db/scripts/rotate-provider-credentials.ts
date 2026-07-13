import { pathToFileURL } from "node:url";

import {
  createPrismaProviderCredentialMaintenanceStore,
  createSearchOpsPrismaClient,
  parseCredentialKeyring,
  rotateProviderCredentialEncryption,
  type CredentialKeyringEnvironment,
  type CredentialMaintenanceSummary,
  type SearchOpsPrismaClient,
} from "../src/index.js";
import { parseCredentialMaintenanceCliArgs } from "../src/provider-credential-migration.js";

const REDACTED_CODES = new Set([
  "credential_keyring_invalid",
  "credential_maintenance_arguments_invalid",
  "credential_maintenance_options_invalid",
]);

export async function runRotateProviderCredentialsCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let client: SearchOpsPrismaClient | undefined;
  let summary: CredentialMaintenanceSummary | undefined;
  let failureCode: string | undefined;

  try {
    const options = parseCredentialMaintenanceCliArgs(args);
    const keyring = parseCredentialKeyring(env as CredentialKeyringEnvironment);
    client = createSearchOpsPrismaClient();
    summary = await rotateProviderCredentialEncryption(
      createPrismaProviderCredentialMaintenanceStore(client),
      keyring,
      options,
    );
  } catch (error) {
    failureCode = toRedactedCode(error);
  } finally {
    if (client !== undefined) {
      try {
        await client.$disconnect();
      } catch {
        failureCode = "credential_maintenance_failed";
      }
    }
  }

  if (failureCode !== undefined || summary === undefined) {
    console.error(failureCode ?? "credential_maintenance_failed");
    return 1;
  }
  console.log(JSON.stringify(summary));
  return summary.failed > 0 ? 1 : 0;
}

function toRedactedCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return REDACTED_CODES.has(message) ? message : "credential_maintenance_failed";
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  void runRotateProviderCredentialsCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
