#!/bin/bash

set -euo pipefail

SEARCHOPS_LAUNCH_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SEARCHOPS_REPO_ROOT="$(cd -- "${SEARCHOPS_LAUNCH_SCRIPT_DIR}/../.." && pwd)"
readonly SEARCHOPS_LAUNCH_SCRIPT_DIR SEARCHOPS_REPO_ROOT

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"

fail() {
  printf 'SearchOps local launcher: %s\n' "$1" >&2
  exit 1
}

load_runtime_env() {
  local env_file="$1"

  if [[ ! -f "$env_file" ]]; then
    fail "missing env file: ${env_file}"
  fi

  set -a
  # Local runtime env files are owner-controlled and excluded from Git.
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_env() {
  local key

  for key in "$@"; do
    if [[ -z "${!key:-}" ]]; then
      fail "required environment variable is not set: ${key}"
    fi
  done
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "required command is not available: ${command_name}"
  fi
}

require_build() {
  local entrypoint="$1"
  local build_command="$2"

  if [[ ! -f "${SEARCHOPS_REPO_ROOT}/${entrypoint}" ]]; then
    fail "missing ${entrypoint}; run: ${build_command}"
  fi
}

wait_for_local_dependencies() {
  local attempt
  local max_attempts="${SEARCHOPS_DEPENDENCY_WAIT_ATTEMPTS:-30}"
  local wait_seconds="${SEARCHOPS_DEPENDENCY_WAIT_SECONDS:-2}"
  local postgres_host="${SEARCHOPS_LOCAL_POSTGRES_HOST:-127.0.0.1}"
  local postgres_port="${SEARCHOPS_LOCAL_POSTGRES_PORT:-5432}"

  require_command pg_isready
  require_command redis-cli

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if pg_isready -h "$postgres_host" -p "$postgres_port" >/dev/null 2>&1 \
      && redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
      return 0
    fi
    sleep "$wait_seconds"
  done

  fail "PostgreSQL or Redis did not become ready after $((max_attempts * wait_seconds)) seconds"
}
