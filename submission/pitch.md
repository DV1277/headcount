# Headcount: 1 — three-minute judge demo

A company of one, staffed by AI agents you can watch.

## Set up

- Open http://127.0.0.1:5173/?replay=fixture:live-boba-g2&speed=20.
- If the web server is stopped, run `npm run demo`. If it is already running, use the link. The recording autoplays and finishes in about 40 seconds.
- Keep the current API/sites server and Cloudflare tunnel running for the phone QR. They are optional for replay and its bundled landing-page preview.
- Keep the Paper [town](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0) and [HUD](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-5-0) designs ready. Local fallback: `docs/status/img/Paper-town-design.png`.

## 0:00–0:40 — let the real recording play

“Solo founders need a team, but managing agents through chat tabs is hard to follow. Headcount: 1 makes the work visible. Mayor Mabel uses StepFun Step 5 Preview to propose a plan. The founder approves it, then three saved CREAO agents do the research, build a landing page, and write a launch kit.

“This is an accelerated recording of an actual 13-minute run. Replay itself calls no APIs. Every walk, handoff and review comes from the captured event log.”

Point out Scout's envelopes and Maker/Herald working in parallel. Let the final card appear.

## 0:40–1:10 — explain control and ownership

Close the final card. Click **Plan · 3 tasks**. Show the model-sourced Step 5 plan and approved dependencies; close it. This view is read-only during replay.

Click **Org**. “One founder approves the plan. Step 5 coordinates and reviews. CREAO Scout hands its accepted research to CREAO Maker and Herald. These two handoffs are actual inputs to downstream agents.” Close the chart.

## 1:10–1:35 — show research

Click **Research** in the left shelf. “Scout returned four competitor records and eight source links. These are the actual saved outputs, with sources the founder can inspect.” Close the viewer.

## 1:35–2:05 — show the working site

Click **Site**. Show the bundled accepted HTML preview. “Maker built this landing-page prototype. The server sanitizes it and publishes it on a separate sites-only listener.”

Close the viewer, click **Founder brief**, and show the QR. The public page is:
https://subscriber-karma-assignments-lifestyle.trycloudflare.com/sites/run_4hN7Q1M-b-/

Invite the judge to scan it while the tunnel is running. “We verified this page on cellular within three seconds. The waitlist is a prototype; it does not store signups or send messages.” Close the final card.

## 2:05–2:30 — show launch copy

Click **Launch**. Switch between **X post** and **Emails**. “Herald wrote three social posts and three outreach emails using Scout's research and the exact published URL. These are drafts the founder can review and copy; nothing has been sent.” Close the viewer.

## 2:30–3:00 — design, reliability and close

“The Paper town and HUD designs use a shared type and color system. Distinct buildings, agent identity colors and visible envelopes make ownership and dependencies readable. The design also includes keyboard controls and reduced motion.” Show the Paper design or town screenshot if useful.

“This run finished with three accepted CREAO outputs and no Mayor covers or task failures. Reported StepFun spend was about six cents; CREAO did not report its credit usage, so that is not a total-cost claim. The complete run and outputs replay without the sponsor APIs. One founder, a visible team, and usable work.”

## If something fails

- Reload the exact replay URL. The recording, fonts, town art and deliverable viewers need no sponsor APIs or control backend. The first install still needs dependencies.
- If the public QR fails, show **Site** → **Bundled offline preview**. Scanning the QR itself requires the public tunnel and an internet connection.
- Keep the completed live run in a second tab: http://127.0.0.1:5173/?run=run_4hN7Q1M-b- (requires the local backend).
- Do not restart the real backend in mock mode during judging. For a mock-only rehearsal, use a separate configuration and explicitly call it a mock.
- Do not wait for a fresh full run during a three-minute pitch. The recorded real run took 13m 12s.

## Short answers

- **What does StepFun do?** Step 5 Preview is the Mayor model for planning, reviews, final brief and repair/failure paths. CREAO hosts the department workers.
- **What does CREAO do?** All three primary department outputs in this recording came from saved CREAO apps. Seven external runs include revisions; IDs are in `docs/status/G2-validation.json`.
- **Is it scripted?** Motion is derived from semantic events. The three illustrative fixtures are labelled separately from this captured real execution.
- **What did Paper contribute?** The existing Headcount file contains foundations, town, worker/item, component and HUD pages. Exported town art is assembled by `scripts/build-town-assets.py`; design evidence is in `docs/status/PAPER-validation.json`.
- **What is still a prototype?** The landing-page signup form, autonomous outreach and scheduling. Research is AI-generated and remains subject to founder review. CREAO billing totals are unavailable.
