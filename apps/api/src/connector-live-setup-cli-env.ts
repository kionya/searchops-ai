import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import type { ConnectorLiveSetupEnvironment } from "@searchops/types";

interface CreateConnectorLiveSetupCliEnvInput {
  readonly baseEnv: NodeJS.ProcessEnv;
  readonly environment: ConnectorLiveSetupEnvironment;
  readonly repoRoot: string;
}

export function createConnectorLiveSetupCliEnv({
  baseEnv,
  environment,
  repoRoot,
}: CreateConnectorLiveSetupCliEnvInput): NodeJS.ProcessEnv {
  if (environment === "deployment") {
    return baseEnv;
  }

  return {
    ...readEnvFileIfPresent(resolve(repoRoot, ".env.api.local")),
    ...readEnvFileIfPresent(resolve(repoRoot, ".env.worker.local")),
    ...baseEnv,
  };
}

function readEnvFileIfPresent(path: string): NodeJS.ProcessEnv {
  if (!existsSync(path)) {
    return {};
  }

  return parseEnv(readFileSync(path, "utf8"));
}
