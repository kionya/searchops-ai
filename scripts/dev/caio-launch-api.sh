#!/bin/bash
# SearchOps API local always-on launcher. Runtime values come from an ignored env file.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./launch-common.sh
source "${SCRIPT_DIR}/launch-common.sh"

load_runtime_env "${SEARCHOPS_API_ENV_FILE:-${SEARCHOPS_REPO_ROOT}/.env.api.local}"
require_env DATABASE_URL DIRECT_DATABASE_URL REDIS_URL
require_command node
require_build "apps/api/dist/index.js" "corepack pnpm --filter @searchops/api build"

export PORT="${PORT:-4000}"
export SEARCHOPS_API_HOST="${SEARCHOPS_API_HOST:-127.0.0.1}"
export SEARCHOPS_API_BASE_URL="${SEARCHOPS_API_BASE_URL:-http://localhost:${PORT}}"
export SEARCHOPS_PUBLIC_APP_URL="${SEARCHOPS_PUBLIC_APP_URL:-http://localhost:3000}"

wait_for_local_dependencies
cd "$SEARCHOPS_REPO_ROOT"
exec node apps/api/dist/index.js
