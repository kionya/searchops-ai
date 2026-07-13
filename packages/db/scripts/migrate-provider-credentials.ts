import { pathToFileURL } from "node:url";

import {
  createPrismaProviderCredentialMaintenanceStore,
  createSearchOpsPrismaClient,
  migrateLegacyProviderCredentials,
  parseCredentialKeyring,
  type CredentialKeyringEnvironment,
  type CredentialMaintenanceSummary,
  type SearchOpsPrismaClient,
} from "../src/index.js";
import { parseCredentialMaintenanceCliArgs } from "../src/provider-credential-migration.js";

const REDACTED_CODES = new Set([
  "credential_keyring_invalid",
  "credential_legacy_ga4_property_invalid",
  "credential_maintenance_arguments_invalid",
  "credential_maintenance_options_invalid",
]);

export async function runMigrateProviderCredentialsCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let client: SearchOpsPrismaClient | undefined;
  let summary: CredentialMaintenanceSummary | undefined;
  let failureCode: string | undefined;

  try {
    const options = parseCredentialMaintenanceCliArgs(args);
    const legacyGa4PropertyId = parseLegacyGa4PropertyId(env.SEARCHOPS_GA4_PROPERTY_ID);
    const keyring = parseCredentialKeyring(env as CredentialKeyringEnvironment);
    client = createSearchOpsPrismaClient();
    summary = await migrateLegacyProviderCredentials(
      createPrismaProviderCredentialMaintenanceStore(client),
      keyring,
      { ...options, ...(legacyGa4PropertyId === undefined ? {} : { legacyGa4PropertyId }) },
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

function parseLegacyGa4PropertyId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error("credential_legacy_ga4_property_invalid");
  }
  return normalized;
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
  void runMigrateProviderCredentialsCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
