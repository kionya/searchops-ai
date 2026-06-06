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
other external API. It reports only env key names and status, never secret values.

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
