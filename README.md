# Headcount: 1

> A company of one, staffed by AI agents you can watch.

A pixel-art town where every resident is an AI agent doing real work for a solo founder. You type a business idea. The Mayor (StepFun Step 5 Preview) drafts a plan, you approve it, and department agents (saved CREAO agents) walk to their buildings, do the work, and hand results to each other. The output is real: market research, a live landing page, launch posts and outreach emails.

**Status: G1 and G2 verified, including the founder's cellular phone check.** The animated town, editable approval gate, event-sourced executor, parallel departments, artifact viewers, sanitized site publisher and offline replay work end to end. Full mock smoke and 186 tests pass. The real run produced all three CREAO deliverables without covers. [Verification evidence](docs/status/G2-validation.json).

Built for LA Hacks AI Hackathon 2026 (Applied Intelligence track). Authoritative product spec and build schedule: [docs/PRD.md](docs/PRD.md).

## Sponsor tech

| Sponsor | What we use | Role in Headcount: 1 | Proof |
|---|---|---|---|
| StepFun | `step-5-preview` via OpenAI-compatible API | Mayor / orchestrator: plans, reviews every deliverable, writes the final brief | [Captured real run](fixtures/runs/live-boba-g2.jsonl) |
| CREAO | Saved agents, run via app API trigger | Scout (research), Maker (landing page), Herald (launch copy) workers | [Saved agents and verification](docs/status/CREAO.md) |
| Paper — Best Designed Hack | Paper design file and exported art | Pixel town, shared design tokens, HUD and org chart | [Town design](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0), [HUD screens](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-5-0), [verified design evidence](docs/status/PAPER-validation.json) |

Selected entries: **Applied Intelligence**, **CREAO Best One-Person Company**, **StepFun Get It Done with Step 5 Preview**, and **Paper Best Designed Hack**. Browser Use, ElevenLabs and Devin have client scaffolds only and are not claimed as working product integrations.

## Judge demo

Open [the recorded real run at 20×](http://127.0.0.1:5173/?replay=fixture:live-boba-g2&speed=20). It reaches the final card in about 40 seconds. This is a recording of actual StepFun and CREAO execution; replay itself calls no sponsor APIs. The three other fixtures are illustrative.

If the web server is stopped, run `npm run demo`. It opens this recording on port 5173; the recording, fonts, town art, outputs and landing-page preview work without a backend or API keys. If port 5173 is already serving this checkout, use the link above instead.

After playback, close the final card and click **Org** to show the real Scout → Maker and Scout → Herald handoffs. Open each deliverable from the left shelf. Open **Founder brief** to return to the QR. [Three-minute pitch and click path](submission/pitch.md) · [Devpost draft](submission/devpost.md).

The [generated landing page](https://subscriber-karma-assignments-lifestyle.trycloudflare.com/sites/run_4hN7Q1M-b-/) is also public and was verified on the founder's cellular phone. Its temporary URL needs this laptop's API/sites server and Cloudflare tunnel to stay running. The bundled site preview remains available if the tunnel or Wi-Fi fails. The generated waitlist is a prototype; it does not persist signups or send outreach.

### CREAO agents

Primary integration: app API Trigger on `agent.creao.ai`, with server-side `capi_` keys. All three saved agents executed successfully. Shared-key request pacing and same-run polling backoff handle temporary rate limits. See [setup and execution evidence](docs/status/CREAO.md).

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

The recording picker also includes **Real CREAO boba run** (`?replay=fixture:live-boba-g2`): 135 captured events, seven artifacts including superseded revisions, and bundled site HTML. Its outputs came from actual sponsor calls; replay itself makes no sponsor calls. CREAO did not report credits, so displayed costs include reported StepFun usage only.

Run the local mock backend in another terminal, then use the web app's idea entry and approval gate:

```bash
HC_MAYOR=mock HC_WORKERS=mock HC_MOCK_SPEED=10 npm run dev:server
npm run smoke      # isolated API/SSE/worker/site integration check; no sponsor calls
```

The control API listens on `127.0.0.1:8787`; the separate sites-only listener uses port `8788`. Tunnel only port 8788. Set `PUBLIC_BASE_URL` before starting a real run so Maker, Herald and the QR share one URL. `npm run record -- <runId> <new-recording-name>` exports a completed run for offline replay without overwriting fixtures. Restart the web dev server after adding a recording so its fixture list refreshes.

`npm run verify:real -- <runId>` checks a completed real run and its public site without triggering agents. It rejects covers, missing handoffs and mismatched launch links; physical phone confirmation is recorded separately.

For live runs, configure credentials locally:

```bash
npm run keys        # paste each API key; input is hidden; writes .env
npm run check       # verifies every configured key
npm run check:deep  # same, plus one real Step 5 call
```

Sponsor details and perks: [docs/SPONSORS.md](docs/SPONSORS.md).

## Repo layout

```
docs/PRD.md             authoritative product spec, contracts and build schedule
CLAUDE.md               notes for coding agents
docs/SPONSORS.md        sponsor perks and judging criteria
integrations/           one module per sponsor API (stepfun, creao, browser-use,
                        devin, elevenlabs) plus index.mjs and shared _http.mjs
scripts/setup-keys.mjs  interactive key entry
scripts/check-keys.mjs  key verification
.env.example            required environment variables
```

## Security

API keys live only in local `.env` files, which are gitignored. This checkout also excludes `.env.example`. All sponsor calls happen server-side; the browser never sees a key and never calls an agent directly.
