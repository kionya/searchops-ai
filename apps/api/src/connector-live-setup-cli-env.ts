import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import type { ConnectorLiveSetupEnvironment } from "@searchops/types";

interface CreateConnectorLiveSetupCliEnvInput {
  readonly apiEnvFile?: string;
  readonly baseEnv: NodeJS.ProcessEnv;
  readonly environment: ConnectorLiveSetupEnvironment;
  readonly repoRoot: string;
  readonly workerEnvFile?: string;
}

export function createConnectorLiveSetupCliEnv({
  apiEnvFile,
  baseEnv,
  environment,
  repoRoot,
  workerEnvFile,
}: CreateConnectorLiveSetupCliEnvInput): {
  readonly apiEnv: NodeJS.ProcessEnv;
  readonly workerEnv?: NodeJS.ProcessEnv;
} {
  const explicitApiEnv = apiEnvFile === undefined
    ? undefined
    : readRequiredEnvFile(resolve(repoRoot, apiEnvFile));
  const explicitWorkerEnv = workerEnvFile === undefined
    ? undefined
    : readRequiredEnvFile(resolve(repoRoot, workerEnvFile));

  if (environment === "deployment") {
    return {
      apiEnv: explicitApiEnv ?? baseEnv,
      ...(explicitWorkerEnv === undefined ? {} : { workerEnv: explicitWorkerEnv }),
    };
  }

  const localWorkerEnv = explicitWorkerEnv ?? readEnvFileIfPresent(
    resolve(repoRoot, ".env.worker.local"),
  );

  return {
    apiEnv: explicitApiEnv ?? {
      ...(readEnvFileIfPresent(resolve(repoRoot, ".env.api.local")) ?? {}),
      ...baseEnv,
    },
    ...(localWorkerEnv === undefined ? {} : { workerEnv: localWorkerEnv }),
  };
}

function readEnvFileIfPresent(path: string): NodeJS.ProcessEnv | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return parseEnv(readFileSync(path, "utf8"));
}

function readRequiredEnvFile(path: string): NodeJS.ProcessEnv {
  const env = readEnvFileIfPresent(path);
  if (env === undefined) {
    throw new Error(`connector_env_file_not_found:${path}`);
  }
  return env;
}
