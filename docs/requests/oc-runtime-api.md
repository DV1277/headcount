# oc-runtime-api — requests to other owners

1. **SSE beat path**: `GET /api/runs/:runId/events` must stay attached after
   the last buffered event until run completion; HEAD's manager already
   subscribes correctly. If manager's `subscribe` return shape ever changes
   (`EventLogSubscription` with `close(): void`), `api/sse.ts` needs a one-line
   update.
2. **Body parsing double-hop**: the router includes its own guarded body
   parser; in `app.ts` the app-level `express.json()` runs first, so the
   router skips parsing (`req.body` pre-set). App-level SyntaxErrors are
   mapped by the router's error middleware only if the app-level parser error
   passes `next(err)` into `/api` — verify HEAD's error middleware order in
   `app.ts` (the app-level handler before mounting `/api` is fine).
3. **Workers owner**: `workers/creao-app-wire.test.ts` has 2 timing-out tests
   (5 s) + 1 typecheck error in the suite's mock type; `workers/inputs.ts`
   has 3 typecheck errors ('task' spread duplicates, string→string[]). Not in
   my scope.
4. **Live scratch run**: `runs/run_tCc4YDzZib` exists in the repo runs dir;
   my suites only delete their own `evlog-test-*` / `api-singleton-test`
   scratch roots, the live run was untouched. The singleton test file points
   `HC_RUNS_DIR` at `runs/api-singleton-test` for the whole file and deletes
   it in `afterAll` — do not remove that env block without re-checking the
   lazy manager doesn't touch the live dir.
5. **Decompress**: JSON bodies are not gzip-decoded before the size guard;
   if a client sends `Content-Encoding: gzip`, no content-decoding middleware
   exists. Not needed for the smoke/demo flows; noting for completeness.
