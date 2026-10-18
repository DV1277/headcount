# Cloudflare static hosting (Workers Static Assets)

> Status: **deployed** at https://headcount-1-demo.dv1277.workers.dev/demo.
> Generated site: https://headcount-1-demo.dv1277.workers.dev/sites/run_4hN7Q1M-b-/.
> Verification and deployed version: [DEPLOYMENT-validation.json](DEPLOYMENT-validation.json).

## What is hosted

Static-only Workers host for the Vite demo. There is **no backend** on this
host: every `/api/*` path returns 404, and `wrangler.jsonc` declares no vars,
no secrets, and no KV/R2/D1 or other providers.

- Worker: `apps/edge/worker.ts` (name `headcount-1-demo`,
  `compatibility_date` 2026-10-18, `assets.directory` `apps/web/dist`,
  `run_worker_first: true`, explicit `ASSETS` binding, no HTML canonicalization or SPA fallback).
- Recorded demo: `fixtures/runs/live-boba-g2.jsonl` +
  `fixtures/runs/live-boba-g2.site.html` +
  `fixtures/runs/live-boba-g2.artifacts.json`
  (accepted artifact `a_BKAQGUnIRlTl`, run `run_4hN7Q1M-b-`).

## Public routes

- `/demo` — Vite SPA demo (same build as `/`).
- `/sites/run_4hN7Q1M-b-/` — recorded generated site, served with a strict
  static-only CSP (`default-src 'none'`, inline styles only, `form-action
  mailto:`, no scripts/network), sandbox-iframe compatible. Missing site
  paths 404 instead of falling through to the SPA; missing assets 404.

## Commands (Root owns deploy/auth)

```sh
npm run build:edge                   # build public app, then stage the exact accepted site
npm run deploy:check                 # validate config and assets without publishing
npm run deploy                       # publish the reviewed build
```

`prepare-edge.mjs` copies `fixtures/runs/live-boba-g2.site.html`
byte-for-byte to `apps/web/dist/sites/run_4hN7Q1M-b-/index.html` and prints a
sha256 so the staged file can be verified identical.

## Checks

```sh
npx vitest run apps/edge/worker.test.ts
```
