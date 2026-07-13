# scripts/dev

Local development helper scripts live here.

## Local dev doctor

`corepack pnpm check:local-dev` checks only local env values, localhost ports, and the API
`/health` endpoint. It does not start/stop services, change Docker state, or call external APIs.

Run from the repo root:

```bash
corepack pnpm check:local-dev
```

Useful variants:

```bash
corepack pnpm check:local-dev -- --json
corepack pnpm check:local-dev -- --strict
```

What it distinguishes:

- `web` open on `3000` but API closed on `4000`: connector sync actions will fail
- API port open but `/health` unhealthy: inspect the API terminal
- PostgreSQL or Redis closed: run `docker compose up -d`
- worker process: no HTTP port; confirm the worker terminal says it is listening for jobs

## Connector live setup check

`corepack pnpm check:connector-live` runs the API package's connector live setup CLI. It validates
connector live-mode environment wiring without calling Google, GA4, PageSpeed, Bing, CMS, or any
other external API. It reports only env key names and status, never secret values. Local checks
automatically load the ignored root files `.env.api.local` and `.env.worker.local`; explicit shell
exports override file values. Deployment checks never load these local files.

Run from the repo root:

```bash
corepack pnpm check:connector-live
```

Useful variants:

```bash
corepack pnpm check:connector-live -- --deployment
corepack pnpm check:connector-live -- --json
corepack pnpm check:connector-live -- --deployment --require-live
```

Exit behavior:

- exits `0` when fixture mode is safe or live setup has only provisioning follow-ups
- exits `1` when malformed or partial env would make live connector sync unsafe
- exits `1` with `--require-live` unless at least one live provider is ready

## Local always-on API and worker

The local launch wrappers keep API and worker runtime configuration inside this repository's
boundary. They never read credentials or configuration from another project.

- `caio-launch-api.sh` loads the ignored root file `.env.api.local`.
- `caio-launch-worker.sh` loads the ignored root file `.env.worker.local`.
- `launch-common.sh` validates required values, build outputs, PostgreSQL, and Redis before start.
- `api.env.example` and `worker.env.example` document safe key names without real secrets.

The actual `.env.*.local` files are already excluded by the repository's `.gitignore`. Keep their
permissions at `600` and never commit them.

Required in both local runtime files:

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `REDIS_URL`

The worker runs in fixture/crawl-only mode when live connector keys are absent. To enable a live
provider, add SearchOps-owned values directly to `.env.worker.local`; do not load them from another
repository or customer system. Google live sync requires both OAuth client values, while GA4 also
requires a numeric `SEARCHOPS_GA4_PROPERTY_ID`.

Build and validate before restarting the launch agents:

```bash
corepack pnpm --filter @searchops/api build
corepack pnpm --filter @searchops/worker build
bash -n scripts/dev/launch-common.sh
bash -n scripts/dev/caio-launch-api.sh
bash -n scripts/dev/caio-launch-worker.sh
```

The wrapper paths intentionally remain unchanged so existing SearchOps launch agents can continue
to invoke them. Renaming the external launch agent labels or plist files is a separate machine-level
change outside this repository.
