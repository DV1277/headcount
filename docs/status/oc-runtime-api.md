# oc-runtime-api — REST §8.7 router + SSE + EventLog + payroll status

Implemented the task card `docs/tasks/opencode/runtime-api.md`. No new
dependencies, no `.env` reads, no servers kept running, no git commits. All
sponsor keys stay server-side; the frontend never calls an agent.

## Files

- `runtime/eventLog.ts` — rewritten append-only log. Seq/t/at are derived
  *inside* the serialized commit (`t = prev ? max(prev.t + 1, over.t ?? elapsedMs) : (over.t ?? 0)`;
  seq is next(line.seq); gapless). Strict reload: every persisted line is
  re-validated with `EventEnvelopeSchema`, run identity + seq + monotonic time
  checked, blank lines skipped, a torn **final** line is repaired exactly once
  by truncation and rewriting, a corrupt **middle** line fails loudly. Lines
  are appended twice (fail → retry) then fsync'd; listeners are notified after
  the file write with exceptions isolated. `subscribe(push, from)` registers
  the live listener before snapshotting history — no missed-past-race. `close()`
  clears the stream. `openEventLog(id, {rootDir?})` + `createEventLog` kept
  compatible.
- `runtime/fs.ts` — `runsRoot(rootDir?)` hierarchy: explicit `rootDir/runs` →
  `HC_RUNS_DIR` (resolved) → `REPO_ROOT/runs`; plus `ensureDir` (mkdir, void),
  `eventsPath`, `readFileText`. Compatible with manager's `listRunIds`,
  `readJsonIfExists`, `writeJsonAtomic` usage.
- `runtime/errors.ts` — unchanged `RunError` (400/404/409/422 helpers).
- `runtime/index.ts` — barrel (eventLog + errors + fs), `EventLog` alias kept.
- `api/sse.ts` — race-free SSE: register listener, buffer live pushes while
  `await manager.subscribe`, replay history, then flush buffer. Frames are one
  write each (`id`/`event: town`/`data`), `Cache-Control: no-store`,
  `X-Accel-Buffering: no`, 15 s heartbeat (`: hb <ts>`), `Connection: close`
  cleanup clears the heartbeat and unsubscribes even if fired during the await.
- `api/index.ts` — `createApiRouter(manager)`: `GET /api/health`
  (`{ok:true}`), `POST /api/runs` (201 `{runId}`), `GET /api/runs` (§8.7
  `RunListItem[]`), `GET /api/runs/:runId` (`{state}`), `POST /approve|answer|
  redirect|pause|resume|replan` (204; PlanSchema validation, redirect narrows
  `agent` to `DeptId` + trims note, 422/400/409/404 mapping), `GET
  /runs/:runId/artifacts/:artifactId` (closes stream body), `GET
  /runs/:runId/events` (SSE; `?from` + `Last-Event-ID`, header wins). Body
  guard parses and maps `SyntaxError` → 400 `invalid_json`, `entity.too.large`
  → 413, skips parsing when `req.body` is already set (HEAD's app-level
  parser). RunError detail → `error.runId`. Body limit 256 KB via
  `createApiRouter(manager, { jsonLimit })`.
- `api/index.test.ts` — 22 tests over real HTTP listeners: §8.7 happy paths,
  validation, sanitized errors, artifact/stream 404s, SSE race (late events
  replayed exactly once), cursors, heartbeats, disconnect cleanup, parse/size
  errors, unknown routes, fake-manager method existence.
- `payroll/index.ts` — `estimateUsd` charges cached input as a subset of
  `tokensIn` (`(tokensIn - cachedIn)·in + cachedIn·cached + tokensOut·out`),
  clamps `cachedIn` to `[0, tokensIn]`, ignores token math on the credits
  path, treats NaN/garbage as zero. `normalizeUsage` floors/clamps and derives
  `usd` from §12.5 rates (in 1.00 / out 2.70 / cached 0.10 per M; CREAO credit
  0.10) only when the report omits it. `payrollTick` builds the
  contract-shaped `payroll.tick` event with nonnegative fields.
- `payroll/index.test.ts` — 10 tests (cached-subset math, clamp, credits,
  zero-spend mocks, rate derivation).
- `runtime/eventLog.test.ts` — 12 tests: append racing (2 writers, gapless
  seq), overloaded `at`, failed-sink retry, listener isolation, the
  subscribe-boundary race, reload mid-session, `HC_RUNS_DIR`, torn-tail
  repair, blank lines, corrupt middle / bad schema / foreign runId / seq gap /
  backwards time, replay times, envelope shape. Test scratch dirs live under
  `runsRoot()` prefixed `evlog-test-` and are removed after each test; the
  live `runs/run_tCc4YDzZib` scratch run was never touched.

## Checks

- `npx vitest run apps/server/src` — **127 passed / 2 failed in 15 files**;
  both failures are `workers/creao-app-wire.test.ts` timeouts owned by the
  workers author. Includes HEAD's `manager.test.ts` (21 passing) riding on
  this eventLog.
- `npx tsc --noEmit` — **zero errors in all owned files**. Remaining
  diagnostics are `workers/inputs.ts` (3) + `workers/creao-app-wire.test.ts`
  (1) — other owner's scope.

## Deviations from the card

- None functional. `EventLog` remains exported (as type alias of
  `EventLogBase`) so HEAD's original barrel shape stays intact.
- Heartbeat is 15 s per card §4 (`: hb <ts>` comment frames — invisible to
  `EventSource`).
