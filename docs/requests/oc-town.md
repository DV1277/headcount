# oc-town — requests to other owners

No cross-boundary change is required for the town renderer to work. Notes for
whoever integrates next (HEAD owns integration):

1. **Server typecheck errors are pre-existing and not mine**: `apps/server/src/runtime/manager.ts` (syntax error), `runtime/eventLog.ts` (`subscribe` close-type mismatch), `runtime/fs.ts` (`Promise<string|undefined>` vs `Promise<void>`), `llm/stepfun.test.ts` (missing `.mjs` declaration), `workers/mock.test.ts` (implicit `any`). None touch town files.
2. **Cue shape consumed as-is**: `walk.carrying = { artifactId, kind }` and `receive {agent, artifactId}` match `@hc/engine` cues exactly; if the engine ever changes the envelope shape, only `town/snapshot.ts` + `town/sim.ts` hooks need updating.
3. **`store.cues$` contract relied upon**: town buffers nothing — the scene replays the full event log on create, so pre-registration cues are covered by the snapshot. This means any future store change MUST keep `events` + `t` consistent with appended cues, or early cues get doubled (snapshot walk teleport followed by a live walk).
4. **Smoke-together**: HEAD may want a browser check of the three fixtures via the replay URL params; renderer has no dev server of its own (owned by HEAD per task card — I did not run any servers).
