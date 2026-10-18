# Selected track evidence

Primary verification: `docs/status/G2-validation.json` (real run, read-only verifier) and `docs/status/PAPER-validation.json` (existing Paper design inspected through local MCP).

| Entry | Working implementation | Show the judge | Evidence |
|---|---|---|---|
| Applied Intelligence | An approved idea becomes research, a landing page, launch drafts and a founder brief | Final card and each accepted deliverable | 135 captured events, 3 accepted department tasks, 4 competitors, 8 sources; `fixtures/runs/live-boba-g2.*` |
| CREAO Best One-Person Company | Scout, Maker and Herald are saved CREAO apps called by the executor | Org chart: Scout → Maker and Scout → Herald; actual artifacts | `docs/status/CREAO.md`, README's 3 saved app links, 7 external run IDs in `G2-validation.json`; no covers in this run |
| StepFun Get It Done with Step 5 Preview | `step-5-preview` plans, reviews, writes the brief and handles repair/failure paths | Plan's Model/Step 5 source label, founder approval, per-agent payroll | `apps/server/src/mayor/`, `apps/server/src/llm/stepfun.ts`, captured model plan and reviews |
| Paper Best Designed Hack | Existing Headcount Paper file with foundations, town, workers/items, components and HUD pages; exported art used by the app | Town, org chart, readable HUD and source design side by side | [Town design](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0), [HUD design](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-5-0), `docs/status/img/Paper-town-design.png`, `scripts/build-town-assets.py` |

## Sponsor attribution

StepFun Step 5 Preview is the Mayor/orchestrator. CREAO hosts all three primary department workers. Paper holds the town and HUD design system and exported artwork. The verified real recording includes six department artifacts across accepted/superseded versions and one Mayor brief; the brief is not a CREAO output.

CREAO workers may use their hosted tools/models. Step 5 Preview is the only Mayor model; that is not a claim about CREAO's underlying model selection.

## Paper criteria and access

The official [Paper challenge page](https://paper.design/la-hacks) and [event challenge listing](https://live.lahacks.com/tracks), checked October 18, describe design fundamentals, ease of use, and personal craft/character. The published text does not explicitly require Paper software use. The existing design file was independently verified, rather than inferred from `.mcp.json` or source comments. Paper file access for a logged-out judge has not been verified; show it locally or use the saved screenshot if needed.

## Demonstration limits

- Replay is a captured real execution and makes no sponsor calls. Live approval/pause/redirect are disabled during replay; use a separately labelled live run to demonstrate new actions.
- The public QR page was checked HTTP 200 and previously confirmed by the founder on cellular within three seconds. It requires the current sites listener and tunnel; the bundled site viewer is the offline fallback.
- $0.055843 is reported StepFun usage. CREAO credit usage was not returned; it is not free and is excluded from the known total.
- The waitlist form is a prototype and does not persist signups. Launch emails and posts are drafts only.
- Browser Use, ElevenLabs, Devin and Workday are not entered as working integrations.
- The public repository exists but needs the final local implementation pushed; the video and Devpost still need to be completed.
