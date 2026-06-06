# scripts/dev

Local development helper scripts live here.

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
