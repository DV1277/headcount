# Headcount: 1

> A company of one, staffed by AI agents you can watch.

A pixel-art town where every resident is an AI agent doing real work for a solo founder. You type a business idea. The Mayor (StepFun Step 5 Preview) drafts a plan, you approve it, and department agents (saved CREAO agents) walk to their buildings, do the work, and hand results to each other. The output is real: market research, a live landing page, launch posts and outreach emails.

**Status: G-1/G0 verified; G1/G2 implementation in progress.** The workspace, runtime contracts, event reducer, three bundled recordings, replay data layer, and town/HUD scaffolds are available. Real agent adapters, execution, and full interactive town/HUD features are in progress for G1/G2.

Built for LA Hacks AI Hackathon 2026 (Applied Intelligence track). Authoritative product spec and build schedule: [docs/PRD.md](docs/PRD.md).

## Sponsor tech

| Sponsor | What we use | Role in Headcount: 1 | Proof |
|---|---|---|---|
| StepFun | `step-5-preview` via OpenAI-compatible API | Mayor / orchestrator: plans, reviews every deliverable, writes the final brief | _Step 5 call log / run link: TBD_ |
| CREAO | Saved agents, run via API trigger | Scout (research), Maker (landing page), Herald (launch copy) workers | _CREAO agent links: TBD_ |
| Browser Use | Browser Use Cloud | Live web research for Scout | _Browser Use session link: TBD_ |
| ElevenLabs | Text-to-speech | Voice for the town | _Voice demo: TBD_ |
| Devin | Cognition Devin | Build partner for the frontend and replay | _Devin sessions / PRs: TBD_ |
| Paper | Design canvas via MCP | Design of the town and overlay UI | _Paper file link: TBD_ |
| Workday | Not targeted unless we pivot | n/a | n/a |

### CREAO agents

Primary integration: app API Trigger on `agent.creao.ai`, with server-side `capi_` keys. The three saved agents and read-only authentication are verified; real task execution remains part of G2. See [setup evidence](docs/status/CREAO.md).

- [Scout (Rio)](https://agent.creao.ai/apps/dabe17eb-3f2c-40d9-bc8c-662f8736ddc1)
- [Maker (Juno)](https://agent.creao.ai/apps/2430f36c-51b1-484e-9025-8cb37837f0d9)
- [Herald (Pip)](https://agent.creao.ai/apps/bc76ea75-e5c8-4b83-a8b2-ff8722009881)

## Quickstart

Requires Node 22.9 or newer.

```bash
npm install
npm run dev         # http://127.0.0.1:5173 — choose a bundled fixture
npm run typecheck
npm test
npm run smoke:foundation
npm run build
```

Open `http://127.0.0.1:5173/?replay=fixture:golden-boba&debug=1` to inspect the reducer during replay. `failure-retry` and `redirect` are also bundled. Fixture outputs and payroll are illustrative; no sponsor APIs are called. Fonts and town assets are local.

`npm run dev:server` starts the health/API scaffold; live runtime endpoints deliberately return `501` until O3/O4 land. `npm run smoke` and `npm run record` are reserved for those later phases. Current gate evidence and remaining work: [G1/G2](docs/status/G1-G2.md), [foundation](docs/status/HEAD.md).

For the later live-run gate, configure credentials locally:

```bash
npm run keys        # paste each API key; input is hidden; writes .env
npm run check       # verifies every configured key
npm run check:deep  # same, plus one real Step 5 call
```

Sponsor details and perks: [docs/SPONSORS.md](docs/SPONSORS.md).

## Repo layout

```
SPEC.md                 product spec, architecture, build schedule
CLAUDE.md               notes for coding agents
docs/SPONSORS.md        sponsor perks and judging criteria
integrations/           one module per sponsor API (stepfun, creao, browser-use,
                        devin, elevenlabs) plus index.mjs and shared _http.mjs
scripts/setup-keys.mjs  interactive key entry
scripts/check-keys.mjs  key verification
.env.example            required environment variables
```

## Security

API keys live only in `.env`, which is gitignored (`.env.example` is the only env file committed). All sponsor calls happen server-side; the browser never sees a key and never calls an agent directly.
