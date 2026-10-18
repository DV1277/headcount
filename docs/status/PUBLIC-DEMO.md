# Public judge demo

**Live:** https://headcount-1-demo.dv1277.workers.dev/demo

**Generated site:** https://headcount-1-demo.dv1277.workers.dev/sites/run_4hN7Q1M-b-/

The Cloudflare build serves a guided replay at `/demo` and a copy of the accepted generated landing page at `/sites/run_4hN7Q1M-b-/`. The root also opens the demo. This is a recording of actual StepFun and CREAO execution, not a fresh run each time someone opens the page.

The tour starts with the verified founder prompt, “Late-night boba delivery for UCLA dorms.” It presents the Mayor's plan, founder approval, Scout research and revisions, dependency handoffs, parallel Maker and Herald work, the founder redirect, accepted outputs, and final brief. Chapters open the appropriate plan, inspector, research, org chart, log, site or launch interface automatically. Pause, next chapter, free exploration and restart remain available.

The site preview and final card generate QR codes using the current deployment's absolute site URL. The hosted site and replay assets do not depend on the laptop, temporary tunnel, local backend or sponsor API availability. New live agent executions still use the existing Node backend; no control API or sponsor credentials are deployed in this demo Worker.

Build and deployment:

```sh
npm run typecheck
npm test
npm run scan:secrets
npm run deploy:check
npm run deploy
```

`npm run dev:edge` builds the public version and serves it through Wrangler on port 8790. Normal `npm run dev` retains the local application; `/demo` opens the guided replay there too.

Recorded event times, provider IDs and source files remain intact. Runtime site metadata points to the hosted copy; original launch copy and brief remain the recorded outputs. The generated waitlist is a prototype with mailto outreach, without a signup database or automatic sending.

Deployment URL and verification results are recorded after publishing in `DEPLOYMENT-validation.json`.

Verified on October 18: 223 tests in 30 files, typecheck, secret scan, Worker runtime and public HTTP checks pass. The published 14-chapter tour reached the completed state naturally. At 390×844 the final QR fits entirely inside the visible card; the narrow-screen layout places it before the deliverables. Evidence: `img/Cloudflare-demo-mobile-final.jpg` and `DEPLOYMENT-validation.json`.
