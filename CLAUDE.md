# Headcount: 1 (LA Hacks AI 2026)

Pixel-art town UI where AI agents run a solo founder's company. Mayor = StepFun `step-5-preview`; Scout/Maker/Herald = saved CREAO agents. Deadline: code freeze Sun Oct 18, 12:00 PM PDT (submit Devpost by 11:45).

## Read first
- `docs/PRD.md`: authoritative product spec, architecture, contracts (§8), design (§10), task cards and gates (§17). `SPEC.md` is a pointer only.
- `docs/SPONSORS.md`: sponsor perks and judging criteria.

## Integrations (`integrations/`, ESM `.mjs`, Node 22+)
Import via `integrations/index.mjs` (`stepfun`, `creao`, `browserUse`, `devin`, `elevenlabs`). Each has `isConfigured()` and `ping()`. Shared HTTP helpers in `_http.mjs`.
- `stepfun.chat(messages, { json, tools, ...opts })`
- `creao.createRun` / `getRun` / `waitForRun` (saved agents); `creao.createAppRun` / `getAppRun` / `waitForAppRun` (App API trigger)
- `browserUse.startBrowser` / `stopBrowser`; for agent runs use `browser-use-sdk` v4
- `devin.createSession(prompt)` / `devin.sendMessage(sessionId, msg)`
- `elevenlabs.tts(text, opts)`

## Rules
- Never put keys in frontend code. Never commit `.env` (gitignored; only `.env.example`). All sponsor calls are server-side.
- Always use `STEPFUN_MODEL` (`step-5-preview`) for the Mayor; StepFun requires it at runtime.
- CREAO runs take minutes, have no streaming on the app path, and each run costs credits. Design async, poll, and cache results; do not re-run casually.
- The frontend only renders events from the append-only log (`runs/<id>/events.jsonl`); it never calls an agent.
- Code freeze 12:00 PM Oct 18. No code after that. Never cut (PRD §5.5): plan approval, real CREAO runs, handoff envelope, org chart, QR landing page, offline replay.
- `.recall/` holds session memory (gitignored). Use the recall skill to resume or dump.

## Commands
- `npm run keys`: interactive key entry (hidden input) into `.env`
- `npm run check`: verify every key
- `npm run check:deep`: also makes one real Step 5 call

## Continue the build
Read `docs/status/HEAD-INTEGRATION.md` for the active handoff/checklist and `docs/status/G1-G2.md` for the G1/G2 build and `docs/status/HEAD.md` for foundation gate evidence; the recall files predate the foundation implementation. `smoke:foundation` validates G-1/G0. The `smoke`/`record` and runtime/adapter implementations are being built by the assigned OpenCode workers. CREAO app-trigger mode is the founder-selected primary path; use per-role app IDs and capi_ keys, never require a developer Account key in app mode. The initial-checkout ownership exception is PRD ADR-016.
