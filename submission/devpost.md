# Headcount: 1

**Tagline:** A company of one, staffed by AI agents you can watch.

**Main track:** Applied Intelligence.
**Sponsor entries:** CREAO Best One-Person Company; StepFun Get It Done with Step 5 Preview; Paper Best Designed Hack.

## Inspiration

A solo founder can delegate to agents, but following their progress across chat tabs is difficult. I wanted a company whose work I could understand at a glance: who owns a task, what they are waiting for, and what they have delivered.

## What it does

Type a business idea. Mayor Mabel, powered by StepFun `step-5-preview`, drafts a structured plan. The founder edits and approves it. Three saved CREAO agents then do the core work: Scout Rio researches competitors, Maker Juno builds a landing-page prototype, and Herald Pip writes social posts and outreach drafts.

The interface is a pixel town. Agents enter their department buildings, carry research between departments and deliver artifacts for review. Every movement derives from an append-only semantic event log. An org chart shows assignments and handoffs, while the artifact viewers expose the actual research, site and launch copy.

The verified boba-delivery run produced three accepted CREAO outputs, four competitor records, eight source links, a sanitized public landing page, three social posts, three outreach emails and a StepFun founder brief. Maker and Herald worked in parallel after Scout. It took 13m 12s and is bundled as a 135-event recording that replays in about 40 seconds at 20×. Replay makes no sponsor calls.

## How I built it

The Node/Express TypeScript server runs a dependency-aware executor with an approval gate, bounded retries, one Mayor review per task, labelled failure fallbacks and usage accounting. It appends events to JSONL and streams them through resumable SSE. A separate sites-only listener serves sanitized generated HTML with a restrictive CSP.

The Mayor adapter calls StepFun Step 5 Preview for plans, reviews, final briefs and repair paths. Department adapters call three saved CREAO apps through the app API Trigger, with shared-key pacing and same-run polling backoff. Keys remain server-side.

React, Vite, Zustand and Phaser render the town and controls. A pure reducer and cue mapper drive both live execution and replay. The existing Headcount Paper design contains foundations, town scenes, workers/items, components and HUD screens. Its exported town art is assembled into the app by `scripts/build-town-assets.py`. The visual system uses Pixelify Sans and IBM Plex, agent identity colors and Kenney CC0 base assets with custom signs, items and layout.

## Challenges

CREAO sometimes returns a short form summary alongside the full JSON result, so parsing must prefer the complete chat output. Shared trigger keys can also hit rate limits; polling now backs off on the same external run instead of creating duplicate work.

Revisions must remain visible without misleading the founder about the current accepted result. Superseded artifacts stay in the saved history, while the town displays current deliverables. A validated revision is accepted without asking the Mayor for a second review.

## Accomplishments

- Real StepFun model plan and edited founder approval.
- Three accepted CREAO department outputs, with no task failures or Mayor covers in the verified run.
- Two research handoffs and parallel Maker/Herald execution.
- Public generated page confirmed on cellular within three seconds.
- Bundled real-run replay, artifact payloads and offline site preview.
- Paper town and HUD designs verified through the local Paper Desktop MCP.
- Automated tests, typecheck, build, mock smoke and real-run verification; current evidence is linked below.

## What I learned

Readable agent workflows need explicit ownership, dependencies and approval boundaries. Honest telemetry also matters: CREAO did not return credit usage, so the UI discloses that the roughly $0.06 shown is reported StepFun usage, not total sponsor billing.

## What's next

Persistent waitlist capture, scheduling, custom departments, shareable run recordings and fuller billing telemetry.

## Built with

StepFun Step 5 Preview, CREAO saved agents, Paper, TypeScript, React, Phaser, Express, Vite, Zustand, Zod, sanitize-html, QR code generation and Kenney CC0 assets.

## Links

- Public repository: https://github.com/DV1277/headcount — push the final local implementation before submission.
- Paper town: https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0
- Paper HUD: https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-5-0
- CREAO agents and execution: `docs/status/CREAO.md` and README agent links.
- Real-run verification: `docs/status/G2-validation.json`.
- Design verification: `docs/status/PAPER-validation.json`.
- Replay: `fixtures/runs/live-boba-g2.jsonl`, companion artifacts JSON and site HTML.
- Demo video: **add the final 2–3 minute video URL before submitting**.

## Prototype limits

The landing-page signup form does not persist submissions. Outreach is drafted, not sent. Recorded research is AI-generated and should be checked before business decisions. The Cloudflare page URL is temporary and depends on the laptop/tunnel. A fresh live run requires configured StepFun and CREAO credentials; bundled replay does not.

Browser Use, ElevenLabs, Devin and Workday are not claimed as product integrations for this submission.
