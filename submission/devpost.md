# Headcount: 1

## Elevator pitch

Run your company from a town of AI agents. Approve the plan, follow the handoffs, and open the finished work.

## Inspiration

A solo founder has to switch between research, product, marketing and management. Giving those jobs to agents creates another job: keeping track of what each agent knows, what it is waiting for, and whether the result is useful.

I wanted to see that work happen in one place. A town gave each department a home, each handoff a visible route, and each deliverable somewhere to arrive. The founder could stay involved through decisions instead of supervising every message.

## What it does

Headcount: 1 turns a business idea into a coordinated company workflow. Mayor Mabel drafts a structured plan. The founder can edit the tasks, change the instructions and approve the scope before execution begins.

Scout Rio researches the market. Once that research is accepted, Maker Juno builds a landing page and Herald Pip writes the launch copy in parallel. The Mayor reviews submissions, requests corrections and prepares the founder's final brief. The founder can inspect agents, pause the workflow or redirect a department with a note.

The interface is a pixel-art town. Agents enter their buildings, carry research to other departments and bring completed work to City Hall. An org chart reveals the dependencies behind those movements. Artifact viewers expose the research, source links, website and launch copy. The final card includes a QR code for the generated site.

For the completed UCLA boba-delivery company, the agents produced four competitor records with eight source links, a landing page, three social posts, three outreach emails and a founder brief. Three department tasks finished with two research handoffs and four revisions. The 13-minute, 12-second execution is saved as 135 events with seven artifacts, including superseded versions.

## How I built it

StepFun `step-5-preview` powers the Mayor's planning, review and final synthesis. Three saved CREAO agents do the research, website and launch work through app-scoped API Trigger calls. CREAO supplies the department outputs that the rest of the workflow consumes.

The TypeScript backend runs a dependency graph behind an explicit approval gate. Scout completes the shared research dependency before Maker and Herald begin independently. The executor tracks each dispatch and result, limits retries, preserves revisions and records reported usage. Rate-limit recovery polls the same external run rather than creating duplicate work. All credentials stay server-side.

Each change is appended to a JSONL event log and delivered through resumable server-sent events. React and Zustand render the controls; Phaser renders the town. A shared pure reducer reconstructs state from the log, and a cue mapper turns semantic events into movement, speech, envelopes and review stamps. This also makes replay and seeking possible without calling the models again.

I designed the town and HUD in Paper, including the department buildings, plan scroll, agent inspectors, org chart and final card. Exported artwork combines with Kenney CC0 base assets, Pixelify Sans and IBM Plex. Ownership has a consistent color; task status also has a word and icon.

Generated HTML passes through an allowlist sanitizer. A separate publisher serves it with a restrictive Content Security Policy. The public experience and accepted site run on Cloudflare Workers with static assets. The guided demo replays the completed real execution and changes HUD views at recorded milestones. New executions use the configured Node backend.

## Challenges I ran into

The department runs take minutes, and the CREAO app-trigger path reports status without streaming tokens. I had to make waiting understandable through task ownership, dependencies and observed progress. The interface follows the status updates returned by the execution service.

Results can contain a short form summary alongside a fuller conversational response. Parsing the wrong field discards the useful output. The adapter now prefers the complete result, validates its structure and carries review feedback into the next dispatch.

Replay exposed a different class of problems. Compressing execution time by 20× made short animations blink and allowed interrupted effects to leave ghosts behind. I separated visible animation timing from the event clock, canceled effects when seeking and prevented overlapping movement animations. Long task titles and URLs also needed measured text fitting and responsive layouts.

## Accomplishments that I'm proud of

- A real idea-to-output execution using StepFun and three saved CREAO agents, with all three department tasks accepted and no fallback covers in the recorded run.
- Research handed to both downstream departments, followed by parallel website and launch work.
- Founder approval, agent inspection, pause and redirect controls around an explicit execution model.
- A generated public site and a final QR that remains fully visible on a phone-sized screen.
- A complete recording that can be paused, scrubbed and replayed with its original artifacts.
- A working Cloudflare deployment, 223 passing tests, and a town whose actions follow the underlying event log.

## What I learned

An agent's role needs an input contract, an owner and a clear definition of completion. Those details determine whether another agent can use its result. The same structure also gives the founder a way to understand and intervene in the work.

Designing the town alongside the executor forced me to define what each movement means. An envelope represents a real artifact handoff. A stamp follows an accepted result. Seeking rebuilds the recorded state. The visual model became a useful way to check the execution model.

## What's next for Headcount: 1

Persistent lead capture, configurable departments and reusable company workflows would let a founder continue from the initial launch package. I also want fuller usage reporting, shareable recordings for new runs and recurring workflows that return to the founder for consequential decisions.

## Built with

TypeScript, React, Phaser, Vite, Zustand, Node.js, Express, Zod, StepFun Step 5 Preview, CREAO, Paper, Cloudflare Workers, sanitize-html, qrcode, Pixelify Sans, IBM Plex and Kenney CC0 assets.

## How it fits the selected challenges

**Applied Intelligence:** A practical workflow for a solo founder, taking an approved business idea through research, site creation and launch preparation with inspectable outputs.

**CREAO Best One-Person Company:** Three saved role agents perform the core department work. The org chart shows research handed from Scout to Maker and Herald. The company is coordinated through API Trigger by an external executor.

**StepFun Get It Done with Step 5 Preview:** The live workflow calls `step-5-preview` for the Mayor's decisions. StepFun plans and reviews; CREAO executes the departments. Approval, inspection, pause and redirect make the workflow understandable and controllable.

**Paper Best Designed Hack:** The town and HUD share a Paper-designed visual system, with department identities, readable status treatments, responsive panels and a consistent relationship between work and movement.

## Project links

- [Interactive end-to-end demo](https://headcount-1-demo.dv1277.workers.dev/demo)
- [Generated boba landing page](https://headcount-1-demo.dv1277.workers.dev/sites/run_4hN7Q1M-b-/)
- [Source code](https://github.com/DV1277/headcount)
- [Paper town design](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-2-0)
- [Paper HUD design](https://app.paper.design/file/01M579A4RA58NP21Q5HRB94MVA/p-5-0)
- [Scout's completed CREAO research run](https://agent.creao.ai/share/f998fa478beda09a6d774b969133e192), agent ID `dabe17eb-3f2c-40d9-bc8c-662f8736ddc1`
- [Saved Scout agent](https://agent.creao.ai/apps/dabe17eb-3f2c-40d9-bc8c-662f8736ddc1)
- [Saved Maker agent](https://agent.creao.ai/apps/2430f36c-51b1-484e-9025-8cb37837f0d9), ID `2430f36c-51b1-484e-9025-8cb37837f0d9`
- [Saved Herald agent](https://agent.creao.ai/apps/bc76ea75-e5c8-4b83-a8b2-ff8722009881), ID `bc76ea75-e5c8-4b83-a8b2-ff8722009881`

The public demo is a recording of actual provider execution. The example signup form opens an email client without storing entries; outreach is prepared for founder review and is not sent automatically. Displayed cost is reported StepFun usage, approximately $0.06 for this run; CREAO did not return credit usage.
