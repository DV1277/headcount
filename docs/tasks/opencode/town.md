# G1/G2 town renderer

HEAD broadcast: PRD v1.3.0 / ADR-017 makes app-trigger CREAO primary by founder request; account realtime is optional. Read docs/requests/HEAD.md for current integration notices.

You are a headless OpenCode implementation worker. HEAD owns integration. Work in `/Users/DV/LA-Hacks-2026`.

WRITE: `apps/web/src/town/**`, `apps/web/public/assets/**`, `docs/status/oc-town.md`, `docs/requests/oc-town.md` only.
READ: `docs/PRD.md` §§6 E05, 8.4–8.6, 10, 17; `docs/status/HEAD.md`; contracts, engine, bridge and store.

Implement T-02–T-08 needed by G1/G2. Preserve the existing visual world and local Kenney assets; this is an extension, not a redesign. Build actual per-agent FIFO walk/enter/exit/receive queues, road-waypoint BFS, event-driven window/alert/bubble/item effects, carried envelopes, selection/artifact bridge actions, speed and reduced motion. Immediate cues must remain immediate while movement queues run. Do not skip carrying walks. Snap to reduced state on load/seek/reconnect; preserve the repaired portal, grid/ResizeObserver sizing and viewport CSS Sim-position provider. No Phaser scene restart before preload completes. Show all five residents and real event text. Full org-chart UI is another owner's job.

Consume the exact existing `@hc/contracts`, `@hc/engine`, `../data/store` and `../bridge` interfaces. Keep `TownCanvas` default export. No copied contract types, new dependencies, edits to root/config/data/UI/engine, git operations, server processes or paid API calls. Do not read `.env` or private recall sessions. Ask through your request file for cross-boundary changes.

Done when: typecheck/build pass for your changes, replay fixtures can drive all mapped cues, handoff envelopes reach receivers, scrubbing snaps cleanly, lifecycle subscriptions clean up. HEAD owns browser screenshots. Write a concise status with files, checks, limitations; then finish.
