# Foundation gate report

**Current scope update:** the founder subsequently authorized G1 and G2. Five headless GLM-5.3-Flash Free Max workers now own town, HUD, runtime, intelligence and sites/smoke. HEAD owns integration/review and saved-agent setup. Active gate status is [G1-G2.md](G1-G2.md); the foundation evidence below remains historical. The founder requires the app-scoped API Trigger at agent.creao.ai, not developer Account keys.

Scope confirmed by the founder: the first two build phases, **G-1 Scaffold** and **G0 Contracts/engine**. Full O1/O2 features and the later mock/live execution gates are outside this session's implementation scope.

## Ownership and review

Three GPT-6 Luna High agents implemented the town scaffold, HUD scaffold, and engine/fixtures. Two GPT-6.1 Sol High agents subsequently reviewed the UI and core, fixed defects, and added regression coverage. HEAD owns workspace configuration, shared wiring, server stubs, gate checks, and this report.

The repository began on an unborn `main` with the founder's existing files untracked. All work stayed in the requested checkout with disjoint file ownership and explicit author-to-reviewer handoffs. No commit, worktree, merge, deployment, or public repository was created; PRD ADR-016 records the foundation exception.

## Implementation

- K-01: npm workspaces, pinned dependencies, strict TypeScript, build/test commands, preserved credential tools, root environment template, typed integration declarations, and cross-boundary server/web exports.
- K-02: roster, event/domain/API contracts and Zod schemas. Plans validate IDs, owners, deliverable types, DAG dependencies, field limits, and payload kinds.
- K-03: pure event reducer, cue derivation, status text, and invariant checks for approval, dependencies, handoffs, task terminality, ordering, and payroll.
- K-04: three illustrative offline fixtures with matching artifact payloads and site HTML. Golden includes parallel departments, review revision, founder redirect, and about seven minutes of recorded timing.
- K-05 delivered early: fixture/run replay sources, SSE source, Zustand store, cue subscriptions, replay clock/seek, typed bridge, and debug state panel.
- Web scaffold: static Phaser town with local CC0 Kenney assets and a read-only HUD for plan/state/log/payroll/replay inspection. Fonts are bundled locally. The town cue player and full HUD controls remain later tasks.
- Server scaffold: boots on loopback; `/api/health` reports `phase: scaffold`, unavailable live services, and missing credential names. Other runtime API routes return an explicit `501 not_implemented`.

## Validation

G-1 and G0 are **implemented and verified locally** under ADR-016. Commit/merge evidence is deliberately not claimed.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass — strict TypeScript across the web, server stubs, contracts, engine and TS scripts |
| `npm test` | Pass — 27 tests across six files |
| `npm run smoke:foundation` | Pass — schemas, event invariants and artifact references/metadata match across files |
| `npm run build` | Pass — Vite production build; the large Phaser bundle remains an optimization advisory |
| `npm run scan:secrets` | Pass — no credential patterns in publishable source |
| Browser, default desktop and 1280×800 | Pass — map and all five static residents visible, plan inspection, Tab/Escape, Log toggle, seek to completion, and playback controls |
| Browser application console | No application errors observed |

Fixture smoke: `golden-boba` 91 events / 5 artifacts / completed in 418.2 recorded seconds; `failure-retry` 27 events / 2 artifacts / failed as intended; `redirect` 36 events / 4 artifacts / completed. All 27 event variants and all four artifact payload kinds are represented.

Evidence: [desktop](img/G0-desktop.jpg), [1280 px](img/G0-1280.jpg), [Sol core review](review-core.md), [Sol UI review](review-ui.md). The Sol reviews fixed reconnect/history and stale request races, replay clock arithmetic, DAG/handoff invariants, fixture ordering, modal focus, current-recording restart, town depth/positions, and responsive Log/Phaser resizing. These checks accept the foundation only.

The server was booted and checked without upstream calls: `GET /api/health` returned 200 with `ok: false`; `POST /api/runs` returned the expected 501. The credential checker reports the missing credentials; its exit code alone is not proof of a configured live integration.

## Credential boundary and next gate

No `.env` was created and no paid agent call was made. Before live StepFun/CREAO validation, the founder must run `npm run keys` and configure `STEPFUN_API_KEY`, `CREAO_API_KEY`, `CREAO_SCOUT_AGENT_ID`, `CREAO_MAKER_AGENT_ID`, and `CREAO_HERALD_AGENT_ID`. Saved agent instructions are in `agents/creao/`.

Next implementation gate: G1, which adds real cue playback, full HUD features, mock Mayor/workers and the runtime/API executor smoke. G2 then verifies real agents and site publishing. `npm run smoke` and `npm run record` remain explicit later-phase stubs; use `npm run smoke:foundation` for this session's gates.

Preview: `npm run dev`, then `http://127.0.0.1:5173/?replay=fixture:golden-boba`. The API scaffold used for health checks was stopped after validation; the web preview remains open. Deployment and a public QR URL have not been created.
