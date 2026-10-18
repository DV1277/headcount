# oc-town — G1/G2 town renderer status (T-02–T-08)

Implemented the Phaser town renderer in `apps/web/src/town/**` per the task card.
No dependencies added; store/engine/bridge/contract surfaces consumed as-is;
`TownCanvas` stays the default export and portal wiring is preserved.

## Files

- `town/map.ts` — 40×23 tile map + exports. Kept TILE_SIZE/MAP_*/BUILDINGS/PLAZA/SIM_SPAWN_POINTS; added `HALL_STEP_SLOTS` (deliverable landing spots, skips hall door column), `PLAZA_PERCHES` (per-agent plaza docks), `LAMP_SPOTS`, `ROOF_CENTER`, `tileBlocked()` (fountain), `mapTile()`.
- `town/routing.ts` — waypoint graph (doors, spawns, junctions, plaza center, perches) + BFS, `DOOR_PARK` dock tiles, `dockFor(building, agent)`, `nearestNode`, `walkPath(from,to)` (handles off-node goals via suffix step + drifted starts via snap), `pathOnGraph`.
- `town/policies.ts` — pure rules: bubble constants (`BUBBLE_*`, 80-char ellipsis, max 2 town-wide), `admitBubble` (priority eviction: newcomer must outrank the weakest else it drops), `WALK_QUEUE_FAST_FORWARD = 6` + `shouldFastForward` (never when `carrying`), `fxStateIsOn`, `motionWord` status words.
- `town/snapshot.ts` — pure reduced-state builder `buildSnapshot(events, t)`: replays the append-only log through `deriveCues(prev, event)` with instant-cue semantics (walks park at docks, pops fill hall-step slots with rotating cursor, stamps set verdicts, receive clears carrying + appends the received ledger). Depth `t`, runId, seq-guard respected, scrub-deterministic.
- `town/sim.ts` — `Sim`: container with agent-color ground ring, dashed select ring, 4-frame walk bodies (bob + feet), face, prop per role, 6px Pixelify name tag (hover shows `name · status`); FIFO job runner (walk/enter/exit/receive), 48 px/s walk at 8 fps frames, 16 px/s plaza wander with 2–5 s pauses, reduced-motion 150 ms fade-teleport, hooks for carry start/arrive/receive/fast-forward.
- `town/TownScene.tsx` — the scene. Kenney tiles ground/decor/buildings/notice board/night multiply overlay + lamps; publishes `SceneController` into the shared ref (cleared on `DESTROY`/`SHUTDOWN`); `applySync(true)` on create; `snap()` builds the reduced snapshot and resets all transient FX; `handleCue` maps every cue kind (see below); `document.fonts.ready` re-renders tags.
- `town/TownCanvas.tsx` — React wiring: Phaser game (FIT scale, pixelArt, map-sized), ResizeObserver-driven `scale.refresh()`, `cues$` subscription forwards to the scene, property effects (`progress`, `speed`, `reducedMotion`, `selected`, statuses via `lastSeq`), `playbackRevision` → `controller.snap()`, `provideSimPositions` (canvas rect → viewport CSS px; door docks reported for hidden sims), preserved caption portal + `TownCanvas.css`.

## Cue semantics implemented

- Movement (`walk|enter|exit|receive`) → per-agent FIFO queue.
- `walk` with `carrying` → envelope attaches (`hc-envelope` sprite bob on the walker); delivery → absorb at the receiver's door + puff.
- Fast-forward: >6 queued plain walks → teleport + puff (carrying never skipped).
- Handoff edge case: sender still inside → envelope flies roof→door (airmail), receiver's `receive` still lands the puff; the batch (bubble/receive/walk-home/enter) resolves mechanically. `receive` may fire while the envelope is in flight — accepted per task card.
- Bubbles: admit policy per `policies.ts`; hidden speakers talk from their door; evictions fade out; in/out scale with speed.
- Building FX: windows glow on `glow` (hall windows amber accent), founder input/error "!" badge on `alert` (smoke puff for the error tone), deliverable pop roof→hall-steps arc with slot rotation + bounce, stamp ACCEPTED (green) / REVISE (red) + small camera shake, freeze marks paused sims with "z z" tags, celebrate confetti + hops, day/night tint `0.35*progress` on `0x28205f` with lamps above `70%`, reduced motion kills pulse/shake/stagger/confetti.

## Checks

- `npm run typecheck` — no errors in `apps/web/src/town/**` (remaining TS errors are `apps/server**` files owned by other workers).
- `npm test` — 103/103 across 17 files, including 24 new town tests (`routing.test.ts`, `snapshot.test.ts`, `policies.test.ts`) fixture-driven over `fixtures/runs/{golden-boba,failure-retry,redirect}.jsonl`: all cue kinds covered, handoff ledger verified, scrub-prefix determinism, fast-forward/priority rules.
- `npm run build` — passes (pre-existing chunk-size warning only).

## Out of scope (per card)

- T-09 perf pass and T-10 hand-made touches.
