# Judge demo audit — 2026-10-18 (read-only review, no source/fixtures touched)

> HEAD follow-up: the real-run picker entry is now added, `npm run demo` opens the explicit ×20 URL, and the public tunnel was independently verified HTTP 200 on October 18 at 09:27 PDT. The worker's claim that it is already expired below was an inference from its temporary nature, not an observed failure. The final-card QR currently works; it still depends on the laptop's sites listener and tunnel. Offline site preview is the fallback. Existing Paper design files were also verified through local Paper MCP; see `PAPER-validation.json`.

## Recommended presentation URL

```
http://127.0.0.1:5173/?replay=fixture:live-boba-g2&speed=20
```

Setup for judges: `npm install` then `npm run dev` ONLY. No `dev:server`, no keys, no tunnel, no backend needed — the fixture branch of `loadReplay` is pure bundled imports and the replay artifact cache serves viewers with zero fetches. Full run replays in ~40s at ×20 (792.7s recorded wall / 20). Do not present the bare root URL and do not use `?run=<id>` (that path needs the control backend).

Optional flags that work on this URL: `&debug=1` (reducer panel), `hud-only=1` (narration column instead of town canvas).

## P0 — blocking or judge-confusing

1. **Bare root does not open the real run; picker has no Real-run entry.** `apps/web/src/ui/Hud.tsx:75` defaults `replaySrc` to `fixture:golden-boba`, but `apps/web/src/App.tsx:12` only calls `openReplay` when `?replay=` is present — so a bare load shows an idle town with an idea box, not any fixture. `Hud.tsx:36-40` `RECORDINGS` lists only the 3 illustrative fixtures; `live-boba-g2` appears only as a generic `Recorded run` row after it is already loaded via URL (`Hud.tsx:329-331`). A judge clicking around never discovers the real run.
   Smallest fix: present the exact URL above; code fix (not applied): add `{ value: 'fixture:live-boba-g2', label: 'Real CREAO boba run' }` to `RECORDINGS`.

2. **Speed defaults to ×1 → 13-minute replay looks broken.** `App.tsx:12` uses `Number(params.get('speed')) || 1`; the menu offers ×20 (`BottomBar.tsx:79`, clamped at `store.ts:76,92`) but nothing selects it. Without `&speed=20` judges watch a 792s timeline crawl.
   Smallest fix: always include `&speed=20` in the presented URL.

3. **FinalCard QR / "Open site" point at the expired tunnel while the Site viewer shows the bundled copy — two different "site" URLs in one demo.** `Viewers.tsx:237` prefers `completed.data.siteUrl` (the `trycloudflare` URL baked into fixture seq 135) over the artifact URL, so the final card QR links to a temporary tunnel (`HEAD-INTEGRATION.md:30-31` says the capture outlives the tunnel). Meanwhile `replaySource.ts:68` overwrites every site artifact's URL with the bundled local asset, so Deliverables → Site correctly shows `Bundled offline preview` (`Viewers.tsx:70-89`). Judges scanning the final-card QR get a dead link.
   Smallest fix for presentation: open the site via Deliverables → Site (offline preview), and narrate the final-card QR as "original public link, tunnel expired — the saved preview is the offline truth." Code fix (not applied): in `FinalCard`, prefer the bundled `siteArtifact.url` when in fixture replay, or label the tunnel link as possibly expired.

## P1 — presentation traps

4. **README overstates the picker.** `README.md:46` says the picker includes the Real CREAO run; code shows only the 3 illustrative entries until the deep URL is loaded (`Hud.tsx:36-40,329-331`, no `live-boba-g2` label anywhere in web src). Fix: one-line README correction or the picker entry from P0-1.
5. **Idle default view invites a dead-end live action.** With no backend, typing an idea and hitting "Open for business" calls `api.health` → proxied `/api` → failure, leaving an error bar (`store.ts:56-63`, `Hud.tsx:400`). Judges should not be invited to drive the idea entry during the fixture demo; stay on the replay URL.
6. **Payroll/credits need one spoken sentence.** Fixture stats are `0 cr · $0.055843` StepFun-reported with `creaoCreditUsageComplete: false` (`G2-validation.json:37-38`); the UI already discloses this honestly (`Viewers.tsx:242-243,289`, `Inspector.tsx:90-93`). Just say it aloud: "costs are reported StepFun usage only; CREAO reported no credits."

## Verified solid — no action

- **Fixture matches the G2 story.** `fixtures/runs/live-boba-g2.jsonl`: 135 lines, seq 1–135 gapless ending `run.completed`, `plan.source: model`, 7 `artifact.created` (research ×2 revs, site ×2 revs, launch-kit ×2 revs, brief), zero `mayor-cover`, all `via: creao-async`. Consistent with `G1-G2.md:5` and `G2-validation.json`.
- **Replay is truly offline / sponsor-free.** Fixture branch uses only `import.meta.glob` bundles (`replaySource.ts:48-70`); replay `getArtifact` serves cache or throws without fetching (`store.ts:45-54`); QR is generated locally (`QrCode.tsx:4-19`); fonts/assets are local per README. Live-only actions (approve/answer/redirect/pause) are gated behind live mode (`PlanModal.tsx:36`, `Hud.tsx:93-96`).
- **Viewers are honest.** Site iframe renders the bundled HTML in an empty sandbox with an offline label (`Viewers.tsx:80-89`); superseded revisions show via stale pills; error bar offers "Try fixture instead" (`Hud.tsx:400`); replay badge/timeline/scrub/speed/restart controls are all present (`Hud.tsx:314,388-393`, `BottomBar.tsx:79-84,93-112`).
- **Port/tunnel separation is documented and correct for a live run if ever needed.** Web 5173, control 8787, sites-only 8788, tunnel only 8788, `PUBLIC_BASE_URL` set before a run (`README.md:55`, `vite.config.ts:10`). Not needed for the fixture demo.

## What I did not do (per constraints)

No source, fixture, config, or memory writes; no servers started/stopped; no network/API calls; no browser automation. Only file reads, greps, and local fixture inspection via shell (`wc`, `grep`, `python3` JSON parsing). This report is the only file I own.
