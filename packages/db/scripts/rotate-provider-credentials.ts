import { pathToFileURL } from "node:url";

import {
  createPrismaProviderCredentialMaintenanceStore,
  createSearchOpsPrismaClient,
  parseCredentialKeyring,
  rotateProviderCredentialEncryption,
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
  "credential_maintenance_arguments_invalid",
  "credential_maintenance_options_invalid",
]);

export interface CredentialMaintenanceCliClient {
  $disconnect(): Promise<void>;
}

export interface RotateProviderCredentialsCliDependencies {
  parseArgs(args: readonly string[]): CredentialMaintenanceCliOptions;
  parseKeyring(env: NodeJS.ProcessEnv): CredentialKeyring;
  createClient(): CredentialMaintenanceCliClient;
  createStore(client: CredentialMaintenanceCliClient): ProviderCredentialMaintenanceStore;
  execute(
    store: ProviderCredentialMaintenanceStore,
    keyring: CredentialKeyring,
    options: CredentialMaintenanceCliOptions,
  ): Promise<CredentialMaintenanceSummary>;
  writeOutput(message: string): void;
  writeError(message: string): void;
}

const productionDependencies: RotateProviderCredentialsCliDependencies = {
  parseArgs: parseCredentialMaintenanceCliArgs,
  parseKeyring: (env) => parseCredentialKeyring(env as CredentialKeyringEnvironment),
  createClient: createSearchOpsPrismaClient,
  createStore: (client) =>
    createPrismaProviderCredentialMaintenanceStore(client as SearchOpsPrismaClient),
  execute: rotateProviderCredentialEncryption,
  writeOutput: (message) => console.log(message),
  writeError: (message) => console.error(message),
};

export async function runRotateProviderCredentialsCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  dependencies: RotateProviderCredentialsCliDependencies = productionDependencies,
): Promise<number> {
  let client: CredentialMaintenanceCliClient | undefined;
  let summary: CredentialMaintenanceSummary | undefined;
  let failureCode: string | undefined;

  try {
    const options = dependencies.parseArgs(args);
    const keyring = dependencies.parseKeyring(env);
    client = dependencies.createClient();
    summary = await dependencies.execute(
      dependencies.createStore(client),
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
    dependencies.writeError(failureCode ?? "credential_maintenance_failed");
    return 1;
  }
  dependencies.writeOutput(JSON.stringify(summary));
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
