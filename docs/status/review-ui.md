# Foundation UI review

Reviewer: GPT-6.1 Sol, High. Scope: G-1 scaffold and G0 contracts/engine integration only. Reviewed PRD §§8–10, 16–17, current O1/O2 status, and the town/HUD source. This is not acceptance of the later O1/O2 task cards.

Final disposition: **SHIP for the G-1/G0 foundation**. The listed defects are resolved after fixes and HEAD's final browser verification. The existing Phaser + parchment HUD scaffold is suitable; no rebuild or visual redesign is needed.

## Defects fixed

- `apps/web/src/ui/Hud.tsx`: replaced the ARIA-only plan overlay with a native modal dialog, so keyboard focus is contained, Escape closes it, and focus returns after close. Replay shortcuts leave modal interaction and modified browser shortcuts alone.
- `apps/web/src/ui/Hud.tsx`: restart now seeks the currently loaded replay to zero, preserving a failure/redirect recording or saved run instead of silently opening golden-boba.
- `apps/web/src/ui/Hud.tsx`, `apps/web/src/styles/hud.css`: the Log control now reveals recent events when the shelf collapses below 1440 px; Escape dismisses it. Empty-log text uses events reached at the current seek point. Shelf breakpoint rules no longer hide inspector headings.
- `apps/web/src/ui/Hud.tsx`, `apps/web/src/styles/hud.css`: added a visible replay playhead, keyboard focus around the range control, elapsed/duration value text, disclosure states, and the page heading. Darkened the replay badge for text contrast.
- `apps/web/src/ui/Hud.tsx`: recording playback says “Recording loaded” and “Recorded payroll,” avoiding a claim of a live server connection or a fixture origin for an arbitrary saved recording.
- `apps/web/src/town/TownCanvas.tsx`: ground stays below world objects rather than covering lower portions of buildings and name tags as row depth increases. Removed hand cursors and click zones whose selection action has no visible consumer in this foundation shell. The static map has an accessible image description. Founder and Herald spawn outside their building footprints so all five residents can be seen.

- `apps/web/src/town/TownCanvas.tsx`: the Sim position provider registers after the Phaser canvas exists and converts map coordinates through the current canvas bounding rectangle into viewport CSS pixels. Queries read the live rectangle, including FIT scaling and centered offsets, after resize.

- Final browser QA found the Log overlay removed the shelf from grid auto-placement, moving the town into the 54 px icon column. Pinned workspace/inspector to columns 2/3 and added a cleaned-up `ResizeObserver` that rereads Phaser parent bounds and refreshes FIT scale after layout. This preserves the 640×368 aspect ratio through panel and viewport changes.

## Validation

- `npm run typecheck` — passed after the UI edits.
- `npm run build --workspace @hc/web` — passed; Vite retains its advisory for the combined Phaser chunk (1.76 MB minified / 418 kB gzip).
- Impeccable mechanical detector on the three changed source files — `[]` (no findings).
- `npm test` during concurrent source review — 18 passed, 1 engine test failed: skipped-task state expected `skipped`, received `ready` at `packages/engine/test/engine.test.ts:104`. Reported to HEAD/source reviewer; outside UI ownership.
- Source inspection confirms bundled Fontsource imports and no external font requests, no exposed town click affordances, effect cleanup for cue subscriptions and Phaser destruction, and native range/select/button controls.
- HEAD completed the final browser pass. This reviewer opened and visually inspected both final images: [1280 × 800](img/G0-1280.jpg) and [1790 × 1040 desktop](img/G0-desktop.jpg). The final images show the full town at both widths, all five residents, complete inspector headings, recording labels, and the playhead at completion. This reviewer did not run a separate browser session.
- HEAD verified at 1280 px: Log opens reachable events and closes; workspace remains 926 × 664 CSS px and canvas 926 × 532.445 CSS px. Tab moves between the plan dialog Close controls, Escape closes the dialog, end-seek shows completed / 91 events / 9.00 credits / $0.12, and there are no app console errors.

## Final scoring of the listed fixes

| Listed fix | Score | Evidence |
|---|---|---|
| Plan dialog keyboard containment and Escape | Resolved | Native dialog implementation; HEAD Tab/Escape exercise passed. |
| Replay restart preserves current source | Resolved | Restart calls `scrubTo(0)` and `setPlaying(true)` without reloading a fixture. Source verified. |
| Reachable collapsed-shelf Log and inspector headings | Resolved | HEAD opened/closed the Log at 1280 px; both final captures show inspector headings. |
| Timeline playhead, range focus, semantics and replay badge | Resolved | Playhead/badge visible in both captures; heading, range/disclosure attributes and focus CSS verified in source. |
| Recording connection/payroll labels | Resolved | Both captures show “Recording loaded,” “Recorded payroll,” and recorded-spend clarification. |
| Ground layering, all five resident visibility and dead town controls | Resolved | Five residents and unobscured buildings in both final captures; removed interactive zones verified in source. |
| CSS-pixel Sim position contract | Resolved | Provider uses current canvas bounding rectangle with viewport offsets and per-axis scale at query time. Source verified. |
| Log-induced 54 px thumbnail and stale FIT scale | Resolved | Explicit grid columns plus resize observer; HEAD repeated Log open/close and measured full 926 px canvas width. Both captures retain full town composition. |

**8 resolved, 0 partial, 0 unresolved** among these listed foundation fixes. Keyboard behavior and live measurements are HEAD-provided evidence; the two final screenshot inspections were performed by this reviewer. No further code changes followed this confirmation.

## Deliberately deferred

Cue playback, Sim walking/selection inspectors, founder input/approval, deliverable viewers, live run controls, and org chart remain later O1/O2 work. The map is a static scaffold. Integer scaling and the later animation/performance acceptance criteria are not claimed complete. No paid calls or key configuration were used.
