# Sponsor cheat sheet: Headcount: 1

LA Hacks AI Hackathon 2026, UCLA, Oct 17-18. **Devpost deadline Sun Oct 18, 12:00 PM PDT, no extensions** (target 11:45). Solo. Main track: Applied Intelligence (exactly one).

Run `npm run keys` to paste keys, `npm run check` to verify.

| Sponsor | Perk | Claim action | Env var |
|---|---|---|---|
| CREAO | Upgraded hackathon account; Launchpad (1 yr Pro Max) for winners | Sign up via the hackathon link, then make `cr_sk_` key + per-agent `capi_` key | `CREAO_API_KEY`, `CREAO_APP_KEY`, `CREAO_APP_ID` |
| StepFun | API credits (amount not published) | Sign up at platform.stepfun.ai; ask at StepFun booth / Discord for credits | `STEPFUN_API_KEY` |
| Browser Use | Credits (not published); new projects get 10 concurrent browsers at $0 | Sign up at cloud.browser-use.com; ask at booth / Discord | `BROWSER_USE_API_KEY` |
| Cognition (Devin) | Free Devin credits for every team | Ask at Cognition booth / Discord (no public code); provision service user | `DEVIN_API_KEY`, `DEVIN_ORG_ID` |
| Paper | Pro free for 1 month (team of 4) | Redeem `LAHACKS26` on a monthly Pro plan; cancel before renewal | none (MCP) |
| Workday | None | Nothing to claim; read the brief | none |
| ElevenLabs (MLH) | MLH promo code (Q4 2025 - Q4 2026) | Claim link in the MLH email of Oct 16; redeem on elevenlabs.io | `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID` |

---

## 1. CREAO

**Prize:** Best AI-First Disruptor $2,000 / **Best One-Person Company $1,000 (our target)** / Best Team Empowerment $500. Winners also join CREAO Launchpad (a year of CREAO Pro Max, founder mentorship, launch support).

**What judges want**
- Hard rule: **at least one CREAO agent does the core work.** Remove the agent and the product must stop working.
- Rubric: 30% AI as foundation, 25% depth on CREAO, 20% originality, 15% track fit, 10% demo. They check the links in the README, and the pitch should name what CREAO is doing.
- One-Person Company: one human operating like a funded startup; win by showing an "org chart of agents that hand work to each other".
- Warnings: runs take minutes (design async), no token streaming on the App API Trigger, every run spends credits, keys stay server-side.

**Free credit:** the upgraded hackathon account: 1 month of Pro Plus with 600 credits (per CREAO's signup code; auto-apply not confirmed). Claim by signing up through the hackathon link below (not the plain signup page). If it doesn't apply, give your account email at the CREAO booth to be upgraded. For top-ups, ask at the booth or on Discord.
**Signup:** https://creao.ai/signup?hackathon=ucla-ai&utm_source=ucla-ai&utm_medium=hackathon&utm_campaign=hackathons-oct-2026
**Community / rules page:** https://community.creao.ai/AI_hackathon_UCLA2026

**Where the keys live**
- Account key `cr_sk_...`: https://developer.creao.ai, API Keys. Env: `CREAO_API_KEY`.
- Per-agent `capi_...` key: on the agent's page at agent.creao.ai. Env: `CREAO_APP_KEY` (key) and `CREAO_APP_ID` (agent id).

**How Headcount: 1 uses it:** every department resident (Scout, Maker, Herald) is a saved CREAO agent, and the town is the live org chart of agents handing results to each other.

---

## 2. StepFun

**Prize:** "Get It Done with Step 5 Preview": $1,000 / $500 / $250 + API credits.

**What judges want**
- Must call `step-5-preview` when the app runs. Other models and services are fine; explain what each does alongside Step 5 Preview.
- Judged on "how well your project completes the task, how reliable the implementation is, and whether users can understand and control the workflow."
- Any eligible event track is welcome, so this stacks with Applied Intelligence.

**Free credit:** API credits, not published on the event site. Ask at the StepFun booth or on Discord.
**Signup:** https://platform.stepfun.ai
**Key:** platform dashboard, API keys. Env: `STEPFUN_API_KEY`. OpenAI-compatible base URL `https://api.stepfun.ai/v1`, model `step-5-preview`.

**How Headcount: 1 uses it:** the Mayor runs on Step 5 (plan JSON, task assignment, review of every deliverable), and the approve / pause / redirect controls answer the "understand and control" criterion.

---

## 3. Browser Use

**Prize:** "Best Use of Browser Use", $2,000 (per prior research; not stated in the API text).

**What judges want**
- "Build an AI agent with Browser Use that turns a goal into action on the web."
- Ideas listed: personal agent for tedious workflows, an agent that pays and completes transactions, a tool that makes websites more accessible, a new browser-powered experience.
- "Show us a working demo and how your project delivers for its intended audience."

**Free credit:** new projects get 10 concurrent browsers at $0. Extra credits not published; ask at the booth or on Discord.
**Signup:** https://cloud.browser-use.com
**Key:** Cloud dashboard, API keys. Env: `BROWSER_USE_API_KEY`. Send as header `X-Browser-Use-API-Key`.

**How Headcount: 1 uses it:** stretch only. Scout drives a real browser for market research and the Library window shows the live browser view.

---

## 4. Cognition (Devin)

**Prize:** "Best Use of Devin": 1st place $5,000 of Devin credits (single prize).

**What judges want**
- "Use Devin, the AI software engineer, to build something exciting." Ambitious ideas welcome: "aim bigger than a weekend normally allows."
- Judged on creativity, novelty, and polish.
- Keep Devin session links and PRs as proof of real use.

**Free credit:** "Every team gets free Devin credits to build with during the weekend." No public code; claim at the Cognition booth or on Discord. Fallback: the self-serve Free plan.
**Signup:** https://app.devin.ai
**Key:** Settings, Devin API, Service users, Provision (role Member). The `cog_...` token is `DEVIN_API_KEY`; the organization id is `DEVIN_ORG_ID`.

**How Headcount: 1 uses it:** Devin gets real build tickets (town frontend, replay scrubber) so the repo history shows the one-person company running on agents end to end.

---

## 5. Paper

**Prize:** "Best Designed Hack": $1,500 / $1,000 / $500.

**What judges want**
- "Design fundamentals": hierarchy, legibility, consistency, contrast.
- Ease of use.
- Personal craft: "give your project a human touch", so look different from generic AI-generated UI.

**Free credit:** redeem code `LAHACKS26` on a monthly Pro plan for Pro free for 1 month (team of 4). **The plan renews after a month: cancel before then** (checkout probably asks for a card), or email team@paper.design with proof of enrollment for a free year.
**Signup:** https://paper.design/la-hacks
**Key:** none. Install Paper Desktop (it starts an MCP server). Then either click "Add to Claude" in the editor's MCP panel, or run:
`claude plugin marketplace add paper-design/agent-plugins && claude plugin install paper-desktop@paper`
**Env var:** none.

**How Headcount: 1 uses it:** design the pixel town, HUD, plan scroll and org-chart view in Paper and pull them into code over MCP; hand-placed details are the "personal craft" evidence.

---

## 6. Workday

**Prize:** "Build the Future of Work with AI" challenge (prize amount not listed in the API text; see brief).

**What judges want:** an AI agent or prototype that helps people succeed after they join a company (ramping into a role, finding trusted information, and similar). Weights:
- Agentic Logic & AI Innovation 30%
- New Hire & Early-Career Relevance 20%
- Responsible AI & Trust 20%
- Future of Work / Workday Relevance 15%
- UX & Inclusivity 10%
- Pitch / Execution / Storytelling 5%

**Free credit:** none. No API, no credits: "You do not need to build inside Workday."
**Signup:** none. **Brief:** https://drive.google.com/file/d/1cwiVFY_8sYZdA4Vxr36Hi7kyhZMNVPPA/view
**Key / env var:** none.

**How Headcount: 1 uses it:** it does not, really. **Honest read: weak fit.** Headcount: 1 is about founders, not new hires, so the 20% new-hire criterion would score low. Only enter if pivoting the framing (for example, an onboarding town for a new hire's first week).

---

## 7. ElevenLabs (MLH)

**Prize:** MLH "Best Use of ElevenLabs": wireless earbuds.

**What judges want**
- "Deploy natural, human-sounding audio": realistic, dynamic, emotionally expressive voices.
- "Integrate fully autonomous audio experiences into your hack and give your project a voice."
- Examples: interactive AI companions, narrated stories, voice-enabled apps.

**Free credit:** MLH promo code. The claim link is in the MLH email "Everything you'll need to know from MLH at LA Hacks AI Hackathon 2026" (Oct 16), under "Claim your ElevenLabs Q4 2025 - Q4 2026 promo code". Redeem on elevenlabs.io (free 1-month Creator plan, per mlh.com/partners/elevenlabs). Fallback: in discord.gg/elevenlabs, go to #coupon-codes, choose "Start Redemption", then enter your registration email (this only works if LA Hacks shared the participant list).
**Signup:** https://elevenlabs.io
**Key:** https://elevenlabs.io/app/settings/api-keys. Env: `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`. Send as header `xi-api-key`.

**How Headcount: 1 uses it:** optional polish. Each resident gets a distinct voice for speech bubbles, and the Mayor reads the final brief aloud in the demo.

---

## Other challenges at a glance

- **Fetch.ai** (ASI:One Agent Challenge): register an agent on Agentverse, make it discoverable via ASI:One, implement Agent Chat Protocol, demo inside asi1.ai, and also submit through the Submission Agent. Stretch: register the Mayor.
- **Base44** (Build Something People Want): must be built substantially on Base44; live app + problem/user/solution write-up. $1,500 / $500.
- **QNX** (Best use of QNX): embedded product on QNX using an open-source AI module from oss.qnx.com. $1,000 / $250 / $250.
- **Even Realities** (G2 Smart Glasses, "Quiet Tech"): Even Hub app for G2. 1st place is G2 glasses for each member.
- **Photon** (Messaging/Calling Agent): agent that reaches humans over iMessage and other channels via Photon 2.0 beta. Stretch: Post Office texts you when the site goes live.
- **Visa** (Future of Shopping): GenAI commerce experience. 1st $2,000. Weights: Innovation 25, UX 25, Technical 20, Commerce Impact 15, Trust 15.
- **Sentry** (Best Use of Sentry): use at least two products beyond error monitoring (Replay, Logs, Tracing, Profiling, Uptime, AI agent monitoring). 1st: guaranteed interviews for the team.
- **Espressif** (Best Use of Espressif): creative hardware projects. 1st ESP-VoCat, 2nd M5Stack Stopwatch.
- **Intuit** (QuickBooks, System One models like Jev): must show a real technical unlock vs classical ML or GenAI, with your own evaluation. Gift cards per person: $200 / $100 / $50.
- **MLH others:** GoDaddy Registry domain (gift card), Gemini API (swag), Snowflake API (Raspberry Pi 4), Vultr (portable screens), Solana, Tiger Data. ElevenLabs is covered above.
- **veri.studio** (Best use of an Open-sourced model): post-train or fine-tune a model for a task using Veri (veri.studio/lahacks).

---

## Judging logistics

- **12:30-2:00 PM:** table expo. Judges rotate, roughly 4-5 minutes per judge. Have the demo running and the QR landing page ready.
- **2:00-3:00 PM:** top-5 stage finalists. 3 minutes to present + 5 minutes Q&A.
- **Submission (Devpost, due 12:00 PM PDT):** project description + public repo + 2-3 minute demo video + Devpost entry. CREAO checks README links, so link the agents there. Sponsor tracks (CREAO, StepFun, Paper, Devin, etc.) are chosen on Devpost in addition to the main track.
- **Main track:** exactly one, Applied Intelligence.
- Event-wide criteria: Technical Depth, Product Thinking & Impact, Execution & Polish, Originality & Insight.
