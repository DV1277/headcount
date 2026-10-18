# Judge demo readiness — October 18, 2026

The local presentation path is ready for Applied Intelligence, CREAO Best One-Person Company, StepFun Get It Done with Step 5 Preview, and Paper Best Designed Hack. This does not claim that Devpost submission or the final code push is complete.

## Current public deployment

Open https://headcount-1-demo.dv1277.workers.dev/demo and click **Watch the end-to-end demo**. The guided replay switches HUD views automatically and ends with a QR for the Workers-hosted site. No laptop server or tunnel is needed. See [deployment verification](DEPLOYMENT-validation.json) and [public demo details](PUBLIC-DEMO.md).

## Earlier local start path

Open http://127.0.0.1:5173/?replay=fixture:live-boba-g2&speed=20. If the web server is stopped, `npm run demo` starts it and opens that URL. It replays the captured real 13m 12s run in about 40 seconds; no sponsor calls occur during replay.

Close the final card, show Plan, Org, Research, Site and Launch, then reopen Founder brief for the phone QR. See [the three-minute script](../../submission/pitch.md).

Keep the current web server, real API/sites server and Cloudflare tunnel alive for both the live-run tab and phone QR. Only the web server is required for offline replay and its bundled outputs. The generated waitlist is a prototype without persistent signup capture; outreach remains draft-only.

## Verified in this pass

- All OpenCode workers are stopped; stale task statuses were closed. No demo server or tunnel was stopped.
- Three headless Command Code workers completed using `meta/muse-spark-1.3-contributor`, effort `high`: judge-script, demo-audit and track-proof. HEAD reviewed and corrected their drafts. Their initial short-lived launches were restarted under a persistent supervisor; all final runs exited zero.
- `npm run demo` opens the real recording at ×20; the recording picker now includes **Real CREAO boba run**.
- A presentation bug is fixed: current deliverables replace superseded drafts on City Hall's steps, validated completed revisions get accepted stamps, and the stamp layout has enough space. Old artifacts remain unchanged in the event/fixture history.
- Browser rehearsal verified the read-only Step 5 plan, org chart with two handoffs, accepted research with four competitors/eight sources, bundled accepted site preview, launch email tabs, final card and QR. Saved screenshots: `img/Judge-demo-town.jpg`, `img/Judge-demo-org.jpg`, `img/Judge-demo-final.jpg`.
- Existing Paper Headcount town and HUD pages were independently inspected via the configured local Paper Desktop MCP. Town art matches the export assembly script and current app assets. Evidence and design links: [PAPER-validation.json](PAPER-validation.json). Screenshot: `img/Paper-town-design.png`. Logged-out sharing access is not verified.
- `npm test`: **190 passing tests in 26 files**, including a regression against the actual CREAO recording. HTTP tests required execution outside the restricted sandbox so their local listeners could bind.
- Typecheck, production build, secret scan and foundation replay smoke pass. Build retains the known large Phaser bundle warning.
- `npm run verify:real -- run_4hN7Q1M-b-` passes, preserving the founder's cellular confirmation. It triggered no new sponsor runs. Public site was independently checked HTTP 200 during this pass.

## Submission work remaining

1. Review and push the final local implementation to the existing public repository, https://github.com/DV1277/headcount. Its last published state predates the completed implementation; this pass did not commit or push.
2. Record and upload a 2–3 minute walkthrough using the script. Add its URL to the draft.
3. Paste [submission/devpost.md](../../submission/devpost.md), add the links/video, select the four entries, and submit. The official deadline is October 18 at noon PDT; the project target remains 11:45.
4. Rehearse once and keep the laptop awake, plugged in, with the phone QR and offline site preview ready.

Published requirements: [Devpost](https://la-ai-hackathon-2026.devpost.com/) and [Paper challenge](https://paper.design/la-hacks). Paper's published criteria describe design fundamentals, ease of use and personal craft; the existing Paper file also supplies actual tool-use evidence. No new API key setup is needed for this presentation.
