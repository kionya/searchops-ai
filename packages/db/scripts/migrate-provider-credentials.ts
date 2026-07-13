import { pathToFileURL } from "node:url";

import {
  createPrismaProviderCredentialMaintenanceStore,
  createSearchOpsPrismaClient,
  migrateLegacyProviderCredentials,
  parseCredentialKeyring,
  type CredentialKeyring,
  type CredentialKeyringEnvironment,
  type CredentialMaintenanceCliOptions,
  type CredentialMaintenanceSummary,
  type ProviderCredentialMaintenanceStore,
  type SearchOpsPrismaClient,
} from "../src/index.js";
import { parseCredentialMaintenanceCliArgs } from "../src/provider-credential-migration.js";

const REDACTED_CODES = new Set([
  "credential_keyring_invalid",
  "credential_legacy_ga4_property_invalid",
  "credential_maintenance_arguments_invalid",
  "credential_maintenance_options_invalid",
]);

export interface CredentialMaintenanceCliClient {
  $disconnect(): Promise<void>;
}

export interface MigrateProviderCredentialsCliDependencies {
  parseArgs(args: readonly string[]): CredentialMaintenanceCliOptions;
  parseKeyring(env: NodeJS.ProcessEnv): CredentialKeyring;
  createClient(): CredentialMaintenanceCliClient;
  createStore(client: CredentialMaintenanceCliClient): ProviderCredentialMaintenanceStore;
  execute(
    store: ProviderCredentialMaintenanceStore,
    keyring: CredentialKeyring,
    options: CredentialMaintenanceCliOptions & { readonly legacyGa4PropertyId?: string },
  ): Promise<CredentialMaintenanceSummary>;
  writeOutput(message: string): void;
  writeError(message: string): void;
}

const productionDependencies: MigrateProviderCredentialsCliDependencies = {
  parseArgs: parseCredentialMaintenanceCliArgs,
  parseKeyring: (env) => parseCredentialKeyring(env as CredentialKeyringEnvironment),
  createClient: createSearchOpsPrismaClient,
  createStore: (client) =>
    createPrismaProviderCredentialMaintenanceStore(client as SearchOpsPrismaClient),
  execute: migrateLegacyProviderCredentials,
  writeOutput: (message) => console.log(message),
  writeError: (message) => console.error(message),
};

export async function runMigrateProviderCredentialsCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  dependencies: MigrateProviderCredentialsCliDependencies = productionDependencies,
): Promise<number> {
  let client: CredentialMaintenanceCliClient | undefined;
  let summary: CredentialMaintenanceSummary | undefined;
  let failureCode: string | undefined;

  try {
    const options = dependencies.parseArgs(args);
    const legacyGa4PropertyId = parseLegacyGa4PropertyId(env.SEARCHOPS_GA4_PROPERTY_ID);
    const keyring = dependencies.parseKeyring(env);
    client = dependencies.createClient();
    summary = await dependencies.execute(
      dependencies.createStore(client),
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
    dependencies.writeError(failureCode ?? "credential_maintenance_failed");
    return 1;
  }
  dependencies.writeOutput(JSON.stringify(summary));
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
